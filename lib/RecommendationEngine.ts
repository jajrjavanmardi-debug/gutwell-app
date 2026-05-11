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
import { fetchFoodNutrition, type FoodNutrition } from './usda';

export type NutritionRecommendationResult = {
  feeling: string;
  nutrients: string[];
  foods: FoodNutrition[];
  recommendation: string;
};

const nutrientCache = new Map<string, string[]>();

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
): string {
  const language = getFallbackLanguage(userFeeling);
  const foodName = foodData?.description;

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
  ): Promise<string> {
    return getFoodRecommendationFromNutrients(userFeeling, nutrients, foods[0] ?? null);
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
): Promise<NutritionRecommendationResult> {
  const feeling = userFeeling.trim();
  if (!feeling) {
    throw new Error('User feeling is required to generate a nutrition recommendation.');
  }

  let nutrients: string[];
  try {
    nutrients = await AnalysisService.getRequiredNutrients(feeling);
  } catch (error) {
    if (!isMissingAiProviderKey(error)) throw error;
    nutrients = getFallbackNutrients(feeling);
  }

  const foods = await FoodService.findMatchingFoodsForNutrients(nutrients);
  let recommendation: string;
  try {
    recommendation = await AnalysisService.generateRecommendation(feeling, nutrients, foods);
  } catch (error) {
    if (!isMissingAiProviderKey(error)) throw error;
    recommendation = buildFallbackRecommendation(feeling, nutrients, foods[0] ?? null);
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

  return analyzeMealPhotoWithGroq(imageBase64, mimeType, analysisContext);
}

export async function reviseMealAnalysis(
  correctionContext: MealCorrectionContext,
): Promise<string> {
  if (!correctionContext.correction.trim()) {
    throw new Error('Correction text is required to revise the meal analysis.');
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
