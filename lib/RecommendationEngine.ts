/**
 * SECURITY: This module no longer talks to any AI provider (Groq/Gemini) or to
 * USDA directly. All of that now runs inside the `analyze-food` Supabase edge
 * function, which holds the API keys as server secrets. The client only sends an
 * authenticated request (the session JWT is attached automatically by
 * supabase.functions.invoke) and renders the returned text/JSON.
 *
 * Prompts and `preferredLanguage` support English (`en`) and German (`de`).
 * User-supplied symptoms/corrections are opaque text passed through.
 */
import { supabase } from './supabase';
import {
  AnalysisError,
  DAILY_PHOTO_LIMIT_REACHED,
  DAILY_REVISION_LIMIT_REACHED,
  DAILY_TEXT_LIMIT_REACHED,
  PREMIUM_REQUIRED,
  type QuotaMeta,
} from './ai-quota';

// USDA nutrition shapes used by the home screen recommendation UI. The data is
// produced server-side now; these types describe the JSON the edge function
// returns so the rest of the app keeps its existing render logic.
export type NutritionValue = {
  amount: number;
  unit: string;
};

export type FoodNutrition = {
  fdcId: number;
  description: string;
  protein: NutritionValue | null;
  fats: NutritionValue | null;
  carbohydrates: NutritionValue | null;
  vitamins: {
    vitaminA: NutritionValue | null;
    vitaminC: NutritionValue | null;
    vitaminD: NutritionValue | null;
    vitaminE: NutritionValue | null;
    vitaminK: NutritionValue | null;
    thiamin: NutritionValue | null;
    riboflavin: NutritionValue | null;
    niacin: NutritionValue | null;
    vitaminB6: NutritionValue | null;
    folate: NutritionValue | null;
    vitaminB12: NutritionValue | null;
  };
};

export type MealPhotoAnalysisContext = {
  preferredLanguage?: 'en' | 'de';
  gutScore?: number;
  conditions?: string[];
  symptoms?: string[];
  userEnteredSymptoms?: string[];
  supplementsTakenToday?: string[];
  triggerMemories?: string[];
  locationContext?: string;
  /** City / region / country for localized grocery examples (complements coordinates in locationContext). */
  retailLocationHint?: string;
  /** Verbatim user text (feelings / what they ate) submitted with the photo before analysis */
  userFeelingsNarrative?: string;
  mealContext?: {
    currentState?: string;
    afterMealActivity?: string;
  };
};

export type MealCorrectionContext = {
  preferredLanguage?: 'en' | 'de';
  previousAnalysis: string;
  correction: string;
  gutScore?: number;
  conditions?: string[];
  symptoms?: string[];
  triggerMemories?: string[];
  locationContext?: string;
  retailLocationHint?: string;
  /** Earlier corrections in this session (oldest → newest); model must treat them as binding vs image/prior analysis. */
  priorUserCorrections?: string[];
};

export type NutritionRecommendationResult = {
  feeling: string;
  nutrients: string[];
  foods: FoodNutrition[];
  recommendation: string;
};

const ANALYZE_FOOD_FUNCTION = 'analyze-food';
const REQUEST_TIMEOUT_MS = 55000;

/**
 * Maps the edge function's structured error codes to a user-facing message.
 * Mirrors the messages used by app/scan-food.tsx so behavior is consistent.
 */
/** Pulls only the safe quota fields off an error body. Never the whole body. */
function readQuotaMeta(body: unknown): QuotaMeta {
  const b = body as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
  return {
    limit: num(b?.limit),
    used: num(b?.used),
    remaining: num(b?.remaining),
    resetAt: typeof b?.resetAt === 'string' ? b.resetAt : undefined,
  };
}

function messageForErrorCode(code: string | undefined, fallback: string): string {
  switch (code) {
    case 'UNAUTHORIZED':
      return 'Your session expired. Please sign in again.';
    case DAILY_PHOTO_LIMIT_REACHED:
      // Screens translate this via the error code; this English line is only a
      // last-resort fallback for callers that do not.
      return "You've reached today's meal analysis limit.";
    case DAILY_REVISION_LIMIT_REACHED:
      return "You've reached today's correction limit.";
    case PREMIUM_REQUIRED:
      return 'Photo analysis is a Premium feature.';
    case DAILY_TEXT_LIMIT_REACHED:
      return "You've reached today's meal description limit.";
    case 'QUOTA_UNAVAILABLE':
      return 'Analysis is temporarily unavailable. Please try again shortly.';
    case 'RATE_LIMITED':
      return 'Too many requests right now. Please wait a minute and try again.';
    case 'IMAGE_TOO_LARGE':
      return 'Image is too large. Please try another photo.';
    case 'BAD_REQUEST':
      return 'Could not process this request. Please try again.';
    case 'SERVER_MISCONFIGURED':
      return 'The analysis service is temporarily unavailable. Please try again later.';
    case 'UPSTREAM_ERROR':
    case 'EMPTY_RESPONSE':
      return 'The analysis service is busy. Please try again in a moment.';
    default:
      return fallback;
  }
}

