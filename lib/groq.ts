/**
 * Groq meal analysis and corrections. User-supplied symptoms/corrections are
 * opaque text passed through; response language is controlled by app language.
 */
import type { AppLanguage } from './app-language';
import type { FoodNutrition, NutritionValue } from './usda';

const GROQ_API_KEY = process.env.EXPO_PUBLIC_GROQ_API_KEY;
const GROQ_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MAX_GROQ_RETRIES = 3;
const GROQ_BACKOFF_MS = 2000;

type GroqResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

type GroqUserContent =
  | string
  | Array<
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } }
  >;

export type MealPhotoAnalysisContext = {
  preferredLanguage?: AppLanguage;
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
};

export type MealCorrectionContext = {
  preferredLanguage?: AppLanguage;
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

export class GroqNutritionError extends Error {
  constructor(
    message: string,
    public code: 'missing-api-key' | 'invalid-api-key' | 'rate-limited' | 'request-failed' | 'invalid-response',
  ) {
    super(message);
    this.name = 'GroqNutritionError';
  }
}

const MEAL_LANGUAGE_COPY: Record<AppLanguage, {
  languageName: string;
  languageRule: string;
  mealImpact: string;
  meal: string;
  symptoms: string;
  mealImpactScore: string;
  why: string;
  gutScore: string;
  analysisInsight: string;
  tips: string;
  instantRelief: string;
  footer: string;
}> = {
  en: {
    languageName: 'English',
    languageRule: 'Write the entire answer strictly in English.',
    mealImpact: 'Meal Impact',
    meal: 'Meal',
    symptoms: 'Symptoms',
    mealImpactScore: 'Meal Impact Score',
    why: 'Why',
    gutScore: 'Gut Score',
    analysisInsight: 'Analysis Insight',
    tips: 'Tips',
    instantRelief: 'Comfort Support',
    footer: 'Educational insight only, not a diagnosis or medical advice. Observe patterns over time and seek care for severe or unusual symptoms.',
  },
  de: {
    languageName: 'German (Deutsch)',
    languageRule: 'Write the entire answer strictly in German.',
    mealImpact: 'Mahlzeitenwirkung',
    meal: 'Mahlzeit',
    symptoms: 'Symptome',
    mealImpactScore: 'Mahlzeiten-Score',
    why: 'Warum',
    gutScore: 'Darm-Score',
    analysisInsight: 'Analyse-Einblick',
    tips: 'Tipps',
    instantRelief: 'Sanfte Hilfe',
    footer: 'Bildender Einblick, keine Diagnose und keine medizinische Beratung. Beobachte Muster über die Zeit und suche Hilfe bei starken oder ungewöhnlichen Symptomen.',
  },
  fa: {
    languageName: 'Persian (فارسی)',
    languageRule: 'Write the entire answer strictly in Persian using Persian script. Use RTL-friendly Markdown and do not include English labels unless a food or brand name has no natural Persian equivalent.',
    mealImpact: 'تأثیر غذا',
    meal: 'غذا',
    symptoms: 'علائم',
    mealImpactScore: 'امتیاز تأثیر غذا',
    why: 'چرا',
    gutScore: 'امتیاز روده',
    analysisInsight: 'بینش تحلیل',
    tips: 'نکات',
    instantRelief: 'راهنمای آرام‌سازی',
    footer: 'این یک بینش آموزشی است، نه تشخیص یا توصیه پزشکی. الگوها را در طول زمان مشاهده کنید و در صورت علائم شدید یا غیرمعمول کمک پزشکی بگیرید.',
  },
};

const COACH_LANGUAGE_COPY: Record<AppLanguage, {
  languageName: string;
  languageRule: string;
  quickAnswer: string;
  noSpecificMeal: string;
  startHere: string;
  howOften: string;
  symptomCheck: string;
  coachTip: string;
  footer: string;
}> = {
  en: {
    languageName: 'English',
    languageRule: 'Write the entire answer strictly in English.',
    quickAnswer: 'Quick answer',
    noSpecificMeal: 'No specific meal was provided, so this guidance is based on your symptoms only.',
    startHere: 'Start here',
    howOften: 'How often',
    symptomCheck: 'Symptom check',
    coachTip: 'Coach tip',
    footer: 'Educational insight only, not a diagnosis or medical advice. Observe patterns over time and seek care for severe or unusual symptoms.',
  },
  de: {
    languageName: 'German (Deutsch)',
    languageRule: 'Write the entire answer strictly in German.',
    quickAnswer: 'Kurzantwort',
    noSpecificMeal: 'Es wurde keine konkrete Mahlzeit genannt, daher basiert diese Empfehlung nur auf deinen Symptomen.',
    startHere: 'So startest du',
    howOften: 'Wie oft',
    symptomCheck: 'Symptom-Check',
    coachTip: 'Coach-Tipp',
    footer: 'Bildender Einblick, keine Diagnose und keine medizinische Beratung. Beobachte Muster über die Zeit und suche Hilfe bei starken oder ungewöhnlichen Symptomen.',
  },
  fa: {
    languageName: 'Persian (فارسی)',
    languageRule: 'Write the entire answer strictly in Persian using Persian script. Use natural RTL-friendly phrasing and do not include English labels unless a food or brand has no natural Persian equivalent.',
    quickAnswer: 'پاسخ کوتاه',
    noSpecificMeal: 'هیچ غذای مشخصی گفته نشده است، بنابراین این راهنما فقط بر اساس علائم شماست.',
    startHere: 'از اینجا شروع کن',
    howOften: 'چند وقت یک بار',
    symptomCheck: 'بررسی علائم',
    coachTip: 'نکته مربی',
    footer: 'این یک بینش آموزشی است، نه تشخیص یا توصیه پزشکی. الگوها را در طول زمان مشاهده کنید و در صورت علائم شدید یا غیرمعمول کمک پزشکی بگیرید.',
  },
};

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRetryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get('retry-after');
  const retryAfterSeconds = retryAfter ? Number(retryAfter) : Number.NaN;

  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return retryAfterSeconds * 1000;
  }

  const retryAfterDate = retryAfter ? Date.parse(retryAfter) : Number.NaN;
  if (Number.isFinite(retryAfterDate)) {
    return Math.max(retryAfterDate - Date.now(), 0);
  }

  return GROQ_BACKOFF_MS * 2 ** attempt;
}

