import {
  analyzeMealPhotoWithGroq,
  analyzeProductBarcodeWithGroq,
  getFoodRecommendationFromNutrients,
  getHelpfulNutrientsForFeeling,
  GroqNutritionError,
  reviseMealAnalysisWithGroq,
  type MealCorrectionContext,
  type MealPhotoAnalysisContext,
} from './groq';
import {
  detectRedFlagSymptoms,
  RedFlagTriageError,
} from './red-flag-triage';
import { fetchFoodNutrition, type FoodNutrition } from './usda';

export type NutritionRecommendationResult = {
  feeling: string;
  nutrients: string[];
  foods: FoodNutrition[];
  recommendation: string;
};

type NutritionRecommendationOptions = {
  hasSpecificFood?: boolean;
};

const nutrientCache = new Map<string, string[]>();

const SPECIFIC_FOOD_PATTERNS = [
  /\b(pizza|burger|fries|kebab|sandwich|salad|soup|pasta|noodles|rice|bread|toast|oats?|cereal|egg|eggs|chicken|beef|fish|tuna|salmon|shrimp|tofu|beans?|lentils?|chickpeas?|onion|garlic|tomato|pepper|potato|carrot|zucchini|apple|banana|berries|strawberr(?:y|ies)|kiwi|plums?|prunes?|figs?|raisins?|yogurt|milk|cheese|cream|coffee|tea|chocolate|sauce|curry)\b/i,
  /\b(pflaume|pflaumen|trockenpflaume|trockenpflaumen|pizza|burger|pommes|kebab|sandwich|salat|suppe|nudeln|reis|brot|toast|hafer|ei|eier|huhn|rind|fisch|thunfisch|lachs|tofu|bohnen|linsen|kichererbsen|zwiebel|knoblauch|tomate|paprika|kartoffel|karotte|zucchini|apfel|banane|beeren|erdbeeren|kiwi|joghurt|milch|käse|kaese|sahne|kaffee|tee|schokolade|sauce|soße|sosse|curry)\b/i,
  /(پیتزا|برگر|سیب زمینی|ساندویچ|سالاد|سوپ|پاستا|ماکارونی|برنج|نان|جو دوسر|تخم مرغ|مرغ|گوشت|ماهی|تن|سالمون|میگو|توفو|لوبیا|عدس|نخود|پیاز|سیر|گوجه|فلفل|هویج|کدو|سیب|موز|توت|توت فرنگی|کیوی|آلو|آلو خشک|انجیر|کشمش|ماست|شیر|پنیر|خامه|قهوه|چای|شکلات|سس|کاری)/,
];

const FOOD_ACTION_PATTERNS = [
  /\b(i\s+)?(ate|eat|eating|had|drank|drink|drinking|cooked|made|ordered)\b/i,
  /\b(gegessen|getrunken|gekocht|bestellt|essen|trinken)\b/i,
  /(خوردم|خورده|می‌خورم|میخورم|بخورم|خوردن|نوشیدم|نوشیده|بنوشم|درست کردم|سفارش دادم)/,
];

const SYMPTOM_OR_GENERIC_FOOD_WORDS = new Set([
  'i', 'am', 'feel', 'feeling', 'have', 'has', 'with', 'after', 'before', 'and', 'or', 'the', 'a', 'an',
  'can', 'could', 'should', 'would', 'how', 'many', 'much', 'often', 'per', 'day', 'it',
  'ate', 'eat', 'eating', 'had', 'drank', 'drink', 'drinking', 'cooked', 'made', 'ordered',
  'meal', 'meals', 'food', 'foods', 'something', 'anything', 'this', 'that', 'today', 'now',
  'bloated', 'bloating', 'gas', 'gassy', 'cramps', 'cramp', 'pain', 'reflux', 'heartburn', 'constipation',
  'constipated', 'diarrhea', 'nausea', 'tired', 'energy', 'low', 'stressed', 'stress', 'craving', 'sugar',
  'ich', 'bin', 'habe', 'hatte', 'mit', 'nach', 'vor', 'und', 'oder', 'gegessen', 'getrunken',
  'gekocht', 'bestellt', 'kann', 'koennte', 'könnte', 'soll', 'sollte', 'wie', 'oft', 'viel', 'tag',
  'das', 'dies', 'dieses', 'mahlzeit', 'mahlzeiten', 'essen',
  'lebensmittel', 'etwas', 'heute', 'jetzt', 'blähungen', 'blaehungen', 'blähbauch', 'schmerzen',
  'krämpfe', 'kraempfe', 'reflux', 'sodbrennen', 'verstopfung', 'durchfall', 'übelkeit', 'uebelkeit',
  'آیا', 'توانم', 'میتوانم', 'می‌توانم', 'چقدر', 'چند', 'بار', 'روز', 'این', 'آن', 'را', 'با', 'بعد',
  'قبل', 'غذا', 'وعده', 'چیزی', 'خوراکی', 'بخورم', 'خوردن', 'بنوشم', 'نفخ', 'درد', 'گرفتگی',
  'ریفلاکس', 'رفلاکس', 'یبوست', 'اسهال', 'تهوع', 'انرژی', 'استرس',
]);

