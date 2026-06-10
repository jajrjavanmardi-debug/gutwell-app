import { PostHog } from 'posthog-react-native';

/**
 * PostHog's own property-bag type, derived from its public `capture` signature
 * (so we don't depend on a non-root-exported type). Our public API accepts the
 * broader `Record<string, unknown>` for caller ergonomics; we narrow to this at
 * the PostHog boundary, which JSON-serializes the properties regardless.
 */
type PostHogProperties = Parameters<PostHog['capture']>[1];

/**
 * Lightweight analytics wrapper around PostHog.
 *
 * Analytics are entirely OPTIONAL: if EXPO_PUBLIC_POSTHOG_KEY is not set (or
 * initialization fails for any reason) every export below becomes a safe no-op.
 * Nothing here should ever throw or crash the app.
 */

const POSTHOG_KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';

let client: PostHog | null = null;

/** Initialize PostHog once at app startup. Silent no-op when unconfigured. */
export function initAnalytics(): void {
  if (client) return; // already initialized
  if (!POSTHOG_KEY) return; // analytics disabled — no key provided

  try {
    client = new PostHog(POSTHOG_KEY, { host: POSTHOG_HOST });
  } catch {
    // Never let analytics setup break the app.
    client = null;
  }
}

export function identifyUser(userId: string, properties?: Record<string, unknown>): void {
  if (!client) return;
  try {
    client.identify(userId, properties as PostHogProperties);
  } catch {
    // ignore
  }
}

/** Track an event. No-op when analytics is unconfigured. */
export function track(event: string, properties?: Record<string, unknown>): void {
  if (!client) return;
  try {
    client.capture(event, properties as PostHogProperties);
  } catch {
    // ignore
  }
}

export function resetAnalytics(): void {
  if (!client) return;
  try {
    client.reset();
  } catch {
    // ignore
  }
}

// ─── Event names (use these constants for consistency) ──────────────────────

export const Events = {
  ONBOARDING_STARTED: 'onboarding_started',
  ONBOARDING_STEP: 'onboarding_step',
  SIGNUP_COMPLETED: 'signup_completed',
  ONBOARDING_COMPLETED: 'onboarding_completed',
  CHECKIN_LOGGED: 'checkin_logged',
  MEAL_LOGGED: 'meal_logged',
  SYMPTOM_LOGGED: 'symptom_logged',
  PAYWALL_VIEWED: 'paywall_viewed',
  STREAK_MILESTONE: 'streak_milestone',
  FOOD_SCANNED: 'food_scanned',
  DATA_EXPORTED: 'data_exported',
  SHARE_OPENED: 'share_opened',
} as const;