function getGroqText(data: GroqResponse): string {
  const text = data.choices?.[0]?.message?.content?.trim();

  if (!text) {
    throw new GroqNutritionError('Groq returned an empty response.', 'invalid-response');
  }

  return text;
}

function normalizeNutrientList(value: unknown): string[] {
  const nutrientList = Array.isArray(value)
    ? value
    : typeof value === 'object' && value !== null && 'nutrients' in value
      ? (value as { nutrients?: unknown }).nutrients
      : value;

  if (typeof nutrientList === 'string') {
    const normalized = nutrientList
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 3);

    if (normalized.length === 0) {
      throw new GroqNutritionError('Groq returned an empty nutrient list.', 'invalid-response');
    }

    return normalized;
  }

  if (!Array.isArray(nutrientList) || nutrientList.some((item) => typeof item !== 'string')) {
    throw new GroqNutritionError('Groq did not return a JSON list of nutrient names.', 'invalid-response');
  }

  const normalized = nutrientList
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 3);

  if (normalized.length === 0) {
    throw new GroqNutritionError('Groq returned an empty nutrient list.', 'invalid-response');
  }

  return normalized;
}

function extractJsonArrayFromText(text: string): string[] {
  const arrayMatch = text.match(/\[[\s\S]*?\]/);

  if (!arrayMatch) {
    throw new GroqNutritionError('Groq did not include a JSON nutrient array.', 'invalid-response');
  }

  return normalizeNutrientList(JSON.parse(arrayMatch[0]));
}

function extractPlainTextNutrients(text: string): string[] {
  const nutrients = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/i, '')
    .replace(/\b(?:and|or)\b/gi, ',')
    .split(/[\n,;]+/)
    .map((item) =>
      item
        .replace(/^[-*•\d.)\s]+/, '')
        .replace(/^(?:nutrients?|helpful nutrients?)\s*[:=-]\s*/i, '')
        .replace(/^.*?\b(?:are|include|includes)\s+/i, '')
        .replace(/["'`.[\]{}]/g, '')
        .trim()
    )
    .filter((item) => item.length > 0 && item.length <= 40 && item.split(/\s+/).length <= 4)
    .slice(0, 3);

  if (nutrients.length === 0) {
    throw new GroqNutritionError('Groq did not return nutrient names.', 'invalid-response');
  }

  return nutrients;
}

function parseJsonList(text: string): string[] {
  const cleanedText = text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();

  try {
    return normalizeNutrientList(JSON.parse(cleanedText));
  } catch (error) {
    try {
      return extractJsonArrayFromText(cleanedText);
    } catch {
      const plainTextNutrients = extractPlainTextNutrients(cleanedText);

      if (plainTextNutrients.length > 0) {
        return plainTextNutrients;
      }

      if (error instanceof GroqNutritionError) {
        throw error;
      }

      throw new GroqNutritionError('Groq did not return parseable nutrient JSON.', 'invalid-response');
    }
  }
}

