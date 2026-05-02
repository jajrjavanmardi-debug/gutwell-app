/**
 * Persisted history for meal photo analyses. Parsing helpers assume AI output follows EN/DE meal-score
 * patterns; digit normalization handles extended Arabic/Persian digits only when parsing stored text.
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

/** Normalize Persian / Arabic-Indic digits to ASCII for regex parsing (no locale-specific literals in source). */
function normalizeDigits(value: string): string {
  return value
    .replace(/[\u06f0-\u06f9]/g, (ch) => String.fromCharCode(48 + ch.charCodeAt(0) - 0x06f0))
    .replace(/[\u0660-\u0669]/g, (ch) => String.fromCharCode(48 + ch.charCodeAt(0) - 0x0660));
}

export function extractMealImpactScore(aiText: string): string | null {
  const normalizedText = normalizeDigits(aiText);
  const scoreMatch = normalizedText.match(/(?:meal impact score|impact score|score)[^\d]{0,24}(\d{1,2})\s*(?:\/|out of)\s*10/i)
    ?? normalizedText.match(/(\d{1,2})\s*(?:\/|out of)\s*10/i);

  if (!scoreMatch) return null;

  const score = Number(scoreMatch[1]);
  if (!Number.isFinite(score) || score < 1 || score > 10) return null;

  return `${score}/10`;
}

export function extractMealName(aiText: string): string {
  const cleanedLines = aiText
    .split('\n')
    .map((line) => line.replace(/^[-*•#\s]+/, '').trim())
    .filter(Boolean);
  const mealLine = cleanedLines.find((line) =>
    /^(likely meal|meal|food)\b/i.test(line)
  );
  const rawMealName = (mealLine ?? cleanedLines[0] ?? 'Meal photo')
    .replace(/^(likely meal|meal|food)\s*[:：-]\s*/i, '')
    .trim();

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
