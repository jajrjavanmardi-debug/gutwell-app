import { getLocalDateKey } from '../lib/date';
import { generateDailyGutScoreInsight } from '../lib/groq';
import { updateTodayScore } from '../lib/scoring';
import { supabase } from '../lib/supabase';

export type DailyCheckInData = {
  stoolType: number | null;
  bloating: number;
  pain: number;
  energy: number;
  mood: number | null;
  waterIntake: number;
};

export type GutScoreResult = {
  score: number;
  status: 'low' | 'moderate' | 'strong';
  focusAreas: string[];
};

export type OnboardingProfilePayload = {
  answers: Record<string, string>;
  mainGoal: string;
  focusAreas: string[];
  firstHabits: string[];
  stoolFrequencyBaseline?: string;
  stoolTypeBaseline?: string;
  symptomsBaseline?: string[];
  dietPatternBaseline?: string;
  fiberIntakeBaseline?: string;
  stressImpactBaseline?: string;
  sleepQualityBaseline?: string;
  triggerFoodAwareness?: string;
};

export type DailyGutScoreCardData = {
  score: number;
  date: string;
  insight: string;
};

type UserProfileScoreRow = Record<string, unknown>;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function readString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function buildDailyGutScoreFallbackInsight(score: number, mainGoal: string | null): string {
  const goal = mainGoal?.trim();

  if (score >= 75) {
    return goal
      ? `Your gut score is strong today; keep one steady habit supporting ${goal}.`
      : 'Your gut score is strong today; keep meals simple, hydrated, and consistent.';
  }

  if (score >= 50) {
    return goal
      ? `Your gut score is moderate; choose one gentle meal or hydration step for ${goal}.`
      : 'Your gut score is moderate; choose one gentle meal and track symptoms today.';
  }

  return goal
    ? `Your gut score needs support; keep portions gentle and avoid likely triggers for ${goal}.`
    : 'Your gut score needs support; keep portions gentle and avoid likely triggers today.';
}

async function getDailyGutScoreInsight(input: { score: number; mainGoal: string | null }): Promise<string> {
  try {
    const insight = await generateDailyGutScoreInsight(input);
    return insight.trim() || buildDailyGutScoreFallbackInsight(input.score, input.mainGoal);
  } catch {
    return buildDailyGutScoreFallbackInsight(input.score, input.mainGoal);
  }
}

/**
 * Pure scoring engine for daily check-in values (0-100).
 */
export function calculateGutScoreFromCheckIn(data: DailyCheckInData): GutScoreResult {
  let score = 50;
  const focusAreas = new Set<string>();

  if (data.stoolType != null) {
    // Ideal stool is type 4, with 3/5 close behind.
    const stoolDiff = Math.abs(data.stoolType - 4);
    score += Math.max(-18, 16 - stoolDiff * 8);
    if (stoolDiff >= 2) focusAreas.add('stool consistency');
  } else {
    focusAreas.add('check-in consistency');
  }

  score += (6 - clamp(data.bloating, 1, 5)) * 3 - 7;
  if (data.bloating >= 4) focusAreas.add('bloating management');

  score += (6 - clamp(data.pain, 1, 5)) * 3 - 7;
  if (data.pain >= 4) focusAreas.add('pain reduction');

  score += (clamp(data.energy, 1, 5) - 3) * 4;
  if (data.energy <= 2) focusAreas.add('energy support');

  if (data.mood != null) {
    score += (clamp(data.mood, 1, 5) - 3) * 2;
  } else {
    focusAreas.add('mood awareness');
  }

  // Hydration has a moderate positive effect.
  const hydrationBonus = Math.min(6, Math.round(clamp(data.waterIntake, 0, 12) * 0.75));
  score += hydrationBonus;
  if (data.waterIntake < 6) focusAreas.add('hydration');

  const finalScore = clamp(Math.round(score), 0, 100);
  const status: GutScoreResult['status'] =
    finalScore >= 75 ? 'strong' : finalScore >= 50 ? 'moderate' : 'low';

  return {
    score: finalScore,
    status,
    focusAreas: Array.from(focusAreas).slice(0, 3),
  };
}
type GoalAwareProfile = {
  mainGoal: string;
  stoolTypeBaseline?: string | null;
  symptomsBaseline?: string[] | null;
};

type DailyScoreLogs = {
  checkIn: {
    stoolType: number | null;
    bloating: number | null;
    pain: number | null;
    energy: number | null;
    mood: number | null;
    waterIntake: number | null;
  };
};

/**
 * Goal-aware 0-100 score using profile + daily logs.
 */