async function callGroq(prompt: string, responseType?: 'json' | 'text'): Promise<string> {
  if (!GROQ_API_KEY) {
    throw new GroqNutritionError('EXPO_PUBLIC_GROQ_API_KEY is missing from the environment.', 'missing-api-key');
  }

  for (let attempt = 0; attempt <= MAX_GROQ_RETRIES; attempt += 1) {
    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          {
            role: 'system',
            content: responseType === 'json'
              ? [
                'You are a nutrition data extraction API.',
                'Return only valid JSON with this exact shape: {"nutrients":["Fiber","Probiotics"]}.',
                'The nutrients value must always be an array of strings.',
                'Do not include Markdown, explanations, prose, comments, or code fences.',
              ].join(' ')
              : [
                'You are NutriFlow, a practical gut wellness nutrition coach.',
                'Answer like a real coach: concrete amounts, timing, symptom-aware cautions, and one small next step.',
                'Avoid diagnosis, treatment, cure, certainty claims, and vague generic nutrition advice.',
              ].join(' '),
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.2,
        ...(responseType === 'json' ? { response_format: { type: 'json_object' } } : {}),
      }),
    });

    if (response.status === 401 || response.status === 403) {
      throw new GroqNutritionError('Groq API key is invalid or unauthorized.', 'invalid-api-key');
    }

    if (response.status === 429) {
      if (attempt === MAX_GROQ_RETRIES) {
        throw new GroqNutritionError('Groq rate limit reached after retrying.', 'rate-limited');
      }

      await wait(getRetryDelay(response, attempt));
      continue;
    }

    if (!response.ok) {
      throw new GroqNutritionError(`Groq request failed with status ${response.status}.`, 'request-failed');
    }

    return getGroqText((await response.json()) as GroqResponse);
  }

  throw new GroqNutritionError('Groq request failed after retrying.', 'request-failed');
}

async function callGroqWithUserContent(
  userContent: GroqUserContent,
  systemPrompt = 'Return concise, educational gut wellness guidance without medical claims.',
): Promise<string> {
  if (!GROQ_API_KEY) {
    throw new GroqNutritionError('EXPO_PUBLIC_GROQ_API_KEY is missing from the environment.', 'missing-api-key');
  }

  for (let attempt = 0; attempt <= MAX_GROQ_RETRIES; attempt += 1) {
    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: userContent,
          },
        ],
        temperature: 0.25,
      }),
    });

    if (response.status === 401 || response.status === 403) {
      throw new GroqNutritionError('Groq API key is invalid or unauthorized.', 'invalid-api-key');
    }

    if (response.status === 429) {
      if (attempt === MAX_GROQ_RETRIES) {
        throw new GroqNutritionError('Groq rate limit reached after retrying.', 'rate-limited');
      }

      await wait(getRetryDelay(response, attempt));
      continue;
    }

    if (!response.ok) {
      throw new GroqNutritionError(`Groq request failed with status ${response.status}.`, 'request-failed');
    }

    return getGroqText((await response.json()) as GroqResponse);
  }

  throw new GroqNutritionError('Groq request failed after retrying.', 'request-failed');
}

function formatNutritionValue(value: NutritionValue | null): string {
  if (!value) return 'not listed';
  return `${value.amount} ${value.unit}`.trim();
}

function summarizeFoodData(foodData: FoodNutrition): string {
  const vitaminEntries = Object.entries(foodData.vitamins)
    .map(([name, value]) => `${name}: ${formatNutritionValue(value)}`)
    .join(', ');

  return [
    `Food: ${foodData.description}`,
    `Protein: ${formatNutritionValue(foodData.protein)}`,
    `Fats: ${formatNutritionValue(foodData.fats)}`,
    `Carbohydrates: ${formatNutritionValue(foodData.carbohydrates)}`,
    `Vitamins: ${vitaminEntries}`,
  ].join('\n');
}

function getPreferredCoachLanguage(userFeeling: string): AppLanguage {
  if (/preferred response language:\s*(persian|فارسی)|use persian only|فارسی/i.test(userFeeling)) {
    return 'fa';
  }

  if (/preferred response language:\s*(german|deutsch)|use german only|deutsch/i.test(userFeeling)) {
    return 'de';
  }

  return 'en';
}

export async function getHelpfulNutrientsForFeeling(userFeeling: string): Promise<string[]> {
  const prompt = [
    `Using practical nutrition knowledge and food-data context, which 3 specific nutrients are most relevant for someone feeling ${userFeeling}?`,
    'If the user asks about a specific food amount or frequency, pick nutrients relevant to that practical food guidance rather than generic wellness nutrients.',
    'Use common nutrient names likely to exist in USDA data, such as Fiber, Potassium, Magnesium, Calcium, Protein, Probiotics, or Vitamin C.',
    'Do not return foods, symptoms, mechanisms, or supplement brands as nutrient names.',
    'Return exactly one JSON object and nothing else.',
    'Required format: {"nutrients":["Fiber","Probiotics","Magnesium"]}',
    'The nutrients field must be an array of nutrient names as strings.',
  ].join('\n');

  const text = await callGroq(prompt, 'json');
  return parseJsonList(text);
}

