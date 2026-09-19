/**
 * lib/meal-log.ts
 *
 * The single place a photo-analysis meal becomes a `food_logs` row.
 *
 * Two callers need the same write with different surfaces:
 *
 *   the Log meal button — spinner, success/offline/failure toasts
 *   onboarding Continue — silent, must never interrupt the transition
 *
 * Rather than have Continue call the button's handler and inherit its toasts,
 * both build the payload here and call saveMealLog. The payload shape exists
 * once, so the two cannot drift.
 *
 * ── Idempotency ─────────────────────────────────────────────────────────────
 * Migration 20260610113000 added `food_logs.client_uuid` with a unique index on
 * (user_id, client_uuid), and the offline queue already upserts on it. This
 * reuses that mechanism rather than inventing one: pass a client_uuid that is
 * stable for a given analysis result and repeated saves — a double tap, a retry
 * after a timeout, a remount mid-flight — collapse into a single row.
 *
 * Online inserts historically left client_uuid NULL, and Postgres treats NULLs
 * as distinct in a unique index, so callers that omit it keep exactly today's
 * behaviour. The visible Log meal button does omit it, deliberately: a user who
 * taps it twice is expressing intent twice.
 */
// Required lazily inside saveMealLog: lib/supabase.ts throws on load without
// env config, and buildFoodLogPayload is a pure function that callers and tests
// should be able to use without a configured client.

export type MealLogInput = {
  userId: string;
  mealName: string;
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  note: string;
  /** Stable per analysis result. Omit for the manual button. */
  clientUuid?: string;
};

export type MealLogResult =
  | { status: 'saved' }
  | { status: 'queued' }
  | { status: 'failed'; error: unknown };

/** Builds the row exactly once, for both callers. */
export function buildFoodLogPayload(input: MealLogInput): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    user_id: input.userId,
    meal_name: input.mealName.trim().slice(0, 200),
    meal_type: input.mealType,
    foods: null,
    note: input.note.slice(0, 600),
    logged_at: new Date().toISOString(),
  };
  if (input.clientUuid) payload.client_uuid = input.clientUuid;
  return payload;
}

/** A network-shaped failure, which the offline queue can retry later. */
function isOffline(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  return (
    Boolean(error.message?.toLowerCase().includes('network')) ||
    error.code === 'PGRST301' ||
    !error.code
  );
}

/**
 * Write the meal. Never throws — callers decide how to surface the outcome, and
 * onboarding must be able to continue regardless.
 *
 * With a clientUuid the write is an upsert on the existing unique index, so it
 * is safe to call more than once for the same analysis.
 */
export async function saveMealLog(input: MealLogInput): Promise<MealLogResult> {
  const payload = buildFoodLogPayload(input);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { supabase } = require('./supabase') as typeof import('./supabase');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { enqueue } = require('./offline-queue') as typeof import('./offline-queue');
  try {
    const { error } = input.clientUuid
      ? await supabase.from('food_logs').upsert(payload, { onConflict: 'user_id,client_uuid' })
      : await supabase.from('food_logs').insert(payload);

    if (!error) return { status: 'saved' };

    if (isOffline(error)) {
      await enqueue(
        'food_logs',
        payload,
        input.clientUuid ? { operation: 'upsert', onConflict: 'user_id,client_uuid' } : undefined,
      );
      return { status: 'queued' };
    }
    return { status: 'failed', error };
  } catch (error) {
    return { status: 'failed', error };
  }
}
