import { supabase } from './supabase';

// ─── New correlation engine (meal-level, symptoms table) ─────────────────

export interface FoodCorrelation {
  foodName: string;
  timesLogged: number;
  timesWithSymptoms: number;
  correlationPct: number; // 0-100
  topSymptom: string | null;
  riskLevel: 'high' | 'medium' | 'low';
}

export interface SafeFood {
  foodName: string;
  timesLogged: number;
  symptomFreeRate: number; // 0-100
}

export async function computeCorrelations(userId: string, daysBack = 90): Promise<{
  triggerFoods: FoodCorrelation[];
  safeFoods: SafeFood[];
}> {
  const since = new Date();
  since.setDate(since.getDate() - daysBack);
  const sinceISO = since.toISOString();

  const [
    { data: foodLogs, error: foodError },
    { data: symptomLogs, error: symptomError },
  ] = await Promise.all([
    supabase.from('food_logs').select('meal_name, logged_at, foods').eq('user_id', userId).gte('logged_at', sinceISO),
    supabase.from('symptoms').select('symptom_type, logged_at, severity').eq('user_id', userId).gte('logged_at', sinceISO),
  ]);
  if (foodError) throw foodError;
  if (symptomError) throw symptomError;

  if (!foodLogs?.length) return { triggerFoods: [], safeFoods: [] };

  const orderedMeals = [...foodLogs].sort(
    (a, b) => new Date(a.logged_at).getTime() - new Date(b.logged_at).getTime()
  );

  // Build a map: foodName → { total, withSymptoms, symptoms: Map<name, count> }
  const foodMap = new Map<string, { total: number; withSymptom: number; symptoms: Map<string, number> }>();

  orderedMeals.forEach((f, idx) => {
    const name = f.meal_name?.trim();
    if (!name) return;
    const key = name.toLowerCase();
    if (!foodMap.has(key)) foodMap.set(key, { total: 0, withSymptom: 0, symptoms: new Map() });
    const entry = foodMap.get(key)!;
    entry.total++;

    // Find symptoms logged within up to 8 hours after this meal.
    // Cap the window so it does not span a day boundary: a meal before a
    // multi-day gap must not claim a full 8h window into the next day, and a
    // symptom should be attributed to a meal on the SAME calendar day. The end
    // is the earliest of: meal+8h, end-of-day (local midnight), and the next
    // meal — but the next meal only caps the window if it falls on the same day.
    const mealDate = new Date(f.logged_at);
    const mealTime = mealDate.getTime();
    const endOfDay = new Date(
      mealDate.getFullYear(),
      mealDate.getMonth(),
      mealDate.getDate() + 1,
      0, 0, 0, 0
    ).getTime();
    const nextMeal = idx < orderedMeals.length - 1 ? orderedMeals[idx + 1] : null;
    const nextMealTime = nextMeal ? new Date(nextMeal.logged_at).getTime() : Number.POSITIVE_INFINITY;
    // Only let the next meal truncate the window if it is on the same day;
    // otherwise end-of-day already bounds it.
    const nextMealSameDayTime = nextMealTime < endOfDay ? nextMealTime : Number.POSITIVE_INFINITY;
    const windowEnd = Math.min(mealTime + 8 * 3600 * 1000, endOfDay, nextMealSameDayTime);
    const relatedSymptoms = (symptomLogs || []).filter(s => {
      const sTime = new Date(s.logged_at).getTime();
      return sTime > mealTime && sTime <= windowEnd;
    });

    if (relatedSymptoms.length > 0) {
      entry.withSymptom++;
      relatedSymptoms.forEach(s => {
        const sn = s.symptom_type || 'symptom';
        entry.symptoms.set(sn, (entry.symptoms.get(sn) || 0) + 1);
      });
    }
  });

  const triggerFoods: FoodCorrelation[] = [];
  const safeFoods: SafeFood[] = [];

  foodMap.forEach((data, key) => {
    const displayName = foodLogs!.find(f => f.meal_name?.toLowerCase() === key)?.meal_name || key;
    if (data.total < 3) return; // need enough observations for trustable patterns

    const pct = Math.round((data.withSymptom / data.total) * 100);
    const topSymptomEntry = Array.from(data.symptoms.entries()).sort((a, b) => b[1] - a[1])[0];
    const hasHighConfidenceTrigger = data.total >= 4 && data.withSymptom >= 2 && pct >= 55;
    const hasHighConfidenceSafe = data.total >= 5 && data.withSymptom <= 1 && pct <= 15;

    if (hasHighConfidenceTrigger) {
      triggerFoods.push({
        foodName: displayName,
        timesLogged: data.total,
        timesWithSymptoms: data.withSymptom,
        correlationPct: pct,
        topSymptom: topSymptomEntry?.[0] || null,
        riskLevel: pct >= 70 ? 'high' : pct >= 50 ? 'medium' : 'low',
      });
    } else if (hasHighConfidenceSafe) {
      safeFoods.push({
        foodName: displayName,
        timesLogged: data.total,
        symptomFreeRate: 100 - pct,
      });
    }
  });

  triggerFoods.sort((a, b) => b.correlationPct - a.correlationPct);
  safeFoods.sort((a, b) => b.symptomFreeRate - a.symptomFreeRate);

  return {
    triggerFoods: triggerFoods.slice(0, 5),
    safeFoods: safeFoods.slice(0, 5),
  };
}

