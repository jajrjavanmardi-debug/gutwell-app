import { supabase } from './supabase';

export type StreakSnapshot = {
  currentStreak: number;
  bestStreak: number;
  lastCheckInDate: string | null;
};

const EMPTY_STREAK: StreakSnapshot = {
  currentStreak: 0,
  bestStreak: 0,
  lastCheckInDate: null,
};

function normalizeDate(dateStr: string): string {
  return dateStr.split('T')[0];
}

function addDays(dateStr: string, days: number): string {
  const date = new Date(`${dateStr}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
}

function isMissingRelationError(error: any): boolean {
  return error?.code === '42P01' || String(error?.message || '').includes('relation');
}

function calculateStreakFromDates(inputDates: string[]): StreakSnapshot {
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

  const today = new Date().toISOString().split('T')[0];
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

  if (error || !data) return EMPTY_STREAK;
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

export async function getStreakSnapshot(userId: string): Promise<StreakSnapshot> {
  const { data, error } = await supabase
    .from('streaks')
    .select('current_streak, best_streak, last_check_in_date')
    .eq('user_id', userId)
    .maybeSingle();

  if (!error && data) {
    return {
      currentStreak: data.current_streak ?? 0,
      bestStreak: data.best_streak ?? 0,
      lastCheckInDate: data.last_check_in_date ?? null,
    };
  }

  const fallback = await getFallbackFromCheckIns(userId);
  await upsertStreakRow(userId, fallback).catch(() => {});
  return fallback;
}

export async function refreshStreakSnapshot(userId: string): Promise<StreakSnapshot> {
  const fallback = await getFallbackFromCheckIns(userId);
  await upsertStreakRow(userId, fallback).catch(() => {});
  return fallback;
}
