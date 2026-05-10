/**
 * Persisted history for meal photo analyses. Parsing helpers assume AI output follows EN/DE meal-score
 * patterns; digit normalization handles extended Arabic/Persian digits only when parsing stored text.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AppLanguage } from './app-language';
import { supabase } from './supabase';

export type PhotoAnalysisHistoryItem = {
  id: string;
  imageUri: string;
  createdAt: string;
  aiText: string;
  symptoms: string[];
  mealName: string;
  mealImpactScore: string | null;
  language?: AppLanguage;
};

const PHOTO_ANALYSIS_HISTORY_KEY = 'gutwell_photo_analysis_history';
const HISTORY_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

type HealthLogRow = {
  id: number | string;
  created_at: string;
  food_name: string | null;
  gut_score: number | null;
  analysis_content: string | null;
  nutrients: unknown;
  language?: string | null;
};

const SCORE_LABELS: Record<AppLanguage, { impact: string; gut: string; fallbackMeal: string }> = {
  en: {
    impact: 'Meal Impact Score',
    gut: 'Gut Score',
    fallbackMeal: 'Meal photo',
  },
  de: {
    impact: 'Mahlzeiten-Score',
    gut: 'Darm-Score',
    fallbackMeal: 'Mahlzeit (Foto)',
  },
  fa: {
    impact: 'امتیاز تأثیر غذا',
    gut: 'امتیاز روده',
    fallbackMeal: 'غذای عکس',
  },
};

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
  const scoreMatch = normalizedText.match(
    /(?:meal impact score|impact score|gut score|score|mahlzeiten-score|darm-score|امتیاز تأثیر غذا|امتیاز غذا|امتیاز روده|امتیاز)[^\d]{0,40}(\d{1,2})\s*(?:\/|out of|از)\s*10/i,
  )
    ?? normalizedText.match(/(\d{1,2})\s*(?:\/|out of|از)\s*10/i);

  if (!scoreMatch) return null;

  const score = Number(scoreMatch[1]);
  if (!Number.isFinite(score) || score < 1 || score > 10) return null;

  return `${score}/10`;
}

function clampMealImpactScore(score: number): number {
  return Math.max(1, Math.min(10, Math.round(score)));
}

function hasAnyText(value: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(value));
}

export function estimateMealImpactScore(
  aiText: string,
  symptoms: string[] = [],
  mealNotes = '',
): string {
  const combinedText = `${aiText} ${mealNotes} ${symptoms.join(' ')}`.toLowerCase();
  let score = 6;

  const severeSymptoms = ['pain', 'cramps', 'reflux', 'nausea', 'diarrhea'];
  const moderateSymptoms = ['bloating', 'gas', 'heaviness', 'constipation', 'low energy'];
  score -= symptoms.filter((symptom) => severeSymptoms.some((item) => symptom.toLowerCase().includes(item))).length * 1.5;
  score -= symptoms.filter((symptom) => moderateSymptoms.some((item) => symptom.toLowerCase().includes(item))).length * 0.75;

  if (hasAnyText(combinedText, [
    /\bfried\b/,
    /\bgreasy\b/,
    /\bspicy\b/,
    /\bchili\b/,
    /\bcream\b/,
    /\bmilk\b/,
    /\bcheese\b/,
    /\bonion\b/,
    /\bgarlic\b/,
    /\bbeans?\b/,
    /\blentils?\b/,
    /\bwheat\b/,
    /\bbarley\b/,
    /\bcookie\b/,
    /\bcake\b/,
    /\bcandy\b/,
    /\bsoda\b/,
    /\bcarbonated\b/,
    /\balcohol\b/,
    /\bcoffee\b/,
  ])) {
    score -= 2;
  }

  if (hasAnyText(combinedText, [
    /\blikely (?:worsen|trigger|irritate)\b/,
    /\bmay (?:worsen|trigger|irritate)\b/,
    /\bnot ideal\b/,
    /\bhigh-fodmap\b/,
    /\bflare\b/,
  ])) {
    score -= 1.5;
  }

  if (hasAnyText(combinedText, [
    /\bboiled potatoes?\b/,
    /\bwhite rice\b/,
    /\bzucchini\b/,
    /\bcarrots?\b/,
    /\bsoup\b/,
    /\bginger\b/,
    /\bpeppermint\b/,
    /\bplain yogurt\b/,
    /\bcooked vegetables?\b/,
    /\blean protein\b/,
  ])) {
    score += 1.5;
  }

  if (hasAnyText(combinedText, [
    /\bgut-friendly\b/,
    /\bgentle\b/,
    /\bsupportive\b/,
    /\blower risk\b/,
    /\beasy to digest\b/,
  ])) {
    score += 1;
  }

  return `${clampMealImpactScore(score)}/10`;
}

export function resolveMealImpactScore(
  aiText: string,
  symptoms: string[] = [],
  mealNotes = '',
  _language: AppLanguage = 'en',
): string | null {
  const extractedScore = extractMealImpactScore(aiText);
  if (!extractedScore) return estimateMealImpactScore(aiText, symptoms, mealNotes);
  if (extractedScore !== '4/10') return extractedScore;
  return estimateMealImpactScore(aiText, symptoms, mealNotes);
}

export function applyDynamicMealImpactScore(
  aiText: string,
  symptoms: string[] = [],
  mealNotes = '',
  language: AppLanguage = 'en',
): string {
  const dynamicScore = resolveMealImpactScore(aiText, symptoms, mealNotes);
  if (!dynamicScore) return aiText;

  const [scoreNumber] = dynamicScore.split('/');
  const labels = SCORE_LABELS[language];
  let updatedText = aiText.replace(
    /((?:Gut Score|Darm-Score|امتیاز روده)\s*:\s*\[[#-]{10}\]\s*)[0-9\u06f0-\u06f9\u0660-\u0669]{1,2}\s*(?:\/|از)\s*(?:10|۱۰|١٠)/i,
    `$1${dynamicScore}`,
  );

  updatedText = updatedText.replace(
    /((?:Meal Impact Score|Impact Score|Score|Mahlzeiten-Score|Darm-Score|امتیاز تأثیر غذا|امتیاز غذا|امتیاز روده|امتیاز)[^\d\n|]{0,40})[0-9\u06f0-\u06f9\u0660-\u0669]{1,2}\s*(?:\/|out of|از)\s*(?:10|۱۰|١٠)/i,
    `$1${dynamicScore}`,
  );

  updatedText = updatedText.replace(
    /(\|\s*(?:Score|Gut Score|Meal Impact Score|Mahlzeiten-Score|Darm-Score|امتیاز تأثیر غذا|امتیاز روده|امتیاز)\s*\|[^\n]*\n\|[^\n]*\n\|(?:[^|\n]*\|){2}\s*)[0-9\u06f0-\u06f9\u0660-\u0669]{1,2}\s*(?:\/|out of|از)\s*(?:10|۱۰|١٠)/i,
    `$1${dynamicScore}`,
  );

  if (updatedText === aiText && scoreNumber) {
    return `${labels.impact}: ${dynamicScore}\n${labels.gut}: [${'#'.repeat(Number(scoreNumber)).padEnd(10, '-')}] ${dynamicScore}\n\n${aiText}`;
  }

  return updatedText;
}

export function extractMealName(aiText: string, language: AppLanguage = 'en'): string {
  const cleanedLines = aiText
    .split('\n')
    .map((line) => line.replace(/^[-*•#\s]+/, '').trim())
    .filter(Boolean);
  const mealLine = cleanedLines.find((line) =>
    /^(?:(?:likely meal|meal|food|mahlzeit|essen)\b|غذا(?=\s*[:：-]|$))/i.test(line)
  );
  const rawMealName = (mealLine ?? cleanedLines[0] ?? SCORE_LABELS[language].fallbackMeal)
    .replace(/^(?:(?:likely meal|meal|food|mahlzeit|essen)\b|غذا(?=\s*[:：-]|$))\s*[:：-]\s*/i, '')
    .trim();

  return rawMealName.slice(0, 80) || SCORE_LABELS[language].fallbackMeal;
}

