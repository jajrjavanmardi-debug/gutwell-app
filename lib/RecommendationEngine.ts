import {
  analyzeMealPhotoWithGroq,
  analyzeProductBarcodeWithGroq,
  getFoodRecommendationFromNutrients,
  getHelpfulNutrientsForFeeling,
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

  const nutrients = await AnalysisService.getRequiredNutrients(feeling);
  const foods = await FoodService.findMatchingFoodsForNutrients(nutrients);
  const recommendation = await AnalysisService.generateRecommendation(feeling, nutrients, foods);

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