export async function getFoodRecommendationFromNutrients(
  userFeeling: string,
  nutrients: string[],
  foodData: FoodNutrition | null,
  options: { hasSpecificFood?: boolean } = {},
): Promise<string> {
  const preferredLanguage = getPreferredCoachLanguage(userFeeling);
  const copy = COACH_LANGUAGE_COPY[preferredLanguage];
  const hasSpecificFood = options.hasSpecificFood ?? true;
  const usableFoodData = hasSpecificFood ? foodData : null;
  const prompt = [
    'You are NutriFlow, a practical gut wellness nutrition coach.',
    `Selected app language: ${copy.languageName}.`,
    `Language rule: ${copy.languageRule} Answer only in ${copy.languageName}.`,
    preferredLanguage === 'fa'
      ? 'Persian formatting rule: use natural Persian wording, right-to-left-friendly line breaks, and Persian labels.'
      : '',
    '',
    'User context:',
    userFeeling,
    hasSpecificFood
      ? 'Food context: the user provided a specific food, meal, or ingredient. You may answer about that provided item.'
      : [
          'Food context: the user did not provide a specific food, meal, or ingredient. Their input is symptoms/feelings only.',
          `You must explicitly include this sentence near the start: "${copy.noSpecificMeal}"`,
          'Do not invent, assume, or imply any specific food, meal, ingredient, snack, drink, or restaurant item.',
          'Do not analyze "this meal", do not say the person ate any food, and do not provide a meal impact score.',
          'Give symptom-based guidance only: practical next steps, symptom watch-outs, and what detail to add next time if they want meal-level analysis.',
        ].join('\n'),
    `Nutrients to consider for this educational insight: ${nutrients.join(', ')}`,
    usableFoodData
      ? 'USDA food data:'
      : hasSpecificFood
        ? 'USDA food data: no matching USDA food was found for these nutrients.'
        : 'USDA food data: intentionally omitted because no specific food was provided.',
    usableFoodData
      ? summarizeFoodData(usableFoodData)
      : hasSpecificFood
        ? 'Generate a helpful response anyway using the nutrient list and user context. Do not say the analysis failed.'
        : 'Generate a helpful symptom-only response. Do not introduce foods as if they were provided by the user.',
    '',
    'Answer the person\'s actual question first. Do not start with generic nutrient education.',
    'Behave like a practical gut wellness advisor: give a safe starting amount, a realistic frequency, how to increase or pause, and what symptoms to watch.',
    'When the user asks "how many", "can I eat this", "how often", or names a food, provide concrete food/intake guidance. Use ranges when exact dosing would be unsafe or uncertain.',
    'Do not give a vague answer like "eat in moderation" unless it is paired with a specific starting amount and tracking instruction.',
    'For plums/prunes guidance: mention that prunes may support regularity but may be associated with gas, bloating, cramps, diarrhea, or IBS-pattern discomfort because of sorbitol/fructose. A cautious start is 1 prune or 1 small fresh plum per day; if tolerated, increase prunes to 2-3 per day or fresh plums to 1-2 per day. Pair with water and avoid large portions at night if reflux is active.',
    'For bloating guidance: favor smaller portions, cooked/peeled options, low-FODMAP swaps, slower eating, and avoiding carbonated drinks, onion/garlic, large legume portions, lactose, and large raw fruit portions when relevant.',
    'For constipation guidance: increase fiber gradually with water; suggest kiwi, oats, chia/flax, cooked vegetables, or 1-2 prunes as a start, and track stool comfort for 2-3 days.',
    'For reflux guidance: caution with acidic fruit, spicy/fatty meals, chocolate, mint if it worsens reflux, large late meals, and lying down soon after eating.',
    'For cramps or abdominal pain: suggest pausing the food the person suspects, hydration, gentle warmth, and a bland option. Tell them to seek care if pain is severe, worsening, unusual, or with fever/blood.',
    'For IBS: use a tolerance-first approach. Start low, change one food at a time, and avoid pushing high-FODMAP or high-fiber jumps during flares.',
    `Use these plain-text labels exactly in the selected language: ${copy.quickAnswer}, ${copy.startHere}, ${copy.howOften}, ${copy.symptomCheck}, ${copy.coachTip}.`,
    'Formatting rule: plain text only. No tables, decorative boxes, ASCII art, or unusual symbols. Short labeled sections and simple bullets are okay.',
    'Keep the answer concrete and compact: 90-150 words unless the user asks for more detail.',
    'If a Gut Score is present, frame the advice as one small pattern-tracking step that may support a steadier score over time.',
    `${copy.startHere} must include a safe starting amount or starting habit.`,
    `${copy.howOften} must include a practical frequency or timeframe.`,
    `${copy.symptomCheck} must mention at least one relevant symptom from IBS, bloating, reflux, constipation, cramps, gas, diarrhea, or pain when applicable.`,
    `${copy.coachTip} must tell the user what to track over the next 24-72 hours.`,
    `Mandatory safety footer: end with this exact footer in the selected language: "${copy.footer}"`,
    hasSpecificFood
      ? 'If the food may be less comfortable for the user\'s profile or symptoms, suggest 3 gentler alternatives that are commonly available in local grocery stores or restaurants.'
      : 'Do not suggest healthier alternatives for an unnamed food. If examples are useful, keep them broad and optional, not framed as foods the user ate.',
    'If IBS is listed in the profile context, never suggest high-sugar cookies, desserts, candy, sugary snacks, brown rice, barley bread, barley, or high-fiber whole grains. Prefer white rice, boiled potatoes, zucchini, carrots, ginger tea, peppermint tea, low-FODMAP soup, cooked vegetables, or plain yogurt when appropriate.',
    'When USDA results are generic, incomplete, or not clearly gut-supportive, do not overfit the recommendation to cookies or processed snacks. Suggest natural whole foods and practical habits tied to the nutrient list.',
    usableFoodData
      ? 'Mention USDA data only if it directly helps the practical answer; do not let generic USDA matches distract from the named food or symptom question.'
      : hasSpecificFood
        ? 'Because no USDA food matched, suggest general food categories or habits tied to the listed nutrients instead of inventing USDA facts.'
        : 'Because this is symptom-only, do not mention USDA matches or invented food facts.',
  ].filter(Boolean).join('\n');

  return callGroq(prompt, 'text');
}

