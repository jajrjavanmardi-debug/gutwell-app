import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// SECURITY: All AI provider + USDA calls happen here, server-side. The API keys
// below are Supabase secrets (set via `supabase secrets set ...`) and are NEVER
// shipped in the client bundle. Do not reintroduce EXPO_PUBLIC_* AI keys.
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
// SECURITY: USDA key is now a server secret. Set with: supabase secrets set USDA_API_KEY=...
const USDA_API_KEY = Deno.env.get("USDA_API_KEY");
const USDA_API_BASE_URL = "https://api.nal.usda.gov/fdc/v1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

// --- Rate limiting (in-memory, IP-based, 10 req/min) ---
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 10;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now >= entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT_MAX;
}

// Max base64 image size: 10 MB
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json",
    },
  });
}

type Language = "en" | "de";

function normalizeLanguage(value: unknown): Language {
  // English + German only. Any other value (incl. legacy "fa") falls back to English.
  return value === "de" ? "de" : "en";
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Gemini helpers
// ---------------------------------------------------------------------------

type GeminiPart =
  | { text: string }
  | { inline_data: { mime_type: string; data: string } };

async function callGemini(
  parts: GeminiPart[],
  options: {
    responseMimeType?: "application/json" | "text/plain";
    temperature?: number;
    maxOutputTokens?: number;
  } = {},
): Promise<string> {
  const response = await fetch(GEMINI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": GEMINI_API_KEY!,
    },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: {
        temperature: options.temperature ?? 0.3,
        // gemini-2.5-flash is a thinking model: reasoning tokens count toward
        // this budget, so the long free-form coaching modes need more headroom
        // than the compact structured photo JSON.
        maxOutputTokens: options.maxOutputTokens ?? 2048,
        ...(options.responseMimeType
          ? { responseMimeType: options.responseMimeType }
          : {}),
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Gemini API error", {
      status: response.status,
      provider: "gemini",
      detail: errorText,
    });
    const err = new Error("Failed to get analysis from AI provider");
    (err as { upstream?: boolean }).upstream = true;
    throw err;
  }

  const data = await response.json();
  const text: string | undefined =
    data?.candidates?.[0]?.content?.parts
      ?.map((part: { text?: string }) => part?.text)
      ?.filter((t: unknown): t is string => typeof t === "string")
      ?.join("")
      ?.trim();

  if (!text) {
    const err = new Error("Empty response from AI provider");
    (err as { empty?: boolean }).empty = true;
    throw err;
  }

  return text;
}

// ---------------------------------------------------------------------------
// Shared prompt fragments (ported from the previous client-side lib/groq.ts so
// the tuned EN/DE coaching behavior is preserved, now executed server-side).
// ---------------------------------------------------------------------------

const DISCLAIMER: Record<Language, string> = {
  en:
    "Important note: This analysis is for informational purposes only and does not replace a medical diagnosis. Seek medical care if you notice severe symptoms.",
  de:
    "Wichtiger Hinweis: Diese Analyse dient nur der Information und ersetzt keine ärztliche Diagnose. Suchen Sie bei schweren Symptomen einen Arzt auf.",
};

const LANGUAGE_LABEL: Record<Language, string> = { en: "English", de: "German" };

const MEAL_COACH_PERSONA = [
  "You are a friendly, informal gut-health coach.",
  "Talk directly to the person, like a supportive coach, not like a clinical report.",
  'Avoid saying "the user"; say "you" in English and "du" in German.',
  "Keep the tone warm, practical, and encouraging while avoiding medical diagnosis or treatment claims.",
  "Your output is shown inside a mobile iOS app, so keep the report short, calm, and easy to scan on a small screen.",
].join(" ");

