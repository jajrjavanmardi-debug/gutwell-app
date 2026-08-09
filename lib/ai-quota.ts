/**
 * lib/ai-quota.ts
 *
 * Client half of the AI cost control: the request identity that makes a retry
 * free, and the typed error the screen renders when the daily limit is hit.
 *
 * The limit itself is enforced entirely server-side (migration
 * 20260808120000_ai_cost_control). Nothing here is a check — a client-side
 * check would be advisory at best and is not a spend control. This module only
 * decides what to SEND and what to SAY.
 */

/** Error codes returned by the analyze-food edge function at a daily ceiling. */
export const DAILY_PHOTO_LIMIT_REACHED = 'DAILY_PHOTO_LIMIT_REACHED';
export const DAILY_REVISION_LIMIT_REACHED = 'DAILY_REVISION_LIMIT_REACHED';
export const DAILY_TEXT_LIMIT_REACHED = 'DAILY_TEXT_LIMIT_REACHED';
/**
 * The server refused a photo analysis because the account is not Premium.
 *
 * Distinct from DAILY_PHOTO_LIMIT_REACHED on purpose: one means "buy this",
 * the other means "you already pay for this and have used today's". Collapsing
 * them would show a paywall to a paying subscriber.
 */
export const PREMIUM_REQUIRED = 'PREMIUM_REQUIRED';

/**
 * Longest correction the server will accept without truncating.
 *
 * Mirrors FIELD_LIMITS.correction in the edge function. The input enforces it
 * so a long correction is visibly capped as it is typed, rather than silently
 * cut server-side and answered as if the rest had been read.
 */
export const MAX_CORRECTION_LENGTH = 2000;

export type QuotaMeta = {
  limit?: number;
  used?: number;
  remaining?: number;
  /** ISO timestamp of the next UTC midnight, from the server. */
  resetAt?: string;
};

/**
 * An error carrying the edge function's structured code.
 *
 * `message` stays the existing English fallback so every current call site
 * keeps working unchanged; screens that want translated copy branch on `code`.
 */
export class AnalysisError extends Error {
  readonly code?: string;
  readonly meta: QuotaMeta;

  constructor(message: string, code?: string, meta: QuotaMeta = {}) {
    super(message);
    this.name = 'AnalysisError';
    this.code = code;
    this.meta = meta;
  }
}

export function isDailyPhotoLimitError(error: unknown): error is AnalysisError {
  return error instanceof AnalysisError && error.code === DAILY_PHOTO_LIMIT_REACHED;
}

export function isDailyRevisionLimitError(error: unknown): error is AnalysisError {
  return error instanceof AnalysisError && error.code === DAILY_REVISION_LIMIT_REACHED;
}

export function isPremiumRequiredError(error: unknown): error is AnalysisError {
  return error instanceof AnalysisError && error.code === PREMIUM_REQUIRED;
}

export function isDailyTextLimitError(error: unknown): error is AnalysisError {
  return error instanceof AnalysisError && error.code === DAILY_TEXT_LIMIT_REACHED;
}

/**
 * Longest typed meal description accepted without truncation.
 * Mirrors FIELD_LIMITS.mealDescription in the edge function.
 */
export const MAX_MEAL_DESCRIPTION_LENGTH = 4000;

/**
 * A fresh id for one logical NEW analysis.
 *
 * RFC 4122 v4 shape, built from Math.random rather than a native CSPRNG:
 * expo-crypto is not installed and adding it would mean a native rebuild
 * mid-release. That is acceptable here because the id is not a secret and is
 * never used for authorization. The server keys reservations on
 * (user_id, request_id, usage_date), so an id cannot collide across accounts;
 * the only consequence of a collision would be a user's own second scan being
 * treated as a retry of their first, and at 122 random bits within a single
 * user-day that is not a practical concern.
 *
 * The server rejects anything that is not a well-formed UUID, so a malformed
 * id fails before any provider call rather than costing a slot.
 */
export function newAnalysisRequestId(): string {
  const hex: string[] = [];
  for (let i = 0; i < 256; i++) hex.push((i + 0x100).toString(16).slice(1));
  const b = new Array<number>(16);
  for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40; // version 4
  b[8] = (b[8] & 0x3f) | 0x80; // variant 10xx
  return (
    hex[b[0]] + hex[b[1]] + hex[b[2]] + hex[b[3]] + '-' +
    hex[b[4]] + hex[b[5]] + '-' +
    hex[b[6]] + hex[b[7]] + '-' +
    hex[b[8]] + hex[b[9]] + '-' +
    hex[b[10]] + hex[b[11]] + hex[b[12]] + hex[b[13]] + hex[b[14]] + hex[b[15]]
  );
}

/**
 * Local clock time the limit resets, e.g. "2:00 AM".
 *
 * The server enforces UTC midnight, which lands at different wall-clock times
 * depending on where the user is — so the raw instant is converted rather than
 * described as "midnight", which would be wrong for most of the world.
 *
 * Returns null when the timestamp is missing or unparseable; the caller then
 * omits the sentence entirely rather than printing "Invalid Date".
 */
export function formatQuotaResetTime(
  resetAt: string | undefined,
  language: 'en' | 'de',
): string | null {
  if (!resetAt) return null;
  const when = new Date(resetAt);
  if (Number.isNaN(when.getTime())) return null;
  try {
    return new Intl.DateTimeFormat(language === 'de' ? 'de-DE' : 'en-US', {
      hour: 'numeric',
      minute: '2-digit',
    }).format(when);
  } catch {
    return null;
  }
}
