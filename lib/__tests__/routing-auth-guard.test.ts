/**
 * Routing auth guard logic tests.
 *
 * These test the DECISION LOGIC extracted from _layout.tsx and index.tsx —
 * not the React components themselves (which require a full RN environment).
 *
 * Rules verified:
 *  1. No session + in (tabs)      → redirect to welcome
 *  2. No session + in (auth)      → no redirect (stay in auth)
 *  3. No session + in (onboarding)→ no redirect (stay in onboarding)
 *  4. Session + onboarding done   → stay in tabs
 *  5. Session + onboarding not done → redirect to questions
 *  6. No session (cold start)     → redirect to welcome (index.tsx)
 */

type Segment = string;

function authGuardDecision(
  session: boolean,
  loading: boolean,
  segments: Segment[],
): 'welcome' | 'stay' {
  if (loading) return 'stay';
  const PROTECTED = ['(tabs)', 'photo-analysis', 'food-history', 'weekly-digest',
    'settings', 'log-symptom', 'reminders', 'edit-checkin', 'paywall'];
  const inProtected = PROTECTED.includes(segments[0] ?? '');
  if (!session && inProtected) return 'welcome';
  return 'stay';
}

function indexDecision(
  session: boolean,
  loading: boolean,
  onboardingCompleted: boolean | null,
): '(onboarding)/welcome' | '(onboarding)/questions' | '(tabs)' | 'loading' {
  if (loading) return 'loading';
  if (!session) return '(onboarding)/welcome';
  if (onboardingCompleted === false) return '(onboarding)/questions';
  return '(tabs)';
}

describe('authGuardDecision', () => {
  test('unauthenticated + in tabs → welcome', () => {
    expect(authGuardDecision(false, false, ['(tabs)'])).toBe('welcome');
  });

  test('unauthenticated + in photo-analysis → welcome', () => {
    expect(authGuardDecision(false, false, ['photo-analysis'])).toBe('welcome');
  });

  test('unauthenticated + in (auth) → stay', () => {
    expect(authGuardDecision(false, false, ['(auth)'])).toBe('stay');
  });

  test('unauthenticated + in (onboarding) → stay', () => {
    expect(authGuardDecision(false, false, ['(onboarding)'])).toBe('stay');
  });

  test('authenticated + in tabs → stay', () => {
    expect(authGuardDecision(true, false, ['(tabs)'])).toBe('stay');
  });

  test('loading → stay (no redirect while auth resolves)', () => {
    expect(authGuardDecision(false, true, ['(tabs)'])).toBe('stay');
  });

  test('unauthenticated + settings → welcome', () => {
    expect(authGuardDecision(false, false, ['settings'])).toBe('welcome');
  });

  test('unauthenticated + paywall → welcome', () => {
    expect(authGuardDecision(false, false, ['paywall'])).toBe('welcome');
  });
});

describe('indexDecision', () => {
  test('fresh install (no session) → welcome', () => {
    expect(indexDecision(false, false, false)).toBe('(onboarding)/welcome');
  });

  test('fresh install (no session, null profile) → welcome', () => {
    expect(indexDecision(false, false, null)).toBe('(onboarding)/welcome');
  });

  test('session + onboarding done → tabs', () => {
    expect(indexDecision(true, false, true)).toBe('(tabs)');
  });

  test('session + onboarding not done → questions', () => {
    expect(indexDecision(true, false, false)).toBe('(onboarding)/questions');
  });

  test('session + profile not yet loaded → tabs (never strand)', () => {
    expect(indexDecision(true, false, null)).toBe('(tabs)');
  });

  test('loading → loading (spinner)', () => {
    expect(indexDecision(false, true, null)).toBe('loading');
  });
});