// Shared output contract for the short, mobile-friendly 5-section emoji report.
// Used by BOTH the initial photo analysis (meal_text) and the correction (meal_revise)
// so the two screens look identical. Keep these in sync — do not fork.
const FIVE_SECTION_FORMAT_RULES = [
  "Output format rules:",
  "- Use plain text only.",
  "- Do not use any markdown syntax. Forbidden: #, ##, ###, *, **, _.",
  "- Emojis are allowed because they are plain text.",
  "- Use exactly the 5 section labels listed below. Do not add, remove, or rename sections.",
  "- Use exactly one emoji at the start of each section label. Do not use emojis inside the body text.",
  "- Never use an emoji as the only carrier of meaning; the text must always explain the meaning.",
  "- Keep the full answer short: maximum 120 words, excluding the safety footer.",
  "- Keep each section to 1 short sentence. Avoid long explanations, numbered lists, and bullet points.",
  "- Keep the tone warm, practical, and calm. Write for iOS Dynamic Type readability: short lines, simple wording, no dense paragraphs.",
];

function fiveSectionStructure(opts: { mealLine: string; disclaimer: string; apologyFirst?: boolean }): string[] {
  return [
    "Required output structure:",
    ...(opts.apologyFirst
      ? ["If an apology is required, put it first in one short sentence before the sections."]
      : []),
    "🍽️ MEAL",
    opts.mealLine,
    "📊 SCORE",
    "Give the Meal Impact Score using the current gut score context and explain it briefly. You MUST state the score in the exact numeric form X/10 (for example 6/10).",
    "⚠️ POSSIBLE SENSITIVITY",
    "Name the likely comfort issue in plain language. If uncertain, say so clearly.",
    "✅ BETTER OPTION",
    "Suggest one gentler alternative that is specific to this exact meal. Choose the most relevant improvement: a cooking method change (e.g. grill instead of fry), an ingredient swap (e.g. sparkling water instead of soda), a portion adjustment, or a complementary food. Do not default to zucchini, carrots, peppermint, or ginger unless they are genuinely the best fit for this specific meal and user context.",
    "➡️ NEXT STEP",
    "Give exactly one practical next step specific to this meal and context. Vary it: for a fried or heavy meal suggest a smaller portion next time or a short walk after eating; for a sugary drink suggest swapping to water or an unsweetened alternative; for a large meal suggest eating more slowly or pausing before seconds; for a dairy concern suggest a smaller portion or a lactose-free alternative; for a generally healthy meal suggest a positive reinforcement habit. Reserve peppermint or ginger tea only when the user has explicitly mentioned stomach pain, nausea, gas, or bloating in their profile conditions or in their notes for this meal.",
    `End with this exact safety footer: ${opts.disclaimer}`,
  ];
}

// --- meal_text: image + rich context -> free-form markdown coaching analysis ---

type MealTextBody = {
  preferredLanguage?: Language;
  gutScore?: number;
  conditions?: string[];
  symptoms?: string[];
  userEnteredSymptoms?: string[];
  supplementsTakenToday?: string[];
  locationContext?: string;
  retailLocationHint?: string;
  userFeelingsNarrative?: string;
};