function parseScoreNumber(score: string | null): number | null {
  if (!score) return null;
  const value = Number(score.match(/\d{1,2}/)?.[0]);
  return Number.isFinite(value) ? Math.max(1, Math.min(10, value)) : null;
}

function parseHealthLogNutrients(value: unknown): { imageUri?: string; symptoms?: string[] } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  return {
    imageUri: typeof record.imageUri === 'string' ? record.imageUri : undefined,
    symptoms: Array.isArray(record.symptoms)
      ? record.symptoms.filter((item): item is string => typeof item === 'string')
      : undefined,
  };
}

function mapHealthLogToHistoryItem(row: HealthLogRow): PhotoAnalysisHistoryItem {
  const aiText = row.analysis_content ?? '';
  const nutrients = parseHealthLogNutrients(row.nutrients);
  const language: AppLanguage = row.language === 'de' || row.language === 'fa' ? row.language : 'en';

  return {
    id: String(row.id),
    imageUri: nutrients.imageUri ?? '',
    createdAt: row.created_at,
    aiText,
    symptoms: nutrients.symptoms ?? [],
    mealName: row.food_name || extractMealName(aiText, language),
    mealImpactScore: row.gut_score ? `${row.gut_score}/10` : extractMealImpactScore(aiText),
    language,
  };
}

