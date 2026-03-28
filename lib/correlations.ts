import { supabase } from './supabase';

// ─── New correlation engine (meal-level, symptom_logs table) ─────────────────

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

  const [{ data: foodLogs }, { data: symptomLogs }] = await Promise.all([
    supabase.from('food_logs').select('meal_name, logged_at, foods').eq('user_id', userId).gte('logged_at', sinceISO),
    supabase.from('symptom_logs').select('symptom_name, logged_at, severity').eq('user_id', userId).gte('logged_at', sinceISO),
  ]);

  if (!foodLogs?.length) return { triggerFoods: [], safeFoods: [] };

  // Build a map: foodName → { total, withSymptoms, symptoms: Map<name, count> }
  const foodMap = new Map<string, { total: number; withSymptom: number; symptoms: Map<string, number> }>();

  foodLogs.forEach(f => {
    const name = f.meal_name?.trim();
    if (!name) return;
    const key = name.toLowerCase();
    if (!foodMap.has(key)) foodMap.set(key, { total: 0, withSymptom: 0, symptoms: new Map() });
    const entry = foodMap.get(key)!;
    entry.total++;

    // Find symptoms logged within 1–8 hours after this meal
    const mealTime = new Date(f.logged_at).getTime();
    const relatedSymptoms = (symptomLogs || []).filter(s => {
      const sTime = new Date(s.logged_at).getTime();
      return sTime > mealTime && sTime - mealTime <= 8 * 3600 * 1000;
    });

    if (relatedSymptoms.length > 0) {
      entry.withSymptom++;
      relatedSymptoms.forEach(s => {
        const sn = s.symptom_name || 'symptom';
        entry.symptoms.set(sn, (entry.symptoms.get(sn) || 0) + 1);
      });
    }
  });

  const triggerFoods: FoodCorrelation[] = [];
  const safeFoods: SafeFood[] = [];

  foodMap.forEach((data, key) => {
    const displayName = foodLogs!.find(f => f.meal_name?.toLowerCase() === key)?.meal_name || key;
    if (data.total < 2) return; // need at least 2 data points

    const pct = Math.round((data.withSymptom / data.total) * 100);
    const topSymptomEntry = Array.from(data.symptoms.entries()).sort((a, b) => b[1] - a[1])[0];

    if (pct >= 40) {
      triggerFoods.push({
        foodName: displayName,
        timesLogged: data.total,
        timesWithSymptoms: data.withSymptom,
        correlationPct: pct,
        topSymptom: topSymptomEntry?.[0] || null,
        riskLevel: pct >= 70 ? 'high' : pct >= 50 ? 'medium' : 'low',
      });
    } else if (pct <= 20 && data.total >= 3) {
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

  const symptomTimestamps = symptoms.map(s => ({
    type: s.symptom_type as string,
    time: new Date(s.logged_at).getTime(),
  }));

  const windowMinMs = windowHours.min * 3600_000;
  const windowMaxMs = windowHours.max * 3600_000;

  // Build per-food tracking
  const foodMap = new Map<string, {
    totalMeals: number;
    symptomFollows: Map<string, number>;
  }>();

  for (const meal of mealsWithFoods) {
    for (const food of meal.foods) {
      if (!foodMap.has(food)) {
        foodMap.set(food, { totalMeals: 0, symptomFollows: new Map() });
      }
      const entry = foodMap.get(food)!;
      entry.totalMeals++;

      // Check which symptoms followed this meal within the window
      const matchedTypes = new Set<string>();
      for (const s of symptomTimestamps) {
        const diff = s.time - meal.loggedAt;
        if (diff >= windowMinMs && diff <= windowMaxMs && !matchedTypes.has(s.type)) {
          matchedTypes.add(s.type);
          entry.symptomFollows.set(s.type, (entry.symptomFollows.get(s.type) ?? 0) + 1);
        }
      }
    }
  }

  // Calculate baseline rates: for each symptom type, what % of days had that symptom?
  const totalDays = periodDays;
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
    baselineRates.set(type, days.size / totalDays);
  }

  // Build correlations
  const correlations: OldFoodCorrelation[] = [];
  const safeFoods: string[] = [];

  for (const [food, data] of foodMap) {
    let hasAnySymptom = false;

    for (const [symptomType, occurrences] of data.symptomFollows) {
      hasAnySymptom = true;
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