function buildMealTextPrompt(body: MealTextBody): string {
  const preferredLanguage = normalizeLanguage(body.preferredLanguage);
  const gutScore = typeof body.gutScore === "number" ? body.gutScore : undefined;
  const conditions = asStringArray(body.conditions);
  const symptoms = asStringArray(body.symptoms);
  const userEnteredSymptoms = asStringArray(body.userEnteredSymptoms);
  const supplementsTakenToday = asStringArray(body.supplementsTakenToday);
  const retailHint = (body.retailLocationHint ?? "").trim();
  const narrative = (body.userFeelingsNarrative ?? "").trim();
  const locationContext = body.locationContext;

  const languageLabel = LANGUAGE_LABEL[preferredLanguage];
  const conditionSummary = conditions.length > 0 ? conditions.join(", ") : "no known conditions";
  const symptomSummary = symptoms.length > 0 ? symptoms.join(", ") : "not provided";
  const userEnteredSymptomSummary =
    userEnteredSymptoms.length > 0 ? userEnteredSymptoms.join(", ") : "none";
  const supplementSummary =
    supplementsTakenToday.length > 0 ? supplementsTakenToday.join(", ") : "none reported today";
  const gutScoreSummary = typeof gutScore === "number" ? `${gutScore}/10` : "not provided";
  const disclaimer = DISCLAIMER[preferredLanguage];
  const locationTrimmed = locationContext?.trim() ?? "";
  const userLocation =
    [
      locationTrimmed && `device/context: ${locationTrimmed}`,
      retailHint && `retail/grocery area: ${retailHint}`,
    ]
      .filter(Boolean)
      .join(" | ") || "not available";

  const profileHead = [
    `Current gut score: ${gutScoreSummary}.`,
    `Known gut conditions: ${conditionSummary}.`,
    `User-entered symptoms from the UI: ${userEnteredSymptomSummary}.`,
    `All current symptoms combined: ${symptomSummary}.`,
    `Supplements taken in the last 12 hours: ${supplementSummary}.`,
  ];

  // 🍽️ MEAL section guidance: the user's confirmation (if any) overrides the photo.
  const mealLine = narrative
    ? `State the meal the person describes ("${narrative}") as authoritative; use the photo only to fill gaps. If their words conflict with the photo, follow their words.`
    : "Briefly state the most likely meal or drink visible in the photo.";

  return [
    "Analyze this meal photo for gut health and return ONE short report.",
    `Preferred response language: ${languageLabel}.`,
    'Tone rule: friendly and informal; speak directly to the person ("you" / "du").',
    "Language rule: respond only in English or German, matching the preferred response language. Do not respond in any other language.",
    "Context reset: this is a new meal scan. Ignore prior guesses, cookies, or chat context unless reflected in the symptoms below.",
    "",
    ...profileHead,
    `userLocation (ground any store/shopping hint in this variable; do not invent a region): ${userLocation}`,
    "",
    "Analysis rules:",
    "- Weigh what you see in the photo against the conditions, all current symptoms, and the gut score. User-entered symptoms take priority over default profile symptoms.",
    "- Consider supplements taken in the last 12 hours when relevant (e.g. a digestive enzyme or probiotic), but do not overpromise symptom relief.",
    conditionSummary !== "no known conditions"
      ? "- If IBS, bloating, or stomach pain is listed in the known conditions above, flag likely gas-forming or high-FODMAP foods; do not suggest brown rice, barley, or high-fiber whole grains — prefer white rice, boiled potatoes, zucchini, carrots, or low-FODMAP soup. Do not default to peppermint or ginger tea unless the user explicitly reports pain, nausea, gas, or bloating in their notes."
      : "- Give food-specific advice based only on what is visible in the photo. Do not assume gut conditions, sensitivities, or dietary restrictions that are not listed. If the user mentions pain or bloating in their notes, address it directly.",
    "- If a pain symptom is present, the NEXT STEP should lead with a gentle Plan B (peppermint or ginger tea, hydration, rest, warm compress) and add: seek medical care promptly for severe, worsening, or unusual pain.",
    "- Do not claim a food will treat, cure, prevent, or reliably stop symptoms. Use cautious comfort language; never promise or quantify outcomes (no percentages or timeframes).",
    "- Non-food guard (HIGHEST PRIORITY): Before producing any sections, decide if the image clearly shows a meal, dish, drink, or recognisable food item. If the image shows a plant in nature, a landscape, a person, an animal, packaging without visible food, a blurry or unidentifiable object, or anything that is clearly not food, you MUST NOT produce the 5-section output. Instead respond with exactly two plain sentences in the preferred response language: (1) state that you cannot identify a meal or food in the image, (2) ask the user to upload a clearer photo of their meal or to describe it in the text field below.",
    "- When the photo shows food but is unclear or ambiguous, say briefly what extra detail would help instead of guessing.",
    "",
    ...FIVE_SECTION_FORMAT_RULES,
    "",
    ...fiveSectionStructure({ mealLine, disclaimer }),
  ].join("\n");
}

// --- meal_revise: ongoing correction -> free-form markdown coaching analysis ---

type MealReviseBody = {
  preferredLanguage?: Language;
  previousAnalysis?: string;
  correction?: string;
  gutScore?: number;
  conditions?: string[];
  symptoms?: string[];
  locationContext?: string;
  retailLocationHint?: string;
  priorUserCorrections?: string[];
};

