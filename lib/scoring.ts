import { supabase } from './supabase';

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

/**
 * Calculate a gut health score (0-100) for a given user on a given date.
 *
 * Factors:
 * - Stool consistency (type 3-4 = ideal, further away = worse)
 * - Low bloating & pain
 * - High energy
 * - Mood (gut-brain axis factor)
 * - Symptom count (fewer = better)
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

  // 1. Check-in data for the day
  const { data: checkIn } = await supabase
    .from('check_ins')
    .select('stool_type, bloating, pain, energy, mood')
    .eq('user_id', userId)
    .eq('entry_date', date)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (checkIn) {
    // Stool type score: 4 is ideal (25 pts), 3 and 5 are good (20 pts), etc.
    const stoolDiff = Math.abs(checkIn.stool_type - 4);
    const stoolScore = Math.max(0, 25 - stoolDiff * 7);
    stoolComponent = stoolScore - 12;
    score += stoolComponent;

    // Bloating: 1 = best (+10), 5 = worst (-10)
    if (checkIn.bloating) {
      bloatingComponent = (6 - checkIn.bloating) * 3 - 7;
      score += bloatingComponent;
    }

    // Pain: 1 = best (+10), 5 = worst (-10)
    if (checkIn.pain) {
      painComponent = (6 - checkIn.pain) * 3 - 7;
      score += painComponent;
    }

    // Energy: 5 = best (+8), 1 = worst (-8)
    if (checkIn.energy) {
      energyComponent = (checkIn.energy - 3) * 4;
      score += energyComponent;
    }

    // Mood: 5 = best (+5), 1 = worst (-5) — gut-brain axis factor
    if (checkIn.mood) {
      moodComponent = (checkIn.mood - 3) * 2.5;
      score += moodComponent;
    }
  }

  // 2. Symptom count for the day
  const { count: symptomCount } = await supabase
    .from('symptoms')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('logged_at', `${date}T00:00:00`)
    .lte('logged_at', `${date}T23:59:59.999`);

  const symptomPenalty = symptomCount ? symptomCount * -5 : 0;
  score += symptomPenalty;

  // 3. Regularity bonus: if user has checked in 5+ of the last 7 days
  const weekAgo = new Date(date);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const { count: weeklyCheckIns } = await supabase
    .from('check_ins')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('entry_date', weekAgo.toISOString().split('T')[0])
    .lte('entry_date', date);

  const regularityBonus = weeklyCheckIns && weeklyCheckIns >= 5 ? 5 : 0;
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
  const today = new Date().toISOString().split('T')[0];
  const { score, factors } = await calculateGutScore(userId, today);

  await supabase
    .from('gut_scores')
    .upsert({
      user_id: userId,
      date: today,
      score,
      factors,
    }, { onConflict: 'user_id,date' });

  return score;
}
