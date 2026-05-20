import type { AppLanguage } from './app-language';

export type IngredientSuggestionSource = 'common-dish' | 'photo-guess' | 'manual' | 'mixed';

export type MealIngredientSuggestion = {
  mealGuess: string;
  ingredients: string[];
  source: IngredientSuggestionSource;
};

type CommonDishIngredientRule = {
  patterns: RegExp[];
  mealName: Record<AppLanguage, string>;
  ingredients: string[];
};

const COMMON_DISH_INGREDIENTS: CommonDishIngredientRule[] = [
  {
    patterns: [/ash[\s-]?reshteh/i, /aash[\s-]?reshteh/i, /ash-e\s*reshteh/i, /آش\s*رشته/],
    mealName: { en: 'Ash Reshteh', de: 'Ash Reshteh', fa: 'آش رشته' },
    ingredients: [
      'reshteh noodles',
      'beans',
      'lentils',
      'chickpeas',
      'herbs',
      'spinach',
      'onion',
      'garlic',
      'kashk',
      'mint oil',
    ],
  },
  {
    patterns: [/ghormeh\s*sabzi/i, /qormeh\s*sabzi/i, /قرمه\s*سبزی/, /قورمه\s*سبزی/],
    mealName: { en: 'Ghormeh Sabzi', de: 'Ghormeh Sabzi', fa: 'قرمه سبزی' },
    ingredients: [
      'herbs',
      'parsley',
      'cilantro',
      'fenugreek',
      'kidney beans',
      'beef or lamb',
      'dried lime',
      'onion',
      'rice',
    ],
  },
  {
    patterns: [/gheymeh/i, /gheimeh/i, /قیمه/],
    mealName: { en: 'Gheymeh', de: 'Gheymeh', fa: 'قیمه' },
    ingredients: [
      'split peas',
      'beef or lamb',
      'tomato sauce',
      'dried lime',
      'potato',
      'onion',
      'rice',
    ],
  },
  {
    patterns: [/\bd[öo]ner\b/i, /\bdoner\b/i, /\bkebab\b/i, /دونر/, /کباب/],
    mealName: { en: 'Döner', de: 'Döner', fa: 'دونر' },
    ingredients: [
      'doner meat',
      'flatbread',
      'raw salad',
      'onion',
      'tomato',
      'cucumber',
      'yogurt sauce',
      'garlic sauce',
      'chili sauce',
    ],
  },
  {
    patterns: [/\bpasta\b/i, /\bspaghetti\b/i, /\bnoodles?\b/i, /\bnudeln\b/i, /پاستا/, /ماکارونی/],
    mealName: { en: 'Pasta', de: 'Pasta', fa: 'پاستا' },
    ingredients: ['wheat pasta', 'tomato sauce', 'cream sauce', 'cheese', 'garlic', 'onion', 'olive oil'],
  },
  {
    patterns: [/\bsalad\b/i, /\bsalat\b/i, /سالاد/],
    mealName: { en: 'Salad', de: 'Salat', fa: 'سالاد' },
    ingredients: ['raw leafy greens', 'tomato', 'cucumber', 'onion', 'dressing', 'olive oil'],
  },
  {
    patterns: [/\brice bowl\b/i, /\bbowl\b/i, /\breis[-\s]?bowl\b/i, /کاسه\s*برنج/, /برنج.*کاسه/],
    mealName: { en: 'Rice bowl', de: 'Reis-Bowl', fa: 'کاسه برنج' },
    ingredients: ['rice', 'protein', 'cooked vegetables', 'raw vegetables', 'sauce'],
  },
  {
    patterns: [/\blentil soup\b/i, /\blinsensuppe\b/i, /سوپ\s*عدس/],
    mealName: { en: 'Lentil soup', de: 'Linsensuppe', fa: 'سوپ عدس' },
    ingredients: ['lentils', 'onion', 'garlic', 'herbs', 'carrot', 'tomato', 'olive oil'],
  },
  {
    patterns: [/\bsalmon rice\b/i, /\bsalmon.*rice\b/i, /\blachs.*reis\b/i, /سالمون.*برنج/],
    mealName: { en: 'Salmon rice bowl', de: 'Lachs-Reis-Bowl', fa: 'کاسه برنج و سالمون' },
    ingredients: ['salmon', 'rice', 'cooked greens', 'tomato', 'lemon', 'olive oil'],
  },
];

