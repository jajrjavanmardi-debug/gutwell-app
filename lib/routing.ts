/**
 * lib/routing.ts
 *
 * The app's routing decisions, extracted as pure functions.
 *
 * app/_layout.tsx and app/index.tsx import these rather than inlining the
 * logic, so the unit tests exercise the code that actually ships. Previously
 * the tests re-implemented these rules, which meant a regression in the real
 * components would not have been caught.
 */

import type { OnboardingStage } from './onboarding-stage';

/** Screens that require an authenticated session. */
export const PROTECTED_SEGMENTS = [
  '(tabs)',
  'photo-analysis',
  'food-history',
  'weekly-digest',
  'settings',
  'log-symptom',
  'reminders',
  'edit-checkin',
  'paywall',
] as const;

export type GuardDecision = 'welcome' | 'reset-password' | 'stay';

/**
 * Root layout guard.
 *
 * - A password-recovery session must sit on the New Password screen and
 *   nowhere else, even though it is technically authenticated.
 * - An unauthenticated user is pushed out of protected screens only.
 *   (auth) and (onboarding) stay freely navigable, which is what keeps the
 *   Welcome screen reachable on a fresh install and after sign-out.
 */
export function authGuardDecision(params: {
  session: boolean;
  loading: boolean;
  segments: readonly (string | undefined)[];
  passwordRecovery?: boolean;
}): GuardDecision {
  const { session, loading, segments, passwordRecovery = false } = params;
  if (loading) return 'stay';

  if (passwordRecovery) {
    return segments[1] === 'reset-password' ? 'stay' : 'reset-password';
  }

  const inProtected = (PROTECTED_SEGMENTS as readonly string[]).includes(segments[0] ?? '');
  if (!session && inProtected) return 'welcome';
  return 'stay';
}

export type IndexDecision =
  | 'loading'
  | '(auth)/reset-password'
  | '(onboarding)/welcome'
  | '(onboarding)/questions'
  | '(onboarding)/example'
  | '(onboarding)/notifications'
  | 'photo-analysis-onboarding'
  | '(tabs)';

/**
 * App entry decision (app/index.tsx) — the single routing decision point.
 *
 * Ordering matters, and each rule earns its position:
 *
 * 1. loading / password recovery win over everything, as before.
 * 2. `onboarding_completed === true` returns tabs *before* the stage is even
 *    read. A finished user is finished; a stale stage left over from an
 *    interrupted run must never pull them back into onboarding. This is also
 *    why a completed user never waits on the AsyncStorage read.
 * 3. Only then does the stage matter, so `stageReady` is required no earlier
 *    than the point where it is actually consulted.
 *
 * Unknown, absent or newer-build stage values arrive here as null (see
 * asOnboardingStage) and fall through to the safe default for that branch —
 * Welcome when signed out, the onboarding analysis when signed in.
 *
 * A pre-signup stage (goal/feeling/example) on an authenticated user is
 * contradictory: v1.0 creates the account only after both questions, so an
 * account means they are past that point. Such a stage is treated as stale and
 * the user resumes at the first analysis rather than being re-asked.
 *
 * When the profile hasn't loaded yet (`onboardingCompleted === null`, e.g. an
 * offline cold start) the user is let into tabs rather than stranded — tabs
 * only need the session. That behaviour predates this change and is preserved.
 */
export function indexDecision(params: {
  session: boolean;
  loading: boolean;
  onboardingCompleted: boolean | null;
  /** Resolved by resolveStage(); null means "no usable information". */
  stage?: OnboardingStage | null;
  /** False while the local stage is still being read from AsyncStorage. */
  stageReady?: boolean;
  passwordRecovery?: boolean;
}): IndexDecision {
  const {
    session,
    loading,
    onboardingCompleted,
    stage = null,
    stageReady = true,
    passwordRecovery = false,
  } = params;

  if (loading) return 'loading';
  if (passwordRecovery) return '(auth)/reset-password';

  // A completed user is routed without consulting the stage at all.
  if (session && onboardingCompleted === true) return '(tabs)';

  if (!stageReady) return 'loading';

  if (!session) {
    if (stage === 'example') return '(onboarding)/example';
    if (stage === 'goal' || stage === 'feeling') return '(onboarding)/questions';
    return '(onboarding)/welcome';
  }

  if (onboardingCompleted === false) {
    if (stage === 'completed') return '(tabs)';
    if (stage === 'notifications') return '(onboarding)/notifications';
    // Everything else means "signed up, no result yet" — including a missing,
    // unknown or pre-signup stage.
    //
    // In the v1.0 flow the account is created AFTER both questions, so an
    // authenticated user has necessarily answered them. Sending such a user to
    // the questionnaire would re-ask what they already answered and strand them
    // short of the first analysis; sending them to the camera resumes exactly
    // where the flow stopped. A pre-signup stage on an account is contradictory
    // and is treated as stale for the same reason.
    return 'photo-analysis-onboarding';
  }

  return '(tabs)';
}
