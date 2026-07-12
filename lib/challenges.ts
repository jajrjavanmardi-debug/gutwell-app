import { supabase } from './supabase';
import { getStreakSnapshot } from './streaks';
import { getLocalDateKey, localDateKeyToDate } from './date';

/** A challenge from the public catalog (public.challenges). */
export type Challenge = {
  id: string;
  slug: string;
  title: string;
  description: string;
  durationDays: number;
  type: string;
  icon: string;
  participantsCount: number;
  isFeatured: boolean;
  createdAt: string;
};

/** A user's joined challenge (public.user_challenges). */
export type UserChallenge = {
  id: string;
  userId: string;
  challengeId: string;
  joinedAt: string;
  progressDays: number;
  status: 'active' | 'completed' | 'abandoned';
  completedAt: string | null;
};

/** A joined challenge with its catalog details attached, for list rendering. */
export type ActiveChallenge = UserChallenge & { challenge: Challenge };

type ChallengeRow = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  duration_days: number | null;
  type: string | null;
  icon: string | null;
  participants_count: number | null;
  is_featured: boolean | null;
  created_at: string;
};

type UserChallengeRow = {
  id: string;
  user_id: string;
  challenge_id: string;
  joined_at: string;
  progress_days: number | null;
  status: string | null;
  completed_at: string | null;
};

function mapChallenge(row: ChallengeRow): Challenge {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description ?? '',
    durationDays: row.duration_days ?? 7,
    type: row.type ?? 'streak',
    icon: row.icon ?? 'flame-outline',
    participantsCount: row.participants_count ?? 0,
    isFeatured: row.is_featured ?? false,
    createdAt: row.created_at,
  };
}

function mapUserChallenge(row: UserChallengeRow): UserChallenge {
  const status = row.status === 'completed' || row.status === 'abandoned' ? row.status : 'active';
  return {
    id: row.id,
    userId: row.user_id,
    challengeId: row.challenge_id,
    joinedAt: row.joined_at,
    progressDays: row.progress_days ?? 0,
    status,
    completedAt: row.completed_at,
  };
}

/** Fetch the full public challenge catalog, featured first. */
export async function listChallenges(): Promise<Challenge[]> {
  const { data, error } = await supabase
    .from('challenges')
    .select('*')
    .order('is_featured', { ascending: false })
    .order('participants_count', { ascending: false });

  if (error) throw error;
  return (data ?? []).map((row) => mapChallenge(row as ChallengeRow));
}

/** Fetch one challenge by id, or null if it doesn't exist. */
export async function getChallenge(challengeId: string): Promise<Challenge | null> {
  const { data, error } = await supabase
    .from('challenges')
    .select('*')
    .eq('id', challengeId)
    .maybeSingle();

  if (error) throw error;
  return data ? mapChallenge(data as ChallengeRow) : null;
}

/** Fetch the user's joined challenges, each with its catalog details attached. */
export async function listUserChallenges(userId: string): Promise<ActiveChallenge[]> {
  const { data, error } = await supabase
    .from('user_challenges')
    .select('*, challenge:challenges(*)')
    .eq('user_id', userId)
    .order('joined_at', { ascending: false });

  if (error) throw error;

  return (data ?? [])
    .map((row) => {
      const r = row as UserChallengeRow & { challenge: ChallengeRow | null };
      if (!r.challenge) return null;
      return { ...mapUserChallenge(r), challenge: mapChallenge(r.challenge) };
    })
    .filter((x): x is ActiveChallenge => x !== null);
}

/** Fetch the user's row for a single challenge, or null if not joined. */
export async function getUserChallenge(
  userId: string,
  challengeId: string,
): Promise<UserChallenge | null> {
  const { data, error } = await supabase
    .from('user_challenges')
    .select('*')
    .eq('user_id', userId)
    .eq('challenge_id', challengeId)
    .maybeSingle();

  if (error) throw error;
  return data ? mapUserChallenge(data as UserChallengeRow) : null;
}

/** Join a challenge (idempotent — re-joining returns the existing row). */
export async function joinChallenge(
  userId: string,
  challengeId: string,
): Promise<UserChallenge> {
  const { data, error } = await supabase
    .from('user_challenges')
    .upsert(
      { user_id: userId, challenge_id: challengeId, status: 'active' },
      { onConflict: 'user_id,challenge_id' },
    )
    .select('*')
    .single();

  if (error) throw error;
  return mapUserChallenge(data as UserChallengeRow);
}

/** Leave a challenge (removes the user's row). */
export async function leaveChallenge(userId: string, challengeId: string): Promise<void> {
  const { error } = await supabase
    .from('user_challenges')
    .delete()
    .eq('user_id', userId)
    .eq('challenge_id', challengeId);

  if (error) throw error;
}

/**
 * Compute how many days of a challenge the user has completed.
 *
 * Gut-health challenges are streak / daily-habit shaped, so progress is derived
 * from the same check-in streak that drives the rest of the app (lib/streaks):
 * the number of consecutive days the user has logged since joining, capped at the
 * challenge's duration. Returns clamped { progressDays, durationDays, ratio }.
 */
export async function computeChallengeProgress(
  userId: string,
  userChallenge: Pick<UserChallenge, 'joinedAt' | 'progressDays'>,
  durationDays: number,
): Promise<{ progressDays: number; durationDays: number; ratio: number }> {
  let streakDays = userChallenge.progressDays;
  try {
    const snapshot = await getStreakSnapshot(userId);

    // Only credit streak days that fall on or after the join date — a streak
    // that predates joining shouldn't auto-complete a freshly joined challenge.
    const joinedKey = getLocalDateKey(new Date(userChallenge.joinedAt));
    const todayKey = getLocalDateKey();
    const daysSinceJoin =
      Math.floor(
        (localDateKeyToDate(todayKey).getTime() - localDateKeyToDate(joinedKey).getTime()) /
          86_400_000,
      ) + 1;

    streakDays = Math.max(0, Math.min(snapshot.currentStreak, daysSinceJoin));
  } catch {
    // Fall back to the persisted progress_days if the streak read fails.
  }

  const safeDuration = Math.max(1, durationDays);
  const progressDays = Math.max(0, Math.min(streakDays, safeDuration));
  return {
    progressDays,
    durationDays: safeDuration,
    ratio: Math.min(progressDays / safeDuration, 1),
  };
}
