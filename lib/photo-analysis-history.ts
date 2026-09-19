/**
 * Persisted history for meal photo analyses. Parsing helpers assume AI output follows the
 * EN/DE meal-score and section-label patterns produced by the analyze-food edge function.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { toShortSentence } from './analysis-sections';

export type PhotoAnalysisHistoryItem = {
  id: string;
  imageUri: string;
  createdAt: string;
  aiText: string;
  symptoms: string[];
  mealName: string;
  mealImpactScore: string | null;
};

const PHOTO_ANALYSIS_HISTORY_KEY = 'gutwell_photo_analysis_history';
const HISTORY_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

function keepRecentItems(items: PhotoAnalysisHistoryItem[]): PhotoAnalysisHistoryItem[] {
  const cutoff = Date.now() - HISTORY_WINDOW_MS;

  return items
    .filter((item) => {
      const createdAt = Date.parse(item.createdAt);
      return Number.isFinite(createdAt) && createdAt >= cutoff;
    })
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export function extractMealImpactScore(aiText: string): string | null {
  // EN/DE outputs use ASCII digits; the "📊 SCORE" section states the score as "X/10".
  const scoreMatch = aiText.match(/(?:meal impact score|impact score|score)[^\d]{0,24}(\d{1,2})\s*(?:\/|out of)\s*10/i)
    ?? aiText.match(/SCORE[:\s]{0,4}(\d{1,2})\s*(?:\/|out of)\s*10/i)
    ?? aiText.match(/(\d{1,2})\s*(?:\/|out of)\s*10/i);

  if (!scoreMatch) return null;

  const score = Number(scoreMatch[1]);
  if (!Number.isFinite(score) || score < 1 || score > 10) return null;

  return `${score}/10`;
}

/**
 * Strip leading decoration (emoji, punctuation, whitespace) from the start of a line
 * so emoji section labels like "🍽️ MEAL" are recognizable. Keeps letters
 * (incl. German umlauts in the Latin-1 range) and digits.
 */
function stripLeadingDecoration(line: string): string {
  return line.replace(/^[^A-Za-z0-9À-ÿ]+/, '').trim();
}

export function extractMealName(aiText: string, fallback = 'Meal photo'): string {
  const cleanedLines = aiText
    .split('\n')
    .map(stripLeadingDecoration)
    .filter(Boolean);

  const mealLabel = /^(likely meal|meal|gericht|mahlzeit|food)\b/i;
  const labelIndex = cleanedLines.findIndex((line) => mealLabel.test(line));

  let rawMealName: string | undefined;
  if (labelIndex !== -1) {
    // Content may be inline ("MEAL: Herbal tea") or on the next line (emoji format).
    const inline = cleanedLines[labelIndex]
      .replace(/^(likely meal|meal|gericht|mahlzeit|food)\s*[:：-]?\s*/i, '')
      .trim();
    rawMealName = inline || cleanedLines[labelIndex + 1];
  }

  rawMealName = (rawMealName ?? cleanedLines[0] ?? fallback).trim();
  return rawMealName.slice(0, 80) || fallback;
}

/**
 * Sentence openers the model uses before naming the dish.
 *
 * Built from an alternation list rather than one hand-written line: the flat
 * version silently missed the `you're` contraction, and the failure was
 * invisible because the truncation below still produced *something*. On device
 * that something was the headline "It looks like you're".
 *
 * Whatever this misses, TITLE_NOT_A_NAME below is the backstop — this regex is
 * how a title gets recovered, not how scaffolding is kept out.
 */
