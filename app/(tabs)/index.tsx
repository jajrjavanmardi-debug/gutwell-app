import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';

import { GutScoreGauge } from '../../components/gut-score-gauge';
import { BorderRadius, Colors, FontFamily, FontSize, Shadows, Spacing } from '../../constants/theme';
import { useLanguage, type AppLanguage } from '../../contexts/LanguageContext';
import { getNutritionRecommendation, type NutritionRecommendationResult } from '../../lib/RecommendationEngine';
import { getPhotoAnalysisHistory, type PhotoAnalysisHistoryItem } from '../../lib/photo-analysis-history';
import {
  getSupplementHistory,
  saveSupplementHistoryItem,
  type SupplementHistoryItem,
} from '../../lib/supplement-history';
import {
  addXpForAction,
  getNextRankProgress,
  getUserProgressProfile,
  type UserProgressProfile,
} from '../../lib/user-progress';

const EXAMPLE_FEELINGS = [
  'lowEnergy',
  'bloated',
  'stressed',
] as const;
const COMMON_SUPPLEMENTS = ['Probiotic', 'Digestive Enzyme', 'Ginger', 'Vitamin D'] as const;

const NUTRIENT_ICONS = ['leaf', 'water', 'sparkles', 'fitness', 'nutrition'] as const;

type Language = AppLanguage;
type Condition = 'ibs' | 'gastritis' | 'bloating' | 'celiac' | 'lactoseIntolerance';
type ActivityLevel = 'sedentary' | 'moderate' | 'active' | 'athlete';
type ScoreStatus = 'poor' | 'moderate' | 'excellent';