function buildMealRevisePrompt(body: MealReviseBody): { persona: string; prompt: string } {
  const preferredLanguage = normalizeLanguage(body.preferredLanguage);
  const previousAnalysis = String(body.previousAnalysis ?? "");
  const correction = String(body.correction ?? "");
  const gutScore = typeof body.gutScore === "number" ? body.gutScore : undefined;
  const conditions = asStringArray(body.conditions);
  const symptoms = asStringArray(body.symptoms);
  const retailHint = (body.retailLocationHint ?? "").trim();
  const prior = asStringArray(body.priorUserCorrections);
  const locationContext = body.locationContext;

  const languageLabel = LANGUAGE_LABEL[preferredLanguage];
  const gutScoreSummary = typeof gutScore === "number" ? `${gutScore}/10` : "not provided";
  const persona = [
    "You are a friendly, informal gut-health coach correcting a prior meal analysis.",
    "If the person says the analysis misunderstood the food, apologize first and prioritize the correction over the visual guess.",
    "Only respond in English or German. Do not respond in any other language.",
    "Avoid medical diagnosis, treatment claims, or promises of symptom relief.",
    "Do not present your advice as medical treatment, prevention, diagnosis, or guaranteed symptom control.",
    "Your output is shown inside a mobile iOS app, so make the revised report short, calm, and easy to scan on a small screen.",
  ].join(" ");
  const disclaimer = DISCLAIMER[preferredLanguage];
  const locationTrimmed = locationContext?.trim() ?? "";
  const userLocation =
    [
      locationTrimmed && `device/context: ${locationTrimmed}`,
      retailHint && `retail/grocery area: ${retailHint}`,
    ]
      .filter(Boolean)
      .join(" | ") || "not available";

  const prompt = [
    "Revise the meal analysis using the ongoing chat context.",
    `Preferred response language: ${languageLabel}.`,
    `Current gut score: ${gutScoreSummary}.`,
    `Known conditions: ${conditions.length > 0 ? conditions.join(", ") : "not provided"}.`,
    `Current symptoms: ${symptoms.length > 0 ? symptoms.join(", ") : "not provided"}.`,
    `userLocation (ground all revised store suggestions in this variable): ${userLocation}`,
    ...(userLocation === "not available"
      ? ["If userLocation is not available, keep shopping hints generic—do not invent a region."]
      : []),
    "",
    prior.length > 0
      ? [
          "Earlier user corrections this session (oldest first). Each one overrides image guesses and earlier AI text about what the meal was:",
          ...prior.map((line, i) => `${i + 1}. ${line}`),
          "",
        ].join("\n")
      : "",
    "Previous AI analysis:",
    previousAnalysis,
    "",
    "Latest user correction or new detail (highest priority—what they mean now):",
    correction,
    "",
    "Correction rules:",
    "- ABSOLUTE PRIORITY: Everything the user typed or spoke in the correction fields overrides any meal identity from the image or from the previous analysis. Rebuild the meal description from user words first.",
    "- The correction from the user is more reliable than the first visual guess. If the user says it is tea, herbal tea, soup, etc., stop discussing the previous guessed food and re-analyze the corrected food.",
    '- If the user says "you misunderstood", "that is wrong", or gives a correction, apologize immediately in English or German before the revised advice.',
    "- If the correction names a different food, completely clear the old meal context and do not mention the previous guessed food.",
    "- Preserve useful context from the photo and prior analysis only when it does not conflict with the correction and only when the user is discussing the same food.",
    "- Do not claim that a food will treat, cure, prevent, or reliably stop symptoms.",
    '- Use cautious comfort language such as "may feel gentler", "could be easier", "possible sensitivity", or "might be worth reducing".',
    '- Do not use strong medical wording such as "treatment", "diagnosis", "cure", "safe", "unsafe", or "medically recommended".',
    "",
    ...FIVE_SECTION_FORMAT_RULES,
    "",
    ...fiveSectionStructure({
      mealLine: "Briefly state the corrected meal or drink based on the user correction.",
      disclaimer,
      apologyFirst: true,
    }),
  ]
    .filter((block) => block !== "")
    .join("\n");

  return { persona, prompt };
}

