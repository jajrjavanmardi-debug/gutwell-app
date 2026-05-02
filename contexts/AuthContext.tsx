import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
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
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/** Must be false for Supabase inserts/selects — RLS uses JWT `auth.uid()`; a fake session never matches `user_id` in rows. */
const BYPASS_AUTH_FOR_NATIVE_TESTING = false;
const MOCK_USER_ID = '00000000-0000-4000-8000-000000000001';

const mockUser: User = {
  id: MOCK_USER_ID,
  aud: 'authenticated',
  role: 'authenticated',
  email: 'tester@gutwell.local',
  app_metadata: {},
  user_metadata: { display_name: 'NutriFlow Tester' },
  created_at: new Date(0).toISOString(),
};

const mockSession = {
  access_token: 'native-testing-token',
  refresh_token: 'native-testing-refresh-token',
  expires_in: 3600,
  token_type: 'bearer',
  user: mockUser,
} as Session;

const mockProfile: Profile = {
  id: MOCK_USER_ID,
  display_name: 'NutriFlow Tester',
  avatar_url: null,
  onboarding_completed: true,
  total_points: 0,
  level: 'beginner',
  gut_concern: null,
  symptom_frequency: null,
  goal: null,
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  if (BYPASS_AUTH_FOR_NATIVE_TESTING) {
    return (
      <AuthContext.Provider
        value={{
          session: mockSession,
          user: mockUser,
          profile: mockProfile,
          loading: false,
          signUp: async () => ({ error: null }),
          signIn: async () => ({ error: null }),
          signOut: async () => {},
          resetPassword: async () => ({ error: null }),
          updatePassword: async () => ({ error: null }),
          refreshProfile: async () => {},
        }}
      >
        {children}
      </AuthContext.Provider>
    );
  }

  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

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
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        fetchProfile(session.user.id);
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
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
  };

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    return { error };
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
