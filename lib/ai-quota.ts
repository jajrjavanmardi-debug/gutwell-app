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
 * The account's free AI-analysis window has run out.
 *
 * NOT the same as DAILY_TEXT_LIMIT_REACHED, and the two must never be
 * collapsed: "today's is used, come back tomorrow" is a wait, while this is
 * "the free period is over, this is a Premium feature from now on". Rendering
 * the first for the second would promise a tomorrow that never arrives.
 *
 * The server does not emit this yet — Free is still 5/day and the 14-day window
 * is inert. The code, the type guard and the rendering path exist now so the
 * server can start emitting it without a client release.
 */
export const FREE_WINDOW_ENDED = 'FREE_WINDOW_ENDED';

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
  /**
   * Free-window fields. EVERY ONE OF THESE COMES FROM THE SERVER.
   *
   * None is computed, defaulted or guessed here: the window is anchored on
   * auth.users.created_at, which the client cannot see, and a local guess would
   * drift from the only copy that matters. When a field is absent the UI omits
   * the sentence that needs it rather than inventing a number — see
   * freeWindowProgress().
   */
  /** ISO timestamp the free window closes. */
  windowEndsAt?: string;
  /** Whole days left in the free window, server-computed. */
  daysRemaining?: number;
  /** 1-based day within the window, server-computed. */
  dayOfWindow?: number;
  /** Length of the window in days, server-computed (14 today). */
  windowTotalDays?: number;
  /**
   * Which allowance answered this request. Server-resolved from the
   * entitlement; never inferred from local RevenueCat state, which is a cache
   * and is not a security boundary.
   */
  tier?: 'free' | 'premium';
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

export function isFreeWindowEndedError(error: unknown): error is AnalysisError {
  return error instanceof AnalysisError && error.code === FREE_WINDOW_ENDED;
}

/**
 * The provider failed — NOT the user's allowance.
 *
 * This distinction is the whole point of the function. When Gemini returns 429
 * RESOURCE_EXHAUSTED the edge function classifies it upstream and answers
 * UPSTREAM_ERROR, and the user's slot is deliberately not refunded (a refunded
 * failure would let anyone farm free compute by forcing errors). So the user
 * really has lost an analysis — but they did not exceed anything, and telling
 * them they hit their own daily limit would be a lie about their account.
 *
 * Kept separate from every quota code so the copy can say "the service is
 * busy", which is what actually happened.
 */
export function isProviderUnavailableError(error: unknown): error is AnalysisError {
  return (
    error instanceof AnalysisError &&
    (error.code === 'UPSTREAM_ERROR' || error.code === 'EMPTY_RESPONSE')
  );
}

/**
 * What the screen should show, resolved from the server's answer alone.
 *
 * A discriminated union rather than a pile of booleans so an unhandled state is
 * a type error instead of a blank screen, and so the two states that look alike
 * — "today's is used" and "the free period ended" — cannot be rendered by the
 * same branch.
 */
export type AnalysisQuotaState =
  | { kind: 'ok' }
  /** Free, inside the window, today's analysis already spent. */
  | { kind: 'free_daily_used'; resetAt?: string }
  /** Free, the 14-day window is over. Premium from here. */
  | { kind: 'free_window_ended'; windowEndsAt?: string }
  /** Free, today's correction already spent. */
  | { kind: 'revision_used'; resetAt?: string }
  /** Premium hit the abuse ceiling. NOT a paywall — they already pay. */
  | { kind: 'premium_ceiling'; resetAt?: string }
  /** Photo analysis on a Free account. The one state that sells Premium. */
  | { kind: 'premium_required' }
  /** The provider failed. Nothing to do with the user's allowance. */
  | { kind: 'provider_unavailable' }
  /** Anything else — auth, network, validation. Rendered by the caller. */
  | { kind: 'other' };

/**
 * Map a failed analysis to the state the UI should render.
 *
 * `localPremiumHint` decides ONLY which copy a daily-limit error gets: a subscriber
 * who hits 20/day must see "try again tomorrow", never Free-window copy and
 * never a paywall for something they already bought. It is a presentation
 * input, not a security input — the server has already made the real decision
 * by the time this runs, and this function cannot grant anything. It is named
 * a "hint" deliberately: an option called isPremium reads like a claim being
 * asserted, and ai-cost-control.test.ts rightly forbids that shape anywhere in
 * the screen, because that is how a client would try to put one on the wire.
 *
 * `meta.tier` wins when the server sends it, because the server knows; the
 * local flag is only the fallback for a server that has not started sending it.
 */
export function quotaStateForError(
  error: unknown,
  opts: { localPremiumHint?: boolean } = {},
): AnalysisQuotaState {
  if (!(error instanceof AnalysisError)) return { kind: 'other' };

  // Compared by code rather than through the exported type guards: each guard
  // narrows to AnalysisError, which is already the type here, so chaining them
  // narrows the negative branch to `never`.
  const code = error.code;
  const meta = error.meta;

  if (code === 'UPSTREAM_ERROR' || code === 'EMPTY_RESPONSE') {
    return { kind: 'provider_unavailable' };
  }
  if (code === PREMIUM_REQUIRED) return { kind: 'premium_required' };
  if (code === FREE_WINDOW_ENDED) {
    return { kind: 'free_window_ended', windowEndsAt: meta.windowEndsAt };
  }

  const premium = meta.tier ? meta.tier === 'premium' : opts.localPremiumHint === true;

  if (code === DAILY_REVISION_LIMIT_REACHED) {
    return premium
      ? { kind: 'premium_ceiling', resetAt: meta.resetAt }
      : { kind: 'revision_used', resetAt: meta.resetAt };
  }
  if (code === DAILY_TEXT_LIMIT_REACHED || code === DAILY_PHOTO_LIMIT_REACHED) {
    return premium
      ? { kind: 'premium_ceiling', resetAt: meta.resetAt }
      : { kind: 'free_daily_used', resetAt: meta.resetAt };
  }
  return { kind: 'other' };
}

/**
 * "Day 4 of 14" — or null when the server has not said.
 *
 * Deliberately NOT expressed as a count of remaining analyses. Missed days do
 * not accumulate, so "10 analyses remaining" promises a balance the user will
 * never be able to spend; the honest unit is the day within a fixed window.
 *
 * Returns null unless BOTH numbers arrived from the server. Guessing one would
 * mean showing a confident number that is wrong.
 */
export function freeWindowProgress(
  meta: QuotaMeta | undefined,
): { day: number; total: number } | null {
  const day = meta?.dayOfWindow;
  const total = meta?.windowTotalDays;
  if (typeof day !== 'number' || typeof total !== 'number') return null;
  if (!Number.isFinite(day) || !Number.isFinite(total)) return null;
  if (day < 1 || total < 1 || day > total) return null;
  return { day, total };
}
