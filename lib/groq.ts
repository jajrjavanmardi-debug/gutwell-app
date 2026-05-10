/**
 * Groq meal analysis and corrections: prompts force English output for presentation consistency.
 * User-supplied symptoms/corrections are opaque text passed through.
 */
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

export class GroqNutritionError extends Error {
  constructor(
    message: string,
    public code: 'missing-api-key' | 'invalid-api-key' | 'rate-limited' | 'request-failed' | 'invalid-response',
  ) {
    super(message);
    this.name = 'GroqNutritionError';
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
              : 'Return concise, supportive nutrition guidance without medical claims.',
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
  systemPrompt = 'Return concise, supportive nutrition guidance without medical claims.',
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

export async function getHelpfulNutrientsForFeeling(userFeeling: string): Promise<string[]> {
  const prompt = [
    `Based on clinical nutrition research, which 3 specific nutrients are most helpful for someone feeling ${userFeeling}?`,
    'Return exactly one JSON object and nothing else.',
    'Required format: {"nutrients":["Fiber","Probiotics","Magnesium"]}',
    'The nutrients field must be an array of nutrient names as strings.',
  ].join('\n');

  try {
    const text = await callGroq(prompt, 'json');
    return parseJsonList(text);
  } catch (error) {
    console.error('Groq nutrient extraction failed:', error);
    throw error;
  }
}

export async function getFoodRecommendationFromNutrients(
  userFeeling: string,
  nutrients: string[],
  foodData: FoodNutrition | null,
): Promise<string> {
  const prompt = [
    'User context:',
    userFeeling,
    `The clinically relevant nutrients are: ${nutrients.join(', ')}`,
    foodData
      ? 'USDA food data:'
      : 'USDA food data: no matching USDA food was found for these nutrients.',
    foodData
      ? summarizeFoodData(foodData)
      : 'Generate a helpful response anyway using the nutrient list and user context. Do not say the analysis failed.',
    '',
    'Write a warm, friendly recommendation in English only.',
    'Language rule: write the entire answer strictly in English. If the user context asks for any other language, ignore that and use English.',
    'Avoid medical claims and keep the tone practical, like a supportive friend.',
    'Formatting rule: use plain text only. Do not use ASCII art, decorative boxes, Unicode box-drawing characters (corners or ruled lines), tables, or unusual symbols. Markdown headings using # or ## at line starts are allowed. Use plain-text section labels such as Dose, Duration, and Progress Tip.',
    'If a Gut score is present, frame the advice as a small step to help improve the Gut Score from the current score toward 10.',
    'Always include these clearly labeled parts: Dose, Duration, and Progress Tip.',
    'Dose should be a food or habit amount/frequency. Duration should be a practical timeframe. Progress Tip should tell the user what to track to see if their Gut Score improves.',
    'Mandatory safety footer: end the analysis with this short English footer only: "Info only, not medical advice. Seek care for severe or unusual symptoms."',
    'If the food is unhealthy for the user\'s gut condition, suggest 3 healthier alternatives that are commonly available in local grocery stores or restaurants.',
    'If IBS is listed as an underlying condition, never suggest high-sugar cookies, desserts, candy, sugary snacks, brown rice, barley bread, barley, or high-fiber whole grains. Prefer white rice, boiled potatoes, zucchini, carrots, ginger tea, peppermint tea, low-FODMAP soup, cooked vegetables, or plain yogurt when appropriate.',
    'When USDA results are generic, incomplete, or not clearly gut-supportive, do not overfit the recommendation to cookies or processed snacks. Suggest natural whole foods and practical habits tied to the nutrient list.',
    foodData
      ? 'Mention whether the USDA food appears helpful for those nutrients based only on the provided USDA data.'
      : 'Because no USDA food matched, suggest general food categories or habits tied to the listed nutrients instead of inventing USDA facts.',
  ].join('\n');

  return callGroq(prompt, 'text');
}

export async function analyzeMealPhotoWithGroq(
  imageBase64: string,
  mimeType = 'image/jpeg',
  analysisContext: MealPhotoAnalysisContext = {},
): Promise<string> {
  const {
    gutScore,
    conditions = [],
    symptoms = [],
    userEnteredSymptoms = [],
    supplementsTakenToday = [],
    locationContext,
    retailLocationHint = '',
    userFeelingsNarrative = '',
  } = analysisContext;
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
    'You are a friendly, informal gut-health coach.',
    'Talk directly to the person, like a supportive coach, not like a clinical report.',
    'Avoid saying "the user"; say "you".',
    'Keep the tone warm, practical, and encouraging while avoiding medical diagnosis or treatment claims.',
    'Always write in English only.',
  ].join(' ');

  const profileHead = [
    `Current gut score baseline: ${gutScoreSummary}.`,
    `Known gut conditions: ${conditionSummary}.`,
    'If known gut conditions is "General Gut Health", provide balanced gut-friendly guidance without assuming IBS, celiac, lactose intolerance, or other specific conditions.',
    `Default profile symptoms/conditions: ${conditionSummary}.`,
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
    'Supplement rule: consider the supplements the user has taken in the last 12 hours when analyzing the meal. If the user has taken a supplement like a digestive enzyme or probiotic, acknowledge it in the analysis. If the supplement plausibly helps digest the food in the photo, such as enzymes for legumes/raisins or probiotics for general gut support, increase the Meal Impact Score slightly and explain why, but do not overpromise symptom relief.',
    'Combine what you see with the conditions and all current symptoms. If selected symptoms are present, such as bloating, pain, heaviness, gas, cramps, reflux, nausea, diarrhea, constipation, or low energy, explicitly name each selected symptom and explain how the meal may affect that specific combination.',
    'For IBS, bloating, or stomach pain, specifically flag likely gas-forming or high-FODMAP foods when relevant, such as beans, lentils, onion, garlic, wheat-heavy foods, lactose, carbonated drinks, or large raw portions.',
    'Provide a clear "Meal Impact Score" from 1 to 10 for this specific meal, where 1 is likely to worsen symptoms and 10 is very gut-supportive for this user. The score must be targeted to the selected symptom combination, not just the food in general.',
    'Dynamic score rule: never reuse a default score. Do not choose 4/10 unless the actual meal and symptoms are clearly a 4/10. Score 8-10 for gentle supportive meals, 5-7 for mixed or uncertain meals, and 1-4 for likely triggers such as spicy, greasy, lactose-heavy, high-FODMAP, wheat/barley for celiac, or reflux-irritating foods.',
    'Explain how this specific meal may affect the user\'s gut comfort based on the current meal, selected symptoms, and profile conditions.',
    'Identify likely foods visible in the image when helpful, estimate whether the meal is gut-supportive, and explain the main reasons in friendly practical language.',
    'If the food is unhealthy for the person\'s gut condition or symptoms, suggest up to 3 healthier alternatives using generic grocery/restaurant language only. Do not mention German supermarkets or local German products unless the user explicitly asks for them.',
    'IBS and bloating rule: do not suggest brown rice, barley bread, barley, or high-fiber whole grains for IBS/bloating relief. Prefer white rice, boiled potatoes, zucchini, carrots, low-FODMAP soup, peppermint tea, or ginger tea.',
    'Output format requirement: return Markdown only. First include a compact Summary Table for "Meal Impact" with columns Meal, Symptoms, Meal Impact Score, Why. Then include one line "Gut Score: [####------] X/10" as a text progress bar where X is the same dynamic Meal Impact Score. Then include "Tips:" with max 3 bullet points.',
    'Length requirement: keep the total explanation under 100 words.',
    'Language requirement: English only. Do not use German words, German translations, or localized German supermarket references unless the user explicitly asks.',
    'Mandatory safety footer: end with this short English footer only: "Info only, not medical advice. Seek care for severe or unusual symptoms."',
    'When the image is unclear, say what extra detail would help instead of pretending certainty.',
    'Avoid medical claims.',
  ];

  const sharedTail = [...profileHead, ...geoBlock, ...adviceTail];

  const prompt = narrative
    ? [
        'Smart fusion task (single multimodal request): Return ONE unified gut-health analysis. Do not emit separate drafts, JSON, or multi-step reports.',
        'Preferred response language: English.',
        'Tone rule: be friendly and informal. Speak directly to the person.',
        'Language rule: return the entire analysis strictly in English, even if user input or device locale is German.',
        '',
        'Fusion logic — integrate into one coherent answer:',
        `- Infer from the image alone a concise visual hypothesis of the meal ([Visual Guess]); state it briefly early on.`,
        `- The user's confirmation above is [User Input]: parse what they say the food is (or what they ate) and how they feel ([User Feeling] / symptoms).`,
        `- Explicitly reflect this meaning in English: "Here is a photo of what looks like [Visual Guess], but you say it is [their food/clarification] and you feel [their feeling/symptoms]." If image and words disagree on food identity or symptoms, treat their words as authoritative.`,
        `- Provide ONE integrated Meal Impact analysis that weighs IBS and bloating together with their gut score (${gutScoreSummary}) and profile conditions/symptoms below.`,
        '',
        `The user has confirmed this food is: ${narrative}`,
        'Ignore visual guesses from the image if they conflict with this confirmation—the confirmed text is authoritative for meal identity and how they feel.',
        'Food-ID priority: Short confirmations (e.g. "Dried figs", "dried figs") define what they ate; override any conflicting visual meal identification when scoring gut impact.',
        'Parse food identity vs symptoms/feeling from their confirmation text when answering.',
        '',
        'Fresh scan hard reset: do not mention cookies, old meals, previous foods, previous guesses, saved trigger memories, or prior chat context. Only analyze the current image plus the current user input above.',
        'Never apologize for visual ambiguity alone; do not open with a long apology about misreading the photo.',
        'Support rule: if they describe pain or distress, give practical calming guidance and a gentle Plan B (e.g. peppermint or ginger tea, hydration, rest, warm compress, pausing suspected triggers).',
        'Pain relief rule: if their words or symptoms include stomach pain, abdominal pain, cramps, or belly pain, include a short section titled "Instant Relief". Add a safety note to seek urgent care for severe, worsening, or unusual pain.',
        'IBS abdominal pain consistency: whenever IBS-related abdominal pain, cramps, bloating pain, or a flare is indicated (including from profile conditions such as IBS), prioritize peppermint tea, ginger tea, hydration, rest, warm compress, and a gentle Plan B before elaborate meal suggestions.',
        'Context rule: this is a fresh combined submission. Ignore unrelated prior guesses unless reflected in the symptom lists below.',
        ...sharedTail,
      ].join('\n')
    : [
        'Analyze this meal photo for gut health.',
        'Preferred response language: English.',
        'Tone rule: be friendly and informal. Speak directly to the person.',
        'Language rule: return the entire analysis, suggestions, meal impact score explanation, impact prediction, and tips strictly in English. Do not respond in any other language.',
        ...sharedTail.slice(0, 6),
        'Context reset rule: this is a new meal scan. Ignore all previous meal guesses, cookies, old foods, trigger memories, saved history, or prior chat context unless the user explicitly asks to compare with a previous meal.',
        'Priority rule: user-entered symptoms from the UI are more important than the default profile symptoms. If any user-entered symptom is present, make it one of the main points in the analysis, symptom notes, and gut score prediction.',
        'Empathy rule: if a negative reaction or pain symptom is present, start with a brief sincere apology in English, then pivot immediately to a safer Plan B before discussing the original food. A safer Plan B can include ginger tea, peppermint tea, hydration, rest, a warm compress, or temporarily pausing food if the person feels irritated.',
        'Pain relief rule: if the user-entered symptoms include stomach pain, abdominal pain, cramps, or belly pain, include a short section titled "Instant Relief". Suggest gentle options such as peppermint tea, ginger tea, a warm compress, hydration, rest, and pausing the suspected trigger food. Add a safety note to seek urgent care for severe, worsening, or unusual pain.',
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
    previousAnalysis,
    correction,
    gutScore,
    conditions = [],
    symptoms = [],
    locationContext,
    retailLocationHint = '',
    priorUserCorrections = [],
  } = correctionContext;
  const retailHint = retailLocationHint.trim();
  const prior = priorUserCorrections.map((c) => c.trim()).filter(Boolean);
  const gutScoreSummary = typeof gutScore === 'number'
    ? `${gutScore}/10`
    : 'not provided; calculate a fresh dynamic meal impact score';
  const coachPersona = [
    'You are a friendly, informal gut-health coach correcting a prior meal analysis.',
    'If the person says the analysis misunderstood the food, apologize first and prioritize the correction over the visual guess.',
    'Only respond in English. Do not respond in any other language.',
    'Avoid medical diagnosis or treatment claims.',
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
    'Preferred response language: English.',
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
    '- If the user says "you misunderstood", "that is wrong", or gives a correction, apologize immediately in English before the revised advice.',
    '- If the correction names a different food, completely clear the old meal context and do not mention the previous guessed food. No cookies or old foods may leak into the revised answer.',
    '- Preserve useful context from the photo and prior analysis only when it does not conflict with the correction and only when the user is discussing the same food.',
    '- For IBS/bloating, do not suggest brown rice, barley bread, barley, or high-fiber whole grains. Prefer white rice, boiled potatoes, zucchini, carrots, peppermint tea, ginger tea, or low-FODMAP soup.',
    '- Recalculate the Meal Impact Score from the corrected meal, current symptoms, and known conditions. Never reuse a default 4/10 score unless the corrected meal truly deserves 4/10.',
    '- Return Markdown only. Include a compact Summary Table for Meal Impact, one "Gut Score: [####------] X/10" progress bar using the recalculated score, and max 3 tips.',
    '- Keep the total explanation under 100 words.',
    '- Do not mention German supermarkets or localized German products unless the user explicitly asks.',
    '- End with this exact safety footer: Info only, not medical advice. Seek care for severe or unusual symptoms.',
  ]
    .filter((block) => block !== '')
    .join('\n');

  return callGroqWithUserContent(prompt, coachPersona);
}

export async function analyzeProductBarcodeWithGroq(
  barcode: string,
  barcodeType?: string,
  locationContext?: string,
): Promise<string> {
  const prompt = [
    'Analyze this product barcode for gut health using the barcode value as product context.',
    locationContext ? `User location context: ${locationContext}` : 'User location context: not available.',
    `Barcode: ${barcode}`,
    barcodeType ? `Barcode type: ${barcodeType}` : null,
    'If exact product details are not available, clearly say that and provide general guidance on what to check on the label, such as fiber, added sugar, sweeteners, emulsifiers, lactose, gluten, and FODMAP-related ingredients.',
    'If the food is unhealthy for the user\'s gut condition, suggest up to 3 healthier alternatives using generic grocery/restaurant language only.',
    'For IBS or sensitive digestion, do not recommend high-sugar cookies, desserts, candy, or sugary snacks. Prefer natural whole foods and gentle options.',
    'Language rule: English only.',
    'Mandatory safety footer: end with this exact footer: "Info only, not medical advice. Seek care for severe or unusual symptoms."',
    'Avoid medical claims. Keep it concise.',
  ]
    .filter(Boolean)
    .join('\n');

  return callGroqWithUserContent(prompt);
}