// ─── Legacy correlation engine (food_logs.foods[], symptoms table) ────────────

export type OldFoodCorrelation = {
  food: string;
  symptom: string;
  occurrences: number;
  totalMeals: number;
  correlationRate: number;
  baselineRate: number;
  riskMultiplier: number;
  confidence: 'low' | 'medium' | 'high';
};

export type CorrelationSummary = {
  topTriggers: OldFoodCorrelation[];
  safeFoods: string[];
  periodDays: number;
  totalMeals: number;
  totalSymptoms: number;
  insufficientData: boolean;
};

/**
 * Analyze correlations between foods eaten and symptoms that follow within a time window.
 *
 * Algorithm:
 * 1. Fetch all food logs (with foods[]) and symptoms for the period
 * 2. For each food item in each meal, check if any symptom occurred 2-24hrs later
 * 3. Compare per-food symptom rate against overall baseline rate
 * 4. riskMultiplier > 1 means the food is associated with more symptoms than average
 */
export async function analyzeCorrelations(
  userId: string,
  periodDays = 30,
  windowHours = { min: 2, max: 24 },
): Promise<CorrelationSummary> {
  const since = new Date();
  since.setDate(since.getDate() - periodDays);
  const sinceStr = since.toISOString();

  // Fetch food logs and symptoms in parallel
  const [foodResult, symptomResult] = await Promise.all([
    supabase
      .from('food_logs')
      .select('foods, meal_name, logged_at')
      .eq('user_id', userId)
      .gte('logged_at', sinceStr)
      .order('logged_at', { ascending: true }),
    supabase
      .from('symptoms')
      .select('symptom_type, severity, logged_at')
      .eq('user_id', userId)
      .gte('logged_at', sinceStr)
      .order('logged_at', { ascending: true }),
  ]);
  if (foodResult.error) throw foodResult.error;
  if (symptomResult.error) throw symptomResult.error;

  const foodLogs = foodResult.data ?? [];
  const symptoms = symptomResult.data ?? [];

  // Extract foods from each meal — use foods[] array, fallback to splitting meal_name
  const mealsWithFoods = foodLogs.map(log => ({
    foods: extractFoods(log.foods, log.meal_name),
    loggedAt: new Date(log.logged_at).getTime(),
  })).filter(m => m.foods.length > 0);

  if (mealsWithFoods.length < 5) {
    return {
      topTriggers: [],
      safeFoods: [],
      periodDays,
      totalMeals: foodLogs.length,
      totalSymptoms: symptoms.length,
      insufficientData: true,
    };
  }

  // Keep a stable identity (the array index) for each symptom event so the same
  // event is never counted twice for a given (food, symptom) pair.
  const symptomTimestamps = symptoms.map((s, index) => ({
    id: index,
    type: s.symptom_type as string,
    time: new Date(s.logged_at).getTime(),
  }));

  const windowMinMs = windowHours.min * 3600_000;
  const windowMaxMs = windowHours.max * 3600_000;

  // Build per-food tracking. For each symptom type we record the SET of distinct
  // symptom-event ids that fell in any of this food's meal windows — not a raw
  // counter. This de-duplicates a single symptom event that would otherwise be
  // counted once per meal whose window covers it (overlapping windows when the
  // same food is eaten repeatedly), so triggers are not over-reported.
  const foodMap = new Map<string, {
    totalMeals: number;
    symptomFollows: Map<string, Set<number>>;
  }>();

  for (const meal of mealsWithFoods) {
    for (const food of meal.foods) {
      if (!foodMap.has(food)) {
        foodMap.set(food, { totalMeals: 0, symptomFollows: new Map() });
      }
      const entry = foodMap.get(food)!;
      entry.totalMeals++;

      // Record which distinct symptom events followed this meal within the window.
      // Cap window at end-of-day so symptoms do not bleed across midnight.
      const mealDate = new Date(meal.loggedAt);
      const endOfMealDay = new Date(mealDate.getFullYear(), mealDate.getMonth(), mealDate.getDate() + 1).getTime() - 1;
      const legacyWindowEnd = Math.min(meal.loggedAt + windowMaxMs, endOfMealDay);
      for (const s of symptomTimestamps) {
        const diff = s.time - meal.loggedAt;
        if (diff >= windowMinMs && s.time <= legacyWindowEnd) {
          let ids = entry.symptomFollows.get(s.type);
          if (!ids) {
            ids = new Set<number>();
            entry.symptomFollows.set(s.type, ids);
          }
          ids.add(s.id);
        }
      }
    }
  }

  // Calculate baseline rates: for each symptom type, what % of days had that symptom?
  const observedDays = Math.max(
    1,
    new Set([
      ...foodLogs.map(f => f.logged_at.split('T')[0]),
      ...symptoms.map(s => s.logged_at.split('T')[0]),
    ]).size
  );
  const symptomDays = new Map<string, Set<string>>();
  for (const s of symptoms) {
    const day = s.logged_at.split('T')[0];
    if (!symptomDays.has(s.symptom_type)) {
      symptomDays.set(s.symptom_type, new Set());
    }
    symptomDays.get(s.symptom_type)!.add(day);
  }
  const baselineRates = new Map<string, number>();
  for (const [type, days] of symptomDays) {
    baselineRates.set(type, days.size / observedDays);
  }

  // Build correlations
  const correlations: OldFoodCorrelation[] = [];
  const safeFoods: string[] = [];

  for (const [food, data] of foodMap) {
    let hasAnySymptom = false;

    for (const [symptomType, symptomEventIds] of data.symptomFollows) {
      hasAnySymptom = true;
      // Count each distinct symptom event once for this (food, symptom) pair.
      const occurrences = symptomEventIds.size;
      const correlationRate = occurrences / data.totalMeals;
      const baseline = baselineRates.get(symptomType) ?? 0;
      const riskMultiplier = baseline > 0
        ? Math.min(10, correlationRate / baseline)
        : (correlationRate > 0 ? 10 : 0);

      const confidence: 'low' | 'medium' | 'high' =
        data.totalMeals < 3 ? 'low' :
        data.totalMeals < 8 ? 'medium' : 'high';

      correlations.push({
        food,
        symptom: symptomType,
        occurrences,
        totalMeals: data.totalMeals,
        correlationRate,
        baselineRate: baseline,
        riskMultiplier,
        confidence,
      });
    }

    // Safe foods: 3+ meals, zero symptom follows
    if (!hasAnySymptom && data.totalMeals >= 3) {
      safeFoods.push(food);
    }
  }

  // Sort by weighted risk: riskMultiplier * confidence weight
  const confidenceWeight = { low: 0.5, medium: 1.0, high: 1.5 };
  correlations.sort((a, b) =>
    (b.riskMultiplier * confidenceWeight[b.confidence]) -
    (a.riskMultiplier * confidenceWeight[a.confidence])
  );

  return {
    topTriggers: correlations.slice(0, 10),
    safeFoods,
    periodDays,
    totalMeals: foodLogs.length,
    totalSymptoms: symptoms.length,
    insufficientData: false,
  };
}

/** Extract normalized food items from foods array or meal name */
function extractFoods(foods: string[] | null, mealName: string | null): string[] {
  if (foods && foods.length > 0) {
    return foods.map(f => f.trim().toLowerCase()).filter(Boolean);
  }
  // Fallback: split meal_name by common separators
  if (mealName) {
    return mealName
      .split(/[,&]|\band\b|\bwith\b/i)
      .map(f => f.trim().toLowerCase())
      .filter(f => f.length > 1);
  }
  return [];
}