export function calculateGutScore(
  profile: GoalAwareProfile,
  logs: DailyScoreLogs,
): GutScoreResult {
  const mainGoal = (profile.mainGoal || '').toLowerCase();
  const c = logs.checkIn;

  let score = 50;
  const focusAreas = new Set<string>();

  const stoolType = c.stoolType ?? 4;
  const bloating = clamp(c.bloating ?? 3, 1, 5);
  const pain = clamp(c.pain ?? 3, 1, 5);
  const energy = clamp(c.energy ?? 3, 1, 5);
  const mood = c.mood != null ? clamp(c.mood, 1, 5) : 3;
  const water = clamp(c.waterIntake ?? 0, 0, 12);

  const stoolDiff = Math.abs(stoolType - 4);
  const stoolScore = Math.max(0, 24 - stoolDiff * 8);
  const symptomScore = (6 - bloating) * 6 + (6 - pain) * 6;
  const consistencyScore = Math.max(0, 18 - stoolDiff * 5);
  const triggerSignalScore = stoolDiff <= 1 ? 10 : 4;
  const generalScore = stoolScore + symptomScore + energy * 2 + mood * 1.5 + water * 0.8;

  if (mainGoal.includes('reduce bloating')) {
    score = 20 + symptomScore * 2.4 + water * 1.2 + (6 - pain) * 2;
    focusAreas.add('symptom relief');
  } else if (mainGoal.includes('improve regularity')) {
    score = 18 + stoolScore * 2.5 + consistencyScore + water * 1.4;
    focusAreas.add('regularity');
  } else if (mainGoal.includes('improve consistency')) {
    score = 18 + consistencyScore * 2.8 + stoolScore * 1.6 + mood;
    focusAreas.add('stool consistency');
  } else if (mainGoal.includes('identify triggers')) {
    score = 22 + triggerSignalScore * 3 + mood * 2 + energy * 2;
    focusAreas.add('trigger discovery');
  } else {
    score = 15 + generalScore * 1.35;
    focusAreas.add('daily balance');
  }

  if (bloating >= 4) focusAreas.add('bloating');
  if (pain >= 4) focusAreas.add('pain');
  if (energy <= 2) focusAreas.add('energy');
  if (water < 6) focusAreas.add('hydration');

  const finalScore = clamp(Math.round(score), 0, 100);
  return {
    score: finalScore,
    status: finalScore >= 75 ? 'strong' : finalScore >= 50 ? 'moderate' : 'low',
    focusAreas: Array.from(focusAreas).slice(0, 3),
  };
}

/**
 * Stores onboarding profile details for a user in `user_profiles`.
 */
export async function saveOnboardingResultsToUserProfile(
  userId: string,
  payload: OnboardingProfilePayload,
): Promise<void> {
  const { error } = await supabase.from('user_profiles').upsert(
    {
      user_id: userId,
      onboarding_answers: payload.answers,
      main_goal: payload.mainGoal,
      focus_areas: payload.focusAreas,
      first_habits: payload.firstHabits,
      stool_frequency_baseline: payload.stoolFrequencyBaseline ?? '',
      stool_type_baseline: payload.stoolTypeBaseline ?? '',
      symptoms_baseline: payload.symptomsBaseline ?? [],
      diet_pattern_baseline: payload.dietPatternBaseline ?? '',
      fiber_intake_baseline: payload.fiberIntakeBaseline ?? '',
      stress_impact_baseline: payload.stressImpactBaseline ?? '',
      sleep_quality_baseline: payload.sleepQualityBaseline ?? '',
      trigger_food_awareness: payload.triggerFoodAwareness ?? '',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );

  if (error) throw error;
}

export async function fetchDailyGutScoreCardData(userId: string): Promise<DailyGutScoreCardData> {
  const today = getLocalDateKey();
  await updateTodayScore(userId);

  const [{ data: profile }, { data: checkIn }] = await Promise.all([
    supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle(),
    supabase
      .from('check_ins')
      .select('stool_type, bloating, pain, energy, mood, water_intake')
      .eq('user_id', userId)
      .eq('entry_date', today)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const profileRow = (profile ?? {}) as UserProfileScoreRow;
  const scoreResult = calculateGutScore(
    {
      mainGoal: readString(profileRow.main_goal, 'General health'),
      stoolTypeBaseline: readString(profileRow.stool_type_baseline, '') || null,
      symptomsBaseline: readStringArray(profileRow.symptoms_baseline),
    },
    {
      checkIn: {
        stoolType: checkIn?.stool_type ?? null,
        bloating: checkIn?.bloating ?? null,
        pain: checkIn?.pain ?? null,
        energy: checkIn?.energy ?? null,
        mood: checkIn?.mood ?? null,
        waterIntake: checkIn?.water_intake ?? null,
      },
    },
  );

  const insight = await getDailyGutScoreInsight({
    score: scoreResult.score,
    mainGoal: readString(profileRow.main_goal, '') || null,
  });

  return {
    score: scoreResult.score,
    date: today,
    insight,
  };
}
