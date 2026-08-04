import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { supabase } from '../lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { resetAnalytics } from '../lib/analytics';

/**
 * Deep link Supabase sends the user back to after they tap the reset link in
 * their email. Built from the app scheme (app.json → "scheme": "gutwellapp")
 * so it resolves correctly in Expo Go, dev clients and release builds alike.
 *
 * This exact value must be present in the Supabase Dashboard's Redirect URL
 * allow-list, otherwise Supabase falls back to the Site URL and the link never
 * reaches the app.
 */
export const PASSWORD_RESET_PATH = 'reset-password';

export function passwordResetRedirectTo(): string {
  return Linking.createURL(`/${PASSWORD_RESET_PATH}`);
}

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

type AuthContextType = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signUp: (email: string, password: string, displayName?: string) => Promise<{ error: any }>;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: any }>;
  updatePassword: (newPassword: string) => Promise<{ error: any }>;
  refreshProfile: () => Promise<void>;
  /** True while a password-recovery session is active, so routing can send the
   *  user to the New Password screen instead of into the app. */
  passwordRecovery: boolean;
  setPasswordRecovery: (value: boolean) => void;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);


// Keys that must be wiped on sign-out or account deletion so the next
// session (or a reinstalled app) always starts from the Welcome screen.
const ONBOARDING_STORAGE_KEYS = [
  'onboarding_answers',
  'onboarding_name',
  'onboarding_checkin_pending',
  'onboarding_completed',
  'rate_app_prompted',
  'gutwell_location_suggestions',
  'scan_tutorial_seen',
];

async function clearLocalSessionState(): Promise<void> {
  try {
    await AsyncStorage.multiRemove(ONBOARDING_STORAGE_KEYS);
  } catch {
    // Best-effort — never block sign-out.
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [passwordRecovery, setPasswordRecovery] = useState(false);

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (data) {
      setProfile({
        id: data.id,
        display_name: data.display_name,
        avatar_url: data.avatar_url,
        onboarding_completed: data.onboarding_completed ?? false,
        total_points: data.total_points ?? 0,
        level: data.level ?? 'beginner',
        gut_concern: data.gut_concern ?? null,
        symptom_frequency: data.symptom_frequency ?? null,
        goal: data.goal ?? null,
      });
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        // Await so the auth gate (app/index.tsx) sees onboarding_completed on
        // cold start instead of routing on a not-yet-loaded profile.
        await fetchProfile(session.user.id).catch(() => {});
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      // A recovery link produces a real but limited session. Flag it so the
      // router sends the user to the New Password screen rather than into the
      // authenticated tab stack.
      if (event === 'PASSWORD_RECOVERY') {
        setPasswordRecovery(true);
      } else if (event === 'SIGNED_OUT') {
        setPasswordRecovery(false);
      }
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string, displayName?: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName },
      },
    });
    return { error };
  };

  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
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
    // Clear onboarding and session-local state so the next launch
    // always starts from the Welcome screen.
    await clearLocalSessionState();
    // Unlink the analytics identity so the next account on this device
    // does not inherit this user's event stream.
    resetAnalytics();
  };

  const resetPassword = async (email: string) => {
    try {
      // redirectTo is what brings the user back into the app from the email.
      // Without it Supabase falls back to the project's Site URL, which is a
      // web address and cannot open GutWell AI.
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: passwordResetRedirectTo(),
      });
      return { error };
    } catch (e) {
      // Network failures throw rather than resolving with an error.
      const message =
        e instanceof Error
          ? e.message
          : (e as { message?: string })?.message ?? 'Network request failed';
      return { error: { message } as { message: string } };
    }
  };

  const updatePassword = async (newPassword: string) => {
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      return { error };
    } catch (e: any) {
      return { error: { message: e?.message ?? 'Failed to update password' } };
    }
  };

  const refreshProfile = async () => {
    if (session?.user) {
      await fetchProfile(session.user.id);
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
        passwordRecovery,
        setPasswordRecovery,
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
