import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { supabase } from '../lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Sentry from '@sentry/react-native';
import { resetAnalytics } from '../lib/analytics';
import { purgeAllLocalData } from '../lib/local-data';
import { logOutSubscriptionUser } from '../lib/subscription';

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

/**
 * The outcome of a Delete Account attempt.
 *
 * THREE outcomes, never two. Collapsing them is what produced the original
 * defect, and the middle case is the dangerous one:
 *
 *   A  serverDeleted: false  — the RPC refused. The account still exists,
 *                              nothing local was touched, the user is still
 *                              signed in. This is the ONLY state that may say
 *                              "your account was not deleted".
 *   B  serverDeleted: true,  — done. Server row gone, device clean.
 *      cleanupComplete: true
 *   C  serverDeleted: true,  — the account IS GONE. Some device cleanup did not
 *      cleanupComplete:false   finish. The user must still be signed out and
 *                              routed away, and must never be told the deletion
 *                              failed, because it did not.
 *
 * `cleanupFailures` carries stable store identifiers only — never keys, values
 * or anything user-derived.
 */
export type DeleteAccountResult = {
  serverDeleted: boolean;
  cleanupComplete: boolean;
  cleanupFailures: string[];
  /** Present only in state A. */
  error?: string;
};

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
  /**
   * Resume point for an unfinished onboarding. NULL for every pre-v1.0 profile
   * and for anyone who has finished — see lib/onboarding-stage.ts. Never
   * authoritative for completion; onboarding_completed decides that.
   */
  onboarding_stage: string | null;
};

type AuthContextType = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signUp: (email: string, password: string, displayName?: string) => Promise<{ error: any }>;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  /** Permanently delete the account. See deleteAccount() and
   *  DeleteAccountResult for the three outcomes and the ordering guarantee. */
  deleteAccount: () => Promise<DeleteAccountResult>;
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

/**
 * Sign-out cleanup. NOT a deletion purge.
 *
 * The account still exists, so this removes only the onboarding/session keys
 * that would otherwise strand the next session mid-flow. Cached history and
 * preferences are deliberately kept — a user who signs back in should find
 * their app as they left it.
 *
 * Account deletion uses purgeAllLocalData() instead. Keep the two separate:
 * quietly widening this into a destructive wipe would make every sign-out
 * destroy data the user still owns.
 */
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
        onboarding_stage: data.onboarding_stage ?? null,
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

  /**
   * Permanently delete the account, then erase every local trace of it.
   *
   * ORDER IS THE WHOLE POINT, and each step is ordered for a reason:
   *
   *   1. RPC first. A purge that ran before the server confirmed would destroy
   *      the local data of an account that still exists — the user would lose
   *      their history AND keep the account they asked to delete.
   *   2. Only on success: purge local data, then detach RevenueCat, then drop
   *      the auth session. Nothing is destroyed on the failure path.
   *   3. The caller decides what to show. This function never reports success
   *      it did not achieve: a failed RPC returns { ok: false } and leaves the
   *      user signed in with their data intact.
   *
   * Local cleanup failures do NOT flip the result to false. The account really
   * is gone at that point, and telling the user deletion failed would be the
   * bigger lie; the failure is recorded for diagnostics instead.
   */
  const deleteAccount = async (): Promise<DeleteAccountResult> => {
    // ── STATE A gate ────────────────────────────────────────────────────────
    // Nothing is destroyed until the server confirms. A purge before this point
    // would wipe the local data of an account that still exists.
    const { error } = await supabase.rpc('delete_user_account');
    if (error) {
      return { serverDeleted: false, cleanupComplete: false, cleanupFailures: [], error: error.message };
    }

    // ── Past here the account IS GONE. ──────────────────────────────────────
    // Every step below is best-effort cleanup. NONE of them may turn this into
    // a reported deletion failure, and none may stop the ones after it.
    const cleanupFailures: string[] = [];

    const purge = await purgeAllLocalData();
    cleanupFailures.push(...purge.failures);

    // Detach this device's RevenueCat identity. The Apple purchase is untouched
    // and remains restorable onto a future account.
    if (!(await logOutSubscriptionUser())) cleanupFailures.push('revenuecat');

    // The server row is already gone, so this can legitimately fail. It is
    // recorded, never fatal.
    try {
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) cleanupFailures.push('auth_signout');
    } catch {
      cleanupFailures.push('auth_signout');
    }

    // Force-clear in-memory state REGARDLESS of the sign-out result. Without
    // this a failed signOut would leave the deleted account's session and
    // profile live in the app, which is the whole risk of state C.
    setSession(null);
    setProfile(null);
    resetAnalytics();

    if (cleanupFailures.length > 0) {
      Sentry.captureMessage('Device cleanup incomplete after account deletion', {
        level: 'warning',
        tags: { context: 'delete_account' },
        // Store names only.
        extra: { stores: cleanupFailures.join(',') },
      });
    }

    return {
      serverDeleted: true,
      cleanupComplete: cleanupFailures.length === 0,
      cleanupFailures,
    };
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
        deleteAccount,
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