const TITLE_PREAMBLE = new RegExp(
  '^(?:' +
    [
      // "It looks like you're having…", "It seems you had…", "This appears to be…"
      "(?:it|this|that)\\s+(?:looks?|seems?|appears?|is)\\s*(?:like)?\\s*(?:to\\s+be)?\\s*" +
        "(?:you(?:'re|’re|\\s+are|\\s+were)?\\s*)?" +
        "(?:enjoying|having|drinking|eating|enjoyed|had|ate|got)?",
      // "You're having…", "You had…"
      "you(?:'re|’re|\\s+are|\\s+were)?\\s*(?:enjoying|having|drinking|eating|enjoyed|had|ate)",
      // "Based on the image, this is…"
      "based\\s+on\\s+(?:the\\s+)?(?:image|photo|picture)s?\\s*,?\\s*" +
        "(?:this\\s+(?:is|looks\\s+like|appears\\s+to\\s+be))?",
      // "I think this is…", "I can see…"
      "i\\s+(?:think|believe|can\\s+see|see)\\s*(?:that\\s+)?" +
        "(?:this\\s+(?:is|looks\\s+like))?",
      "here\\s+(?:is|we\\s+have)",
      "the\\s+(?:meal|dish|photo|image)\\s+(?:shows|is|contains)",
      "looks\\s+like",
      // German — a DE analysis opens the same way, and the title is rendered
      // from the same extractor.
      "es\\s+sieht\\s+(?:so\\s+)?aus,?\\s*als\\s+(?:ob\\s+)?(?:du|sie)?",
      "das\\s+(?:sieht\\s+aus\\s+wie|ist|scheint|w(?:a|ä)re)",
      "hier\\s+(?:ist|haben\\s+wir)",
      "auf\\s+dem\\s+(?:bild|foto)\\s*(?:ist|sehe\\s+ich)?",
      "ich\\s+(?:denke|glaube|sehe)",
    ].join('|') +
    ')' +
    // Articles and partitives the opener leaves behind.
    "(?:\\s*(?:a|an|the|some|your|einen|eine|ein|der|die|das)\\b)*" +
    "(?:\\s*(?:meal|plate|bowl|cup)\\s+of)?" +
    "\\s*",
  'i',
);

/**
 * "a warming cup of Yogi Tea" is the vessel, not the drink. Dropped so the
 * name itself fits the budget instead of being truncated mid-phrase.
 */
const TITLE_VESSEL =
  /^(?:(?:a|an|the|some|your)\s+)?(?:(?:warm|warming|hot|cold|iced|fresh|delicious|lovely|nice|tasty|healthy|light|large|small)\s+)*(?:cup|mug|glass|bowl|plate|serving|portion|slice|piece)\s+of\s+/i;

/**
 * A title that still starts with one of these is scaffolding, not a dish — no
 * food name begins "It", "You" or "Based". This is a post-condition, checked
 * after every cut, because truncation is itself capable of manufacturing a
 * fragment: "It looks like you're having…" cut to 24 characters and trimmed to
 * a word boundary is exactly the "It looks like you're" seen on device.
 *
 * Word-bounded so real names survive — "Iced tea" is not "I".
 */
const TITLE_NOT_A_NAME =
  /^(?:it|this|that|these|those|here|there|i|you|we|they|based|looks|seems|appears|maybe|perhaps|probably|likely|es|das|hier|ich|du|sie|auf|wahrscheinlich|vermutlich)\b/i;

/**
 * An action, not a food: "Focusing on meal timing", "Working with walnuts".
 *
 * A revision that adds timing or symptoms makes the model's MEAL section
 * describe what it is doing rather than what was eaten, and the result reads
 * as a headline because it starts with an ordinary word. Matched narrowly — a
 * gerund followed by a preposition — so participle food names are untouched:
 * "Grilled chicken" has no -ing, and "Baking soda" has no preposition.
 */
const TITLE_ACTION_PHRASE = /^\w+ing\s+(?:on|about|with|for|to|at)\b/i;

/**
 * Always cut here — past this point the model has stopped identifying the dish
 * and started explaining it.
 */
