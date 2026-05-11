import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { AuthError, Session, User } from '@supabase/supabase-js';
import { Platform } from 'react-native';
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
  loading: boolean;
  signUp: (email: string, password: string, displayName?: string) => Promise<AuthActionResult>;
  signIn: (email: string, password: string) => Promise<AuthActionResult>;
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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
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
        const { data: { session: initialSession } } = await supabase.auth.getSession();
        if (!isMounted) return;
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
      setSession(nextSession);
      if (nextSession?.user) {
        void fetchProfile(nextSession.user).catch((error) => {
          console.error('Failed to load profile after auth change:', error);
          setProfile(null);
        });
      } else {
        setProfile(null);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  const signUp = async (email: string, password: string, displayName?: string) => {
    try {
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

  const signOut = async () => {
    await supabase.auth.signOut();
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
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await fetchProfile(user);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        profile,
        loading,
        signUp,
        signIn,
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
