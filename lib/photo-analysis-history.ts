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

function parseScoreNumber(score: string | null): number | null {
  if (!score) return null;
  const value = Number(normalizeDigits(score).match(/\d{1,2}/)?.[0]);
  return Number.isFinite(value) ? Math.max(1, Math.min(10, value)) : null;
}

function countMatches(value: string, patterns: RegExp[]): number {
  return patterns.reduce((count, pattern) => count + (pattern.test(value) ? 1 : 0), 0);
}

const FOOD_SIGNALS = {
  highFodmap: [
    /\bonions?\b/, /\bgarlic\b/, /\bwheat\b/, /\bbarley\b/, /\brye\b/, /\bbeans?\b/,
    /\blentils?\b/, /\bchickpeas?\b/, /\bcabbage\b/, /\bcauliflower\b/, /\bmushrooms?\b/,
    /\bapples?\b/, /\bpears?\b/, /\bdried figs?\b/, /\bdates?\b/, /\bhoney\b/,
    /\bhigh[-\s]?fodmap\b/, /\bfodmap\b/, /پیاز/, /سیر/, /گندم/, /جو\b/, /حبوبات/, /عدس/, /نخود/,
    /کلم/, /قارچ/, /سیب/, /گلابی/, /انجیر خشک/, /خرما/, /عسل/, /فودمپ/,
    /zwiebel/, /knoblauch/, /weizen/, /gerste/, /roggen/, /bohnen/, /linsen/, /kichererbsen/,
  ],
  onion: [/\bonions?\b/, /پیاز/, /zwiebel/],
  garlic: [/\bgarlic\b/, /سیر/, /knoblauch/],
  spicy: [
    /\bspicy\b/, /\bchili\b/, /\bchilli\b/, /\bhot sauce\b/, /\bjalape/, /\bpeppery\b/,
    /تند/, /فلفل/, /چیلی/, /scharf/, /chili/,
  ],
  greasy: [
    /\bfried\b/, /\bdeep[-\s]?fried\b/, /\bgreasy\b/, /\bfries?\b/, /\bchips\b/,
    /\bhigh[-\s]?fat\b/, /\bbutter\b/, /\bmayonnaise\b/, /سرخ/, /سوخاری/, /چرب/, /سیب زمینی سرخ/,
    /frittiert/, /fettig/, /pommes/, /butter/, /mayonnaise/,
  ],
  creamyDairy: [
    /\bcream\b/, /\bcreamy\b/, /\bcheese\b/, /\bmilk\b/, /\blactose\b/, /\bice cream\b/,
    /خامه/, /خامه ای/, /پنیر/, /شیر/, /لاکتوز/, /بستنی/,
    /sahne/, /cremig/, /käse/, /kaese/, /milch/, /laktose/, /eiscreme/,
  ],
  acidic: [
    /\btomato sauce\b/, /\btomatoes?\b/, /\bcitrus\b/, /\borange\b/, /\blemon\b/, /\bcoffee\b/,
    /\bchocolate\b/, /\balcohol\b/, /گوجه/, /مرکبات/, /پرتقال/, /لیمو/, /قهوه/, /شکلات/, /الکل/,
    /tomate/, /tomatensauce/, /zitrus/, /orange/, /zitrone/, /kaffee/, /schokolade/, /alkohol/,
  ],
  ultraProcessed: [
    /\bburger\b/, /\bfast food\b/, /\bpizza\b/, /\bnuggets?\b/, /\bsausage\b/, /\bbacon\b/,
    /\bcookies?\b/, /\bcakes?\b/, /\bcandy\b/, /\bsoda\b/, /\bcola\b/, /\bsugary\b/,
    /\bprocessed\b/, /فست فود/, /برگر/, /پیتزا/, /ناگت/, /سوسیس/, /کالباس/, /بیکن/, /کیک/,
    /بیسکویت/, /شیرینی/, /نوشابه/, /قندی/, /فرآوری/, /fastfood/, /burger/, /pizza/, /wurst/,
    /speck/, /kuchen/, /keks/, /süß/, /suess/, /limonade/, /verarbeitet/,
  ],
  refinedLowFiber: [
    /\bwhite bread\b/, /\brefined\b/, /\bpastry\b/, /\bcroissant\b/, /\bdonut\b/, /\bplain pasta\b/,
    /\blow fiber\b/, /نان سفید/, /تصفيه/, /تصفیه/, /شیرینی/, /دونات/, /پاستا ساده/, /کم فیبر/,
    /weißbrot/, /weissbrot/, /raffiniert/, /croissant/, /donut/, /wenig ballast/,
  ],
  constipationFiber: [
    /\boats?\b/, /\boatmeal\b/, /\bchia\b/, /\bflax\b/, /\bkiwi\b/, /\bprunes?\b/, /\bplums?\b/,
    /\bberries\b/, /\bvegetables?\b/, /\blegumes?\b/, /\bbeans?\b/, /\blentils?\b/, /\bwhole grains?\b/,
    /\bfiber[-\s]?rich\b/, /\bhigh fiber\b/, /جو دوسر/, /چیا/, /کتان/, /کیوی/, /آلو/, /آلو خشک/,
    /توت/, /سبزی/, /حبوبات/, /عدس/, /غلات کامل/, /فیبر بالا/, /پر فیبر/,
    /hafer/, /chia/, /leinsamen/, /kiwi/, /pflaume/, /beeren/, /gemüse/, /gemuese/,
    /hülsenfrüchte/, /huelsenfruechte/, /vollkorn/, /ballaststoff/,
  ],
  gentle: [
    /\bwhite rice\b/, /\bboiled potatoes?\b/, /\bpotatoes?\b/, /\bzucchini\b/, /\bcarrots?\b/,
    /\bsoup\b/, /\bginger\b/, /\bpeppermint\b/, /\bbanana\b/, /\bplain yogurt\b/,
    /\bcooked vegetables?\b/, /\blean protein\b/, /\bchicken\b/, /\bfish\b/, /\bsalmon\b/,
    /\beggs?\b/, /\btofu\b/, /\beasy to digest\b/, /\bgentle\b/, /\bgut-friendly\b/,
    /برنج سفید/, /سیب زمینی/, /کدو/, /هویج/, /سوپ/, /زنجبیل/, /نعناع/, /موز/, /ماست ساده/,
    /سبزی پخته/, /پروتئین کم چرب/, /مرغ/, /ماهی/, /سالمون/, /تخم مرغ/, /توفو/, /ملایم/,
    /reis/, /kartoffel/, /zucchini/, /karotte/, /suppe/, /ingwer/, /pfefferminz/, /banane/,
    /naturjoghurt/, /gekochtes gemüse/, /gekochtes gemuese/, /hähnchen/, /haehnchen/, /fisch/,
    /lachs/, /ei\b/, /tofu/, /sanft/, /verträglich/, /vertraeglich/,
  ],
  balancedPlate: [
    /\bsalmon\b/, /\bfish\b/, /\bchicken\b/, /\bturkey\b/, /\btofu\b/, /\beggs?\b/,
    /\bquinoa\b/, /\brice\b/, /\bpotatoes?\b/, /\boats?\b/, /\bvegetables?\b/, /\bgreens?\b/,
    /\bzucchini\b/, /\bcarrots?\b/, /\bolive oil\b/, /سالمون/, /ماهی/, /مرغ/, /بوقلمون/, /توفو/,
    /تخم مرغ/, /کینوا/, /برنج/, /سیب زمینی/, /جو دوسر/, /سبزی/, /کدو/, /هویج/, /روغن زیتون/,
    /lachs/, /fisch/, /hähnchen/, /haehnchen/, /pute/, /tofu/, /ei\b/, /quinoa/, /reis/,
    /kartoffel/, /hafer/, /gemüse/, /gemuese/, /grün/, /gruen/, /zucchini/, /karotte/, /olivenöl/,
  ],
};