export async function generateDailyGutScoreInsight(input: {
  score: number;
  mainGoal: string | null;
}): Promise<string> {
  const prompt = [
    `Based on a Gut Score of ${input.score}/100 and the goal of ${input.mainGoal ?? 'General gut wellness'}, give a 1-sentence coaching tip.`,
    'Make it practical, specific, and supportive.',
    'No diagnosis, no treatment or cure claim, no certainty claims, no emojis, max 20 words.',
  ].join('\n');

  return callGroq(prompt, 'text');
}

export async function analyzeMealPhotoWithGroq(
  imageBase64: string,
  mimeType = 'image/jpeg',
  analysisContext: MealPhotoAnalysisContext = {},
): Promise<string> {
  const {
    preferredLanguage = 'en',
    gutScore,
    conditions = [],
    symptoms = [],
    userEnteredSymptoms = [],
    supplementsTakenToday = [],
    locationContext,
    retailLocationHint = '',
    userFeelingsNarrative = '',
  } = analysisContext;
  const languageCopy = MEAL_LANGUAGE_COPY[preferredLanguage];
  const narrative = userFeelingsNarrative.trim();
  const conditionSummary = conditions.length > 0 ? conditions.join(', ') : 'not provided';
  const symptomSummary = symptoms.length > 0 ? symptoms.join(', ') : 'not provided';
  const userEnteredSymptomSummary = userEnteredSymptoms.length > 0 ? userEnteredSymptoms.join(', ') : 'none';
  const supplementSummary = supplementsTakenToday.length > 0 ? supplementsTakenToday.join(', ') : 'none reported today';
  const gutScoreSummary = typeof gutScore === 'number'
    ? `${gutScore}/10`
    : 'not provided; calculate a fresh meal impact score from this meal, symptoms, and conditions';
  const locationTrimmed = locationContext?.trim() ?? '';
  const userLocation =
    [
      locationTrimmed && `device/context: ${locationTrimmed}`,
      retailLocationHint.trim() && `retail/grocery area: ${retailLocationHint.trim()}`,
    ]
      .filter(Boolean)
      .join(' | ') || 'not available';
  const coachPersona = [
    'You are a friendly, informal gut wellness coach.',
    'Talk directly to the person, like a supportive coach, not like a formal report.',
    'Avoid saying "the user"; say "you".',
    'Keep the tone warm, practical, and encouraging while avoiding diagnosis, treatment, cure, or certainty claims.',
    `Selected app language: ${languageCopy.languageName}.`,
    languageCopy.languageRule,
    preferredLanguage === 'fa'
      ? 'For Persian, format all prose and Markdown so it reads naturally right-to-left.'
      : '',
  ].join(' ');

  const profileHead = [
    `Current gut score baseline: ${gutScoreSummary}.`,
    `Known wellness profile context: ${conditionSummary}.`,
    'If profile context is "General Gut Wellness", provide balanced gut-friendly guidance without assuming IBS, celiac, lactose intolerance, or other specific conditions.',
    `Default profile symptoms/context: ${conditionSummary}.`,
    `User-entered symptoms from the UI: ${userEnteredSymptomSummary}.`,
    `Selected symptom combination for scoring: ${userEnteredSymptomSummary}. Treat this as structured user input, not a vague text description.`,
    `All current symptoms combined: ${symptomSummary}.`,
    `Current Medications/Supplements taken in the last 12 hours: ${supplementSummary}.`,
  ];

  const geoBlock = [
    `userLocation context: ${userLocation}`,
    ...(userLocation === 'not available'
      ? ['If userLocation is not available, keep suggestions generic; do not invent a city or country.']
      : []),
  ];

  const adviceTail = [
    `Supplement rule: consider the supplements the user has taken in the last 12 hours when creating the meal insight. If the user has taken a supplement like a digestive enzyme or probiotic, acknowledge it as context. If the supplement may make the meal feel gentler, such as enzymes for legumes/raisins or probiotics for general gut support, increase the ${languageCopy.mealImpactScore} slightly and explain why, but do not overpromise comfort changes.`,
    'Combine what you see with the profile context and all current symptoms. If selected symptoms are present, such as bloating, pain, heaviness, gas, cramps, reflux, nausea, diarrhea, constipation, or low energy, explicitly name each selected symptom and explain how the meal may be associated with that specific combination.',
    'For IBS, bloating, or stomach pain patterns, specifically note possible gas-forming or high-FODMAP foods when relevant, such as beans, lentils, onion, garlic, wheat-heavy foods, lactose, carbonated drinks, or large raw portions.',
    `Provide a clear "${languageCopy.mealImpactScore}" from 1 to 10 for this specific meal, where 1 may be associated with more discomfort and 10 is very gut-supportive for this user. The score must be targeted to the selected symptom combination, not just the food in general.`,
    'Dynamic score rule: never reuse a default score. Use the full 1-10 range. Score 8-10 for balanced gut-friendly meals with gentle protein, cooked plants, fiber diversity, or constipation-supportive fiber. Score 5-7 only for mixed meals. Score 1-4 for possible trigger-heavy patterns such as fast food, greasy/fried foods, creamy sauces, spicy foods, lactose-heavy meals, high-FODMAP onion/garlic/beans/lentils/wheat, wheat/barley for celiac, or reflux-associated tomato/citrus/coffee/chocolate/alcohol.',
    'Symptom interaction rule: bloating plus onion, garlic, wheat, beans, lentils, carbonated drinks, or spicy foods must lower the score strongly. Reflux plus greasy, spicy, creamy, acidic, coffee, chocolate, or alcohol must lower the score strongly. Constipation plus fiber-rich foods such as oats, chia, flax, kiwi, prunes, berries, legumes, cooked vegetables, or soup should raise the score unless bloating/IBS comfort concerns dominate.',
    `Insight specificity rule: every "${languageCopy.analysisInsight}" bullet must name a concrete food component or symptom interaction, such as onion load, creamy sauce, greasy fat, low fiber diversity, constipation-supportive fiber, reflux-related ingredients, or high-FODMAP load. Avoid generic bullets like "vegetables are healthy" or "protein is good".`,
    "Explain how this specific meal may be associated with the user's gut comfort based on the current meal, selected symptoms, and profile context.",
    'Identify likely foods visible in the image when helpful, estimate whether the meal is gut-supportive, and explain the main reasons in friendly practical language.',
    "If the food may be less comfortable for the person's profile or symptoms, suggest up to 3 gentler alternatives using generic grocery/restaurant language only. Do not mention German supermarkets or local German products unless the user explicitly asks for them.",
    'IBS and bloating rule: do not push brown rice, barley bread, barley, or high-fiber whole grains as IBS/bloating comfort ideas. Prefer white rice, boiled potatoes, zucchini, carrots, low-FODMAP soup, peppermint tea, or ginger tea.',
    `Output format requirement: return Markdown only. First include a compact Summary Table for "${languageCopy.mealImpact}" with columns "${languageCopy.meal}", "${languageCopy.symptoms}", "${languageCopy.mealImpactScore}", "${languageCopy.why}". Then include one line "${languageCopy.gutScore}: [####------] X/10" as a text progress bar where X is the same dynamic ${languageCopy.mealImpactScore}. Then include "${languageCopy.analysisInsight}:" with 2-3 concise bullet points explaining why the score was assigned. Then include "${languageCopy.tips}:" with max 3 bullet points.`,
    'Length requirement: keep the total explanation under 130 words.',
    `Language requirement: ${languageCopy.languageRule} All fixed labels, table headers, section names, and the footer must be in ${languageCopy.languageName}.`,
    `Mandatory safety footer: end with this exact footer in the selected language: "${languageCopy.footer}"`,
    'When the image is unclear, say what extra detail would help instead of pretending certainty.',
    'Avoid diagnosis, treatment, cure, certainty, or medical claims.',
  ];

  const sharedTail = [...profileHead, ...geoBlock, ...adviceTail];

  const prompt = narrative
    ? [
        'Smart fusion task (single multimodal request): Return ONE unified gut wellness insight. Do not emit separate drafts, JSON, or multi-step reports.',
        `Preferred response language: ${languageCopy.languageName}.`,
        'Tone rule: be friendly and informal. Speak directly to the person.',
        `Language rule: ${languageCopy.languageRule} Answer only in ${languageCopy.languageName}, regardless of user input or device locale.`,
        '',
        'Fusion logic — integrate into one coherent answer:',
        `- Infer from the image alone a concise visual hypothesis of the meal ([Visual Guess]); state it briefly early on.`,
        `- The user's confirmation above is [User Input]: parse what they say the food is (or what they ate) and how they feel ([User Feeling] / symptoms).`,
        `- Explicitly reflect this meaning in ${languageCopy.languageName}: the photo may look like [Visual Guess], but their text says it is [their food/clarification] and they feel [their feeling/symptoms]. If image and words disagree on food identity or symptoms, treat their words as authoritative.`,
        `- Provide ONE integrated ${languageCopy.mealImpact} analysis that weighs IBS and bloating together with their ${languageCopy.gutScore} (${gutScoreSummary}) and profile conditions/symptoms below.`,
        '',
        `The user has confirmed this food is: ${narrative}`,
        'Ignore visual guesses from the image if they conflict with this confirmation—the confirmed text is authoritative for meal identity and how they feel.',
        'Food-ID priority: Short confirmations (e.g. "Dried figs", "dried figs") define what they ate; override any conflicting visual meal identification when scoring gut impact.',
        'Parse food identity vs symptoms/feeling from their confirmation text when answering.',
        '',
        'Fresh scan hard reset: do not mention cookies, old meals, previous foods, previous guesses, saved trigger memories, or prior chat context. Only analyze the current image plus the current user input above.',
        'Never apologize for visual ambiguity alone; do not open with a long apology about misreading the photo.',
        'Comfort support rule: if they describe pain or distress, give practical calming guidance and a gentle Plan B (e.g. peppermint or ginger tea, hydration, rest, warm compress, pausing foods they suspect).',
        `Comfort support rule: if their words or symptoms include stomach pain, abdominal pain, cramps, or belly pain, include a short section titled "${languageCopy.instantRelief}". Add a safety note to seek urgent care for severe, worsening, or unusual pain.`,
        'IBS abdominal pain consistency: whenever IBS-related abdominal pain, cramps, bloating pain, or a flare is indicated (including from profile conditions such as IBS), prioritize peppermint tea, ginger tea, hydration, rest, warm compress, and a gentle Plan B before elaborate meal suggestions.',
        'Context rule: this is a fresh combined submission. Ignore unrelated prior guesses unless reflected in the symptom lists below.',
        ...sharedTail,
      ].join('\n')
    : [
        'Analyze this meal photo for educational gut wellness patterns.',
        `Preferred response language: ${languageCopy.languageName}.`,
        'Tone rule: be friendly and informal. Speak directly to the person.',
        `Language rule: ${languageCopy.languageRule} Return the entire analysis, suggestions, meal impact score explanation, impact prediction, tips, table headers, and footer only in ${languageCopy.languageName}.`,
        ...sharedTail.slice(0, 6),
        'Context reset rule: this is a new meal scan. Ignore all previous meal guesses, cookies, old foods, trigger memories, saved history, or prior chat context unless the user explicitly asks to compare with a previous meal.',
        'Priority rule: user-entered symptoms from the UI are more important than the default profile symptoms. If any user-entered symptom is present, make it one of the main points in the analysis, symptom notes, and gut score prediction.',
        `Empathy rule: if a negative reaction or pain symptom is present, start with a brief sincere apology in ${languageCopy.languageName}, then pivot immediately to a safer Plan B before discussing the original food. A safer Plan B can include ginger tea, peppermint tea, hydration, rest, a warm compress, or temporarily pausing food if the person feels irritated.`,
        `Comfort support rule: if the user-entered symptoms include stomach pain, abdominal pain, cramps, or belly pain, include a short section titled "${languageCopy.instantRelief}". Suggest gentle options such as peppermint tea, ginger tea, a warm compress, hydration, rest, and pausing the food they suspect. Add a safety note to seek urgent care for severe, worsening, or unusual pain.`,
        'IBS abdominal pain consistency: whenever IBS-related abdominal pain, cramps, bloating pain, or a flare is indicated (including from profile conditions such as IBS), prioritize peppermint tea, ginger tea, hydration, rest, warm compress, and a gentle Plan B before elaborate meal suggestions.',
        ...sharedTail.slice(6),
      ].join('\n');

  return callGroqWithUserContent([
    { type: 'text', text: prompt },
    {
      type: 'image_url',
      image_url: {
        url: `data:${mimeType};base64,${imageBase64}`,
      },
    },
  ], coachPersona);
}

