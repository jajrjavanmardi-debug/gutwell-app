import PostHog from 'posthog-react-native';

const POSTHOG_API_KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY || '';
const POSTHOG_HOST = 'https://us.i.posthog.com';

let posthog: PostHog | null = null;

/** Initialize PostHog analytics. Call once at app startup. */
export async function initAnalytics(): Promise<void> {
  if (!POSTHOG_API_KEY || __DEV__) return;
  try {
    posthog = new PostHog(POSTHOG_API_KEY, { host: POSTHOG_HOST });
  } catch (err) {
    console.warn('PostHog init failed:', err);
  }
}

/** Identify a user after auth. */
export function identifyUser(userId: string, properties?: Record<string, unknown>): void {
  posthog?.identify(userId, properties);
}

/** Track an event. */
export function track(event: string, properties?: Record<string, unknown>): void {
  posthog?.capture(event, properties);
}

/** Reset identity on sign out. */
export function resetAnalytics(): void {
  posthog?.reset();
}

// ─── Event names (use these constants for consistency) ──────────────────────

export const Events = {
  ONBOARDING_COMPLETED: 'onboarding_completed',
  CHECKIN_LOGGED: 'checkin_logged',
  MEAL_LOGGED: 'meal_logged',
  SYMPTOM_LOGGED: 'symptom_logged',
  PAYWALL_VIEWED: 'paywall_viewed',
  STREAK_MILESTONE: 'streak_milestone',
  FOOD_SCANNED: 'food_scanned',
  DATA_EXPORTED: 'data_exported',
} as const;