/**
 * Invokes the analyze-food edge function with an auth header (attached
 * automatically by supabase) and a 55s timeout, then returns the parsed JSON.
 * Throws an Error with a user-friendly message on failure.
 */
async function invokeAnalyzeFood<T>(
  body: Record<string, unknown>,
  fallbackMessage: string,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('Analysis timeout')), REQUEST_TIMEOUT_MS);
  });

  const invokePromise = supabase.functions.invoke(ANALYZE_FOOD_FUNCTION, { body });

  let data, error;
  try {
    ({ data, error } = await Promise.race([invokePromise, timeoutPromise]));
  } finally {
    // Clear on BOTH outcomes — a resolved request must not leave a 55s timer
    // alive (it kept the JS event loop busy after every successful analysis).
    clearTimeout(timeoutId);
  }

  if (error) {
    // supabase-js wraps a non-2xx as FunctionsHttpError whose `context` is the
    // raw Response — the structured error code lives in the JSON body, not on
    // `context` directly. Read the body to recover the edge function's { code }
    // so specific messages (rate-limited, image-too-large, expired session) are
    // surfaced instead of always collapsing to the generic fallback.
    let code: string | undefined;
    let meta: QuotaMeta = {};
    const ctx = (error as { context?: unknown }).context;
    if (ctx && typeof (ctx as Response).json === 'function') {
      try {
        const errorBody = await (ctx as Response).json();
        if (
          errorBody &&
          typeof errorBody === 'object' &&
          typeof (errorBody as { code?: unknown }).code === 'string'
        ) {
          code = (errorBody as { code: string }).code;
          meta = readQuotaMeta(errorBody);
        }
      } catch {
        // Body wasn't JSON or was already consumed — fall back to the generic message.
      }
    }
    throw new AnalysisError(messageForErrorCode(code, fallbackMessage), code, meta);
  }

  // Edge function returns { code, message } on handled errors with a 2xx-less
  // status, but also defensively guard against a code field in a 200 body.
  if (data && typeof data === 'object' && 'code' in data && typeof (data as { code: unknown }).code === 'string') {
    const code = (data as { code: string }).code;
    throw new AnalysisError(messageForErrorCode(code, fallbackMessage), code, readQuotaMeta(data));
  }

  return data as T;
}

export async function getNutritionRecommendation(
  userFeeling: string,
): Promise<NutritionRecommendationResult> {
  const feeling = userFeeling.trim();
  if (!feeling) {
    throw new Error('User feeling is required to generate a nutrition recommendation.');
  }

  // Step 1: ask the server for the helpful nutrients for this feeling.
  const nutrientResponse = await invokeAnalyzeFood<{ nutrients?: string[] }>(
    { mode: 'nutrients', feeling },
    'Could not generate nutrition guidance. Please try again.',
  );
  const nutrients = Array.isArray(nutrientResponse?.nutrients)
    ? nutrientResponse.nutrients.filter((item): item is string => typeof item === 'string')
    : [];

  // Step 2: server fetches USDA matches + writes the recommendation text.
  const recommendationResponse = await invokeAnalyzeFood<{
    recommendation?: string;
    foods?: FoodNutrition[];
  }>(
    { mode: 'nutrient_recommendation', feeling, nutrients },
    'Could not generate nutrition guidance. Please try again.',
  );

  const foods = Array.isArray(recommendationResponse?.foods) ? recommendationResponse.foods : [];
  const recommendation =
    typeof recommendationResponse?.recommendation === 'string'
      ? recommendationResponse.recommendation
      : '';

  return { feeling, nutrients, foods, recommendation };
}

