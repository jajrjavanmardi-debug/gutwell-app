/**
 * Persisted history for meal photo analyses. Parsing helpers assume AI output follows the
 * EN/DE meal-score and section-label patterns produced by the analyze-food edge function.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

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
