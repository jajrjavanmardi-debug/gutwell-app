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
  | '(tabs)';

/**
 * App entry decision (app/index.tsx) — the single routing decision point.
 *
 * When the profile hasn't loaded yet the user is let into tabs rather than
 * stranded: tabs only need the session.
 */
export function indexDecision(params: {
  session: boolean;
  loading: boolean;
  onboardingCompleted: boolean | null;
  passwordRecovery?: boolean;
}): IndexDecision {
  const { session, loading, onboardingCompleted, passwordRecovery = false } = params;
  if (loading) return 'loading';
  if (passwordRecovery) return '(auth)/reset-password';
  if (!session) return '(onboarding)/welcome';
  if (onboardingCompleted === false) return '(onboarding)/questions';
  return '(tabs)';
}