const TITLE_TAIL_HARD =
  /\s*(,|;|:|—|–| - | \(| which | that | but | topped | served | alongside | accompanied | on the side | eaten | consumed | gegessen | getrunken ).*/i;

/**
 * Cut here only when the title is still over budget. "Grilled chicken and
 * rice" is a legitimate name for a composite meal and fits; "fried fish with a
 * dip and a Coca-Cola" does not, and the first component identifies it well
 * enough.
 */
const TITLE_TAIL_SOFT = /\s*( with | and | plus ).*/i;

/**
 * A cut can still land on a word that cannot end a title. "Fried fish and a"
 * is worse than "Fried fish", so trailing articles and conjunctions come off.
 */
const TITLE_DANGLING = /[\s,]+(a|an|the|and|or|with|of|in|on|for|plus)$/i;

/**
 * A title is a glance, not a read. 24 chars is the shape of the approved
 * examples — "Cheese Pizza", "Chicken Salad", "Mediterranean Bowl" — and is
 * the threshold above which the soft cut drops trailing components. At 32 a
 * string like "Pizza with cheese and tomato" slipped through intact.
 *
 * Shared by both identity paths so the model's name and the user's own words
 * are held to the same budget.
 */
const MEAL_TITLE_MAX = 24;

/**
 * German puts the verb last, so stripping the opener leaves it stranded:
 * "…als ob du einen Kräutertee trinkst" reduces to "Kräutertee trinkst".
 * A name does not end in a verb.
 */
const TITLE_DE_TRAILING_VERB =
  /\s+(?:trinkst|trinken|isst|essen|gegessen|getrunken|hast|hattest|genie(?:ß|ss)t|zu\s+dir\s+nimmst)\.?$/i;

/**
 * The meal title: the dish, and nothing else.
 *
 * The MEAL section is prose — "You had some pizza with cheese and a side
 * salad, which is quite rich" — and a headline needs the noun phrase out of
 * the front of it. Four cuts, in order: the opener, the hard clause boundary,
 * the soft one if still over budget, then a word-boundary cap.
 *
 * Explanation is never lost, only relocated: the full MEAL text stays in the
 * analysis body, which is what the reader sees under the score.
 */
export function extractMealTitle(aiText: string, fallback = 'Meal analysis'): string {
  const fullName = extractMealName(aiText, fallback);
  if (!fullName || fullName === fallback) return fallback;
  if (/^i cannot identify|^ich kann .* nicht erkennen/i.test(fullName)) return fallback;

  const MAX = MEAL_TITLE_MAX;

  let stripped = fullName.replace(TITLE_PREAMBLE, '').trim();
  // After the opener, before the budget is measured: the vessel is not the
  // dish, and keeping it is what pushed real names past the cut.
  stripped = stripped.replace(TITLE_VESSEL, '').trim();
  // Applied after the preamble so "This is a bowl of…" is not itself treated
  // as the clause boundary.
  // Before the cuts: TITLE_TAIL_SOFT removes the preposition that makes an
  // action phrase recognisable, so "working with walnuts" would survive as
  // "Working". Judged here, while it is still a whole phrase.
  if (TITLE_ACTION_PHRASE.test(stripped)) return fallback;
  stripped = stripped.replace(TITLE_TAIL_HARD, '').trim();
  stripped = stripped.replace(/[.!?]+$/, '').replace(/^(a|an|the)\s+/i, '').trim();
  if (stripped.length > MAX) stripped = stripped.replace(TITLE_TAIL_SOFT, '').trim();

  const result = (stripped || fullName)
    .replace(TITLE_DE_TRAILING_VERB, '')
    .replace(TITLE_DANGLING, '');
  const titled = result.charAt(0).toUpperCase() + result.slice(1);

  if (titled.length <= MAX) return safeTitle(titled, fallback);
  // Still long: a single very long dish name. Cut at a word boundary.
  const cut = titled.slice(0, MAX);
  const lastSpace = cut.lastIndexOf(' ');
  const trimmed = (lastSpace > 12 ? cut.slice(0, lastSpace) : cut)
    .replace(/[,\s]+$/, '')
    .replace(TITLE_DANGLING, '');
  return safeTitle(trimmed, fallback);
}

/**
 * A concise food label from the user's OWN words.
 *
 * Used only when the model's MEAL section yields no usable name — which is the
 * common case, because the prompt asks for a sentence ("State the meal the
 * person describes…"), not a label. Walnuts came back as "Looks like you're
 * working with walnuts…", and after a timing correction the section was about
 * timing rather than food at all.
 *
 * Deliberately NOT noun extraction from AI prose. The input here is what the
 * person typed or spoke, so the first clause is already the thing they named:
 * "walnuts, feeling bloated" -> "Walnuts". Everything after the first clause
 * boundary is context, not identity.
 *
 * Returns null rather than a guess whenever what is left cannot be a name, so
 * the caller falls back to its localized default.
 */
export function conciseFoodIdentity(userText: string): string | null {
  if (typeof userText !== 'string') return null;
  const firstLine = userText.trim().split('\n')[0] ?? '';
  if (!firstLine) return null;

  const opened = firstLine.replace(TITLE_PREAMBLE, '').replace(TITLE_VESSEL, '').trim();
  if (TITLE_ACTION_PHRASE.test(opened)) return null;

  let value = opened
    .replace(TITLE_TAIL_HARD, '')
    .replace(/[.!?]+$/, '')
    .replace(/^(a|an|the|some|ein|eine|einen)\s+/i, '')
    .trim();

  if (value.length > MEAL_TITLE_MAX) {
    value = value.replace(TITLE_TAIL_SOFT, '').trim();
  }
  if (value.length > MEAL_TITLE_MAX) {
    const cut = value.slice(0, MEAL_TITLE_MAX);
    const lastSpace = cut.lastIndexOf(' ');
    value = (lastSpace > 12 ? cut.slice(0, lastSpace) : cut).replace(/[,\s]+$/, '');
  }
  value = value.replace(TITLE_DE_TRAILING_VERB, '').replace(TITLE_DANGLING, '').trim();
  if (!value) return null;

  const titled = value.charAt(0).toUpperCase() + value.slice(1);
  // Same post-condition as the model path: a description of how someone feels
  // is not a food name.
  if (titled.length < 3 || TITLE_NOT_A_NAME.test(titled)) return null;
  if (TITLE_ACTION_PHRASE.test(titled)) return null;
  return titled;
}

/**
 * The post-condition every return from extractMealTitle passes through.
 *
 * A headline is a claim about what the food IS, so anything that is not a name
 * — leftover scaffolding, or a stub too short to identify anything — becomes
 * the neutral fallback instead. Uncertainty belongs in the analysis body,
 * which still carries the model's full wording; it must not appear as a
 * truncated sentence in the largest text on the screen.
 */
function safeTitle(candidate: string, fallback: string): string {
  const value = candidate.trim();
  if (value.length < 3) return fallback;
  if (TITLE_NOT_A_NAME.test(value)) return fallback;
  if (TITLE_ACTION_PHRASE.test(value)) return fallback;
  return value;
}

/**
 * Extracts a short one-line reason from the SCORE section (the sentence explaining the score).
 * Returns empty string when SCORE section is missing or reason cannot be extracted.
 */
export function extractScoreReason(aiText: string): string {
  // Find the SCORE section and extract the explanatory sentence
    const scoreSection = aiText.match(/SCORE[^\n]*\n([^\n]{10,200})/i);
  if (!scoreSection) return '';
  let reason = scoreSection[1].trim();
  // Remove the X/10 if it appears at the start of the reason line
  reason = reason.replace(/^\d{1,2}\/10[^a-zA-Z]*/i, '').trim();
  // Remove leading emoji or symbols
  reason = reason.replace(/^[^\w\u00C0-\u017E\u0600-\u06FF]+/, '').trim();
  if (reason.length < 5) return '';
  // One short sentence, and only one. The number already carries the message;
  // this line exists to say why at a glance. The detailed reasoning stays in
  // the analysis body and, in the concise onboarding view, inside "More".
  const candidate = toShortSentence(reason, 90);
  if (!candidate) return '';
  // Stripping the leading "5/10 — " leaves the remainder mid-sentence, so it
  // needs its capital back before it can stand on its own line.
  return candidate.charAt(0).toUpperCase() + candidate.slice(1);
}

export async function getPhotoAnalysisHistory(): Promise<PhotoAnalysisHistoryItem[]> {
  const raw = await AsyncStorage.getItem(PHOTO_ANALYSIS_HISTORY_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const normalizedItems = parsed.map((item) => {
      const historyItem = item as Partial<PhotoAnalysisHistoryItem>;
      const aiText = historyItem.aiText ?? '';

      return {
        id: historyItem.id ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        imageUri: historyItem.imageUri ?? '',
        createdAt: historyItem.createdAt ?? new Date(0).toISOString(),
        aiText,
        symptoms: historyItem.symptoms ?? [],
        mealName: historyItem.mealName ?? extractMealName(aiText),
        mealImpactScore: historyItem.mealImpactScore ?? extractMealImpactScore(aiText),
      };
    });

    return keepRecentItems(normalizedItems);
  } catch {
    return [];
  }
}

export async function savePhotoAnalysisHistoryItem(payload: {
  imageUri: string;
  aiText: string;
  symptoms?: string[];
  mealImpactScore?: string | null;
}): Promise<void> {
  const existing = await getPhotoAnalysisHistory();
  const aiText = payload.aiText;
  const createdAt = new Date().toISOString();

  const newItem: PhotoAnalysisHistoryItem = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    imageUri: payload.imageUri,
    createdAt,
    aiText,
    symptoms: payload.symptoms ?? [],
    mealName: extractMealName(aiText),
    mealImpactScore: payload.mealImpactScore ?? extractMealImpactScore(aiText),
  };

  await AsyncStorage.setItem(
    PHOTO_ANALYSIS_HISTORY_KEY,
    JSON.stringify([newItem, ...existing]),
  );
}