const SYMPTOM_SIGNALS = {
  bloating: [/\bbloating\b/, /\bbloated\b/, /\bgas\b/, /\bheaviness\b/, /نفخ/, /گاز/, /سنگینی/, /bläh/, /blaeh/, /gas/, /schweregefühl/],
  constipation: [/\bconstipation\b/, /\bconstipated\b/, /یبوست/, /verstopfung/],
  reflux: [/\breflux\b/, /\bheartburn\b/, /\bacid\b/, /\bGERD\b/i, /ریفلاکس/, /رفلاکس/, /سوزش معده/, /reflux/, /sodbrennen/],
  pain: [/\bpain\b/, /\bcramps?\b/, /\bstomach ache\b/, /\babdominal\b/, /درد/, /گرفتگی/, /دل درد/, /schmerz/, /krampf/],
  ibs: [/\bibs\b/, /\birritable bowel\b/, /سندرم روده تحریک پذیر/, /روده تحریک پذیر/, /reizdarm/],
  celiac: [/\bceliac\b/, /\bcoeliac\b/, /سلیاک/, /zöliakie/, /zoeliakie/],
  lactose: [/\blactose intolerance\b/, /عدم تحمل لاکتوز/, /laktoseintoleranz/],
};

export function estimateMealImpactScore(
  aiText: string,
  symptoms: string[] = [],
  mealNotes = '',
): string {
  const combinedText = normalizeDigits(`${aiText} ${mealNotes} ${symptoms.join(' ')}`).toLocaleLowerCase();
  const symptomText = normalizeDigits(symptoms.join(' ')).toLocaleLowerCase();
  let score = 6.2;

  const hasBloating = hasAnyText(symptomText, SYMPTOM_SIGNALS.bloating);
  const hasConstipation = hasAnyText(symptomText, SYMPTOM_SIGNALS.constipation);
  const hasReflux = hasAnyText(symptomText, SYMPTOM_SIGNALS.reflux);
  const hasPain = hasAnyText(symptomText, SYMPTOM_SIGNALS.pain);
  const hasIbs = hasAnyText(combinedText, SYMPTOM_SIGNALS.ibs);
  const hasCeliac = hasAnyText(combinedText, SYMPTOM_SIGNALS.celiac);
  const hasLactose = hasAnyText(combinedText, SYMPTOM_SIGNALS.lactose);
  const highFodmapCount = countMatches(combinedText, FOOD_SIGNALS.highFodmap);
  const gentleCount = countMatches(combinedText, FOOD_SIGNALS.gentle);
  const balancedCount = countMatches(combinedText, FOOD_SIGNALS.balancedPlate);
  const constipationFiberCount = countMatches(combinedText, FOOD_SIGNALS.constipationFiber);
  const hasOnionOrGarlic = hasAnyText(combinedText, [...FOOD_SIGNALS.onion, ...FOOD_SIGNALS.garlic]);
  const hasSpicy = hasAnyText(combinedText, FOOD_SIGNALS.spicy);
  const hasGreasy = hasAnyText(combinedText, FOOD_SIGNALS.greasy);
  const hasCreamyDairy = hasAnyText(combinedText, FOOD_SIGNALS.creamyDairy);
  const hasAcidic = hasAnyText(combinedText, FOOD_SIGNALS.acidic);
  const hasUltraProcessed = hasAnyText(combinedText, FOOD_SIGNALS.ultraProcessed);
  const hasRefinedLowFiber = hasAnyText(combinedText, FOOD_SIGNALS.refinedLowFiber);

  if (hasBloating) score -= 0.7;
  if (hasReflux) score -= 0.8;
  if (hasConstipation) score -= 0.4;
  if (hasPain) score -= 1.0;

  if (highFodmapCount > 0) score -= Math.min(2.4, 0.85 + highFodmapCount * 0.45);
  if (hasGreasy) score -= 1.4;
  if (hasSpicy) score -= 1.1;
  if (hasCreamyDairy) score -= 1.0;
  if (hasAcidic) score -= 0.8;
  if (hasUltraProcessed) score -= 1.7;
  if (hasRefinedLowFiber) score -= 0.9;

  if (gentleCount > 0) score += Math.min(2.0, 0.85 + gentleCount * 0.25);
  if (balancedCount >= 3) score += 1.5;
  else if (balancedCount >= 2) score += 0.8;
  if (constipationFiberCount > 0) score += Math.min(1.7, 0.6 + constipationFiberCount * 0.25);

  if ((hasBloating || hasIbs) && hasOnionOrGarlic) score -= 2.2;
  if ((hasBloating || hasIbs) && hasSpicy) score -= 1.4;
  if ((hasBloating || hasIbs) && highFodmapCount >= 2) score -= 1.2;
  if (hasReflux && (hasGreasy || hasSpicy || hasCreamyDairy || hasAcidic)) score -= 2.2;
  if (hasConstipation && constipationFiberCount >= 2 && !hasBloating) score += 1.7;
  if (hasConstipation && (hasUltraProcessed || hasRefinedLowFiber || hasGreasy)) score -= 1.8;
  if (hasIbs && highFodmapCount > 0) score -= 1.5;
  if (hasIbs && gentleCount >= 2 && highFodmapCount === 0) score += 1.1;
  if (hasCeliac && hasAnyText(combinedText, [/\bwheat\b/, /\bbarley\b/, /\brye\b/, /گندم/, /جو\b/, /weizen/, /gerste/, /roggen/])) score -= 3.0;
  if (hasLactose && hasCreamyDairy) score -= 2.0;
  if (hasUltraProcessed && (hasGreasy || hasCreamyDairy || hasSpicy)) score -= 0.9;
  if (balancedCount >= 4 && !hasUltraProcessed && highFodmapCount === 0 && !hasGreasy) score += 0.9;

  return `${clampMealImpactScore(score)}/10`;
}

export function resolveMealImpactScore(
  aiText: string,
  symptoms: string[] = [],
  mealNotes = '',
  _language: AppLanguage = 'en',
): string | null {
  const estimatedScore = estimateMealImpactScore(aiText, symptoms, mealNotes);
  const estimatedValue = parseScoreNumber(estimatedScore);
  const extractedScore = extractMealImpactScore(aiText);
  const extractedValue = parseScoreNumber(extractedScore);

  if (!extractedScore || !extractedValue || !estimatedValue) return estimatedScore;
  if (extractedScore === '4/10') return estimatedScore;
  if (extractedValue >= 5 && extractedValue <= 7 && Math.abs(extractedValue - estimatedValue) >= 1) return estimatedScore;
  if (Math.abs(extractedValue - estimatedValue) >= 2) return estimatedScore;
  return extractedScore;
}

export function applyDynamicMealImpactScore(
  aiText: string,
  symptoms: string[] = [],
  mealNotes = '',
  language: AppLanguage = 'en',
): string {
  const dynamicScore = resolveMealImpactScore(aiText, symptoms, mealNotes, language);
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
