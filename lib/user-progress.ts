import AsyncStorage from '@react-native-async-storage/async-storage';

export type RankName = 'Initiate' | 'Warrior' | 'Apex';

export type UserProgressProfile = {
  xp: number;
  rank: RankName;
  triggers: TriggerFeedbackItem[];
};

export type TriggerFeedbackItem = {
  id: string;
  mealName: string;
  adviceSummary: string;
  symptoms?: string[];
  createdAt: string;
};

const USER_PROGRESS_KEY = 'gutwell_user_progress_profile';

const RANKS: Array<{ name: RankName; minXp: number }> = [
  { name: 'Initiate', minXp: 0 },
  { name: 'Warrior', minXp: 100 },
  { name: 'Apex', minXp: 300 },
];

function getRankForXp(xp: number): RankName {
  return [...RANKS].reverse().find((rank) => xp >= rank.minXp)?.name ?? 'Initiate';
}

export function getNextRankProgress(xp: number): { current: RankName; next: RankName | null; percent: number } {
  const currentRank = getRankForXp(xp);
  const currentIndex = RANKS.findIndex((rank) => rank.name === currentRank);
  const current = RANKS[currentIndex];
  const next = RANKS[currentIndex + 1] ?? null;

  if (!next) {
    return { current: currentRank, next: null, percent: 100 };
  }

  const range = next.minXp - current.minXp;
  const earned = xp - current.minXp;
  return {
    current: currentRank,
    next: next.name,
    percent: Math.max(0, Math.min(100, Math.round((earned / range) * 100))),
  };
}

export async function getUserProgressProfile(): Promise<UserProgressProfile> {
  const raw = await AsyncStorage.getItem(USER_PROGRESS_KEY);
  if (!raw) return { xp: 0, rank: 'Initiate', triggers: [] };

  try {
    const parsed = JSON.parse(raw) as Partial<UserProgressProfile>;
    const xp = Number(parsed.xp ?? 0);
    const triggers = Array.isArray(parsed.triggers) ? parsed.triggers : [];

    return {
      xp: Number.isFinite(xp) ? xp : 0,
      rank: getRankForXp(Number.isFinite(xp) ? xp : 0),
      triggers,
    };
  } catch {
    return { xp: 0, rank: 'Initiate', triggers: [] };
  }
}

export async function addXpForAction(amount: number): Promise<{
  profile: UserProgressProfile;
  leveledUp: boolean;
  previousRank: RankName;
}> {
  const existing = await getUserProgressProfile();
  const previousRank = existing.rank;
  const xp = Math.max(0, existing.xp + amount);
  const profile = {
    ...existing,
    xp,
    rank: getRankForXp(xp),
  };

  await AsyncStorage.setItem(USER_PROGRESS_KEY, JSON.stringify(profile));
  return {
    profile,
    previousRank,
    leveledUp: previousRank !== profile.rank,
  };
}

export async function recordTriggerFeedback(item: Omit<TriggerFeedbackItem, 'id' | 'createdAt'>): Promise<UserProgressProfile> {
  const existing = await getUserProgressProfile();
  const nextTrigger: TriggerFeedbackItem = {
    ...item,
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    createdAt: new Date().toISOString(),
  };
  const profile = {
    ...existing,
    triggers: [nextTrigger, ...existing.triggers].slice(0, 30),
  };

  await AsyncStorage.setItem(USER_PROGRESS_KEY, JSON.stringify(profile));
  return profile;
}