export function hasSpecificFoodReference(input: string): boolean {
  const normalized = input.trim().toLocaleLowerCase();
  if (!normalized) return false;

  if (SPECIFIC_FOOD_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return true;
  }

  if (!FOOD_ACTION_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return false;
  }

  const remainingWords = normalized
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !SYMPTOM_OR_GENERIC_FOOD_WORDS.has(word));

  return remainingWords.length > 0;
}

function getFallbackLanguage(userFeeling: string): 'en' | 'de' | 'fa' {
  if (/preferred response language:\s*(persian|فارسی)|use persian only|فارسی/i.test(userFeeling)) return 'fa';
  if (/preferred response language:\s*(german|deutsch)|use german only|deutsch/i.test(userFeeling)) return 'de';
  return 'en';
}

function isMissingAiProviderKey(error: unknown): boolean {
  return error instanceof GroqNutritionError && error.code === 'missing-api-key';
}

function getFallbackNutrients(userFeeling: string): string[] {
  const lower = userFeeling.toLocaleLowerCase();

  if (/constipation|constipated|verstopfung|یبوست/.test(lower)) {
    return ['Fiber', 'Magnesium', 'Potassium'];
  }

  if (/cramp|pain|schmerz|krampf|درد|گرفتگی/.test(lower)) {
    return ['Magnesium', 'Potassium', 'Calcium'];
  }

  if (/reflux|heartburn|sodbrennen|ریفلاکس|رفلاکس|سوزش معده/.test(lower)) {
    return ['Fiber', 'Protein', 'Calcium'];
  }

  if (/bloat|gas|bläh|blaeh|نفخ|گاز/.test(lower)) {
    return ['Fiber', 'Potassium', 'Protein'];
  }

  return ['Fiber', 'Potassium', 'Magnesium'];
}

function buildFallbackRecommendation(
  userFeeling: string,
  nutrients: string[],
  foodData: FoodNutrition | null,
  hasSpecificFood: boolean,
): string {
  const language = getFallbackLanguage(userFeeling);
  const foodName = hasSpecificFood ? foodData?.description : undefined;

  if (!hasSpecificFood) {
    if (language === 'fa') {
      return [
        'پاسخ کوتاه: هیچ غذای مشخصی گفته نشده است، بنابراین این راهنما فقط بر اساس علائم شماست.',
        'از اینجا شروع کن: آب بنوش، آرام نفس بکش، در صورت درد از گرمای ملایم استفاده کن و فعلاً محرک های نامشخص را اضافه نکن.',
        'چند وقت یک بار: علائم را 24 تا 72 ساعت دنبال کن و دفعه بعد اگر تحلیل غذایی می خواهی، نام غذا یا ماده اصلی را هم بنویس.',
        'فقط برای اطلاع است، نه توصیه پزشکی. در صورت علائم شدید یا غیرمعمول کمک پزشکی بگیرید.',
      ].join('\n');
    }

    if (language === 'de') {
      return [
        'Kurzantwort: Es wurde keine konkrete Mahlzeit genannt, daher basiert diese Empfehlung nur auf deinen Symptomen.',
        'So startest du: Trinke Wasser, atme langsam in den Bauch, nutze bei Krämpfen sanfte Wärme und füge vorerst keinen unklaren Trigger hinzu.',
        'Wie oft: Beobachte die Symptome 24-72 Stunden und nenne beim nächsten Mal das konkrete Lebensmittel, wenn du eine Mahlzeitenanalyse möchtest.',
        'Nur zur Information, keine medizinische Beratung. Suche Hilfe bei starken oder ungewöhnlichen Symptomen.',
      ].join('\n');
    }

    return [
      'Quick answer: No specific meal was provided, so this guidance is based on your symptoms only.',
      'Start here: Sip water, slow your breathing, use gentle warmth for cramps, and avoid adding an unclear trigger right now.',
      'How often: Track symptoms for 24-72 hours and include the exact food or ingredient next time if you want meal-level analysis.',
      'Info only, not medical advice. Seek care for severe or unusual symptoms.',
    ].join('\n');
  }

  if (language === 'fa') {
    return [
      'پاسخ سریع: الان هوش مصنوعی در دسترس نیست، اما می توانی با یک قدم ساده شروع کنی.',
      `شروع: یک وعده ملایم با ${nutrients.slice(0, 2).join(' و ')} انتخاب کن${foodName ? `؛ مثل ${foodName}` : ''}.`,
      'چند وقت یک بار: امروز یک تغییر کوچک انجام بده و 24 تا 72 ساعت نفخ، ریفلاکس، یبوست یا درد را دنبال کن.',
      'این فقط راهنمای عمومی است و جایگزین توصیه پزشکی نیست.',
    ].join('\n');
  }

  if (language === 'de') {
    return [
      'Schnelle Antwort: Die KI ist gerade nicht verfügbar, aber du kannst mit einem kleinen Schritt starten.',
      `Start: Wähle eine sanfte Mahlzeit mit ${nutrients.slice(0, 2).join(' und ')}${foodName ? `, zum Beispiel ${foodName}` : ''}.`,
      'Häufigkeit: Probiere heute eine kleine Änderung und beobachte Blähungen, Reflux, Verstopfung oder Schmerzen für 24-72 Stunden.',
      'Nur zur Orientierung, keine medizinische Beratung.',
    ].join('\n');
  }

  return [
    'Quick answer: AI guidance is unavailable right now, but you can still start with one small step.',
    `Start here: Choose a gentle meal focused on ${nutrients.slice(0, 2).join(' and ')}${foodName ? `, such as ${foodName}` : ''}.`,
    'How often: Try one small change today and track bloating, reflux, constipation, or pain for 24-72 hours.',
    'Info only, not medical advice.',
  ].join('\n');
}