const translations = {
  en: {
    appEyebrow: 'NutriFlow nutrition guide',
    welcome: "How's your gut today?",
    heroSubtitle:
      'Share your energy, digestion, cravings, or symptoms. We will look for supportive nutrients and turn trusted USDA data into a gentle nutrition idea.',
    inputLabel: 'Tell us what is going on',
    score: 'Gut Score: ',
    currentStatus: 'Current Status',
    dose: 'Dose',
    duration: 'Duration',
    progressTip: 'Progress Tip',
    noConditions: 'none shared',
    conditions: 'Underlying Conditions',
    activity: 'Activity Level',
    button: 'Analyze as a Friend',
    photoAnalysisButton: 'Photo meal analysis',
    placeholder: 'Tell me what you ate or how you feel...',
    clear: 'Clear',
    loading: 'Analyzing nutrients and USDA data...',
    preparingHealthBuddy: 'Preparing your health buddy...',
    recommendationReady: 'Recommendation Ready!',
    reanalyzeMessage: 'Please re-analyze to see results in English.',
    emptyAlertTitle: 'How are you feeling?',
    emptyAlertMessage: 'Please describe how you are feeling before generating a nutrition plan.',
    errorTitle: 'Nutrition plan failed',
    genericErrorMessage: 'Something went wrong while generating your nutrition plan.',
    shareTitle: 'My NutriFlow recommendation',
    shareFeeling: 'Feeling',
    shareNutrients: 'Helpful nutrients',
    shareButton: 'Share with friends',
    shareErrorTitle: 'Sharing unavailable',
    shareErrorMessage: 'Unable to open sharing right now.',
    supportiveNutrients: 'Supportive nutrients',
    nutrientBadges: 'Nutrient Badges',
    usdaMatches: 'USDA matches',
    recommendedFoods: 'Recommended Foods',
    noFoods: 'No USDA foods matched yet, but your nutrient guidance is ready.',
    yourPlan: 'Your plan',
    bigRecommendation: 'Big Recommendation',
    photoHistoryTitle: 'Recent History',
    photoHistorySubtitle: 'Food scans from the last 14 days',
    photoHistoryEmpty: 'No meal photo analyses yet.',
    photoHistoryNoScore: 'Score pending',
    historyButton: 'View full history',
    heatmapTitle: 'Meal Scan Streak',
    heatmapSubtitle: 'Last 30 days',
    progressChartTitle: '7-day body rhythm',
    progressChartSubtitle: 'Gut Score + Energy Level',
    gutScoreMetric: 'Gut Score',
    energyMetric: 'Energy',
    xpLabel: 'XP',
    nextRank: 'Next rank',
    rankUp: 'Rank Up',
    goodFeelingCelebration: 'Good feeling logged',
    chartPopupDate: 'Date',
    chartPopupScore: 'Score',
    chartPopupFeeling: 'Feeling',
    medicalDisclaimer:
      'Important note: This analysis is for informational purposes only and does not replace a medical diagnosis. Seek medical care if you notice severe symptoms.',
    rankTitle: 'Gut Warrior Level 1',
    todaysStatus: "Today's Status",
    supplementTaken: 'Supplement Taken',
    noSupplementsLogged: 'No Supplements Logged Yet',
    supplementTitle: "Today's Supplements",
    supplementLogTitle: 'Log Supplement & Probiotic',
    supplementSubtitle: 'Log supplements and probiotics for meal analysis context.',
    supplementNamePlaceholder: 'Supplement name, e.g. Probiotic Kapsel',
    supplementDosagePlaceholder: 'Dosage, e.g. 1 capsule',
    supplementSave: 'Save supplement',
    supplementHistoryTitle: 'Supplements History',
    supplementEmpty: 'No supplements logged in the last 14 days.',
    scoreDecrease: 'Decrease Gut Score',
    scoreIncrease: 'Increase Gut Score',
    languageButtons: {
      en: 'EN',
      de: 'DE',
    },
    welcomeEmptyTitle: 'Tell me how you feel to start your nutrition journey.',
    welcomeEmptyText:
      'NutriFlow will turn your check-in into supportive nutrients, USDA food ideas, and a warm next step.',
    diseases: {
      ibs: 'IBS',
      gastritis: 'Gastritis',
      bloating: 'Bloating',
      celiac: 'Celiac',
      lactoseIntolerance: 'Lactose Intolerance',
    },
    activityLevels: {
      sedentary: 'Sedentary',
      moderate: 'Moderate',
      active: 'Active',
      athlete: 'Athlete',
    },
    examples: {
      lowEnergy: 'Low energy and muscle cramps',
      bloated: 'Bloated after meals',
      stressed: 'Stressed and craving sugar',
    },
    statusLabels: {
      poor: 'Poor',
      moderate: 'Moderate',
      excellent: 'Healthy',
    },
  },
  de: {
    appEyebrow: 'NutriFlow Ernährungsbegleiter',
    welcome: "Wie geht's deinem Bauch?",
    heroSubtitle:
      'Teile deine Energie, Verdauung, Gelüste oder Symptome. Wir finden unterstützende Nährstoffe und passende USDA-Lebensmittelideen.',
    inputLabel: 'Erzähl uns, was los ist',
    score: 'Darm-Score: ',
    currentStatus: 'Aktueller Status',
    dose: 'Dosis',
    duration: 'Dauer',
    progressTip: 'Fortschrittstipp',
    noConditions: 'nicht angegeben',
    conditions: 'Vorerkrankungen',
    activity: 'Aktivität',
    button: 'Freundliche Analyse',
    photoAnalysisButton: 'Foto-Mahlanalyse',
    placeholder: 'Was hast du gegessen oder wie fühlst du dich?...',
    clear: 'Löschen',
    loading: 'Nährstoffe und USDA-Daten werden analysiert...',
    preparingHealthBuddy: 'Dein Gesundheitsbuddy wird vorbereitet...',
    recommendationReady: 'Empfehlung ist bereit!',
    reanalyzeMessage: 'Bitte analysiere erneut, um die Ergebnisse auf Deutsch zu sehen.',
    emptyAlertTitle: 'Wie fühlst du dich?',
    emptyAlertMessage: 'Beschreibe bitte zuerst, wie du dich fühlst.',
    errorTitle: 'Empfehlung fehlgeschlagen',
    genericErrorMessage: 'Beim Erstellen deiner Ernährungsempfehlung ist etwas schiefgelaufen.',
    shareTitle: 'Meine NutriFlow-Empfehlung',
    shareFeeling: 'Gefühl',
    shareNutrients: 'Hilfreiche Nährstoffe',
    shareButton: 'Mit Freunden teilen',
    shareErrorTitle: 'Teilen nicht verfügbar',
    shareErrorMessage: 'Teilen kann gerade nicht geöffnet werden.',
    supportiveNutrients: 'Unterstützende Nährstoffe',
    nutrientBadges: 'Nährstoff-Badges',
    usdaMatches: 'USDA-Treffer',
    recommendedFoods: 'Empfohlene Lebensmittel',
    noFoods: 'Noch keine passenden USDA-Lebensmittel gefunden, aber deine Nährstoffempfehlung ist bereit.',
    yourPlan: 'Dein Plan',
    bigRecommendation: 'Große Empfehlung',
    photoHistoryTitle: 'Aktueller Verlauf',
    photoHistorySubtitle: 'Food-Scans der letzten 14 Tage',
    photoHistoryEmpty: 'Noch keine Mahlzeiten-Fotoanalyse.',
    photoHistoryNoScore: 'Score offen',
    historyButton: 'Vollständigen Verlauf ansehen',
    heatmapTitle: 'Meal-Scan-Serie',
    heatmapSubtitle: 'Letzte 30 Tage',
    progressChartTitle: '7-Tage Körperrhythmus',
    progressChartSubtitle: 'Darm-Score + Energielevel',
    gutScoreMetric: 'Darm-Score',
    energyMetric: 'Energie',
    xpLabel: 'XP',
    nextRank: 'Nächster Rang',
    rankUp: 'Rank Up',
    goodFeelingCelebration: 'Gutes Gefühl geloggt',
    chartPopupDate: 'Datum',
    chartPopupScore: 'Score',
    chartPopupFeeling: 'Gefühl',
    medicalDisclaimer:
      'Wichtiger Hinweis: Diese Analyse dient nur der Information und ersetzt keine ärztliche Diagnose. Suchen Sie bei schweren Symptomen einen Arzt auf.',
    rankTitle: 'Gut Warrior Level 1',
    todaysStatus: 'Heutiger Status',
    supplementTaken: 'Supplement genommen',
    noSupplementsLogged: 'Noch keine Supplements erfasst',
    supplementTitle: 'Heutige Supplements',
    supplementLogTitle: 'Supplement & Probiotikum erfassen',
    supplementSubtitle: 'Erfasse Supplements und Probiotika für genauere Mahlzeitenanalysen.',
    supplementNamePlaceholder: 'Supplement, z. B. Probiotic Kapsel',
    supplementDosagePlaceholder: 'Dosis, z. B. 1 Kapsel',
    supplementSave: 'Supplement speichern',
    supplementHistoryTitle: 'Supplement-Verlauf',
    supplementEmpty: 'Keine Supplements in den letzten 14 Tagen erfasst.',
    scoreDecrease: 'Darm-Score verringern',
    scoreIncrease: 'Darm-Score erhöhen',
    languageButtons: {
      en: 'EN',
      de: 'DE',
    },
    welcomeEmptyTitle: 'Sag mir, wie du dich fühlst, um deine Ernährungsreise zu starten.',
    welcomeEmptyText:
      'NutriFlow macht aus deinem Check-in unterstützende Nährstoffe, USDA-Lebensmittelideen und einen freundlichen nächsten Schritt.',
    diseases: {
      ibs: 'Reizdarmsyndrom',
      gastritis: 'Gastritis',
      bloating: 'Blähungen',
      celiac: 'Zöliakie',
      lactoseIntolerance: 'Laktoseintoleranz',
    },
    activityLevels: {
      sedentary: 'Sitzend',
      moderate: 'Moderat',
      active: 'Aktiv',
      athlete: 'Sportlich',
    },
    examples: {
      lowEnergy: 'Wenig Energie und Muskelkrämpfe',
      bloated: 'Blähungen nach dem Essen',
      stressed: 'Gestresst und Lust auf Süßes',
    },
    statusLabels: {
      poor: 'Schwach',
      moderate: 'Moderat',
      excellent: 'Gesund',
    },
  },
  fa: {
    appEyebrow: 'راهنمای تغذیه NutriFlow',
    welcome: 'امروز روده‌ات چطور است؟',
    heroSubtitle:
      'انرژی، هضم، میل غذایی یا نشانه‌هایت را بنویس. NutriFlow مواد مغذی پشتیبان و ایده‌های غذایی ساده را پیشنهاد می‌کند.',
    inputLabel: 'بگو چه خبر است',
    score: 'امتیاز روده: ',
    currentStatus: 'وضعیت فعلی',
    dose: 'مقدار',
    duration: 'مدت',
    progressTip: 'نکته پیشرفت',
    noConditions: 'چیزی ثبت نشده',
    conditions: 'شرایط زمینه‌ای',
    activity: 'سطح فعالیت',
    button: 'مثل یک دوست تحلیل کن',
    photoAnalysisButton: 'تحلیل عکس غذا',
    placeholder: 'بگو چه خوردی یا چه حسی داری...',
    clear: 'پاک کردن',
    loading: 'در حال تحلیل مواد مغذی و داده‌های USDA...',
    preparingHealthBuddy: 'در حال آماده‌سازی همراه سلامت...',
    recommendationReady: 'پیشنهاد آماده است!',
    reanalyzeMessage: 'برای دیدن نتیجه به فارسی، لطفاً دوباره تحلیل کن.',
    emptyAlertTitle: 'چه حسی داری؟',
    emptyAlertMessage: 'قبل از ساخت برنامه تغذیه، لطفاً حالت را توضیح بده.',
    errorTitle: 'ساخت برنامه تغذیه ناموفق بود',
    genericErrorMessage: 'هنگام ساخت برنامه تغذیه مشکلی پیش آمد.',
    shareTitle: 'پیشنهاد NutriFlow من',
    shareFeeling: 'حس',
    shareNutrients: 'مواد مغذی کمک‌کننده',
    shareButton: 'اشتراک‌گذاری با دوستان',
    shareErrorTitle: 'اشتراک‌گذاری در دسترس نیست',
    shareErrorMessage: 'الان امکان باز کردن اشتراک‌گذاری نیست.',
    supportiveNutrients: 'مواد مغذی پشتیبان',
    nutrientBadges: 'نشان‌های مواد مغذی',
    usdaMatches: 'نتایج USDA',
    recommendedFoods: 'غذاهای پیشنهادی',
    noFoods: 'هنوز غذای مطابقی در USDA پیدا نشد، اما راهنمای مواد مغذی آماده است.',
    yourPlan: 'برنامه تو',
    bigRecommendation: 'پیشنهاد اصلی',
    photoHistoryTitle: 'سابقه اخیر',
    photoHistorySubtitle: 'اسکن‌های غذای ۱۴ روز گذشته',
    photoHistoryEmpty: 'هنوز تحلیل عکس غذا نداری.',
    photoHistoryNoScore: 'امتیاز در انتظار',
    historyButton: 'دیدن همه سابقه',
    heatmapTitle: 'روند اسکن غذا',
    heatmapSubtitle: '۳۰ روز گذشته',
    progressChartTitle: 'ریتم ۷ روزه بدن',
    progressChartSubtitle: 'امتیاز روده + سطح انرژی',
    gutScoreMetric: 'امتیاز روده',
    energyMetric: 'انرژی',
    xpLabel: 'XP',
    nextRank: 'رتبه بعدی',
    rankUp: 'ارتقای رتبه',
    goodFeelingCelebration: 'حس خوب ثبت شد',
    chartPopupDate: 'تاریخ',
    chartPopupScore: 'امتیاز',
    chartPopupFeeling: 'حس',
    medicalDisclaimer:
      'نکته مهم: این تحلیل فقط برای اطلاع‌رسانی است و جایگزین تشخیص پزشکی نیست. اگر نشانه‌های شدید داری، به پزشک مراجعه کن.',
    rankTitle: 'Gut Warrior سطح ۱',
    todaysStatus: 'وضعیت امروز',
    supplementTaken: 'مکمل مصرف شد',
    noSupplementsLogged: 'هنوز مکملی ثبت نشده',
    supplementTitle: 'مکمل‌های امروز',
    supplementLogTitle: 'ثبت مکمل و پروبیوتیک',
    supplementSubtitle: 'مکمل‌ها و پروبیوتیک‌ها را برای زمینه بهتر تحلیل غذا ثبت کن.',
    supplementNamePlaceholder: 'نام مکمل، مثل پروبیوتیک',
    supplementDosagePlaceholder: 'مقدار، مثل ۱ کپسول',
    supplementSave: 'ذخیره مکمل',
    supplementHistoryTitle: 'سابقه مکمل‌ها',
    supplementEmpty: 'در ۱۴ روز گذشته مکملی ثبت نشده است.',
    scoreDecrease: 'کاهش امتیاز روده',
    scoreIncrease: 'افزایش امتیاز روده',
    languageButtons: {
      en: 'EN',
      de: 'DE',
      fa: 'فا',
    },
    welcomeEmptyTitle: 'برای شروع مسیر تغذیه، بگو چه حسی داری.',
    welcomeEmptyText:
      'NutriFlow چک‌این تو را به مواد مغذی پشتیبان، ایده‌های غذایی و یک قدم بعدی مهربان تبدیل می‌کند.',
    diseases: {
      ibs: 'IBS',
      gastritis: 'گاستریت',
      bloating: 'نفخ',
      celiac: 'سلیاک',
      lactoseIntolerance: 'عدم تحمل لاکتوز',
    },
    activityLevels: {
      sedentary: 'کم‌تحرک',
      moderate: 'متوسط',
      active: 'فعال',
      athlete: 'ورزشکار',
    },
    examples: {
      lowEnergy: 'انرژی کم و گرفتگی عضله',
      bloated: 'نفخ بعد از غذا',
      stressed: 'استرس و میل به شیرینی',
    },
    statusLabels: {
      poor: 'ضعیف',
      moderate: 'متوسط',
      excellent: 'سالم',
    },
  },
} as const;

const CONDITION_OPTIONS: Condition[] = ['ibs', 'gastritis', 'bloating', 'celiac', 'lactoseIntolerance'];
const ACTIVITY_LEVELS: ActivityLevel[] = ['sedentary', 'moderate', 'active', 'athlete'];
const AI_LANGUAGE_LABELS: Record<Language, string> = {
  en: 'English',
  de: 'German',
  fa: 'Persian',
};

