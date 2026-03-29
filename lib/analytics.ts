/** Track an event (no-op stub — analytics provider removed). */
export function initAnalytics(): void {}
export function identifyUser(_userId: string, _properties?: Record<string, unknown>): void {}
export function track(_event: string, _properties?: Record<string, unknown>): void {}
export function resetAnalytics(): void {}

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
