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

export function extractMealName(aiText: string): string {
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

  rawMealName = (rawMealName ?? cleanedLines[0] ?? 'Meal photo').trim();
  return rawMealName.slice(0, 80) || 'Meal photo';
}

/** Sentence openers the model uses before naming the dish. */
const TITLE_PREAMBLE =
  /^(it looks like you (enjoyed|had|ate)|you (had|ate|enjoyed)( some| a| an)?|this (looks like|appears to be|is)( a| an)?( meal of| plate of| bowl of)?|looks like( a| an)?( meal of| lovely)?|i can see( a| an)?|the (meal|dish|photo) (shows|is)( a| an)?|here (is|we have)( a| an)?)\s*/i;

/**
 * Always cut here — past this point the model has stopped identifying the dish
 * and started explaining it.
 */
const TITLE_TAIL_HARD =
  /\s*(,|;|:|—|–| - | \(| which | that | but | topped | served | alongside | accompanied | on the side ).*/i;

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
export function extractMealTitle(aiText: string): string {
  const fullName = extractMealName(aiText);
  if (!fullName || fullName === 'Meal photo') return 'Meal analysis';
  if (/^i cannot identify/i.test(fullName)) return 'Meal analysis';

  // A title is a glance, not a read. 24 chars is the shape of the approved
  // examples — "Cheese Pizza", "Chicken Salad", "Mediterranean Bowl" — and is
  // the threshold above which the soft cut drops trailing components. At 32 a
  // string like "Pizza with cheese and tomato" slipped through intact.
  const MAX = 24;

  let stripped = fullName.replace(TITLE_PREAMBLE, '').trim();
  // Applied after the preamble so "This is a bowl of…" is not itself treated
  // as the clause boundary.
  stripped = stripped.replace(TITLE_TAIL_HARD, '').trim();
  stripped = stripped.replace(/[.!?]+$/, '').replace(/^(a|an|the)\s+/i, '').trim();
  if (stripped.length > MAX) stripped = stripped.replace(TITLE_TAIL_SOFT, '').trim();

  const result = (stripped || fullName).replace(TITLE_DANGLING, '');
  const titled = result.charAt(0).toUpperCase() + result.slice(1);

  if (titled.length <= MAX) return titled;
  // Still long: a single very long dish name. Cut at a word boundary.
  const cut = titled.slice(0, MAX);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 12 ? cut.slice(0, lastSpace) : cut)
    .replace(/[,\s]+$/, '')
    .replace(TITLE_DANGLING, '');
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
