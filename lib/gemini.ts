import type { FoodNutrition, NutritionValue } from './usda';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = 'gemini-2.0-flash-lite';
const GEMINI_API_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const MAX_GEMINI_RETRIES = 3;
const GEMINI_BACKOFF_MS = 2000;

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
};

export class GeminiNutritionError extends Error {
  constructor(
    message: string,
    public code: 'missing-api-key' | 'invalid-api-key' | 'rate-limited' | 'request-failed' | 'invalid-response',
  ) {
    super(message);
    this.name = 'GeminiNutritionError';
  }
}

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

  return GEMINI_BACKOFF_MS * 2 ** attempt;
}

function getGeminiText(data: GeminiResponse): string {
  const text = data.candidates?.[0]?.content?.parts
    ?.map((part) => part.text)
    .filter((part): part is string => typeof part === 'string')
    .join('')
    .trim();

  if (!text) {
    throw new GeminiNutritionError('Gemini returned an empty response.', 'invalid-response');
  }

  return text;
}

function parseJsonList(text: string): string[] {
  const cleanedText = text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();
  const parsed = JSON.parse(cleanedText);

  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== 'string')) {
    throw new GeminiNutritionError('Gemini did not return a JSON list of nutrient names.', 'invalid-response');
  }

  return parsed.slice(0, 3);
}

async function callGemini(prompt: string, responseMimeType?: 'application/json' | 'text/plain'): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new GeminiNutritionError('GEMINI_API_KEY is missing from the environment.', 'missing-api-key');
  }

  for (let attempt = 0; attempt <= MAX_GEMINI_RETRIES; attempt += 1) {
    const response = await fetch(`${GEMINI_API_URL}?key=${encodeURIComponent(GEMINI_API_KEY)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: responseMimeType ? { responseMimeType } : undefined,
      }),
    });

    if (response.status === 400 || response.status === 403) {
      throw new GeminiNutritionError('Gemini API key is invalid or unauthorized.', 'invalid-api-key');
    }

    if (response.status === 429) {
      if (attempt === MAX_GEMINI_RETRIES) {
        throw new GeminiNutritionError('Gemini rate limit reached after retrying.', 'rate-limited');
      }

      await wait(getRetryDelay(response, attempt));
      continue;
    }

    if (!response.ok) {
      throw new GeminiNutritionError(`Gemini request failed with status ${response.status}.`, 'request-failed');
    }

    return getGeminiText((await response.json()) as GeminiResponse);
  }

  throw new GeminiNutritionError('Gemini request failed after retrying.', 'request-failed');
}

function formatNutritionValue(value: NutritionValue | null): string {
  if (!value) return 'not listed';
  return `${value.amount} ${value.unit}`.trim();
}

function summarizeFoodData(foodData: FoodNutrition): string {
  // Flatten the parsed USDA result into a compact text summary so Gemini can compare the food
  // against the requested nutrients without needing raw USDA rows.
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

export async function getHelpfulNutrientsForFeeling(userFeeling: string): Promise<string[]> {
  const prompt = `Based on clinical nutrition research, which 3 specific nutrients are most helpful for someone feeling ${userFeeling}? Return only a simple JSON list of nutrient names.`;
  const text = await callGemini(prompt, 'application/json');
  return parseJsonList(text);
}

export async function getFoodRecommendationFromNutrients(
  userFeeling: string,
  nutrients: string[],
  foodData: FoodNutrition,
): Promise<string> {
  const prompt = [
    `The user is feeling: ${userFeeling}`,
    `The clinically relevant nutrients are: ${nutrients.join(', ')}`,
    'USDA food data:',
    summarizeFoodData(foodData),
    '',
    'Write a short, supportive recommendation for the user in 2-3 sentences.',
    'Mention whether this food appears helpful for those nutrients based only on the provided USDA data.',
    'Avoid medical claims and keep the tone warm and practical.',
  ].join('\n');

  return callGemini(prompt, 'text/plain');
}
