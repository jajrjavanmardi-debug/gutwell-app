import { supabase } from './supabase';
import { addDaysToLocalDateKey, getLocalDateKey } from './date';

export type StreakSnapshot = {
  currentStreak: number;
  bestStreak: number;
  lastCheckInDate: string | null;
};

/**
 * Log a non-fatal failure without crashing the caller. Streak reads/writes are
 * best-effort (they back a cosmetic counter), but swallowing errors silently
 * hides real outages (e.g. RLS misconfig, network). Surface them via warn so
 * they show up in logs / Sentry breadcrumbs.
 */
function reportStreakError(context: string, error: unknown): void {
  // eslint-disable-next-line no-console
  console.warn(`[streaks] ${context}`, error);
}

const EMPTY_STREAK: StreakSnapshot = {
  currentStreak: 0,
  bestStreak: 0,
  lastCheckInDate: null,
};

function normalizeDate(dateStr: string): string {
  return dateStr.split('T')[0];
}

function addDays(dateStr: string, days: number): string {
  return addDaysToLocalDateKey(dateStr, days);
}

function isMissingRelationError(error: any): boolean {
  return error?.code === '42P01' || String(error?.message || '').includes('relation');
}

export function calculateStreakFromDates(inputDates: string[]): StreakSnapshot {
  if (inputDates.length === 0) return EMPTY_STREAK;

  const uniqueSorted = Array.from(new Set(inputDates.map(normalizeDate))).sort((a, b) => a.localeCompare(b));
  let best = 1;
  let running = 1;

  for (let i = 1; i < uniqueSorted.length; i += 1) {
    if (addDays(uniqueSorted[i - 1], 1) === uniqueSorted[i]) {
      running += 1;
      best = Math.max(best, running);
    } else {
      running = 1;
    }
  }

  const today = getLocalDateKey();
  const yesterday = addDays(today, -1);
  const lastDate = uniqueSorted[uniqueSorted.length - 1];

  let current = 0;
  if (lastDate === today || lastDate === yesterday) {
    current = 1;
    for (let i = uniqueSorted.length - 2; i >= 0; i -= 1) {
      if (addDays(uniqueSorted[i], 1) === uniqueSorted[i + 1]) {
        current += 1;
      } else {
        break;
      }
    }
  }

  return {
    currentStreak: current,
    bestStreak: Math.max(best, current),
    lastCheckInDate: lastDate,
  };
}

async function getFallbackFromCheckIns(userId: string): Promise<StreakSnapshot> {
  const { data, error } = await supabase
    .from('check_ins')
    .select('entry_date')
    .eq('user_id', userId)
    .order('entry_date', { ascending: true });

  if (error) {
    reportStreakError('failed to load check-ins for streak recompute', error);
    return EMPTY_STREAK;
  }
  if (!data) return EMPTY_STREAK;
  return calculateStreakFromDates(data.map((row) => row.entry_date));
}

async function upsertStreakRow(userId: string, snapshot: StreakSnapshot): Promise<void> {
  const { error } = await supabase.from('streaks').upsert(
    {
      user_id: userId,
      current_streak: snapshot.currentStreak,
      best_streak: snapshot.bestStreak,
      last_check_in_date: snapshot.lastCheckInDate,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  );

  if (error && !isMissingRelationError(error)) {
    throw error;
  }
}

/**
 * Read the streak for display.
 *
 * The cached `streaks` row stores `current_streak` as last written by a check-in,
 * so after a missed day it goes stale and over-reports until the next check-in
 * refreshes it. To avoid showing a stale-too-high streak, we treat the recompute
 * from `check_ins` dates (`calculateStreakFromDates`, which breaks a streak with
 * no check-in today/yesterday) as the source of truth for DISPLAY, and use the DB
 * row only as a cache.
 *
 * The two sources are reconciled: the recompute drives `currentStreak` /
 * `lastCheckInDate`, while `bestStreak` takes the max of the recompute and the
 * cached value (so an all-time best survives even if old check-ins were pruned).
 * If the recompute diverges from the cache, we write the reconciled value back so
 * the cache self-heals.
 */
export async function getStreakSnapshot(userId: string): Promise<StreakSnapshot> {
  const { data: cacheRow, error: cacheError } = await supabase
    .from('streaks')
    .select('current_streak, best_streak, last_check_in_date')
    .eq('user_id', userId)
    .maybeSingle();

  if (cacheError) {
    reportStreakError('failed to read cached streak row', cacheError);
  }

  const recomputed = await getFallbackFromCheckIns(userId);

  const cachedBest = !cacheError && cacheRow ? cacheRow.best_streak ?? 0 : 0;
  const reconciled: StreakSnapshot = {
    currentStreak: recomputed.currentStreak,
    bestStreak: Math.max(recomputed.bestStreak, cachedBest),
    lastCheckInDate: recomputed.lastCheckInDate,
  };

  // Self-heal the cache when it disagrees with the authoritative recompute
  // (e.g. it went stale across a missed day, or best_streak grew).
  const cacheIsStale =
    cacheError ||
    !cacheRow ||
    (cacheRow.current_streak ?? 0) !== reconciled.currentStreak ||
    (cacheRow.best_streak ?? 0) !== reconciled.bestStreak ||
    (cacheRow.last_check_in_date ?? null) !== reconciled.lastCheckInDate;
  if (cacheIsStale) {
    await upsertStreakRow(userId, reconciled).catch((error) =>
      reportStreakError('failed to refresh stale streak cache', error)
    );
  }

  return reconciled;
}

export async function refreshStreakSnapshot(userId: string): Promise<StreakSnapshot> {
  const fallback = await getFallbackFromCheckIns(userId);
  await upsertStreakRow(userId, fallback).catch((error) =>
    reportStreakError('failed to persist refreshed streak', error)
  );
  return fallback;
}