const AnalysisService = {
  async getRequiredNutrients(userFeeling: string): Promise<string[]> {
    const cacheKey = userFeeling.trim().toLowerCase();
    const cachedNutrients = nutrientCache.get(cacheKey);
    if (cachedNutrients) return cachedNutrients;

    const nutrients = await getHelpfulNutrientsForFeeling(userFeeling);
    nutrientCache.set(cacheKey, nutrients);
    return nutrients;
  },

  async generateRecommendation(
    userFeeling: string,
    nutrients: string[],
    foods: FoodNutrition[],
    options: NutritionRecommendationOptions,
  ): Promise<string> {
    return getFoodRecommendationFromNutrients(userFeeling, nutrients, foods[0] ?? null, options);
  },
};

const FoodService = {
  async findMatchingFoodsForNutrients(nutrients: string[]): Promise<FoodNutrition[]> {
    const results = await Promise.allSettled(
      nutrients.map((nutrient) => fetchFoodNutrition(nutrient)),
    );

    return results
      .filter((result): result is PromiseFulfilledResult<FoodNutrition> => result.status === 'fulfilled')
      .map((result) => result.value);
  },
};

export async function getNutritionRecommendation(
  userFeeling: string,
  options: NutritionRecommendationOptions = {},
): Promise<NutritionRecommendationResult> {
  const feeling = userFeeling.trim();
  if (!feeling) {
    throw new Error('User feeling is required to generate a nutrition recommendation.');
  }

  const triage = detectRedFlagSymptoms(feeling);
  if (triage.hasRedFlag) {
    throw new RedFlagTriageError(getFallbackLanguage(feeling), triage);
  }

  const hasSpecificFood = options.hasSpecificFood ?? hasSpecificFoodReference(feeling);

  let nutrients: string[];
  try {
    nutrients = await AnalysisService.getRequiredNutrients(feeling);
  } catch (error) {
    if (!isMissingAiProviderKey(error)) throw error;
    nutrients = getFallbackNutrients(feeling);
  }

  const foods = hasSpecificFood ? await FoodService.findMatchingFoodsForNutrients(nutrients) : [];
  let recommendation: string;
  try {
    recommendation = await AnalysisService.generateRecommendation(feeling, nutrients, foods, { hasSpecificFood });
  } catch (error) {
    if (!isMissingAiProviderKey(error)) throw error;
    recommendation = buildFallbackRecommendation(feeling, nutrients, foods[0] ?? null, hasSpecificFood);
  }

  return {
    feeling,
    nutrients,
    foods,
    recommendation,
  };
}

export async function analyzeMealPhoto(
  imageBase64: string,
  mimeType = 'image/jpeg',
  analysisContext: MealPhotoAnalysisContext = {},
): Promise<string> {
  if (!imageBase64.trim()) {
    throw new Error('Image data is required to analyze a meal photo.');
  }

  const triage = detectRedFlagSymptoms([
    analysisContext.userFeelingsNarrative,
    ...(analysisContext.userEnteredSymptoms ?? []),
    ...(analysisContext.symptoms ?? []),
  ]);
  if (triage.hasRedFlag) {
    throw new RedFlagTriageError(analysisContext.preferredLanguage ?? 'en', triage);
  }

  return analyzeMealPhotoWithGroq(imageBase64, mimeType, analysisContext);
}

export async function reviseMealAnalysis(
  correctionContext: MealCorrectionContext,
): Promise<string> {
  if (!correctionContext.correction.trim()) {
    throw new Error('Correction text is required to revise the meal analysis.');
  }

  const triage = detectRedFlagSymptoms([
    correctionContext.correction,
    ...(correctionContext.symptoms ?? []),
  ]);
  if (triage.hasRedFlag) {
    throw new RedFlagTriageError(correctionContext.preferredLanguage ?? 'en', triage);
  }

  return reviseMealAnalysisWithGroq(correctionContext);
}

export async function analyzeProductBarcode(
  barcode: string,
  barcodeType?: string,
  locationContext?: string,
  preferredLanguage?: MealPhotoAnalysisContext['preferredLanguage'],
): Promise<string> {
  const normalizedBarcode = barcode.trim();
  if (!normalizedBarcode) {
    throw new Error('Barcode data is required to analyze a product.');
  }

  return analyzeProductBarcodeWithGroq(normalizedBarcode, barcodeType, locationContext, preferredLanguage);
}

export { AnalysisService, FoodService };