export async function analyzeMealPhoto(
  imageBase64: string,
  mimeType = 'image/jpeg',
  analysisContext: MealPhotoAnalysisContext = {},
  /**
   * Idempotency key for the server's daily quota. The SAME id must be sent for
   * every retry of one logical analysis, and a NEW id for a new photo — that is
   * what makes a retry free and a new scan cost a slot. Required: the edge
   * function rejects an image request without a valid UUID before calling the
   * provider.
   */
  requestId?: string,
): Promise<string> {
  if (!imageBase64.trim()) {
    throw new Error('Image data is required to analyze a meal photo.');
  }

  const response = await invokeAnalyzeFood<{ analysis?: string }>(
    {
      mode: 'meal_text',
      requestId,
      image: imageBase64,
      mimeType,
      preferredLanguage: analysisContext.preferredLanguage ?? 'en',
      gutScore: analysisContext.gutScore,
      conditions: analysisContext.conditions ?? [],
      symptoms: analysisContext.symptoms ?? [],
      userEnteredSymptoms: analysisContext.userEnteredSymptoms ?? [],
      supplementsTakenToday: analysisContext.supplementsTakenToday ?? [],
      locationContext: analysisContext.locationContext,
      retailLocationHint: analysisContext.retailLocationHint ?? '',
      userFeelingsNarrative: analysisContext.userFeelingsNarrative ?? '',
      mealContext: analysisContext.mealContext,
    },
    'Could not analyze the meal photo. Please try again.',
  );

  if (typeof response?.analysis !== 'string' || !response.analysis.trim()) {
    throw new Error('Could not analyze the meal photo. Please try again.');
  }
  return response.analysis;
}

/**
 * Text-only meal analysis — the permanent fallback when there is no photo.
 *
 * Shares everything downstream with the photo path: same five-section contract,
 * same parser, same Result Screen, same meal save. The only difference is that
 * no image is sent, and the server rejects one if it is.
 */
export async function analyzeMealText(
  mealDescription: string,
  analysisContext: MealPhotoAnalysisContext = {},
  requestId?: string,
): Promise<string> {
  if (!mealDescription.trim()) {
    throw new Error('Describe what you ate to get an analysis.');
  }

  const response = await invokeAnalyzeFood<{ analysis?: string }>(
    {
      mode: 'meal_text_only',
      requestId,
      // Deliberately no `image` / `mimeType` key at all: the edge function
      // rejects the request outright if either is present, so an image can
      // never be routed onto the cheaper text counter.
      mealDescription: mealDescription.trim(),
      preferredLanguage: analysisContext.preferredLanguage ?? 'en',
      gutScore: analysisContext.gutScore,
      conditions: analysisContext.conditions ?? [],
      symptoms: analysisContext.symptoms ?? [],
      userEnteredSymptoms: analysisContext.userEnteredSymptoms ?? [],
      supplementsTakenToday: analysisContext.supplementsTakenToday ?? [],
      locationContext: analysisContext.locationContext,
      retailLocationHint: analysisContext.retailLocationHint ?? '',
      userFeelingsNarrative: analysisContext.userFeelingsNarrative ?? '',
      mealContext: analysisContext.mealContext,
    },
    'Could not analyze the meal. Please try again.',
  );

  if (typeof response?.analysis !== 'string' || !response.analysis.trim()) {
    throw new Error('Could not analyze the meal. Please try again.');
  }
  return response.analysis;
}

export async function reviseMealAnalysis(
  correctionContext: MealCorrectionContext,
  /**
   * Idempotency key for the revision quota. One per correction SUBMISSION —
   * a retry of the same correction reuses it and is free, a genuinely new
   * correction gets a new one. Never the photo's request id: that would make
   * the first correction dedupe against the scan and every later one against
   * each other.
   */
  requestId?: string,
): Promise<string> {
  if (!correctionContext.correction.trim()) {
    throw new Error('Correction text is required to revise the meal analysis.');
  }

  const response = await invokeAnalyzeFood<{ analysis?: string }>(
    {
      mode: 'meal_revise',
      requestId,
      preferredLanguage: correctionContext.preferredLanguage ?? 'en',
      previousAnalysis: correctionContext.previousAnalysis,
      correction: correctionContext.correction,
      gutScore: correctionContext.gutScore,
      conditions: correctionContext.conditions ?? [],
      symptoms: correctionContext.symptoms ?? [],
      locationContext: correctionContext.locationContext,
      retailLocationHint: correctionContext.retailLocationHint ?? '',
      priorUserCorrections: correctionContext.priorUserCorrections ?? [],
    },
    'Could not update the analysis. Please try again.',
  );

  if (typeof response?.analysis !== 'string' || !response.analysis.trim()) {
    throw new Error('Could not update the analysis. Please try again.');
  }
  return response.analysis;
}