// --- nutrients: feeling -> JSON list of helpful nutrient names ---

function buildNutrientsPrompt(userFeeling: string): string {
  return [
    `Based on clinical nutrition research, which 3 specific nutrients are most helpful for someone feeling ${userFeeling}?`,
    "Return exactly one JSON object and nothing else.",
    'Required format: {"nutrients":["Fiber","Probiotics","Magnesium"]}',
    "The nutrients field must be an array of nutrient names as strings.",
  ].join("\n");
}

function parseNutrientList(text: string): string[] {
  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const arrayMatch = cleaned.match(/\[[\s\S]*?\]/);
    if (!arrayMatch) return [];
    try {
      parsed = JSON.parse(arrayMatch[0]);
    } catch {
      return [];
    }
  }

  const list = Array.isArray(parsed)
    ? parsed
    : typeof parsed === "object" && parsed !== null && "nutrients" in parsed
      ? (parsed as { nutrients?: unknown }).nutrients
      : parsed;

  if (!Array.isArray(list)) return [];
  return list
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 3);
}

// --- nutrient_recommendation: feeling + nutrients (+ server-side USDA) -> text + foods ---

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
type NutritionValue = { amount: number; unit: string };
type FoodNutrition = {
  fdcId: number;
  description: string;
  protein: NutritionValue | null;
  fats: NutritionValue | null;
  carbohydrates: NutritionValue | null;
  vitamins: Record<string, NutritionValue | null>;
};

function getNutrient(
  nutrients: UsdaFoodNutrient[],
  nutrientNumbers: string[],
  fallbackNames: string[],
): NutritionValue | null {
  const nutrient = nutrients.find((item) => {
    const numberMatches = item.nutrientNumber
      ? nutrientNumbers.includes(item.nutrientNumber)
      : false;
    const normalizedName = item.nutrientName?.toLowerCase() ?? "";
    const nameMatches = fallbackNames.some((name) => normalizedName.includes(name));
    return numberMatches || nameMatches;
  });
  if (typeof nutrient?.value !== "number") return null;
  return { amount: nutrient.value, unit: nutrient.unitName ?? "" };
}

function parseFoodNutrition(food: UsdaFoodSearchItem): FoodNutrition | null {
  if (typeof food.fdcId !== "number" || !food.description) return null;
  const nutrients = food.foodNutrients ?? [];
  return {
    fdcId: food.fdcId,
    description: food.description,
    protein: getNutrient(nutrients, ["203"], ["protein"]),
    fats: getNutrient(nutrients, ["204"], ["total lipid", "fat"]),
    carbohydrates: getNutrient(nutrients, ["205"], ["carbohydrate"]),
    vitamins: {
      vitaminA: getNutrient(nutrients, ["318", "320"], ["vitamin a"]),
      vitaminC: getNutrient(nutrients, ["401"], ["vitamin c"]),
      vitaminD: getNutrient(nutrients, ["324", "328"], ["vitamin d"]),
      vitaminE: getNutrient(nutrients, ["323"], ["vitamin e"]),
      vitaminK: getNutrient(nutrients, ["430"], ["vitamin k"]),
      thiamin: getNutrient(nutrients, ["404"], ["thiamin"]),
      riboflavin: getNutrient(nutrients, ["405"], ["riboflavin"]),
      niacin: getNutrient(nutrients, ["406"], ["niacin"]),
      vitaminB6: getNutrient(nutrients, ["415"], ["vitamin b-6", "vitamin b6"]),
      folate: getNutrient(nutrients, ["417"], ["folate"]),
      vitaminB12: getNutrient(nutrients, ["418"], ["vitamin b-12", "vitamin b12"]),
    },
  };
}