const INGREDIENT_LABELS: Record<string, Record<AppLanguage, string>> = {
  'reshteh noodles': { en: 'reshteh noodles', de: 'Reshteh-Nudeln', fa: 'رشته آش' },
  beans: { en: 'beans', de: 'Bohnen', fa: 'لوبیا' },
  lentils: { en: 'lentils', de: 'Linsen', fa: 'عدس' },
  chickpeas: { en: 'chickpeas', de: 'Kichererbsen', fa: 'نخود' },
  herbs: { en: 'herbs', de: 'Kräuter', fa: 'سبزی‌های معطر' },
  spinach: { en: 'spinach', de: 'Spinat', fa: 'اسفناج' },
  onion: { en: 'onion', de: 'Zwiebel', fa: 'پیاز' },
  garlic: { en: 'garlic', de: 'Knoblauch', fa: 'سیر' },
  kashk: { en: 'kashk', de: 'Kashk', fa: 'کشک' },
  'mint oil': { en: 'mint oil', de: 'Minzöl', fa: 'روغن نعناع' },
  parsley: { en: 'parsley', de: 'Petersilie', fa: 'جعفری' },
  cilantro: { en: 'cilantro', de: 'Koriander', fa: 'گشنیز' },
  fenugreek: { en: 'fenugreek', de: 'Bockshornklee', fa: 'شنبلیله' },
  'kidney beans': { en: 'kidney beans', de: 'Kidneybohnen', fa: 'لوبیا قرمز' },
  'beef or lamb': { en: 'beef or lamb', de: 'Rind oder Lamm', fa: 'گوشت گاو یا گوسفند' },
  'dried lime': { en: 'dried lime', de: 'getrocknete Limette', fa: 'لیموعمانی' },
  'split peas': { en: 'split peas', de: 'gelbe Erbsen', fa: 'لپه' },
  'tomato sauce': { en: 'tomato sauce', de: 'Tomatensauce', fa: 'سس گوجه' },
  potato: { en: 'potato', de: 'Kartoffel', fa: 'سیب‌زمینی' },
  rice: { en: 'rice', de: 'Reis', fa: 'برنج' },
  'doner meat': { en: 'doner meat', de: 'Dönerfleisch', fa: 'گوشت دونر' },
  flatbread: { en: 'flatbread', de: 'Fladenbrot', fa: 'نان تخت' },
  'raw salad': { en: 'raw salad', de: 'roher Salat', fa: 'سالاد خام' },
  tomato: { en: 'tomato', de: 'Tomate', fa: 'گوجه' },
  cucumber: { en: 'cucumber', de: 'Gurke', fa: 'خیار' },
  'yogurt sauce': { en: 'yogurt sauce', de: 'Joghurtsauce', fa: 'سس ماست' },
  'garlic sauce': { en: 'garlic sauce', de: 'Knoblauchsauce', fa: 'سس سیر' },
  'chili sauce': { en: 'chili sauce', de: 'Chilisauce', fa: 'سس تند' },
  'wheat pasta': { en: 'wheat pasta', de: 'Weizenpasta', fa: 'پاستای گندمی' },
  'cream sauce': { en: 'cream sauce', de: 'Sahnesauce', fa: 'سس خامه‌ای' },
  cheese: { en: 'cheese', de: 'Käse', fa: 'پنیر' },
  'olive oil': { en: 'olive oil', de: 'Olivenöl', fa: 'روغن زیتون' },
  'raw leafy greens': { en: 'raw leafy greens', de: 'rohes Blattgemüse', fa: 'سبزی برگ‌دار خام' },
  dressing: { en: 'dressing', de: 'Dressing', fa: 'سس سالاد' },
  protein: { en: 'protein', de: 'Protein', fa: 'پروتئین' },
  'cooked vegetables': { en: 'cooked vegetables', de: 'gegartes Gemüse', fa: 'سبزیجات پخته' },
  'raw vegetables': { en: 'raw vegetables', de: 'rohes Gemüse', fa: 'سبزیجات خام' },
  sauce: { en: 'sauce', de: 'Sauce', fa: 'سس' },
  carrot: { en: 'carrot', de: 'Karotte', fa: 'هویج' },
  salmon: { en: 'salmon', de: 'Lachs', fa: 'سالمون' },
  'cooked greens': { en: 'cooked greens', de: 'gegartes Grün', fa: 'سبزی پخته' },
  lemon: { en: 'lemon', de: 'Zitrone', fa: 'لیمو' },
};