const NUTRIENT_TRANSLATIONS: Record<Language, Record<string, string>> = {
  en: {
    fiber: 'Fiber',
    probiotic: 'Probiotic',
    probiotics: 'Probiotics',
    prebiotic: 'Prebiotic',
    prebiotics: 'Prebiotics',
    magnesium: 'Magnesium',
    iron: 'Iron',
    zinc: 'Zinc',
    potassium: 'Potassium',
    calcium: 'Calcium',
    protein: 'Protein',
    omega3: 'Omega-3',
    'omega-3': 'Omega-3',
    vitaminb12: 'Vitamin B12',
    'vitamin b12': 'Vitamin B12',
    vitamind: 'Vitamin D',
    'vitamin d': 'Vitamin D',
    vitaminc: 'Vitamin C',
    'vitamin c': 'Vitamin C',
  },
  de: {
    fiber: 'Ballaststoffe',
    probiotic: 'Probiotikum',
    probiotics: 'Probiotika',
    prebiotic: 'Präbiotikum',
    prebiotics: 'Präbiotika',
    magnesium: 'Magnesium',
    iron: 'Eisen',
    zinc: 'Zink',
    potassium: 'Kalium',
    calcium: 'Kalzium',
    protein: 'Protein',
    omega3: 'Omega-3',
    'omega-3': 'Omega-3',
    vitaminb12: 'Vitamin B12',
    'vitamin b12': 'Vitamin B12',
    vitamind: 'Vitamin D',
    'vitamin d': 'Vitamin D',
    vitaminc: 'Vitamin C',
    'vitamin c': 'Vitamin C',
  },
  fa: {
    fiber: 'فیبر',
    probiotic: 'پروبیوتیک',
    probiotics: 'پروبیوتیک‌ها',
    prebiotic: 'پری‌بیوتیک',
    prebiotics: 'پری‌بیوتیک‌ها',
    magnesium: 'منیزیم',
    iron: 'آهن',
    zinc: 'روی',
    potassium: 'پتاسیم',
    calcium: 'کلسیم',
    protein: 'پروتئین',
    omega3: 'امگا ۳',
    'omega-3': 'امگا ۳',
    vitaminb12: 'ویتامین B12',
    'vitamin b12': 'ویتامین B12',
    vitamind: 'ویتامین D',
    'vitamin d': 'ویتامین D',
    vitaminc: 'ویتامین C',
    'vitamin c': 'ویتامین C',
  },
};

function getGutScoreColor(score: number): string {
  if (score <= 3) return '#DC2626';
  if (score <= 6) return '#F97316';
  return '#16A34A';
}

function getGutScoreStatus(score: number): ScoreStatus {
  if (score <= 3) return 'poor';
  if (score <= 6) return 'moderate';
  return 'excellent';
}

function getNutrientTranslationKey(nutrient: string): string {
  return nutrient
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9 -]/g, '');
}

function translateNutrient(nutrient: string, language: Language): string {
  const key = getNutrientTranslationKey(nutrient);
  const compactKey = key.replace(/[\s-]/g, '');

  return NUTRIENT_TRANSLATIONS[language][key]
    ?? NUTRIENT_TRANSLATIONS[language][compactKey]
    ?? nutrient;
}

function parseScoreValue(score: string | null): number | null {
  if (!score) return null;
  const match = score.match(/(\d{1,2})\s*\/\s*10/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? Math.max(1, Math.min(10, value)) : null;
}

type ChartPoint = {
  label: string;
  dateLabel: string;
  gutScore: number;
  energy: number;
  feeling: 'Good' | 'Bad';
};

function buildSevenDayChartData(
  photoHistory: PhotoAnalysisHistoryItem[],
  supplementHistory: SupplementHistoryItem[],
  fallbackGutScore: number,
): ChartPoint[] {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    const dateKey = date.toDateString();
    const dayScans = photoHistory.filter((item) => new Date(item.createdAt).toDateString() === dateKey);
    const daySupplements = supplementHistory.filter((item) => new Date(item.createdAt).toDateString() === dateKey);
    const scanScores = dayScans
      .map((item) => parseScoreValue(item.mealImpactScore))
      .filter((score): score is number => score !== null);
    const averageGutScore = scanScores.length > 0
      ? Math.round(scanScores.reduce((sum, score) => sum + score, 0) / scanScores.length)
      : fallbackGutScore;
    const energy = Math.max(
      1,
      Math.min(10, Math.round(averageGutScore * 0.7 + Math.min(daySupplements.length, 3) * 1.2 + (dayScans.length > 0 ? 0.8 : 0))),
    );

    return {
      label: date.toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 2),
      dateLabel: date.toLocaleDateString(),
      gutScore: averageGutScore,
      energy,
      feeling: averageGutScore >= 6 ? 'Good' : 'Bad',
    };
  });
}