export async function reviseMealAnalysisWithGroq(
  correctionContext: MealCorrectionContext,
): Promise<string> {
  const {
    preferredLanguage = 'en',
    previousAnalysis,
    correction,
    gutScore,
    conditions = [],
    symptoms = [],
    locationContext,
    retailLocationHint = '',
    priorUserCorrections = [],
  } = correctionContext;
  const languageCopy = MEAL_LANGUAGE_COPY[preferredLanguage];
  const retailHint = retailLocationHint.trim();
  const prior = priorUserCorrections.map((c) => c.trim()).filter(Boolean);
  const gutScoreSummary = typeof gutScore === 'number'
    ? `${gutScore}/10`
    : 'not provided; calculate a fresh dynamic meal impact score';
  const coachPersona = [
    'You are a friendly, informal gut wellness coach correcting a prior meal insight.',
    'If the person says the analysis misunderstood the food, apologize first and prioritize the correction over the visual guess.',
    `Selected app language: ${languageCopy.languageName}.`,
    languageCopy.languageRule,
    preferredLanguage === 'fa'
      ? 'For Persian, format all prose and Markdown so it reads naturally right-to-left.'
      : '',
    'Avoid diagnosis, treatment, cure, certainty, or medical claims.',
  ].join(' ');
  const locationTrimmed = locationContext?.trim() ?? '';
  const userLocation =
    [
      locationTrimmed && `device/context: ${locationTrimmed}`,
      retailHint && `retail/grocery area: ${retailHint}`,
    ]
      .filter(Boolean)
      .join(' | ') || 'not available';

  const prompt = [
    'Revise the meal analysis using the ongoing chat context.',
    `Preferred response language: ${languageCopy.languageName}.`,
    `Language rule: ${languageCopy.languageRule} Answer only in ${languageCopy.languageName}, including fixed labels, table headers, tips, and footer.`,
    `Current gut score baseline: ${gutScoreSummary}.`,
    `Known conditions: ${conditions.length > 0 ? conditions.join(', ') : 'not provided'}.`,
    `Current symptoms: ${symptoms.length > 0 ? symptoms.join(', ') : 'not provided'}.`,
    `userLocation context: ${userLocation}`,
    ...(userLocation === 'not available'
      ? ['If userLocation is not available, keep shopping hints generic—do not invent a region.']
      : []),
    '',
    prior.length > 0
      ? [
          'Earlier user corrections this session (oldest first). Each one overrides image guesses and earlier AI text about what the meal was:',
          ...prior.map((line, i) => `${i + 1}. ${line}`),
          '',
        ].join('\n')
      : '',
    'Previous AI analysis:',
    previousAnalysis,
    '',
    'Latest user correction or new detail (highest priority—what they mean now):',
    correction,
    '',
    'Correction rules:',
    '- ABSOLUTE_PRIORITY: Everything the user typed or spoke in the correction fields—including this message and every numbered correction above—overrides any meal identity from the image or from the previous analysis. Rebuild the meal description from user words first.',
    '- The correction from the user is more reliable than the first visual guess. If the user says it is tea, herbal tea, soup, etc., stop discussing the previous guessed food and re-analyze the corrected food.',
    `- If the user says "you misunderstood", "that is wrong", or gives a correction, apologize immediately in ${languageCopy.languageName} before the revised advice.`,
    '- If the correction names a different food, completely clear the old meal context and do not mention the previous guessed food. No cookies or old foods may leak into the revised answer.',
    '- Preserve useful context from the photo and prior analysis only when it does not conflict with the correction and only when the user is discussing the same food.',
    '- For IBS/bloating, do not suggest brown rice, barley bread, barley, or high-fiber whole grains. Prefer white rice, boiled potatoes, zucchini, carrots, peppermint tea, ginger tea, or low-FODMAP soup.',
    `- Recalculate the ${languageCopy.mealImpactScore} from the corrected meal, current symptoms, and known conditions. Use the full 1-10 range: 8-10 for gentle balanced/supportive meals, 5-7 for mixed meals, 1-4 for strong possible-trigger combinations. Never reuse a default 4/10 or 6/10 score unless the corrected meal truly deserves it.`,
    '- Apply symptom interactions strongly: bloating plus onion/garlic/spicy/high-FODMAP lowers the score; constipation plus fiber-rich foods raises it; reflux plus greasy/spicy/creamy/acidic foods lowers it.',
    `- "${languageCopy.analysisInsight}" bullets must be specific to food components and symptoms. Avoid generic lines such as vegetables are healthy or protein is good.`,
    `- Return Markdown only. Include a compact Summary Table for "${languageCopy.mealImpact}" with columns "${languageCopy.meal}", "${languageCopy.symptoms}", "${languageCopy.mealImpactScore}", "${languageCopy.why}", one "${languageCopy.gutScore}: [####------] X/10" progress bar using the recalculated score, "${languageCopy.analysisInsight}:" with 2-3 concise score-rationale bullets, and max 3 "${languageCopy.tips}" bullet points.`,
    '- Keep the total explanation under 130 words.',
    '- Do not mention German supermarkets or localized German products unless the user explicitly asks.',
    `- End with this exact safety footer: ${languageCopy.footer}`,
  ]
    .filter((block) => block !== '')
    .join('\n');

  return callGroqWithUserContent(prompt, coachPersona);
}

