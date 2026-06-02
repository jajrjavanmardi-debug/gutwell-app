import { supabase } from './supabase';
import { addDaysToLocalDateKey, getLocalDateKey, getLocalDayIsoRange } from './date';

export type ScoreFactors = {
  stool_score: number;
  bloating_score: number;
  pain_score: number;
  energy_score: number;
  mood_score: number;
  symptom_penalty: number;
  regularity_bonus: number;
  calculated_at: string;
};

function asClampedNumber(value: unknown, min: number, max: number): number | null {
  if (typeof value !== 'number' || Number.isNaN(value)) return null;
  return Math.min(max, Math.max(min, value));
}

// ─── Scoring constants ────────────────────────────────────────────────────────

/**
 * Points per same-day symptom. Deliberately gentle: symptoms inform the score
 * but must never dominate it, and — combined with the awareness credit below —
 * honestly logging how you feel should never score WORSE than hiding it.
 */
const SYMPTOM_PENALTY_PER_SYMPTOM = -3;
/** Floor for the raw symptom penalty (before the awareness credit). */
const SYMPTOM_PENALTY_FLOOR = -12;
/**
 * Awareness credit applied whenever the user logs at least one symptom. The
 * behavior we want to reinforce is *honest tracking*, not symptom-free days, so
 * this fully offsets the first symptom's penalty: logging one symptom is
 * net-neutral rather than punishing the user for being honest. Additional
 * symptoms still nudge the score down to reflect a rougher day, but gently and
 * capped (net floor ≈ -9).
 */
const SYMPTOM_AWARENESS_BONUS = 3;

/**
 * Number of check-ins in the trailing 7 days required to earn the regularity
 * bonus.
 *
 * TODO: Ideally this should honor the user's configured daily goal. As of now,
 * the only user goal/units settings live in AsyncStorage (`gutwell_settings` in
 * app/settings.tsx) where `dailyGoal` is a qualitative category ('Reduce
 * Bloating', etc.) and `metricUnits` is unrelated to scoring — there is no
 * numeric check-in target, and scoring runs against Supabase with no path to
 * AsyncStorage (it is also invoked headlessly via updateTodayScore). If a
 * numeric weekly/daily check-in goal is later persisted to the DB (e.g. a
 * profiles/user_settings column), thread it through calculateGutScore and use it
 * here instead of this hardcoded threshold.
 */
const REGULARITY_BONUS_MIN_CHECKINS = 5;
/** Points awarded when the regularity threshold is met. */
const REGULARITY_BONUS_POINTS = 5;

/**
 * Calculate a gut health score (0-100) for a given user on a given date.
 *
 * Factors:
 * - Stool consistency (type 3-4 = ideal, further away = worse)
 * - Low bloating & pain
 * - High energy
 * - Mood (gut-brain axis factor)
 * - Symptom awareness (honest logging is credited, never punished)
 * - Check-in regularity bonus
 */
export async function calculateGutScore(
  userId: string,
  date: string,
): Promise<{ score: number; factors: ScoreFactors }> {
  let score = 50;
  let stoolComponent = 0;
  let bloatingComponent = 0;
  let painComponent = 0;
  let energyComponent = 0;
  let moodComponent = 0;

  // Compute the week-ago date before firing queries
  const weekAgoDate = addDaysToLocalDateKey(date, -7);
  const { startIso: symptomStartIso, endIso: symptomEndIso } = getLocalDayIsoRange(date);

  // 1-3. Run all three independent DB calls in parallel
  const [
    { data: checkIn, error: checkInError },
    { count: symptomCount, error: symptomError },
    { count: weeklyCheckIns, error: weeklyCheckInsError },
  ] = await Promise.all([
    // 1. Check-in data for the day
    supabase
      .from('check_ins')
      .select('stool_type, bloating, pain, energy, mood')
      .eq('user_id', userId)
      .eq('entry_date', date)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    // 2. Symptom count for the day
    supabase
      .from('symptoms')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('logged_at', symptomStartIso)
      .lt('logged_at', symptomEndIso),
    // 3. Regularity bonus: check-ins in the last 7 days
    supabase
      .from('check_ins')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('entry_date', weekAgoDate)
      .lte('entry_date', date),
  ]);

  if (checkInError) throw checkInError;
  if (symptomError) throw symptomError;
  if (weeklyCheckInsError) throw weeklyCheckInsError;

  if (checkIn) {
    const stoolType = asClampedNumber(checkIn.stool_type, 1, 7);
    const bloating = asClampedNumber(checkIn.bloating, 1, 5);
    const pain = asClampedNumber(checkIn.pain, 1, 5);
    const energy = asClampedNumber(checkIn.energy, 1, 5);
    const mood = asClampedNumber(checkIn.mood, 1, 5);

    // Stool type score: 4 is ideal (25 pts), 3 and 5 are good (20 pts), etc.
    if (stoolType !== null) {
      const stoolDiff = Math.abs(stoolType - 4);
      const stoolScore = Math.max(0, 25 - stoolDiff * 7);
      stoolComponent = stoolScore - 12;
      score += stoolComponent;
    }

    // Bloating: 1 = best (+10), 5 = worst (-10)
    if (bloating !== null) {
      bloatingComponent = (6 - bloating) * 3 - 7;
      score += bloatingComponent;
    }

    // Pain: 1 = best (+10), 5 = worst (-10)
    if (pain !== null) {
      painComponent = (6 - pain) * 3 - 7;
      score += painComponent;
    }

    // Energy: 5 = best (+8), 1 = worst (-8)
    if (energy !== null) {
      energyComponent = (energy - 3) * 4;
      score += energyComponent;
    }

    // Mood: 5 = best (+5), 1 = worst (-5) — gut-brain axis factor
    if (mood !== null) {
      moodComponent = (mood - 3) * 2.5;
      score += moodComponent;
    }
  }

  // Symptom impact = a gentle, capped penalty OFFSET by an awareness credit, so
  // honestly logging a symptom is never worse than not logging one (the first
  // symptom nets to zero). This removes the perverse "tracking hurts my score"
  // incentive while still letting a genuinely rough day register.
  const rawSymptomPenalty = symptomCount
    ? Math.max(SYMPTOM_PENALTY_FLOOR, symptomCount * SYMPTOM_PENALTY_PER_SYMPTOM)
    : 0;
  const symptomPenalty = rawSymptomPenalty + (symptomCount ? SYMPTOM_AWARENESS_BONUS : 0);
  score += symptomPenalty;

  const regularityBonus =
    weeklyCheckIns && weeklyCheckIns >= REGULARITY_BONUS_MIN_CHECKINS
      ? REGULARITY_BONUS_POINTS
      : 0;
  score += regularityBonus;

  const finalScore = Math.max(0, Math.min(100, Math.round(score)));

  return {
    score: finalScore,
    factors: {
      stool_score: stoolComponent,
      bloating_score: bloatingComponent,
      pain_score: painComponent,
      energy_score: energyComponent,
      mood_score: moodComponent,
      symptom_penalty: symptomPenalty,
      regularity_bonus: regularityBonus,
      calculated_at: new Date().toISOString(),
    },
  };
}

/**
 * Calculate and save today's gut score for a user.
 */
export async function updateTodayScore(userId: string): Promise<number> {
  const today = getLocalDateKey();
  const { score, factors } = await calculateGutScore(userId, today);

  const { error } = await supabase
    .from('gut_scores')
    .upsert({
      user_id: userId,
      date: today,
      score,
      factors,
    }, { onConflict: 'user_id,date' });
  if (error) throw error;

  return score;
}