function getLinePath(points: number[], width: number, height: number): string {
  if (points.length === 0) return '';
  const xStep = width / Math.max(points.length - 1, 1);
  return points
    .map((point, index) => {
      const x = index * xStep;
      const y = height - ((point - 1) / 9) * height;
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
}

function SevenDayProgressChart({
  data,
  gutLabel,
  energyLabel,
  onSelectPoint,
}: {
  data: ChartPoint[];
  gutLabel: string;
  energyLabel: string;
  onSelectPoint: (point: ChartPoint) => void;
}) {
  const chartWidth = 300;
  const chartHeight = 118;
  const gutPath = getLinePath(data.map((point) => point.gutScore), chartWidth, chartHeight);
  const energyPath = getLinePath(data.map((point) => point.energy), chartWidth, chartHeight);

  return (
    <View>
      <Svg width="100%" height={178} viewBox={`0 0 ${chartWidth} 178`}>
        {[1, 2, 3].map((line) => (
          <Line
            key={line}
            x1="0"
            x2={chartWidth}
            y1={line * 32}
            y2={line * 32}
            stroke="#1E1E1E"
            strokeWidth="1"
          />
        ))}
        <Path d={gutPath} fill="none" stroke="#2DCE89" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" />
        <Path d={energyPath} fill="none" stroke="#D4A373" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" />
        {data.map((point, index) => {
          const x = index * (chartWidth / Math.max(data.length - 1, 1));
          const gutY = chartHeight - ((point.gutScore - 1) / 9) * chartHeight;
          const energyY = chartHeight - ((point.energy - 1) / 9) * chartHeight;
          return (
            <Fragment key={`${point.label}-${index}`}>
              <Circle
                cx={x}
                cy={gutY}
                r="8"
                fill="#2DCE89"
                opacity="0.18"
                onPress={() => onSelectPoint(point)}
              />
              <Circle cx={x} cy={gutY} r="4.5" fill="#2DCE89" onPress={() => onSelectPoint(point)} />
              <Circle cx={x} cy={energyY} r="4.5" fill="#D4A373" />
              <SvgText x={x} y="162" fill="#777777" fontSize="10" fontWeight="700" textAnchor="middle">
                {point.label}
              </SvgText>
            </Fragment>
          );
        })}
      </Svg>
      <View style={styles.chartLegend}>
        <View style={styles.chartLegendItem}>
          <View style={[styles.chartLegendDot, styles.chartGutDot]} />
          <Text style={styles.chartLegendText}>{gutLabel}</Text>
        </View>
        <View style={styles.chartLegendItem}>
          <View style={[styles.chartLegendDot, styles.chartEnergyDot]} />
          <Text style={styles.chartLegendText}>{energyLabel}</Text>
        </View>
      </View>
    </View>
  );
}

export default function HomeScreen() {
  const { width } = useWindowDimensions();
  const { language } = useLanguage();
  const scrollViewRef = useRef<ScrollView>(null);
  const previousLanguageRef = useRef<Language>('en');
  const celebrationPulse = useRef(new Animated.Value(0)).current;
  const [feeling, setFeeling] = useState('');
  const [gutScore, setGutScore] = useState(4);
  const [conditions, setConditions] = useState<Condition[]>([]);
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>('moderate');
  const [result, setResult] = useState<NutritionRecommendationResult | null>(null);
  const [resultLanguage, setResultLanguage] = useState<Language | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [showReadyMessage, setShowReadyMessage] = useState(false);
  const [languageRefreshMessage, setLanguageRefreshMessage] = useState('');
  const [photoHistory, setPhotoHistory] = useState<PhotoAnalysisHistoryItem[]>([]);
  const [supplementHistory, setSupplementHistory] = useState<SupplementHistoryItem[]>([]);
  const [showSupplementModal, setShowSupplementModal] = useState(false);
  const [supplementName, setSupplementName] = useState('');
  const [supplementDosage, setSupplementDosage] = useState('');
  const [userProgress, setUserProgress] = useState<UserProgressProfile>({
    xp: 0,
    rank: 'Initiate',
    triggers: [],
  });
  const [rankUpBadge, setRankUpBadge] = useState('');
  const [celebrationMessage, setCelebrationMessage] = useState('');
  const [selectedChartPoint, setSelectedChartPoint] = useState<ChartPoint | null>(null);

  const t = translations[language];
  const isRtlLanguage = language === 'fa';
  const trimmedFeeling = useMemo(() => feeling.trim(), [feeling]);
  const hasFeelingInput = trimmedFeeling.length > 0;
  const isWideLayout = width >= 760;
  const gutScoreColor = getGutScoreColor(gutScore);
  const gutScoreStatus = getGutScoreStatus(gutScore);
  const localizedResult = resultLanguage === language ? result : null;
  const localizedConditionSummary = useMemo(
    () =>
      conditions.length > 0
        ? conditions.map((condition) => t.diseases[condition]).join(', ')
        : t.noConditions,
    [conditions, t]
  );
  const localizedActivityLevel = t.activityLevels[activityLevel];
  const todaysSupplements = useMemo(() => {
    const today = new Date().toDateString();
    return supplementHistory.filter((item) => new Date(item.createdAt).toDateString() === today);
  }, [supplementHistory]);
  const todaySupplementSummary = todaysSupplements.length > 0
    ? todaysSupplements.map((item) => `${item.name}${item.dosage ? ` (${item.dosage})` : ''}`).join(', ')
    : t.noSupplementsLogged;
  const rankProgress = useMemo(() => getNextRankProgress(userProgress.xp), [userProgress.xp]);
  const chartData = useMemo(
    () => buildSevenDayChartData(photoHistory, supplementHistory, gutScore),
    [gutScore, photoHistory, supplementHistory]
  );
  const isGoodFeeling = useMemo(
    () => /\bgood\b|\bgreat\b|\bbetter\b|\bhappy\b|\bcalm\b|\bwonderful\b|\bfine\b|\bgut\b|\bbesser\b|\bgern\b/i.test(trimmedFeeling),
    [trimmedFeeling]
  );
  const heatmapDays = useMemo(() => {
    const scanDates = new Set(
      photoHistory.map((item) => new Date(item.createdAt).toDateString())
    );

    return Array.from({ length: 30 }, (_, index) => {
      const date = new Date();
      date.setDate(date.getDate() - (29 - index));
      return {
        key: date.toISOString(),
        active: scanDates.has(date.toDateString()),
      };
    });
  }, [photoHistory]);
  useFocusEffect(
    useCallback(() => {
      let isActive = true;

      Promise.all([getPhotoAnalysisHistory(), getSupplementHistory(), getUserProgressProfile()])
        .then(([history, supplements, progress]) => {
          if (!isActive) return;
          setPhotoHistory(history);
          setSupplementHistory(supplements);
          setUserProgress(progress);
        })
        .catch(console.warn);

      return () => {
        isActive = false;
      };
    }, [])
  );

  const localizedNutrients = useMemo(
    () => localizedResult?.nutrients.map((nutrient) => translateNutrient(nutrient, language)) ?? [],
    [language, localizedResult]
  );
  const shareMessage = useMemo(() => {
    if (!localizedResult) return '';

    return [
      'NutriFlow Snapshot',
      t.shareTitle,
      `${t.shareFeeling}: ${localizedResult.feeling}`,
      `${t.conditions}: ${localizedConditionSummary}`,
      `${t.shareNutrients}: ${localizedNutrients.join(', ')}`,
      '',
      localizedResult.recommendation,
    ].join('\n');
  }, [localizedConditionSummary, localizedNutrients, localizedResult, t]);

  useEffect(() => {
    const previousLanguage = previousLanguageRef.current;
    previousLanguageRef.current = language;

    if (previousLanguage === language) return;

    setErrorMessage('');
    setShowReadyMessage(false);

    if (result || resultLanguage) {
      setResult(null);
      setResultLanguage(null);
      setLanguageRefreshMessage(t.reanalyzeMessage);
    }
  }, [language, result, resultLanguage, t.reanalyzeMessage]);

  useEffect(() => {
    if (!celebrationMessage) return;

    celebrationPulse.setValue(0);
    Animated.sequence([
      Animated.timing(celebrationPulse, {
        toValue: 1,
        duration: 420,
        useNativeDriver: true,
      }),
      Animated.timing(celebrationPulse, {
        toValue: 0,
        duration: 520,
        useNativeDriver: true,
      }),
    ]).start();
  }, [celebrationMessage, celebrationPulse]);

  const handleClearAnalysis = () => {
    setFeeling('');
    setResult(null);
    setResultLanguage(null);
    setErrorMessage('');
    setShowReadyMessage(false);
    setLanguageRefreshMessage('');
  };

  const handleGeneratePlan = async () => {
    console.log('Generate Nutrition Plan pressed', {
      hasFeelingInput,
      isLoading,
    });

    if (isLoading) return;

    if (!trimmedFeeling) {
      const message = t.emptyAlertMessage;
      console.log('Nutrition plan generation skipped:', message);
      Alert.alert(t.emptyAlertTitle, message);
      return;
    }

    setIsLoading(true);
    console.log('Nutrition plan loading state set to true');
    setErrorMessage('');
    setShowReadyMessage(false);
    setLanguageRefreshMessage('');

    try {
      const analysisInput = [
        `${t.shareFeeling}: ${trimmedFeeling}`,
        `${t.score}${gutScore}/10`,
        `${t.conditions}: ${localizedConditionSummary}`,
        `${t.activity}: ${localizedActivityLevel}`,
        `Preferred response language: ${AI_LANGUAGE_LABELS[language]}`,
        'Use English, German, or Persian only, matching the preferred response language.',
        'For IBS/bloating, do not suggest brown rice, barley bread, barley, or high-fiber whole grains. Prefer white rice, boiled potatoes, zucchini, carrots, peppermint tea, ginger tea, or low-FODMAP soup.',
      ].join('\n');
      const recommendation = await getNutritionRecommendation(analysisInput);
      const xpResult = await addXpForAction(10);
      setResult(recommendation);
      setResultLanguage(language);
      setUserProgress(xpResult.profile);
      setShowReadyMessage(true);
      if (xpResult.leveledUp) {
        setRankUpBadge(`${t.rankUp}: ${xpResult.profile.rank}`);
        setTimeout(() => setRankUpBadge(''), 3200);
      }
      if (isGoodFeeling) {
        setCelebrationMessage(t.goodFeelingCelebration);
        setTimeout(() => setCelebrationMessage(''), 2800);
      }
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
      console.log('Nutrition plan generated successfully', {
        nutrients: recommendation.nutrients,
        foods: recommendation.foods.map((food) => food.description),
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : t.genericErrorMessage;
      console.error('Nutrition plan generation failed:', error);
      Alert.alert(t.errorTitle, message);
      setErrorMessage(message);
    } finally {
      setIsLoading(false);
      console.log('Nutrition plan loading state set to false');
    }
  };

  const toggleCondition = (condition: Condition) => {
    setConditions((currentConditions) =>
      currentConditions.includes(condition)
        ? currentConditions.filter((item) => item !== condition)
        : [...currentConditions, condition]
    );
  };

  const handleSaveSupplement = async () => {
    const name = supplementName.trim();
    const dosage = supplementDosage.trim();

    if (!name || !dosage) {
      Alert.alert(t.supplementTitle, t.supplementNamePlaceholder);
      return;
    }

    try {
      const nextHistory = await saveSupplementHistoryItem({ name, dosage });
      const xpResult = await addXpForAction(10);
      setSupplementHistory(nextHistory);
      setUserProgress(xpResult.profile);
      if (xpResult.leveledUp) {
        setRankUpBadge(`${t.rankUp}: ${xpResult.profile.rank}`);
        setTimeout(() => setRankUpBadge(''), 3200);
      }
      setSupplementName('');
      setSupplementDosage('');
      setShowSupplementModal(false);
    } catch (error) {
      console.error('Supplement save failed:', error);
      Alert.alert(t.errorTitle, t.genericErrorMessage);
    }
  };

  const openSupplementModal = () => {
    setSupplementName('');
    setSupplementDosage('');
    setShowSupplementModal(true);
  };

  const handleShareRecommendation = async () => {
    if (!shareMessage) return;

    try {
      await Share.share({
        title: t.shareTitle,
        message: shareMessage,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : t.shareErrorMessage;
      console.error('Recommendation share failed:', error);
      Alert.alert(t.shareErrorTitle, message);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        <ScrollView
          ref={scrollViewRef}
          contentContainerStyle={[styles.content, isWideLayout && styles.contentWide]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <LinearGradient
            colors={['#051A12', '#000000']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.dashboardScoreCard}
          >
            <View style={[styles.eyebrow, isRtlLanguage && styles.rtlRow]}>
              <Ionicons name="leaf" size={14} color={Colors.accent} />
              <Text style={[styles.eyebrowText, isRtlLanguage && styles.rtlText]}>{t.appEyebrow}</Text>
            </View>
            <Text style={[styles.rankTitle, isRtlLanguage && styles.rtlText]}>
              Gut {userProgress.rank}
            </Text>
            <View style={styles.xpPill}>
              <Text style={styles.xpPillText}>
                {userProgress.xp} {t.xpLabel}
                {rankProgress.next ? ` · ${t.nextRank}: ${rankProgress.next}` : ''}
              </Text>
            </View>
            <View style={styles.xpTrack}>
              <View style={[styles.xpFill, { width: `${rankProgress.percent}%` }]} />
            </View>
            {rankUpBadge ? (
              <View style={[styles.rankUpBadge, isRtlLanguage && styles.rtlRow]}>
                <Ionicons name="trophy" size={15} color="#000000" />
                <Text style={styles.rankUpBadgeText}>{rankUpBadge}</Text>
              </View>
            ) : null}
            {celebrationMessage ? (
              <Animated.View
                style={[
                  styles.celebrationBadge,
                  {
                    opacity: celebrationPulse.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.82, 1],
                    }),
                    transform: [{
                      scale: celebrationPulse.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.96, 1.04],
                      }),
                    }],
                  },
                  isRtlLanguage && styles.rtlRow,
                ]}
              >
                <Ionicons name="sparkles" size={15} color="#000000" />
                <Text style={styles.celebrationBadgeText}>{celebrationMessage}</Text>
              </Animated.View>
            ) : null}

            <GutScoreGauge
              score={gutScore}
              scoreLabel={t.score}
              statusLabel={t.statusLabels[gutScoreStatus]}
              color={gutScoreColor}
              isRtl={isRtlLanguage}
              size={Math.min(270, Math.max(210, width - 96))}
            />

            <View style={styles.scoreButtons}>
              <Pressable
                onPress={() => setGutScore((score) => Math.max(1, score - 1))}
                accessibilityLabel={t.scoreDecrease}
                style={styles.scoreButton}
              >
                <Text style={styles.scoreButtonText}>-</Text>
              </Pressable>
              <Pressable
                onPress={() => setGutScore((score) => Math.min(10, score + 1))}
                accessibilityLabel={t.scoreIncrease}
                style={styles.scoreButton}
              >
                <Text style={styles.scoreButtonText}>+</Text>
              </Pressable>
            </View>

            <View style={[styles.todayStatusBar, isRtlLanguage && styles.rtlRow]}>
              <View style={styles.todayStatusCopy}>
                <Text style={[styles.todayStatusLabel, isRtlLanguage && styles.rtlText]}>
                  {t.todaysStatus}
                </Text>
                <Text style={[styles.todayStatusText, isRtlLanguage && styles.rtlText]}>
                  {todaysSupplements.length > 0
                    ? `${t.supplementTaken}: ${todaySupplementSummary}`
                    : t.noSupplementsLogged}
                </Text>
              </View>
              <Pressable
                onPress={openSupplementModal}
                style={({ pressed }) => [styles.todayStatusAddButton, pressed && styles.pressed]}
              >
                <Ionicons name="add" size={24} color={Colors.textInverse} />
              </Pressable>
            </View>

            <Pressable
              disabled={isLoading}
              onPress={() => router.push('/photo-analysis')}
              hitSlop={8}
              style={({ pressed }) => [
                styles.actionCardPressable,
                isLoading && styles.photoAnalysisButtonDisabled,
                pressed && !isLoading && styles.pressed,
              ]}
            >
              <LinearGradient
                colors={['#0B5A3E', '#03120D']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.primaryPhotoButton, isRtlLanguage && styles.rtlRow]}
              >
                <View style={styles.primaryPhotoIcon}>
                  <Ionicons name="camera" size={26} color={Colors.textInverse} />
                </View>
                <Text style={[styles.primaryPhotoText, isRtlLanguage && styles.rtlText]}>
                  {t.photoAnalysisButton}
                </Text>
              </LinearGradient>
            </Pressable>

            <Pressable
              onPress={openSupplementModal}
              hitSlop={8}
              style={({ pressed }) => [
                styles.actionCardPressable,
                pressed && styles.pressed,
              ]}
            >
              <LinearGradient
                colors={['#12211B', '#000000']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.primaryPhotoButton, isRtlLanguage && styles.rtlRow]}
              >
                <View style={styles.primaryPhotoIcon}>
                  <Ionicons name="medkit" size={25} color={Colors.textInverse} />
                </View>
                <Text style={[styles.primaryPhotoText, isRtlLanguage && styles.rtlText]}>
                  {t.supplementLogTitle}
                </Text>
              </LinearGradient>
            </Pressable>
          </LinearGradient>

          <View style={styles.chartCard}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionKicker, isRtlLanguage && styles.rtlText]}>
                {t.progressChartSubtitle}
              </Text>
              <Text style={[styles.sectionTitle, isRtlLanguage && styles.rtlText]}>
                {t.progressChartTitle}
              </Text>
            </View>
            <SevenDayProgressChart
              data={chartData}
              gutLabel={t.gutScoreMetric}
              energyLabel={t.energyMetric}
              onSelectPoint={setSelectedChartPoint}
            />
            {selectedChartPoint ? (
              <View style={styles.chartPopup}>
                <View style={styles.chartPopupHeader}>
                  <Ionicons name="pulse" size={16} color="#2DCE89" />
                  <Text style={styles.chartPopupTitle}>{selectedChartPoint.label}</Text>
                  <Pressable onPress={() => setSelectedChartPoint(null)} hitSlop={8}>
                    <Ionicons name="close" size={16} color="#A7A7A7" />
                  </Pressable>
                </View>
                <Text style={styles.chartPopupText}>
                  {t.chartPopupDate}: {selectedChartPoint.dateLabel}
                </Text>
                <Text style={styles.chartPopupText}>
                  {t.chartPopupScore}: {selectedChartPoint.gutScore}/10
                </Text>
                <Text style={styles.chartPopupText}>
                  {t.chartPopupFeeling}: {selectedChartPoint.feeling}
                </Text>
              </View>
            ) : null}
          </View>

          <View style={styles.photoHistoryCard}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionKicker, isRtlLanguage && styles.rtlText]}>
                {t.photoHistorySubtitle}
              </Text>
              <Text style={[styles.sectionTitle, isRtlLanguage && styles.rtlText]}>
                {t.photoHistoryTitle}
              </Text>
            </View>

            {photoHistory.length > 0 ? (
              <View style={styles.photoHistoryList}>
                {photoHistory.slice(0, 3).map((item) => (
                  <Pressable
                    key={item.id}
                    onPress={() => router.push({
                      pathname: '/photo-analysis',
                      params: { historyId: item.id },
                    })}
                    style={({ pressed }) => [
                      styles.photoHistoryItem,
                      isRtlLanguage && styles.rtlRow,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Image source={{ uri: item.imageUri }} style={styles.photoHistoryImage} />
                    <View style={styles.photoHistoryCopy}>
                      <Text style={[styles.photoHistoryDate, isRtlLanguage && styles.rtlText]}>
                        {new Date(item.createdAt).toLocaleDateString()}
                      </Text>
                      <Text numberOfLines={1} style={[styles.photoHistoryMeal, isRtlLanguage && styles.rtlText]}>
                        {item.mealName}
                      </Text>
                      <View style={[styles.photoHistoryScoreBadge, isRtlLanguage && styles.rtlRow]}>
                        <Ionicons name="speedometer" size={13} color="#2DCE89" />
                        <Text style={styles.photoHistoryText}>
                          {item.mealImpactScore ?? t.photoHistoryNoScore}
                        </Text>
                      </View>
                    </View>
                    <Ionicons
                      name={isRtlLanguage ? 'chevron-back' : 'chevron-forward'}
                      size={18}
                      color="#777777"
                    />
                  </Pressable>
                ))}
              </View>
            ) : (
              <Text style={[styles.emptyText, isRtlLanguage && styles.rtlText]}>
                {t.photoHistoryEmpty}
              </Text>
            )}
            <Pressable
              onPress={() => router.push('/food-history')}
              style={({ pressed }) => [styles.historyButton, pressed && styles.pressed]}
            >
              <Ionicons name="list" size={17} color="#000000" />
              <Text style={styles.historyButtonText}>{t.historyButton}</Text>
            </Pressable>
          </View>

          <View style={styles.heatmapCard}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionKicker, isRtlLanguage && styles.rtlText]}>{t.heatmapSubtitle}</Text>
              <Text style={[styles.sectionTitle, isRtlLanguage && styles.rtlText]}>{t.heatmapTitle}</Text>
            </View>
            <View style={[styles.heatmapGrid, isRtlLanguage && styles.rtlRow]}>
              {heatmapDays.map((day) => (
                <View
                  key={day.key}
                  style={[
                    styles.heatmapCell,
                    day.active && styles.heatmapCellActive,
                  ]}
                />
              ))}
            </View>
          </View>

          <View style={[styles.hero, isWideLayout && styles.heroWide]}>
            <View style={styles.heroCopy}>
              <Text style={[styles.heroTitle, isRtlLanguage && styles.rtlText]}>{t.welcome}</Text>
              <Text style={[styles.heroSubtitle, isRtlLanguage && styles.rtlText]}>{t.heroSubtitle}</Text>

              <View style={[styles.promptChips, isRtlLanguage && styles.rtlRow]}>
                {EXAMPLE_FEELINGS.map((example) => (
                  <Pressable
                    key={example}
                    onPress={() => setFeeling(t.examples[example])}
                    style={({ pressed }) => [styles.promptChip, pressed && styles.pressed]}
                  >
                    <Text style={[styles.promptChipText, isRtlLanguage && styles.rtlText]}>{t.examples[example]}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.inputCard}>
              <View style={[styles.inputHeader, isRtlLanguage && styles.rtlRow]}>
                <Text style={[styles.inputLabel, isRtlLanguage && styles.rtlText]}>{t.inputLabel}</Text>
                <Pressable
                  disabled={isLoading || (!feeling && !result && !errorMessage)}
                  onPress={handleClearAnalysis}
                  hitSlop={8}
                  style={({ pressed }) => [
                    styles.clearButton,
                    (isLoading || (!feeling && !result && !errorMessage)) && styles.clearButtonDisabled,
                    pressed && !isLoading && styles.pressed,
                  ]}
                >
                  <Ionicons name="refresh" size={14} color="#2DCE89" />
                  <Text style={styles.clearButtonText}>{t.clear}</Text>
                </Pressable>
              </View>
              <TextInput
                value={feeling}
                onChangeText={setFeeling}
                placeholder={t.placeholder}
                placeholderTextColor="#777777"
                multiline
                textAlignVertical="top"
                style={[styles.textArea, isRtlLanguage && styles.rtlText]}
              />

              <View style={styles.profileControls}>
                <Text style={[styles.controlLabel, isRtlLanguage && styles.rtlText]}>{t.conditions}</Text>
                <View style={[styles.optionWrap, isRtlLanguage && styles.rtlRow]}>
                  {CONDITION_OPTIONS.map((condition) => (
                    <Pressable
                      key={condition}
                      onPress={() => toggleCondition(condition)}
                      style={[
                        styles.optionChip,
                        conditions.includes(condition) && styles.optionChipActive,
                      ]}
                    >
                      <Text style={[
                        styles.optionChipText,
                        conditions.includes(condition) && styles.optionChipTextActive,
                        isRtlLanguage && styles.rtlText,
                      ]}>
                        {t.diseases[condition]}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <Text style={[styles.controlLabel, isRtlLanguage && styles.rtlText]}>{t.activity}</Text>
                <View style={[styles.optionWrap, isRtlLanguage && styles.rtlRow]}>
                  {ACTIVITY_LEVELS.map((level) => (
                    <Pressable
                      key={level}
                      onPress={() => setActivityLevel(level)}
                      style={[
                        styles.optionChip,
                        activityLevel === level && styles.optionChipActive,
                      ]}
                    >
                      <Text style={[
                        styles.optionChipText,
                        activityLevel === level && styles.optionChipTextActive,
                        isRtlLanguage && styles.rtlText,
                      ]}>
                        {t.activityLevels[level]}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <Pressable
                disabled={isLoading}
                onPress={handleGeneratePlan}
                hitSlop={8}
                style={({ pressed }) => [
                  styles.generateButton,
                  !hasFeelingInput && !isLoading && styles.generateButtonNeedsInput,
                  isLoading && styles.generateButtonDisabled,
                  pressed && !isLoading && styles.pressed,
                ]}
              >
                {isLoading ? (
                  <>
                    <ActivityIndicator color={Colors.textInverse} size="small" />
                    <Text style={styles.generateButtonText}>
                      {t.loading}
                    </Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="nutrition" size={19} color={Colors.textInverse} />
                    <Text style={styles.generateButtonText}>{t.button}</Text>
                  </>
                )}
              </Pressable>

              <Modal
                transparent
                visible={showSupplementModal}
                animationType="fade"
                onRequestClose={() => setShowSupplementModal(false)}
              >
                <View style={styles.modalBackdrop}>
                  <View style={styles.supplementModal}>
                    <View style={[styles.modalHeader, isRtlLanguage && styles.rtlRow]}>
                      <Text style={[styles.modalTitle, isRtlLanguage && styles.rtlText]}>
                        {t.supplementLogTitle}
                      </Text>
                      <Pressable onPress={() => setShowSupplementModal(false)} hitSlop={10}>
                        <Ionicons name="close" size={22} color="#A7A7A7" />
                      </Pressable>
                    </View>

                    <View style={[styles.commonSupplementWrap, isRtlLanguage && styles.rtlRow]}>
                      {COMMON_SUPPLEMENTS.map((item) => (
                        <Pressable
                          key={item}
                          onPress={() => setSupplementName(item)}
                          style={[
                            styles.commonSupplementChip,
                            supplementName === item && styles.commonSupplementChipActive,
                          ]}
                        >
                          <Text
                            style={[
                              styles.commonSupplementText,
                              supplementName === item && styles.commonSupplementTextActive,
                            ]}
                          >
                            {item}
                          </Text>
                        </Pressable>
                      ))}
                    </View>

                    <View style={styles.supplementForm}>
                      <TextInput
                        value={supplementName}
                        onChangeText={setSupplementName}
                        placeholder={t.supplementNamePlaceholder}
                        placeholderTextColor="#777777"
                        style={[styles.supplementInput, isRtlLanguage && styles.rtlText]}
                      />
                      <TextInput
                        value={supplementDosage}
                        onChangeText={setSupplementDosage}
                        placeholder={t.supplementDosagePlaceholder}
                        placeholderTextColor="#777777"
                        style={[styles.supplementInput, isRtlLanguage && styles.rtlText]}
                      />
                      <Pressable
                        onPress={handleSaveSupplement}
                        style={({ pressed }) => [
                          styles.supplementSaveButton,
                          pressed && styles.pressed,
                        ]}
                      >
                        <Ionicons name="add-circle" size={18} color={Colors.textInverse} />
                        <Text style={styles.supplementSaveText}>{t.supplementSave}</Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              </Modal>

              {errorMessage ? (
                <View style={styles.errorCard}>
                  <Ionicons name="alert-circle-outline" size={18} color={Colors.error} />
                  <Text style={[styles.errorText, isRtlLanguage && styles.rtlText]}>{errorMessage}</Text>
                </View>
              ) : null}

              {languageRefreshMessage ? (
                <View style={[styles.infoCard, isRtlLanguage && styles.rtlRow]}>
                    <Ionicons name="language" size={18} color="#2DCE89" />
                  <Text style={[styles.infoText, isRtlLanguage && styles.rtlText]}>
                    {languageRefreshMessage}
                  </Text>
                </View>
              ) : null}

              {showReadyMessage ? (
                <View style={[styles.readyToast, isRtlLanguage && styles.rtlRow]}>
                  <Ionicons name="checkmark-circle" size={18} color={Colors.success} />
                  <Text style={[styles.readyToastText, isRtlLanguage && styles.rtlText]}>
                    {t.recommendationReady}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>

          {localizedResult ? (
            <>
              <View style={[styles.resultContextCard, isRtlLanguage && styles.rtlRow]}>
                <View style={styles.resultContextItem}>
                  <Text style={[styles.resultContextLabel, isRtlLanguage && styles.rtlText]}>
                    {t.shareFeeling}
                  </Text>
                  <Text style={[styles.resultContextValue, isRtlLanguage && styles.rtlText]}>
                    {localizedResult.feeling}
                  </Text>
                </View>
                <View style={styles.resultContextItem}>
                  <Text style={[styles.resultContextLabel, isRtlLanguage && styles.rtlText]}>
                    {t.conditions}
                  </Text>
                  <Text style={[styles.resultContextValue, isRtlLanguage && styles.rtlText]}>
                    {localizedConditionSummary}
                  </Text>
                </View>
              </View>

              <View style={[styles.resultsGrid, isWideLayout && styles.resultsGridWide]}>
              <View style={[styles.resultsPanel, isWideLayout && styles.nutrientsPanelWide]}>
                <View style={styles.sectionHeader}>
                  <Text style={[styles.sectionKicker, isRtlLanguage && styles.rtlText]}>{t.supportiveNutrients}</Text>
                  <Text style={[styles.sectionTitle, isRtlLanguage && styles.rtlText]}>{t.nutrientBadges}</Text>
                </View>

                <View style={[styles.nutrientBadgeWrap, isRtlLanguage && styles.rtlRow]}>
                  {localizedNutrients.map((nutrient, index) => (
                    <View key={`${nutrient}-${index}`} style={styles.nutrientBadge}>
                      <Ionicons
                        name={NUTRIENT_ICONS[index % NUTRIENT_ICONS.length]}
                        size={16}
                        color="#2DCE89"
                      />
                      <Text style={[styles.nutrientBadgeText, isRtlLanguage && styles.rtlText]}>
                        {nutrient}
                      </Text>
                    </View>
                  ))}
                </View>

                <View style={styles.foodsSection}>
                  <View style={styles.sectionHeader}>
                    <Text style={[styles.sectionKicker, isRtlLanguage && styles.rtlText]}>{t.usdaMatches}</Text>
                    <Text style={[styles.sectionTitle, isRtlLanguage && styles.rtlText]}>{t.recommendedFoods}</Text>
                  </View>

                  {localizedResult.foods.length > 0 ? (
                    <View style={styles.foodList}>
                      {localizedResult.foods.slice(0, 5).map((food) => (
                        <View key={food.description} style={[styles.foodItem, isRtlLanguage && styles.rtlRow]}>
                          <View style={styles.foodIcon}>
                            <Ionicons name="restaurant" size={15} color="#2DCE89" />
                          </View>
                          <Text style={[styles.foodItemText, isRtlLanguage && styles.rtlText]}>{food.description}</Text>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <Text style={[styles.foodEmptyText, isRtlLanguage && styles.rtlText]}>
                      {t.noFoods}
                    </Text>
                  )}
                </View>
              </View>

              <View style={[styles.resultsPanel, styles.recommendationPanel]}>
                <View style={styles.sectionHeader}>
                  <Text style={[styles.sectionKicker, isRtlLanguage && styles.rtlText]}>{t.yourPlan}</Text>
                  <Text style={[styles.sectionTitle, isRtlLanguage && styles.rtlText]}>{t.bigRecommendation}</Text>
                </View>

                <View style={styles.recommendationCard}>
                  <View style={styles.recommendationIcon}>
                    <Ionicons name="chatbubble-ellipses" size={22} color={Colors.textInverse} />
                  </View>
                  <Text style={[styles.recommendationText, isRtlLanguage && styles.rtlText]}>{localizedResult.recommendation}</Text>
                  <View style={styles.medicalDisclaimerBox}>
                    <Text style={[styles.medicalDisclaimerText, isRtlLanguage && styles.rtlText]}>
                      {t.medicalDisclaimer}
                    </Text>
                  </View>

                  <Pressable
                    onPress={handleShareRecommendation}
                    style={({ pressed }) => [styles.shareButton, pressed && styles.pressed]}
                  >
                    <Ionicons name="paper-plane" size={18} color="#000000" />
                    <Text style={styles.shareButtonText}>{t.shareButton}</Text>
                  </Pressable>
                </View>
              </View>
              </View>
            </>
          ) : (
            <View style={styles.welcomeState}>
              <View style={styles.welcomeIcon}>
                <Ionicons name="leaf" size={26} color="#2DCE89" />
              </View>
              <Text style={[styles.welcomeTitle, isRtlLanguage && styles.rtlText]}>{t.welcomeEmptyTitle}</Text>
              <Text style={[styles.welcomeText, isRtlLanguage && styles.rtlText]}>{t.welcomeEmptyText}</Text>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#000000' },
  keyboardView: { flex: 1 },
  content: { flexGrow: 1, padding: Spacing.lg, paddingBottom: Spacing.xxl + 28 },
  contentWide: { alignSelf: 'center', maxWidth: 1120, paddingHorizontal: Spacing.xl, width: '100%' },
  rtlRow: {
    flexDirection: 'row-reverse',
  },
  rtlText: {
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  hero: { gap: Spacing.lg },
  heroWide: { alignItems: 'stretch', flexDirection: 'row' },
  heroCopy: { flex: 1, justifyContent: 'center' },
  dashboardScoreCard: {
    alignItems: 'center',
    borderColor: '#123C2A',
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    marginBottom: Spacing.lg,
    padding: Spacing.lg,
    ...Shadows.md,
  },
  eyebrow: {
    alignSelf: 'flex-start', alignItems: 'center', backgroundColor: 'rgba(45,206,137,0.12)',
    borderColor: 'rgba(45,206,137,0.35)', borderRadius: BorderRadius.full, borderWidth: 1,
    flexDirection: 'row', gap: 6, marginBottom: Spacing.md, paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  eyebrowText: { color: '#B7F7D6', fontFamily: FontFamily.sansSemiBold, fontSize: FontSize.xs },
  rankTitle: {
    color: '#FFFFFF',
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xl,
    letterSpacing: -0.2,
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  xpPill: {
    backgroundColor: 'rgba(45,206,137,0.14)',
    borderColor: 'rgba(45,206,137,0.28)',
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
  },
  xpPillText: {
    color: '#B7F7D6',
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xs,
  },
  xpTrack: {
    alignSelf: 'stretch',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: BorderRadius.full,
    height: 8,
    marginBottom: Spacing.md,
    overflow: 'hidden',
  },
  xpFill: {
    backgroundColor: '#2DCE89',
    borderRadius: BorderRadius.full,
    height: '100%',
  },
  rankUpBadge: {
    alignItems: 'center',
    backgroundColor: '#2DCE89',
    borderRadius: BorderRadius.full,
    flexDirection: 'row',
    gap: 6,
    marginBottom: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 7,
  },
  rankUpBadgeText: {
    color: '#000000',
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xs,
  },
  celebrationBadge: {
    alignItems: 'center',
    backgroundColor: '#D4A373',
    borderRadius: BorderRadius.full,
    flexDirection: 'row',
    gap: 6,
    marginBottom: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 7,
  },
  celebrationBadgeText: {
    color: '#000000',
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xs,
  },
  heroTitle: {
    color: '#FFFFFF', fontFamily: FontFamily.displayBold, fontSize: 44,
    letterSpacing: -0.8, lineHeight: 48,
  },
  heroSubtitle: {
    color: '#A7A7A7', fontFamily: FontFamily.sansRegular, fontSize: FontSize.md,
    lineHeight: 24, marginTop: Spacing.md, maxWidth: 560,
  },
  promptChips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.lg },
  promptChip: {
    backgroundColor: '#101010', borderColor: '#242424', borderRadius: BorderRadius.full,
    borderWidth: 1, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, ...Shadows.sm,
  },
  promptChipText: { color: '#D8D8D8', fontFamily: FontFamily.sansMedium, fontSize: FontSize.sm },
  languageRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  languageButton: {
    backgroundColor: '#101010',
    borderColor: '#242424',
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  languageButtonActive: {
    backgroundColor: '#2DCE89',
    borderColor: '#2DCE89',
  },
  languageButtonText: {
    color: '#C9C9C9',
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xs,
  },
  languageButtonTextActive: {
    color: '#000000',
  },
  inputCard: {
    backgroundColor: '#0B0B0B', borderColor: '#242424', borderRadius: BorderRadius.xl,
    borderWidth: 1, flex: 1, minWidth: 0, padding: Spacing.lg, ...Shadows.md,
  },
  inputHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  inputLabel: { color: '#F5F5F5', fontFamily: FontFamily.sansSemiBold, fontSize: FontSize.sm },
  clearButton: {
    alignItems: 'center',
    backgroundColor: '#151515',
    borderColor: '#2A2A2A',
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
  },
  clearButtonDisabled: { opacity: 0.45 },
  clearButtonText: {
    color: '#2DCE89',
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.xs,
  },
  textArea: {
    backgroundColor: '#111111', borderColor: '#242424', borderRadius: BorderRadius.lg,
    borderWidth: 1, color: '#FFFFFF', fontFamily: FontFamily.sansRegular, fontSize: FontSize.md,
    lineHeight: 24, minHeight: 144, padding: Spacing.md,
  },
  profileControls: {
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  scoreGaugeBlock: {
    alignItems: 'center',
    backgroundColor: '#F7FCFA',
    borderColor: '#D7F3E5',
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    gap: Spacing.sm,
    padding: Spacing.md,
  },
  controlLabel: {
    color: '#F4F4F4',
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
  },
  scoreButtons: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  scoreButton: {
    alignItems: 'center',
    backgroundColor: '#123C2A',
    borderRadius: BorderRadius.full,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  scoreButtonText: {
    color: '#FFFFFF',
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.lg,
    lineHeight: 20,
  },
  todayStatusBar: {
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderColor: 'rgba(255,255,255,0.11)',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: Spacing.md,
    justifyContent: 'space-between',
    marginTop: Spacing.md,
    padding: Spacing.md,
  },
  todayStatusCopy: {
    flex: 1,
  },
  todayStatusLabel: {
    color: '#2DCE89',
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xs,
    marginBottom: 3,
    textTransform: 'uppercase',
  },
  todayStatusText: {
    color: '#FFFFFF',
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
  },
  todayStatusAddButton: {
    alignItems: 'center',
    backgroundColor: '#2DCE89',
    borderRadius: BorderRadius.full,
    height: 42,
    justifyContent: 'center',
    width: 42,
    ...Shadows.sm,
  },
  actionCardPressable: {
    alignSelf: 'stretch',
    marginTop: Spacing.md,
  },
  primaryPhotoButton: {
    alignItems: 'center',
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    flexDirection: 'row',
    gap: Spacing.md,
    justifyContent: 'center',
    minHeight: 72,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    ...Shadows.md,
  },
  primaryPhotoIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(45,206,137,0.22)',
    borderRadius: BorderRadius.full,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  primaryPhotoText: {
    color: Colors.textInverse,
    flexShrink: 1,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.lg,
    textAlign: 'center',
  },
  optionWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  optionChip: {
    backgroundColor: '#101010',
    borderColor: '#242424',
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  optionChipActive: {
    backgroundColor: '#123C2A',
    borderColor: '#2DCE89',
  },
  optionChipText: {
    color: '#BEBEBE',
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.xs,
    textTransform: 'capitalize',
  },
  optionChipTextActive: {
    color: '#FFFFFF',
  },
  generateButton: {
    alignItems: 'center', backgroundColor: '#123C2A', borderRadius: BorderRadius.lg,
    flexDirection: 'row', gap: Spacing.sm, justifyContent: 'center', marginTop: Spacing.md,
    minHeight: 54, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, ...Shadows.md,
  },
  generateButtonNeedsInput: { backgroundColor: '#0E281D' },
  generateButtonDisabled: { backgroundColor: '#242424', shadowOpacity: 0 },
  generateButtonText: {
    color: Colors.textInverse, flexShrink: 1, fontFamily: FontFamily.sansBold,
    fontSize: FontSize.md, textAlign: 'center',
  },
  photoAnalysisButton: {
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderColor: Colors.primary + '33',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: Spacing.sm,
    justifyContent: 'center',
    marginTop: Spacing.sm,
    minHeight: 50,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  photoAnalysisButtonDisabled: { opacity: 0.5 },
  photoAnalysisButtonText: {
    color: Colors.primary,
    flexShrink: 1,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.sm,
    textAlign: 'center',
  },
  supplementCard: {
    backgroundColor: Colors.surface,
    borderColor: Colors.primary + '26',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    marginTop: Spacing.md,
    padding: Spacing.md,
  },
  supplementHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  supplementIcon: {
    alignItems: 'center',
    backgroundColor: Colors.primary + '12',
    borderRadius: BorderRadius.full,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  supplementHeaderText: {
    flex: 1,
  },
  supplementTitle: {
    color: Colors.text,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.md,
  },
  supplementSubtitle: {
    color: Colors.textSecondary,
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.xs,
    lineHeight: 18,
    marginTop: 2,
  },
  supplementForm: {
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  modalBackdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  supplementModal: {
    backgroundColor: '#101010',
    borderColor: '#242424',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    padding: Spacing.lg,
    width: '100%',
    ...Shadows.md,
  },
  modalHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  modalTitle: {
    color: '#FFFFFF',
    flex: 1,
    fontFamily: FontFamily.displaySemiBold,
    fontSize: FontSize.lg,
  },
  commonSupplementWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  commonSupplementChip: {
    backgroundColor: '#181818',
    borderColor: '#2A2A2A',
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  commonSupplementChipActive: {
    backgroundColor: '#2DCE89',
    borderColor: '#2DCE89',
  },
  commonSupplementText: {
    color: '#D4D4D4',
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
  },
  commonSupplementTextActive: {
    color: '#000000',
  },
  supplementInput: {
    backgroundColor: '#181818',
    borderColor: '#2A2A2A',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    color: '#FFFFFF',
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.sm,
    minHeight: 46,
    paddingHorizontal: Spacing.md,
  },
  supplementSaveButton: {
    alignItems: 'center',
    backgroundColor: '#2DCE89',
    borderRadius: BorderRadius.md,
    flexDirection: 'row',
    gap: Spacing.sm,
    justifyContent: 'center',
    minHeight: 46,
  },
  supplementSaveText: {
    color: '#000000',
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.sm,
  },
  supplementHistoryTitle: {
    color: Colors.primary,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xs,
    marginTop: Spacing.md,
    textTransform: 'uppercase',
  },
  supplementHistoryList: {
    gap: Spacing.xs,
    marginTop: Spacing.sm,
  },
  supplementHistoryItem: {
    alignItems: 'center',
    backgroundColor: '#F8FCFA',
    borderRadius: BorderRadius.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  supplementHistoryName: {
    color: Colors.text,
    flex: 1,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
  },
  supplementHistoryDose: {
    color: Colors.textSecondary,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.xs,
  },
  supplementEmptyText: {
    color: Colors.textSecondary,
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.xs,
    lineHeight: 18,
    marginTop: Spacing.sm,
  },
  photoHistoryCard: {
    backgroundColor: '#090909',
    borderColor: '#242424',
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    marginTop: Spacing.lg,
    padding: Spacing.lg,
    ...Shadows.sm,
  },
  chartCard: {
    backgroundColor: '#090909',
    borderColor: '#242424',
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    marginTop: Spacing.lg,
    padding: Spacing.lg,
  },
  chartLegend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
    marginTop: Spacing.sm,
  },
  chartLegendItem: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
  },
  chartLegendDot: {
    borderRadius: BorderRadius.full,
    height: 9,
    width: 9,
  },
  chartGutDot: {
    backgroundColor: '#2DCE89',
  },
  chartEnergyDot: {
    backgroundColor: '#D4A373',
  },
  chartLegendText: {
    color: '#CFCFCF',
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xs,
  },
  chartPopup: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderColor: 'rgba(255,255,255,0.13)',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    marginTop: Spacing.md,
    padding: Spacing.md,
  },
  chartPopupHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.sm,
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  chartPopupTitle: {
    color: '#FFFFFF',
    flex: 1,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.sm,
  },
  chartPopupText: {
    color: '#CFCFCF',
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.sm,
    lineHeight: 21,
  },
  photoHistoryList: {
    gap: Spacing.sm,
  },
  photoHistoryItem: {
    alignItems: 'center',
    backgroundColor: '#101010',
    borderColor: '#242424',
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    flexDirection: 'row',
    gap: Spacing.md,
    padding: Spacing.md,
  },
  photoHistoryImage: {
    borderRadius: BorderRadius.lg,
    height: 76,
    width: 76,
  },
  photoHistoryCopy: {
    flex: 1,
  },
  photoHistoryDate: {
    color: '#2DCE89',
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xs,
    marginBottom: 4,
  },
  photoHistoryMeal: {
    color: '#FFFFFF',
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.sm,
    marginBottom: 4,
  },
  photoHistoryText: {
    color: '#2DCE89',
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xs,
    lineHeight: 19,
  },
  photoHistoryScoreBadge: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#102C20',
    borderRadius: BorderRadius.full,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
  },
  historyButton: {
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: '#2DCE89',
    borderRadius: BorderRadius.full,
    flexDirection: 'row',
    gap: Spacing.sm,
    justifyContent: 'center',
    marginTop: Spacing.md,
    minHeight: 46,
  },
  historyButtonText: {
    color: '#000000',
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.sm,
  },
  heatmapCard: {
    backgroundColor: '#090909',
    borderColor: '#242424',
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    marginTop: Spacing.lg,
    padding: Spacing.lg,
  },
  heatmapGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  heatmapCell: {
    backgroundColor: '#151515',
    borderColor: '#242424',
    borderRadius: 5,
    borderWidth: 1,
    height: 18,
    width: 18,
  },
  heatmapCellActive: {
    backgroundColor: '#2DCE89',
    borderColor: '#68F3B3',
    shadowColor: '#2DCE89',
    shadowOpacity: 0.45,
    shadowRadius: 8,
  },
  emptyText: {
    color: '#A7A7A7',
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  errorCard: {
    alignItems: 'flex-start', backgroundColor: Colors.error + '10', borderColor: Colors.error + '30',
    borderRadius: BorderRadius.md, borderWidth: 1, flexDirection: 'row', gap: Spacing.sm,
    marginTop: Spacing.md, padding: Spacing.md,
  },
  errorText: { color: Colors.error, flex: 1, fontFamily: FontFamily.sansMedium, fontSize: FontSize.sm, lineHeight: 20 },
  infoCard: {
    alignItems: 'flex-start',
    backgroundColor: Colors.primary + '10',
    borderColor: Colors.primary + '30',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.md,
    padding: Spacing.md,
  },
  infoText: {
    color: Colors.primary,
    flex: 1,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  readyToast: {
    alignItems: 'center',
    backgroundColor: Colors.secondary + '18',
    borderColor: Colors.secondary + '44',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.md,
    padding: Spacing.md,
  },
  readyToastText: {
    color: Colors.primary,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.sm,
  },
  resultContextCard: {
    backgroundColor: '#090909',
    borderColor: '#242424',
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
    marginTop: Spacing.lg,
    padding: Spacing.md,
    ...Shadows.sm,
  },
  resultContextItem: {
    flex: 1,
    minWidth: 140,
  },
  resultContextLabel: {
    color: '#2DCE89',
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xs,
    marginBottom: 3,
    textTransform: 'uppercase',
  },
  resultContextValue: {
    color: '#FFFFFF',
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  resultsGrid: { gap: Spacing.lg, marginTop: Spacing.lg },
  resultsGridWide: { alignItems: 'stretch', flexDirection: 'row' },
  resultsPanel: {
    backgroundColor: '#090909', borderColor: '#242424', borderRadius: BorderRadius.xl,
    borderWidth: 1, padding: Spacing.lg, ...Shadows.sm,
  },
  nutrientsPanelWide: { flex: 0.9 },
  recommendationPanel: { flex: 1.1 },
  sectionHeader: { marginBottom: Spacing.md },
  sectionKicker: {
    color: '#2DCE89', fontFamily: FontFamily.sansBold, fontSize: FontSize.xs,
    letterSpacing: 0.8, marginBottom: 2, textTransform: 'uppercase',
  },
  sectionTitle: { color: '#FFFFFF', fontFamily: FontFamily.displaySemiBold, fontSize: FontSize.xl },
  nutrientBadgeWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  nutrientBadge: {
    alignItems: 'center',
    backgroundColor: '#102C20',
    borderColor: '#164934',
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  nutrientBadgeText: {
    color: '#D8FBEA',
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.sm,
  },
  foodsSection: {
    borderTopColor: '#242424',
    borderTopWidth: 1,
    marginTop: Spacing.lg,
    paddingTop: Spacing.lg,
  },
  foodList: {
    gap: Spacing.sm,
  },
  foodItem: {
    alignItems: 'center',
    backgroundColor: '#101010',
    borderColor: '#242424',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: Spacing.sm,
    padding: Spacing.md,
  },
  foodIcon: {
    alignItems: 'center',
    backgroundColor: '#102C20',
    borderRadius: BorderRadius.full,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  foodItemText: {
    color: '#F5F5F5',
    flex: 1,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  foodEmptyText: {
    color: '#A7A7A7',
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  recommendationCard: { backgroundColor: '#03120D', borderRadius: BorderRadius.xl, overflow: 'hidden', padding: Spacing.lg },
  recommendationIcon: {
    alignItems: 'center', backgroundColor: Colors.secondary + '55', borderRadius: BorderRadius.full,
    height: 46, justifyContent: 'center', marginBottom: Spacing.md, width: 46,
  },
  recommendationText: { color: Colors.textInverse, fontFamily: FontFamily.displayMedium, fontSize: 25, lineHeight: 36 },
  medicalDisclaimerBox: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    marginTop: Spacing.lg,
    padding: Spacing.md,
  },
  medicalDisclaimerText: {
    color: '#B8B8B8',
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.xs,
    fontStyle: 'italic',
    lineHeight: 18,
  },
  shareButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#2DCE89',
    borderRadius: BorderRadius.full,
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  shareButtonText: {
    color: '#000000',
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.sm,
  },
  welcomeState: {
    alignItems: 'center',
    backgroundColor: '#090909',
    borderColor: '#242424',
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    marginTop: Spacing.lg,
    padding: Spacing.xl,
    ...Shadows.sm,
  },
  welcomeIcon: {
    alignItems: 'center',
    backgroundColor: '#102C20',
    borderRadius: BorderRadius.full,
    height: 56,
    justifyContent: 'center',
    marginBottom: Spacing.md,
    width: 56,
  },
  welcomeTitle: {
    color: '#FFFFFF',
    fontFamily: FontFamily.displaySemiBold,
    fontSize: FontSize.xl,
    lineHeight: 30,
    textAlign: 'center',
  },
  welcomeText: {
    color: '#A7A7A7',
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.md,
    lineHeight: 24,
    marginTop: Spacing.sm,
    maxWidth: 560,
    textAlign: 'center',
  },
  pressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
});
