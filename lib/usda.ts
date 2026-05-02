const USDA_API_BASE_URL = 'https://api.nal.usda.gov/fdc/v1';

const USDA_API_KEY = process.env.EXPO_PUBLIC_USDA_API_KEY;

type UsdaFoodNutrient = {
  nutrientName?: string;
  nutrientNumber?: string;
  unitName?: string;
  value?: number;
};

type UsdaFoodSearchItem = {
  fdcId?: number;
  description?: string;
  foodNutrients?: UsdaFoodNutrient[];
};

type UsdaFoodSearchResponse = {
  foods?: UsdaFoodSearchItem[];
};

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

export class UsdaNutritionError extends Error {
  constructor(
    message: string,
    public code: 'missing-api-key' | 'invalid-api-key' | 'not-found' | 'request-failed' | 'invalid-response',
  ) {
    super(message);
    this.name = 'UsdaNutritionError';
  }
}

function getNutrient(
  nutrients: UsdaFoodNutrient[],
  nutrientNumbers: string[],
  fallbackNames: string[],
): NutritionValue | null {
  const nutrient = nutrients.find((item) => {
    const numberMatches = item.nutrientNumber ? nutrientNumbers.includes(item.nutrientNumber) : false;
    const normalizedName = item.nutrientName?.toLowerCase() ?? '';
    const nameMatches = fallbackNames.some((name) => normalizedName.includes(name));
    return numberMatches || nameMatches;
  });

  if (typeof nutrient?.value !== 'number') return null;

  return {
    amount: nutrient.value,
    unit: nutrient.unitName ?? '',
  };
}

function parseFoodNutrition(food: UsdaFoodSearchItem): FoodNutrition {
  if (typeof food.fdcId !== 'number' || !food.description) {
    throw new UsdaNutritionError('USDA returned an incomplete food result.', 'invalid-response');
  }

  const nutrients = food.foodNutrients ?? [];

  return {
    fdcId: food.fdcId,
    description: food.description,
    // USDA nutrients include stable nutrient numbers, so prefer those and fall back to names for resilience.
    protein: getNutrient(nutrients, ['203'], ['protein']),
    fats: getNutrient(nutrients, ['204'], ['total lipid', 'fat']),
    carbohydrates: getNutrient(nutrients, ['205'], ['carbohydrate']),
    vitamins: {
      // These map USDA nutrient rows into a compact vitamin object for the app to consume.
      vitaminA: getNutrient(nutrients, ['318', '320'], ['vitamin a']),
      vitaminC: getNutrient(nutrients, ['401'], ['vitamin c']),
      vitaminD: getNutrient(nutrients, ['324', '328'], ['vitamin d']),
      vitaminE: getNutrient(nutrients, ['323'], ['vitamin e']),
      vitaminK: getNutrient(nutrients, ['430'], ['vitamin k']),
      thiamin: getNutrient(nutrients, ['404'], ['thiamin']),
      riboflavin: getNutrient(nutrients, ['405'], ['riboflavin']),
      niacin: getNutrient(nutrients, ['406'], ['niacin']),
      vitaminB6: getNutrient(nutrients, ['415'], ['vitamin b-6', 'vitamin b6']),
      folate: getNutrient(nutrients, ['417'], ['folate']),
      vitaminB12: getNutrient(nutrients, ['418'], ['vitamin b-12', 'vitamin b12']),
    },
  };
}

export async function fetchFoodNutrition(query: string): Promise<FoodNutrition> {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    throw new UsdaNutritionError('Enter a food name before searching nutrition data.', 'not-found');
  }

  if (!USDA_API_KEY) {
    throw new UsdaNutritionError('EXPO_PUBLIC_USDA_API_KEY is missing from the environment.', 'missing-api-key');
  }

  const params = new URLSearchParams({
    api_key: USDA_API_KEY,
    query: trimmedQuery,
    pageSize: '1',
  });

  const response = await fetch(`${USDA_API_BASE_URL}/foods/search?${params.toString()}`);

  if (response.status === 401 || response.status === 403) {
    throw new UsdaNutritionError('USDA API key is invalid or unauthorized.', 'invalid-api-key');
  }

  if (!response.ok) {
    throw new UsdaNutritionError(`USDA request failed with status ${response.status}.`, 'request-failed');
  }

  const data = (await response.json()) as UsdaFoodSearchResponse;
  const food = data.foods?.[0];

  if (!food) {
    throw new UsdaNutritionError(`No USDA nutrition result found for "${trimmedQuery}".`, 'not-found');
  }

  return parseFoodNutrition(food);
}