export async function analyzeProductBarcodeWithGroq(
  barcode: string,
  barcodeType?: string,
  locationContext?: string,
  preferredLanguage: AppLanguage = 'en',
): Promise<string> {
  const languageCopy = MEAL_LANGUAGE_COPY[preferredLanguage];
  const prompt = [
    'Analyze this product barcode for educational gut wellness patterns using the barcode value as product context.',
    `Preferred response language: ${languageCopy.languageName}.`,
    locationContext ? `User location context: ${locationContext}` : 'User location context: not available.',
    `Barcode: ${barcode}`,
    barcodeType ? `Barcode type: ${barcodeType}` : null,
    'If exact product details are not available, clearly say that and provide general guidance on what to check on the label, such as fiber, added sugar, sweeteners, emulsifiers, lactose, gluten, and FODMAP-related ingredients.',
    "If the food may be less comfortable for the user's profile or symptoms, suggest up to 3 gentler alternatives using generic grocery/restaurant language only.",
    'For IBS or sensitive digestion, do not recommend high-sugar cookies, desserts, candy, or sugary snacks. Prefer natural whole foods and gentle options.',
    `Language rule: ${languageCopy.languageRule}`,
    `Mandatory safety footer: end with this exact footer: "${languageCopy.footer}"`,
    'Avoid medical claims. Keep it concise.',
  ]
    .filter(Boolean)
    .join('\n');

  return callGroqWithUserContent(prompt);
}