async function fetchUsdaFood(query: string): Promise<FoodNutrition | null> {
  const trimmed = query.trim();
  if (!trimmed || !USDA_API_KEY) return null;
  try {
    const params = new URLSearchParams({
      api_key: USDA_API_KEY,
      query: trimmed,
      pageSize: "1",
    });
    const response = await fetch(`${USDA_API_BASE_URL}/foods/search?${params.toString()}`);
    if (!response.ok) return null;
    const data = (await response.json()) as { foods?: UsdaFoodSearchItem[] };
    const food = data.foods?.[0];
    return food ? parseFoodNutrition(food) : null;
  } catch (error) {
    console.error("USDA lookup failed", { error: String(error) });
    return null;
  }
}

function formatNutritionValue(value: NutritionValue | null): string {
  if (!value) return "not listed";
  return `${value.amount} ${value.unit}`.trim();
}

function summarizeFoodData(foodData: FoodNutrition): string {
  const vitaminEntries = Object.entries(foodData.vitamins)
    .map(([name, value]) => `${name}: ${formatNutritionValue(value)}`)
    .join(", ");
  return [
    `Food: ${foodData.description}`,
    `Protein: ${formatNutritionValue(foodData.protein)}`,
    `Fats: ${formatNutritionValue(foodData.fats)}`,
    `Carbohydrates: ${formatNutritionValue(foodData.carbohydrates)}`,
    `Vitamins: ${vitaminEntries}`,
  ].join("\n");
}