const INGREDIENT_SYNONYMS: Record<string, string> = {
  'red beans': 'kidney beans',
  'kidney bean': 'kidney beans',
  'garbanzo beans': 'chickpeas',
  chickpea: 'chickpeas',
  bean: 'beans',
  lentil: 'lentils',
  noodle: 'reshteh noodles',
  noodles: 'reshteh noodles',
  reshteh: 'reshteh noodles',
  'fresh herbs': 'herbs',
  herb: 'herbs',
  mint: 'mint oil',
  'fried mint': 'mint oil',
  'fried onion': 'onion',
  onions: 'onion',
  'raw onion': 'onion',
  'garlic yogurt sauce': 'garlic sauce',
  yoghurt: 'yogurt sauce',
  'yoghurt sauce': 'yogurt sauce',
  yogurt: 'yogurt sauce',
  chilli: 'chili sauce',
  chili: 'chili sauce',
  'pasta noodles': 'wheat pasta',
  spaghetti: 'wheat pasta',
  macaroni: 'wheat pasta',
  'leafy greens': 'raw leafy greens',
  greens: 'raw leafy greens',
  vegetables: 'raw vegetables',
  veggies: 'raw vegetables',
};

function normalizeForMatching(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase()
    .replace(/[()[\]{}.,;:!?'"`]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeIngredientName(value: string): string {
  const normalized = normalizeForMatching(value);
  return INGREDIENT_SYNONYMS[normalized] ?? normalized;
}

export function mergeIngredientNames(...lists: Array<Array<string | null | undefined>>): string[] {
  const merged: string[] = [];
  const seen = new Set<string>();

  lists.flat().forEach((ingredient) => {
    if (!ingredient) return;
    const normalized = normalizeIngredientName(ingredient);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    merged.push(normalized);
  });

  return merged.slice(0, 14);
}

export function localizeIngredientName(ingredient: string, language: AppLanguage): string {
  const normalized = normalizeIngredientName(ingredient);
  return INGREDIENT_LABELS[normalized]?.[language] ?? ingredient.trim();
}

export function hasLocalizedIngredientLabel(ingredient: string, language: AppLanguage): boolean {
  const normalized = normalizeIngredientName(ingredient);
  return Boolean(INGREDIENT_LABELS[normalized]?.[language]);
}

export function findCommonDishIngredientSuggestion(
  text: string,
  language: AppLanguage,
): MealIngredientSuggestion | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const match = COMMON_DISH_INGREDIENTS.find((rule) =>
    rule.patterns.some((pattern) => pattern.test(trimmed))
  );

  if (!match) return null;

  return {
    mealGuess: match.mealName[language],
    ingredients: mergeIngredientNames(match.ingredients),
    source: 'common-dish',
  };
}

export function filterIngredientsForLanguage(
  ingredients: string[],
  language: AppLanguage,
): string[] {
  const normalized = mergeIngredientNames(ingredients);

  if (language !== 'fa') return normalized;

  return normalized.filter((ingredient) => {
    if (hasLocalizedIngredientLabel(ingredient, language)) return true;
    return /[\u0600-\u06FF]/.test(ingredient);
  });
}