async function getLocalPhotoAnalysisHistory(): Promise<PhotoAnalysisHistoryItem[]> {
  const raw = await AsyncStorage.getItem(PHOTO_ANALYSIS_HISTORY_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const normalizedItems = parsed.map((item) => {
      const historyItem = item as Partial<PhotoAnalysisHistoryItem>;
      const aiText = historyItem.aiText ?? '';
      const language: AppLanguage | undefined =
        historyItem.language === 'de' || historyItem.language === 'fa' || historyItem.language === 'en'
          ? historyItem.language
          : undefined;

      return {
        id: historyItem.id ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        imageUri: historyItem.imageUri ?? '',
        createdAt: historyItem.createdAt ?? new Date(0).toISOString(),
        aiText,
        symptoms: historyItem.symptoms ?? [],
        mealName: historyItem.mealName ?? extractMealName(aiText, language),
        mealImpactScore: historyItem.mealImpactScore ?? extractMealImpactScore(aiText),
        language,
      };
    });

    return keepRecentItems(normalizedItems);
  } catch {
    return [];
  }
}

export async function getPhotoAnalysisHistory(userId?: string): Promise<PhotoAnalysisHistoryItem[]> {
  const localHistory = await getLocalPhotoAnalysisHistory();
  const resolvedUserId =
    userId ??
    (await supabase.auth.getSession()).data.session?.user.id ??
    (await supabase.auth.getUser()).data.user?.id;

  if (!resolvedUserId) return localHistory;

  const since = new Date(Date.now() - HISTORY_WINDOW_MS).toISOString();
  const { data, error } = await supabase
    .from('health_logs')
    .select('id, created_at, food_name, gut_score, analysis_content, nutrients, language')
    .eq('user_id', resolvedUserId)
    .gte('created_at', since)
    .order('created_at', { ascending: false });

  if (error) {
    console.warn('Supabase photo history fetch failed:', error.message);
    return localHistory;
  }

  const remoteHistory = keepRecentItems((data ?? []).map(mapHealthLogToHistoryItem));
  if (remoteHistory.length === 0) return localHistory;

  const existingIds = new Set(remoteHistory.map((item) => item.id));
  return keepRecentItems([
    ...remoteHistory,
    ...localHistory.filter((item) => !existingIds.has(item.id)),
  ]);
}

export async function savePhotoAnalysisHistoryItem(payload: {
  imageUri: string;
  aiText: string;
  symptoms?: string[];
  mealImpactScore?: string | null;
  language?: AppLanguage;
  userId?: string;
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
    mealName: extractMealName(aiText, payload.language),
    mealImpactScore: payload.mealImpactScore ?? extractMealImpactScore(aiText),
    language: payload.language,
  };

  await AsyncStorage.setItem(
    PHOTO_ANALYSIS_HISTORY_KEY,
    JSON.stringify([newItem, ...existing]),
  );

  if (!payload.userId) return;

  const { error } = await supabase.from('health_logs').insert({
    user_id: payload.userId,
    food_name: newItem.mealName,
    gut_score: parseScoreNumber(newItem.mealImpactScore),
    analysis_content: aiText,
    nutrients: {
      source: 'photo-analysis',
      imageUri: payload.imageUri,
      symptoms: payload.symptoms ?? [],
    },
    language: payload.language ?? 'en',
  });

  if (error) {
    console.warn('Supabase photo history save failed:', error.message);
  }
}