function buildNutrientRecommendationPrompt(
  userFeeling: string,
  nutrients: string[],
  foodData: FoodNutrition | null,
): string {
  return [
    "User context:",
    userFeeling,
    `The clinically relevant nutrients are: ${nutrients.join(", ")}`,
    foodData ? "USDA food data:" : "USDA food data: no matching USDA food was found for these nutrients.",
    foodData
      ? summarizeFoodData(foodData)
      : "Generate a helpful response anyway using the nutrient list and user context. Do not say the analysis failed.",
    "",
    "Write a warm, friendly recommendation in the preferred response language from the user context.",
    "Language rule: write the entire answer in English or German only, matching the preferred response language.",
    "Avoid medical claims and keep the tone practical, like a supportive friend.",
    "Formatting rule: use plain text only. Do not use ASCII art, decorative boxes, Unicode box-drawing characters (corners or ruled lines), tables, or unusual symbols. Do not use any markdown syntax. Forbidden: #, ##, ###, *, **, _. Use plain ALL CAPS section labels such as SUGGESTION, HOW LONG TO TRY, PROGRESS TIP.",
    "If a Gut score is present, frame the advice as a small step to help improve the Gut Score from the current score toward 10.",
    "Always include these clearly labeled parts: Suggestion, How long to try, and Progress Tip. Use German equivalents only when the preferred language is German.",
    "Suggestion should be a food or habit with a sensible amount/frequency phrased as friendly guidance (never prescription-style dosing). How long to try should be a practical timeframe. Progress Tip should tell the user what to track to see if their Gut Score improves.",
    `Mandatory safety footer: end the analysis with a short medical disclaimer in the preferred response language. German exact text: "${DISCLAIMER.de}" English exact text: "${DISCLAIMER.en}"`,
    "If the food is unhealthy for the user's gut condition, suggest 3 healthier alternatives that are commonly available in local grocery stores or restaurants.",
    "If IBS is listed as an underlying condition, never suggest high-sugar cookies, desserts, candy, sugary snacks, brown rice, barley bread, barley, or high-fiber whole grains. Prefer white rice, boiled potatoes, zucchini, carrots, low-FODMAP soup, cooked vegetables, or plain yogurt when appropriate. Peppermint or ginger tea may be suggested only when the user explicitly reports stomach pain, nausea, gas, or bloating.",
    "When USDA results are generic, incomplete, or not clearly gut-supportive, do not overfit the recommendation to cookies or processed snacks. Suggest natural whole foods and practical habits tied to the nutrient list.",
    foodData
      ? "Mention whether the USDA food appears helpful for those nutrients based only on the provided USDA data."
      : "Because no USDA food matched, suggest general food categories or habits tied to the listed nutrients instead of inventing USDA facts.",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Original structured photo analysis (mode "photo") — used by scan-food.tsx.
// ---------------------------------------------------------------------------

const PHOTO_SYSTEM_PROMPT = `You are a gut health nutrition analyst. Analyze this food photo and identify every food item visible.

For each food item, provide:
- name: the food item (lowercase)
- gut_score: 1-10 (10 = excellent for gut health, 1 = likely to cause issues)
- fodmap_level: "low", "medium", or "high"
- flags: array of relevant tags from: "probiotic", "prebiotic", "high-fiber", "anti-inflammatory", "irritant", "high-fat", "processed", "gluten"
- reasoning: one sentence explaining the gut health impact

Also provide:
- overall_score: 1-10 for the whole meal's gut friendliness
- summary: one sentence overall gut health assessment of the meal

Scoring guidelines:
- Fermented foods (yogurt, kimchi, sauerkraut): 8-10 (probiotic)
- High-fiber vegetables, legumes: 7-9 (prebiotic, high-fiber)
- Lean proteins (chicken, fish, eggs): 6-8 (neutral to good)
- Whole grains (oats, brown rice): 6-8 (high-fiber)
- Refined grains (white bread, pasta): 3-5 (low fiber, may cause bloating)
- Fried foods, processed meats: 2-4 (irritant, high-fat)
- High-FODMAP foods (onion, garlic, wheat): mark as high FODMAP
- Dairy: varies (yogurt = good, ice cream = poor)
- Spicy foods: 3-5 (potential irritant)

Return ONLY valid JSON matching this exact structure, no markdown fences:
{"foods":[{"name":"...","gut_score":0,"fodmap_level":"...","flags":[],"reasoning":"..."}],"overall_score":0,"summary":"..."}`;

async function handlePhotoMode(image: unknown, mimeType: unknown): Promise<Response> {
  if (!image) {
    return jsonResponse(
      { code: "BAD_REQUEST", message: "No image provided", retryable: false },
      400,
    );
  }
  if (typeof image === "string" && image.length > MAX_IMAGE_SIZE) {
    return jsonResponse(
      { code: "IMAGE_TOO_LARGE", message: "Image exceeds 10 MB limit", retryable: false },
      413,
    );
  }

  let responseText: string;
  try {
    responseText = await callGemini(
      [
        { text: PHOTO_SYSTEM_PROMPT },
        {
          inline_data: {
            mime_type: typeof mimeType === "string" ? mimeType : "image/jpeg",
            data: image as string,
          },
        },
      ],
      { responseMimeType: "application/json", temperature: 0.3 },
    );
  } catch (error) {
    if ((error as { empty?: boolean }).empty) {
      return jsonResponse(
        { code: "EMPTY_RESPONSE", message: "No analysis returned", retryable: true },
        502,
      );
    }
    return jsonResponse(
      { code: "UPSTREAM_ERROR", message: "Failed to analyze image", retryable: true },
      502,
    );
  }

  let analysis: unknown;
  try {
    analysis = JSON.parse(responseText);
  } catch {
    const jsonMatch = responseText.match(/```json?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      analysis = JSON.parse(jsonMatch[1]);
    } else {
      return jsonResponse(
        { code: "EMPTY_RESPONSE", message: "Could not parse analysis", retryable: true },
        502,
      );
    }
  }

  return new Response(JSON.stringify(analysis), {
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// Request handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  // --- 1. Auth verification ---
  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    return jsonResponse(
      { code: "UNAUTHORIZED", message: "Missing authorization", retryable: false },
      401,
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return jsonResponse(
      { code: "UNAUTHORIZED", message: "Invalid or expired token", retryable: false },
      401,
    );
  }

  // --- 2. Rate limiting ---
  const clientIp =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  if (isRateLimited(clientIp)) {
    return jsonResponse(
      { code: "RATE_LIMITED", message: "Rate limit exceeded. Try again later.", retryable: true },
      429,
    );
  }

  if (!GEMINI_API_KEY) {
    return jsonResponse(
      { code: "SERVER_MISCONFIGURED", message: "GEMINI_API_KEY not configured", retryable: false },
      500,
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(
      { code: "BAD_REQUEST", message: "Invalid JSON body", retryable: false },
      400,
    );
  }

  const mode = typeof body.mode === "string" ? body.mode : "photo";

  try {
    switch (mode) {
      // Structured JSON food scan (app/scan-food.tsx). Default for backward compat.
      case "photo":
        return await handlePhotoMode(body.image, body.mimeType);

      // Free-form coaching analysis from image + narrative (app/photo-analysis.tsx).
      case "meal_text": {
        const image = body.image;
        if (!image || typeof image !== "string") {
          return jsonResponse(
            { code: "BAD_REQUEST", message: "No image provided", retryable: false },
            400,
          );
        }
        if (image.length > MAX_IMAGE_SIZE) {
          return jsonResponse(
            { code: "IMAGE_TOO_LARGE", message: "Image exceeds 10 MB limit", retryable: false },
            413,
          );
        }
        const prompt = buildMealTextPrompt(body as MealTextBody);
        const analysis = await callGemini(
          [
            { text: `${MEAL_COACH_PERSONA}\n\n${prompt}` },
            {
              inline_data: {
                mime_type: typeof body.mimeType === "string" ? body.mimeType : "image/jpeg",
                data: image,
              },
            },
          ],
          { temperature: 0.25, maxOutputTokens: 4096 },
        );
        return jsonResponse({ analysis });
      }

      // Free-form coaching analysis revised from a correction (app/photo-analysis.tsx).
      case "meal_revise": {
        if (!String(body.correction ?? "").trim()) {
          return jsonResponse(
            { code: "BAD_REQUEST", message: "Correction text is required", retryable: false },
            400,
          );
        }
        const { persona, prompt } = buildMealRevisePrompt(body as MealReviseBody);
        const analysis = await callGemini([{ text: `${persona}\n\n${prompt}` }], {
          temperature: 0.25,
          maxOutputTokens: 4096,
        });
        return jsonResponse({ analysis });
      }

      // Helpful nutrients for a feeling (app/(tabs)/index.tsx home plan).
      case "nutrients": {
        const feeling = String(body.feeling ?? "").trim();
        if (!feeling) {
          return jsonResponse(
            { code: "BAD_REQUEST", message: "Feeling text is required", retryable: false },
            400,
          );
        }
        const text = await callGemini([{ text: buildNutrientsPrompt(feeling) }], {
          responseMimeType: "application/json",
          temperature: 0.2,
        });
        const nutrients = parseNutrientList(text);
        if (nutrients.length === 0) {
          return jsonResponse(
            { code: "EMPTY_RESPONSE", message: "No nutrients returned", retryable: true },
            502,
          );
        }
        return jsonResponse({ nutrients });
      }

      // Full home recommendation: nutrients -> USDA foods -> recommendation text.
      case "nutrient_recommendation": {
        const feeling = String(body.feeling ?? "").trim();
        if (!feeling) {
          return jsonResponse(
            { code: "BAD_REQUEST", message: "Feeling text is required", retryable: false },
            400,
          );
        }
        const nutrients = asStringArray(body.nutrients);
        // Look up one USDA food per nutrient (server-side key), keep successful hits.
        const foodResults = await Promise.all(nutrients.map((n) => fetchUsdaFood(n)));
        const foods = foodResults.filter((f): f is FoodNutrition => f !== null);
        const recommendation = await callGemini(
          [{ text: buildNutrientRecommendationPrompt(feeling, nutrients, foods[0] ?? null) }],
          { temperature: 0.2, maxOutputTokens: 4096 },
        );
        return jsonResponse({ recommendation, foods });
      }

      default:
        return jsonResponse(
          { code: "BAD_REQUEST", message: `Unknown mode: ${mode}`, retryable: false },
          400,
        );
    }
  } catch (error) {
    if ((error as { upstream?: boolean }).upstream || (error as { empty?: boolean }).empty) {
      return jsonResponse(
        { code: "UPSTREAM_ERROR", message: "Failed to analyze", retryable: true },
        502,
      );
    }
    console.error("Edge function error", { error: String(error), provider: "gemini", mode });
    return jsonResponse(
      { code: "INTERNAL_ERROR", message: "Internal server error", retryable: true },
      500,
    );
  }
});
