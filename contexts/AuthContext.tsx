import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { AuthError, Session, User } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import {
  disableGuestMode,
  enableGuestMode,
  getGuestProfile,
  type GuestProfile,
} from '../lib/guest-mode';
import { supabase } from '../lib/supabase';

type Profile = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  onboarding_completed: boolean;
  total_points: number;
  level: string;
  gut_concern: string | null;
  symptom_frequency: string | null;
  goal: string | null;
};

type AuthActionResult = {
  error: AuthError | { message: string } | null;
};

type AuthContextType = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  isGuest: boolean;
  loading: boolean;
  signUp: (email: string, password: string, displayName?: string) => Promise<AuthActionResult>;
  signIn: (email: string, password: string) => Promise<AuthActionResult>;
  continueAsGuest: () => Promise<AuthActionResult & { profile: Profile | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<AuthActionResult>;
  updatePassword: (newPassword: string) => Promise<AuthActionResult>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function getWebAuthRedirectUrl(): string | undefined {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return undefined;
  return window.location.origin;
}

function getDisplayName(user: User, fallback?: string): string {
  const fromMetadata = typeof user.user_metadata?.display_name === 'string'
    ? user.user_metadata.display_name.trim()
    : '';
  if (fromMetadata) return fromMetadata;
  if (fallback?.trim()) return fallback.trim();
  return user.email?.split('@')[0] ?? 'NutriFlow user';
}

function normalizeProfile(data: Partial<Profile> & { id: string }): Profile {
  return {
    id: data.id,
    display_name: data.display_name ?? null,
    avatar_url: data.avatar_url ?? null,
    onboarding_completed: data.onboarding_completed ?? false,
    total_points: data.total_points ?? 0,
    level: data.level ?? 'beginner',
    gut_concern: data.gut_concern ?? null,
    symptom_frequency: data.symptom_frequency ?? null,
    goal: data.goal ?? null,
  };
}

function normalizeGuestAuthProfile(profile: GuestProfile): Profile {
  return {
    id: profile.id,
    display_name: profile.display_name,
    avatar_url: null,
    onboarding_completed: profile.onboarding_completed,
    total_points: 0,
    level: 'guest',
    gut_concern: profile.gut_concern,
    symptom_frequency: profile.symptom_frequency,
    goal: profile.goal,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isGuest, setIsGuest] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async (authUser: User, displayName?: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', authUser.id)
      .maybeSingle();

    if (error) throw error;

    if (data) {
      setProfile(normalizeProfile(data));
      return normalizeProfile(data);
    }

    const { error: upsertError } = await supabase
      .from('profiles')
      .upsert(
        {
          id: authUser.id,
          display_name: getDisplayName(authUser, displayName),
          onboarding_completed: false,
        },
        { onConflict: 'id' }
      );

    if (upsertError) throw upsertError;

    const { data: createdProfile, error: reloadError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', authUser.id)
      .single();

    if (reloadError) throw reloadError;

    const normalized = normalizeProfile(createdProfile);
    setProfile(normalized);
    return normalized;
  }, []);

  useEffect(() => {
    let isMounted = true;

    const hydrateSession = async () => {
      try {
        const guestProfile = await getGuestProfile();
        if (!isMounted) return;

        if (guestProfile) {
          setIsGuest(true);
          setSession(null);
          setProfile(normalizeGuestAuthProfile(guestProfile));
          return;
        }

        const { data: { session: initialSession } } = await supabase.auth.getSession();
        if (!isMounted) return;
        setIsGuest(false);
        setSession(initialSession);
        if (initialSession?.user) {
          await fetchProfile(initialSession.user);
        } else if (isMounted) {
          setProfile(null);
        }
      } catch (error) {
        console.error('Failed to restore auth session:', error);
        if (isMounted) {
          setSession(null);
          setProfile(null);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    void hydrateSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      void getGuestProfile()
        .then((guestProfile) => {
          if (!isMounted) return;

          if (guestProfile) {
            setIsGuest(true);
            setSession(null);
            setProfile(normalizeGuestAuthProfile(guestProfile));
            return;
          }

          setIsGuest(false);
          setSession(nextSession);
          if (nextSession?.user) {
            void fetchProfile(nextSession.user).catch((error) => {
              console.error('Failed to load profile after auth change:', error);
              setProfile(null);
            });
          } else {
            setProfile(null);
          }
        })
        .catch((error) => {
          console.error('Failed to check guest mode after auth change:', error);
        });
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  const signUp = async (email: string, password: string, displayName?: string) => {
    try {
      await disableGuestMode();
      setIsGuest(false);
      const emailRedirectTo = getWebAuthRedirectUrl();
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { display_name: displayName?.trim() },
          ...(emailRedirectTo ? { emailRedirectTo } : {}),
        },
      });
      if (error) return { error };
      if (data.session?.user) {
        await fetchProfile(data.session.user, displayName);
      }
      return { error: null };
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unable to create account';
      return { error: { message } as { message: string } };
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      await disableGuestMode();
      setIsGuest(false);
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (!error && data.user) {
        await fetchProfile(data.user);
      }
      return { error };
    } catch (e) {
      const message =
        e instanceof Error
          ? e.message
          : typeof e === 'string'
            ? e
            : (e as { message?: string })?.message ?? 'Network request failed';
      return { error: { message } as { message: string } };
    }
  };

  const continueAsGuest = async () => {
    try {
      const guestProfile = await enableGuestMode();
      const normalized = normalizeGuestAuthProfile(guestProfile);
      setIsGuest(true);
      setSession(null);
      setProfile(normalized);
      await supabase.auth.signOut().catch((error) => {
        console.warn('Supabase sign-out while entering guest mode failed:', error);
      });
      return { error: null, profile: normalized };
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unable to start guest mode';
      return { error: { message }, profile: null };
    }
  };

  const signOut = async () => {
    await disableGuestMode();
    setIsGuest(false);
    await supabase.auth.signOut().catch((error) => {
      console.warn('Supabase sign-out failed:', error);
    });
    setSession(null);
    setProfile(null);
  };

  const resetPassword = async (email: string) => {
    const redirectTo = getWebAuthRedirectUrl();
    const { error } = await supabase.auth.resetPasswordForEmail(
      email,
      redirectTo ? { redirectTo } : undefined
    );
    return { error };
  };

  const updatePassword = async (newPassword: string) => {
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      return { error };
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to update password';
      return { error: { message } };
    }
  };

  const refreshProfile = async () => {
    const guestProfile = await getGuestProfile();
    if (guestProfile) {
      setIsGuest(true);
      setSession(null);
      setProfile(normalizeGuestAuthProfile(guestProfile));
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setIsGuest(false);
      await fetchProfile(user);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        profile,
        isGuest,
        loading,
        signUp,
        signIn,
        continueAsGuest,
        signOut,
        resetPassword,
        updatePassword,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
