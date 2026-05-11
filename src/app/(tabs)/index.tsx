import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';

import { GutScoreGauge } from '../../../components/gut-score-gauge';
import { useAuth } from '../../../contexts/AuthContext';
import { BorderRadius, Colors, FontFamily, FontSize, Shadows, Spacing, Theme } from '../../../constants/theme';
import { getNutritionRecommendation, type NutritionRecommendationResult } from '../../../lib/RecommendationEngine';
import { getPhotoAnalysisHistory, type PhotoAnalysisHistoryItem } from '../../../lib/photo-analysis-history';
import {
  getSupplementHistory,
  saveSupplementHistoryItem,
  type SupplementHistoryItem,
} from '../../../lib/supplement-history';
import {
  addXpForAction,
  getNextRankProgress,
  getUserProgressProfile,
  type UserProgressProfile,
} from '../../../lib/user-progress';
import { fetchDailyGutScoreCardData, type DailyGutScoreCardData } from '../../../services/scoring';
import {
  APP_LANGUAGE_STORAGE_KEY,
  isRtlLanguage,
  parseStoredLanguage,
  type AppLanguage,
} from '../../../lib/app-language';
import {
  getUserProfileSettings,
  saveUserProfileSettings,
  type MedicalCondition,
  type UserProfileSettings,
} from '../../../lib/user-profile-settings';

const EXAMPLE_FEELINGS = [
  'lowEnergy',
  'bloated',
  'stressed',
] as const;
const COMMON_SUPPLEMENTS = ['Probiotic', 'Digestive Enzyme', 'Ginger', 'Vitamin D'] as const;

const NUTRIENT_ICONS = ['leaf', 'water', 'sparkles', 'fitness', 'nutrition'] as const;
const DS = Theme;
const UI_COPY = {
  en: {
    analysis: 'Analysis',
    history: 'History',
    quickTips: 'Quick Tips',
    welcomeMessageTitle: "How's your gut today?",
    welcomeMessageSubtitle:
      'Share your energy, digestion, cravings, or symptoms. We will look for supportive nutrients and turn trusted USDA data into a gentle nutrition idea.',
    startScan: 'Start Scan',
    viewDetails: 'View Details',
    save: 'Save',
    cancel: 'Cancel',
    help: 'Help',
    instantRelief: 'Instant Relief',
    commonSymptoms: 'Common Symptoms',
    version: 'Version',
    rightsReserved: 'All rights reserved.',
    profile: 'Profile',
    login: 'Login',
  },
  de: {
    analysis: 'Analyse',
    history: 'Verlauf',
    quickTips: 'Schnelle Tipps',
    welcomeMessageTitle: "Wie geht's deinem Bauch?",
    welcomeMessageSubtitle:
      'Teile deine Energie, Verdauung, Gelüste oder Symptome. Wir finden unterstützende Nährstoffe und passende USDA-Lebensmittelideen.',
    startScan: 'Scan starten',
    viewDetails: 'Details anzeigen',
    save: 'Speichern',
    cancel: 'Abbrechen',
    help: 'Hilfe',
    instantRelief: 'Soforthilfe',
    commonSymptoms: 'Häufige Symptome',
    version: 'Version',
    rightsReserved: 'Alle Rechte vorbehalten.',
    profile: 'Profil',
    login: 'Anmelden',
  },
  fa: {
    analysis: 'تحلیل',
    history: 'سوابق',
    quickTips: 'نکات سریع',
    welcomeMessageTitle: 'امروز حال گوارش شما چطور است؟',
    welcomeMessageSubtitle:
      'انرژی، هضم، میل غذایی یا علائم خود را ثبت کنید تا پیشنهادهای تغذیه ای مناسب دریافت کنید.',
    startScan: 'شروع اسکن',
    viewDetails: 'مشاهده جزئیات',
    save: 'ذخیره',
    cancel: 'لغو',
    help: 'کمک',
    instantRelief: 'تسکین فوری',
    commonSymptoms: 'علائم رایج',
    version: 'نسخه',
    rightsReserved: 'تمامی حقوق محفوظ است.',
    profile: 'پروفایل',
    login: 'ورود',
  },
} as const;

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
    dailyGutScore: 'Daily Gut Score',
    noScoreYet: 'No score yet',
    dailyScoreFallback: "Complete today's check-in to generate your personalized daily summary.",
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
    shareSnapshot: 'NutriFlow Snapshot',
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
    supplementNamePlaceholder: 'Supplement name, e.g. probiotic capsule',
    supplementDosagePlaceholder: 'Dosage, e.g. 1 capsule',
    supplementSave: 'Save supplement',
    supplementHistoryTitle: 'Supplements History',
    supplementEmpty: 'No supplements logged in the last 14 days.',
    scoreDecrease: 'Decrease Gut Score',
    scoreIncrease: 'Increase Gut Score',
    languageButtons: {
      en: 'EN',
      de: 'DE',
      fa: 'FA',
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
    chartFeeling: {
      Good: 'Good',
      Bad: 'Needs support',
    },
    rankNames: {
      Initiate: 'Initiate',
      Warrior: 'Warrior',
      Apex: 'Apex',
    },
    commonSupplements: {
      Probiotic: 'Probiotic',
      'Digestive Enzyme': 'Digestive Enzyme',
      Ginger: 'Ginger',
      'Vitamin D': 'Vitamin D',
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
    dailyGutScore: 'Täglicher Darm-Score',
    noScoreYet: 'Noch kein Score',
    dailyScoreFallback: 'Schließe den heutigen Check-in ab, um deine persönliche Tageszusammenfassung zu erhalten.',
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
    shareSnapshot: 'NutriFlow-Zusammenfassung',
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
      fa: 'FA',
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
    chartFeeling: {
      Good: 'Gut',
      Bad: 'Braucht Unterstützung',
    },
    rankNames: {
      Initiate: 'Start',
      Warrior: 'Kämpfer',
      Apex: 'Spitze',
    },
    commonSupplements: {
      Probiotic: 'Probiotikum',
      'Digestive Enzyme': 'Verdauungsenzym',
      Ginger: 'Ingwer',
      'Vitamin D': 'Vitamin D',
    },
  },
  fa: {
    appEyebrow: 'راهنمای تغذیه NutriFlow',
    welcome: 'امروز حال گوارش شما چطور است؟',
    heroSubtitle:
      'انرژی، هضم، میل غذایی یا علائم خود را بنویسید. ما مواد مغذی حمایتی و ایده های غذایی ملایم بر پایه داده های USDA پیشنهاد می کنیم.',
    inputLabel: 'بگویید چه چیزی در جریان است',
    score: 'امتیاز روده: ',
    currentStatus: 'وضعیت فعلی',
    dailyGutScore: 'امتیاز روزانه روده',
    noScoreYet: 'هنوز امتیازی نیست',
    dailyScoreFallback: 'چک‌این امروز را کامل کنید تا خلاصه روزانه شخصی شما ساخته شود.',
    dose: 'مقدار',
    duration: 'مدت',
    progressTip: 'نکته پیشرفت',
    noConditions: 'موردی ثبت نشده',
    conditions: 'شرایط زمینه ای',
    activity: 'سطح فعالیت',
    button: 'تحلیل دوستانه',
    photoAnalysisButton: 'تحلیل عکس غذا',
    placeholder: 'بگویید چه خورده اید یا چه احساسی دارید...',
    clear: 'پاک کردن',
    loading: 'در حال تحلیل مواد مغذی و داده های USDA...',
    preparingHealthBuddy: 'در حال آماده سازی همراه سلامت شما...',
    recommendationReady: 'پیشنهاد آماده است!',
    reanalyzeMessage: 'برای دیدن نتیجه به فارسی، لطفاً دوباره تحلیل کنید.',
    emptyAlertTitle: 'چه احساسی دارید؟',
    emptyAlertMessage: 'قبل از ساخت برنامه تغذیه، لطفاً حال خود را توضیح دهید.',
    errorTitle: 'برنامه تغذیه ناموفق بود',
    genericErrorMessage: 'هنگام ساخت برنامه تغذیه مشکلی پیش آمد.',
    shareTitle: 'پیشنهاد NutriFlow من',
    shareSnapshot: 'خلاصه NutriFlow',
    shareFeeling: 'احساس',
    shareNutrients: 'مواد مغذی مفید',
    shareButton: 'اشتراک گذاری با دوستان',
    shareErrorTitle: 'اشتراک گذاری در دسترس نیست',
    shareErrorMessage: 'اکنون امکان باز کردن اشتراک گذاری وجود ندارد.',
    supportiveNutrients: 'مواد مغذی حمایتی',
    nutrientBadges: 'نشان های مواد مغذی',
    usdaMatches: 'موارد مطابق USDA',
    recommendedFoods: 'غذاهای پیشنهادی',
    noFoods: 'هنوز غذای مطابق USDA پیدا نشد، اما راهنمای مواد مغذی آماده است.',
    yourPlan: 'برنامه شما',
    bigRecommendation: 'پیشنهاد اصلی',
    photoHistoryTitle: 'سوابق اخیر',
    photoHistorySubtitle: 'اسکن های غذا در ۱۴ روز گذشته',
    photoHistoryEmpty: 'هنوز تحلیل عکس غذا ندارید.',
    photoHistoryNoScore: 'امتیاز در انتظار',
    historyButton: 'مشاهده همه سوابق',
    heatmapTitle: 'زنجیره اسکن غذا',
    heatmapSubtitle: '۳۰ روز گذشته',
    progressChartTitle: 'ریتم ۷ روزه بدن',
    progressChartSubtitle: 'امتیاز روده + سطح انرژی',
    gutScoreMetric: 'امتیاز روده',
    energyMetric: 'انرژی',
    xpLabel: 'امتیاز تجربه',
    nextRank: 'رتبه بعدی',
    rankUp: 'ارتقای رتبه',
    goodFeelingCelebration: 'احساس خوب ثبت شد',
    chartPopupDate: 'تاریخ',
    chartPopupScore: 'امتیاز',
    chartPopupFeeling: 'احساس',
    medicalDisclaimer:
      'نکته مهم: این تحلیل فقط برای اطلاع است و جایگزین تشخیص پزشکی نیست. اگر علائم شدید دارید، کمک پزشکی بگیرید.',
    rankTitle: 'سطح ۱ همراه روده',
    todaysStatus: 'وضعیت امروز',
    supplementTaken: 'مکمل مصرف شده',
    noSupplementsLogged: 'هنوز مکملی ثبت نشده',
    supplementTitle: 'مکمل های امروز',
    supplementLogTitle: 'ثبت مکمل و پروبیوتیک',
    supplementSubtitle: 'مکمل ها و پروبیوتیک ها را برای زمینه دقیق تر تحلیل غذا ثبت کنید.',
    supplementNamePlaceholder: 'نام مکمل، مثلاً پروبیوتیک',
    supplementDosagePlaceholder: 'مقدار، مثلاً ۱ کپسول',
    supplementSave: 'ذخیره مکمل',
    supplementHistoryTitle: 'سوابق مکمل ها',
    supplementEmpty: 'در ۱۴ روز گذشته مکملی ثبت نشده است.',
    scoreDecrease: 'کاهش امتیاز روده',
    scoreIncrease: 'افزایش امتیاز روده',
    languageButtons: {
      en: 'EN',
      de: 'DE',
      fa: 'FA',
    },
    welcomeEmptyTitle: 'برای شروع مسیر تغذیه، بگویید چه احساسی دارید.',
    welcomeEmptyText:
      'NutriFlow چک‌این شما را به مواد مغذی حمایتی، ایده های غذایی USDA و یک قدم بعدی ملایم تبدیل می کند.',
    diseases: {
      ibs: 'سندرم روده تحریک پذیر',
      gastritis: 'گاستریت',
      bloating: 'نفخ',
      celiac: 'سلیاک',
      lactoseIntolerance: 'عدم تحمل لاکتوز',
    },
    activityLevels: {
      sedentary: 'کم تحرک',
      moderate: 'متوسط',
      active: 'فعال',
      athlete: 'ورزشی',
    },
    examples: {
      lowEnergy: 'انرژی کم و گرفتگی عضلات',
      bloated: 'نفخ بعد از غذا',
      stressed: 'استرس و میل به شیرینی',
    },
    statusLabels: {
      poor: 'ضعیف',
      moderate: 'متوسط',
      excellent: 'سالم',
    },
    chartFeeling: {
      Good: 'خوب',
      Bad: 'نیازمند حمایت',
    },
    rankNames: {
      Initiate: 'شروع',
      Warrior: 'جنگجو',
      Apex: 'اوج',
    },
    commonSupplements: {
      Probiotic: 'پروبیوتیک',
      'Digestive Enzyme': 'آنزیم گوارشی',
      Ginger: 'زنجبیل',
      'Vitamin D': 'ویتامین D',
    },
  },
} as const;

const CONDITION_OPTIONS: Condition[] = ['ibs', 'gastritis', 'bloating', 'celiac', 'lactoseIntolerance'];
const ACTIVITY_LEVELS: ActivityLevel[] = ['sedentary', 'moderate', 'active', 'athlete'];
const CONDITION_TO_PROFILE: Record<Condition, MedicalCondition> = {
  ibs: 'IBS',
  gastritis: 'Gastritis',
  bloating: 'Bloating',
  celiac: 'Celiac',
  lactoseIntolerance: 'Lactose Intolerance',
};
const PROFILE_TO_CONDITION: Record<MedicalCondition, Condition> = {
  IBS: 'ibs',
  Gastritis: 'gastritis',
  Bloating: 'bloating',
  Celiac: 'celiac',
  'Lactose Intolerance': 'lactoseIntolerance',
};
const AI_LANGUAGE_LABELS: Record<Language, string> = {
  en: 'English',
  de: 'German',
  fa: 'Persian',
};

const SCIENTIFIC_SOURCE_COPY: Record<Language, string> = {
  en: 'Scientific Source: USDA FoodData Central & Localized AI Adaptation.',
  de: 'Wissenschaftliche Quelle: USDA FoodData Central & lokalisierte KI-Anpassung.',
  fa: 'منبع علمی: USDA FoodData Central و سازگاری محلی هوش مصنوعی.',
};

const LANGUAGE_LOCALES: Record<Language, string> = {
  en: 'en-US',
  de: 'de-DE',
  fa: 'fa-IR',
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
    probiotics: 'پروبیوتیک ها',
    prebiotic: 'پری بیوتیک',
    prebiotics: 'پری بیوتیک ها',
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

function toProfileConditions(conditions: Condition[]): MedicalCondition[] {
  return conditions.map((condition) => CONDITION_TO_PROFILE[condition]);
}

function toHomeConditions(conditions: MedicalCondition[]): Condition[] {
  return conditions
    .map((condition) => PROFILE_TO_CONDITION[condition])
    .filter((condition): condition is Condition => Boolean(condition));
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
  language: Language,
): ChartPoint[] {
  const locale = LANGUAGE_LOCALES[language];
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
      label: date.toLocaleDateString(locale, { weekday: 'short' }).slice(0, 2),
      dateLabel: date.toLocaleDateString(locale),
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
  const { user: currentUser } = useAuth();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const scrollViewRef = useRef<ScrollView>(null);
  const previousLanguageRef = useRef<Language>('en');
  const celebrationPulse = useRef(new Animated.Value(0)).current;
  const [feeling, setFeeling] = useState('');
  const [language, setLanguage] = useState<Language>('en');
  const [hasLoadedLanguage, setHasLoadedLanguage] = useState(false);
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
  const [dailyGutScoreCard, setDailyGutScoreCard] = useState<DailyGutScoreCardData | null>(null);
  const [dailyGutScoreLoading, setDailyGutScoreLoading] = useState(false);

  const t = translations[language];
  const isRtl = isRtlLanguage(language);
  const ui = UI_COPY[language];
  const scientificSource = SCIENTIFIC_SOURCE_COPY[language];
  const localizedStaticLabels = {
    profile: ui.profile,
    login: ui.login,
    history: ui.history,
    sos: ui.instantRelief,
  };
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
    () => buildSevenDayChartData(photoHistory, supplementHistory, gutScore, language),
    [gutScore, language, photoHistory, supplementHistory]
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
  useEffect(() => {
    AsyncStorage.getItem(APP_LANGUAGE_STORAGE_KEY)
      .then((storedLanguage) => {
        setLanguage(parseStoredLanguage(storedLanguage));
      })
      .catch(console.warn)
      .finally(() => setHasLoadedLanguage(true));
  }, []);

  useEffect(() => {
    if (!hasLoadedLanguage) return;
    AsyncStorage.setItem(APP_LANGUAGE_STORAGE_KEY, language).catch(console.warn);
  }, [hasLoadedLanguage, language]);

  useFocusEffect(
    useCallback(() => {
      let isActive = true;
      const fallbackProfileSettings: UserProfileSettings = { conditions: [] };
      setDailyGutScoreLoading(true);

      Promise.all([
        getPhotoAnalysisHistory(currentUser?.id),
        getSupplementHistory(),
        getUserProgressProfile(),
        currentUser?.id ? fetchDailyGutScoreCardData(currentUser.id) : Promise.resolve(null),
        getUserProfileSettings().catch((error) => {
          console.warn('Profile settings load failed:', error);
          return fallbackProfileSettings;
        }),
      ])
        .then(([history, supplements, progress, dailyScore, profileSettings]) => {
          if (!isActive) return;
          setPhotoHistory(history);
          setSupplementHistory(supplements);
          setUserProgress(progress);
          setDailyGutScoreCard(dailyScore);
          setConditions(toHomeConditions(profileSettings.conditions));
          if (profileSettings.preferredLanguage) {
            setLanguage(profileSettings.preferredLanguage);
            setHasLoadedLanguage(true);
          }
        })
        .catch(console.warn)
        .finally(() => {
          if (isActive) setDailyGutScoreLoading(false);
        });

      return () => {
        isActive = false;
      };
    }, [currentUser?.id])
  );

  const localizedNutrients = useMemo(
    () => localizedResult?.nutrients.map((nutrient) => translateNutrient(nutrient, language)) ?? [],
    [language, localizedResult]
  );
  const shareMessage = useMemo(() => {
    if (!localizedResult) return '';

    return [
      t.shareSnapshot,
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
        `Use ${AI_LANGUAGE_LABELS[language]} only. Do not respond in any other language.`,
        'For IBS/bloating, do not suggest brown rice, barley bread, barley, or high-fiber whole grains. Prefer white rice, boiled potatoes, zucchini, carrots, peppermint tea, ginger tea, or low-FODMAP soup.',
      ].join('\n');
      const recommendation = await getNutritionRecommendation(analysisInput);
      const xpResult = await addXpForAction(10);
      setResult({ ...recommendation, feeling: trimmedFeeling });
      setResultLanguage(language);
      setUserProgress(xpResult.profile);
      setShowReadyMessage(true);
      if (xpResult.leveledUp) {
        setRankUpBadge(`${t.rankUp}: ${t.rankNames[xpResult.profile.rank]}`);
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

  const handleLanguageChange = (nextLanguage: Language) => {
    setLanguage(nextLanguage);
    setHasLoadedLanguage(true);
    saveUserProfileSettings({
      conditions: toProfileConditions(conditions),
      preferredLanguage: nextLanguage,
    }).catch((error) => console.warn('Preferred language save failed:', error));
  };

  const toggleCondition = (condition: Condition) => {
    setConditions((currentConditions) => {
      const nextConditions = currentConditions.includes(condition)
        ? currentConditions.filter((item) => item !== condition)
        : [...currentConditions, condition];

      saveUserProfileSettings({
        conditions: toProfileConditions(nextConditions),
        preferredLanguage: language,
      }).catch((error) => console.warn('Profile condition save failed:', error));

      return nextConditions;
    });
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
        setRankUpBadge(`${t.rankUp}: ${t.rankNames[xpResult.profile.rank]}`);
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
          <View style={styles.languageTopWrap}>
            <View style={[styles.languageRow, isRtl && styles.rtlRow]}>
              {(['en', 'de', 'fa'] as Language[]).map((item) => (
                <Pressable
                  key={item}
                  onPress={() => handleLanguageChange(item)}
                  style={[
                    styles.languageButton,
                    language === item && styles.languageButtonActive,
                  ]}
                >
                  <Text style={[
                    styles.languageButtonText,
                    language === item && styles.languageButtonTextActive,
                  ]}>
                    {t.languageButtons[item]}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={[styles.topActionsRow, isRtl && styles.rtlRow]}>
            <Pressable
              onPress={() => router.push('/settings')}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={localizedStaticLabels.profile}
              style={({ pressed }) => [styles.settingsQuickButton, pressed && styles.pressed]}
            >
              <Ionicons name="settings-outline" size={18} color="#FFFFFF" />
              <Text style={[styles.settingsQuickButtonText, isRtl && styles.rtlText]}>
                {localizedStaticLabels.profile}
              </Text>
            </Pressable>
            {currentUser ? (
              <Pressable
                onPress={() => router.push('/food-history')}
                hitSlop={8}
                style={({ pressed }) => [styles.historyQuickButton, pressed && styles.pressed]}
              >
                <Ionicons name="time-outline" size={18} color="#2DCE89" />
                <Text style={[styles.historyQuickButtonText, isRtl && styles.rtlText]}>
                  {localizedStaticLabels.history}
                </Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={() => router.push('/login')}
                hitSlop={8}
                style={({ pressed }) => [styles.loginQuickButton, pressed && styles.pressed]}
              >
                <Ionicons name="log-in-outline" size={18} color="#000000" />
                <Text style={[styles.loginQuickButtonText, isRtl && styles.rtlText]}>
                  {localizedStaticLabels.login}
                </Text>
              </Pressable>
            )}
          </View>
          <LinearGradient
            colors={DS.gradients.surface}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.dashboardScoreCard}
          >
            <View style={[styles.eyebrow, isRtl && styles.rtlRow]}>
              <Ionicons name="leaf" size={14} color={Colors.accent} />
              <Text style={[styles.eyebrowText, isRtl && styles.rtlText]}>{t.appEyebrow}</Text>
            </View>
            <Text style={[styles.rankTitle, isRtl && styles.rtlText]}>
              {t.rankTitle}: {t.rankNames[userProgress.rank]}
            </Text>
            <View style={styles.xpPill}>
              <Text style={styles.xpPillText}>
                {userProgress.xp} {t.xpLabel}
                {rankProgress.next ? ` · ${t.nextRank}: ${t.rankNames[rankProgress.next]}` : ''}
              </Text>
            </View>
            <View style={styles.xpTrack}>
              <View style={[styles.xpFill, { width: `${rankProgress.percent}%` }]} />
            </View>
            {rankUpBadge ? (
              <View style={[styles.rankUpBadge, isRtl && styles.rtlRow]}>
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
                  isRtl && styles.rtlRow,
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
              isRtl={isRtl}
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

            <View style={[styles.todayStatusBar, isRtl && styles.rtlRow]}>
              <View style={styles.todayStatusCopy}>
                <Text style={[styles.todayStatusLabel, isRtl && styles.rtlText]}>
                  {t.todaysStatus}
                </Text>
                <Text style={[styles.todayStatusText, isRtl && styles.rtlText]}>
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
                colors={DS.gradients.primary}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.primaryPhotoButton, isRtl && styles.rtlRow]}
              >
                <View style={styles.primaryPhotoIcon}>
                  <Ionicons name="camera" size={26} color={Colors.textInverse} />
                </View>
                <Text style={[styles.primaryPhotoText, isRtl && styles.rtlText]}>
                  {`${ui.analysis}: ${ui.startScan}`}
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
                colors={DS.gradients.primary}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.primaryPhotoButton, isRtl && styles.rtlRow]}
              >
                <View style={styles.primaryPhotoIcon}>
                  <Ionicons name="medkit" size={25} color={Colors.textInverse} />
                </View>
                <Text style={[styles.primaryPhotoText, isRtl && styles.rtlText]}>
                  {t.supplementLogTitle}
                </Text>
              </LinearGradient>
            </Pressable>
          </LinearGradient>

          <View style={styles.dailyScoreCard}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionKicker, isRtl && styles.rtlText]}>{t.dailyGutScore}</Text>
              <Text style={[styles.sectionTitle, isRtl && styles.rtlText]}>
                {dailyGutScoreCard ? `${dailyGutScoreCard.score}/100` : t.noScoreYet}
              </Text>
            </View>
            {dailyGutScoreLoading ? (
              <ActivityIndicator color={DS.colors.sage} size="small" />
            ) : (
              <Text style={[styles.dailyScoreSummary, isRtl && styles.rtlText]}>
                {dailyGutScoreCard?.insight
                  ?? t.dailyScoreFallback}
              </Text>
            )}
          </View>

          <View style={styles.chartCard}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionKicker, isRtl && styles.rtlText]}>
                {t.progressChartSubtitle}
              </Text>
              <Text style={[styles.sectionTitle, isRtl && styles.rtlText]}>
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
                <View style={[styles.chartPopupHeader, isRtl && styles.rtlRow]}>
                  <Ionicons name="pulse" size={16} color="#2DCE89" />
                  <Text style={[styles.chartPopupTitle, isRtl && styles.rtlText]}>{selectedChartPoint.label}</Text>
                  <Pressable onPress={() => setSelectedChartPoint(null)} hitSlop={8}>
                    <Ionicons name="close" size={16} color="#A7A7A7" />
                  </Pressable>
                </View>
                <Text style={[styles.chartPopupText, isRtl && styles.rtlText]}>
                  {t.chartPopupDate}: {selectedChartPoint.dateLabel}
                </Text>
                <Text style={[styles.chartPopupText, isRtl && styles.rtlText]}>
                  {t.chartPopupScore}: {selectedChartPoint.gutScore}/10
                </Text>
                <Text style={[styles.chartPopupText, isRtl && styles.rtlText]}>
                  {t.chartPopupFeeling}: {t.chartFeeling[selectedChartPoint.feeling]}
                </Text>
              </View>
            ) : null}
          </View>

          <View style={styles.photoHistoryCard}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionKicker, isRtl && styles.rtlText]}>
                {t.photoHistorySubtitle}
              </Text>
              <Text style={[styles.sectionTitle, isRtl && styles.rtlText]}>
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
                      isRtl && styles.rtlRow,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Image source={{ uri: item.imageUri }} style={styles.photoHistoryImage} />
                    <View style={styles.photoHistoryCopy}>
                      <Text style={[styles.photoHistoryDate, isRtl && styles.rtlText]}>
                        {new Date(item.createdAt).toLocaleDateString()}
                      </Text>
                      <Text numberOfLines={1} style={[styles.photoHistoryMeal, isRtl && styles.rtlText]}>
                        {item.mealName}
                      </Text>
                      <View style={[styles.photoHistoryScoreBadge, isRtl && styles.rtlRow]}>
                        <Ionicons name="speedometer" size={13} color="#2DCE89" />
                        <Text style={styles.photoHistoryText}>
                          {item.mealImpactScore ?? t.photoHistoryNoScore}
                        </Text>
                      </View>
                    </View>
                    <Ionicons
                      name={isRtl ? 'chevron-back' : 'chevron-forward'}
                      size={18}
                      color="#777777"
                    />
                  </Pressable>
                ))}
              </View>
            ) : (
              <Text style={[styles.emptyText, isRtl && styles.rtlText]}>
                {t.photoHistoryEmpty}
              </Text>
            )}
            <Pressable
              onPress={() => router.push('/food-history')}
              style={({ pressed }) => [styles.historyButton, pressed && styles.pressed]}
            >
              <Ionicons name="list" size={17} color="#000000" />
              <Text style={[styles.historyButtonText, isRtl && styles.rtlText]}>{t.historyButton}</Text>
            </Pressable>
          </View>

          <View style={styles.heatmapCard}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionKicker, isRtl && styles.rtlText]}>{t.heatmapSubtitle}</Text>
              <Text style={[styles.sectionTitle, isRtl && styles.rtlText]}>{t.heatmapTitle}</Text>
            </View>
            <View style={[styles.heatmapGrid, isRtl && styles.rtlRow]}>
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
              <Text style={[styles.heroTitle, isRtl && styles.rtlText]}>{ui.welcomeMessageTitle}</Text>
              <Text style={[styles.heroSubtitle, isRtl && styles.rtlText]}>{ui.welcomeMessageSubtitle}</Text>

              <View style={[styles.promptChips, isRtl && styles.rtlRow]}>
                {EXAMPLE_FEELINGS.map((example) => (
                  <Pressable
                    key={example}
                    onPress={() => setFeeling(t.examples[example])}
                    style={({ pressed }) => [styles.promptChip, pressed && styles.pressed]}
                  >
                    <Text style={[styles.promptChipText, isRtl && styles.rtlText]}>{t.examples[example]}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.inputCard}>
              <View style={[styles.inputHeader, isRtl && styles.rtlRow]}>
                <Text style={[styles.inputLabel, isRtl && styles.rtlText]}>{t.inputLabel}</Text>
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
                  <Text style={[styles.clearButtonText, isRtl && styles.rtlText]}>{t.clear}</Text>
                </Pressable>
              </View>
              <TextInput
                value={feeling}
                onChangeText={setFeeling}
                placeholder={t.placeholder}
                placeholderTextColor="#777777"
                multiline
                textAlignVertical="top"
                style={[styles.textArea, isRtl && styles.rtlText]}
              />

              <View style={styles.profileControls}>
                <Text style={[styles.controlLabel, isRtl && styles.rtlText]}>{t.conditions}</Text>
                <View style={[styles.optionWrap, isRtl && styles.rtlRow]}>
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
                        isRtl && styles.rtlText,
                      ]}>
                        {t.diseases[condition]}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <Text style={[styles.controlLabel, isRtl && styles.rtlText]}>{t.activity}</Text>
                <View style={[styles.optionWrap, isRtl && styles.rtlRow]}>
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
                        isRtl && styles.rtlText,
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
                    <Text style={[styles.generateButtonText, isRtl && styles.rtlText]}>
                      {t.loading}
                    </Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="nutrition" size={19} color={Colors.textInverse} />
                    <Text style={[styles.generateButtonText, isRtl && styles.rtlText]}>{t.button}</Text>
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
                    <View style={[styles.modalHeader, isRtl && styles.rtlRow]}>
                      <Text style={[styles.modalTitle, isRtl && styles.rtlText]}>
                        {t.supplementLogTitle}
                      </Text>
                      <Pressable onPress={() => setShowSupplementModal(false)} hitSlop={10}>
                        <Ionicons name="close" size={22} color="#A7A7A7" />
                      </Pressable>
                    </View>

                    <View style={[styles.commonSupplementWrap, isRtl && styles.rtlRow]}>
                      {COMMON_SUPPLEMENTS.map((item) => (
                        <Pressable
                          key={item}
                          onPress={() => setSupplementName(t.commonSupplements[item])}
                          style={[
                            styles.commonSupplementChip,
                            (supplementName === item || supplementName === t.commonSupplements[item]) && styles.commonSupplementChipActive,
                          ]}
                        >
                          <Text
                            style={[
                              styles.commonSupplementText,
                              (supplementName === item || supplementName === t.commonSupplements[item]) && styles.commonSupplementTextActive,
                              isRtl && styles.rtlText,
                            ]}
                          >
                            {t.commonSupplements[item]}
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
                        style={[styles.supplementInput, isRtl && styles.rtlText]}
                      />
                      <TextInput
                        value={supplementDosage}
                        onChangeText={setSupplementDosage}
                        placeholder={t.supplementDosagePlaceholder}
                        placeholderTextColor="#777777"
                        style={[styles.supplementInput, isRtl && styles.rtlText]}
                      />
                      <Pressable
                        onPress={handleSaveSupplement}
                        style={({ pressed }) => [
                          styles.supplementSaveButton,
                          pressed && styles.pressed,
                        ]}
                      >
                        <Ionicons name="add-circle" size={18} color={Colors.textInverse} />
                        <Text style={[styles.supplementSaveText, isRtl && styles.rtlText]}>{t.supplementSave}</Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              </Modal>

              {errorMessage ? (
                <View style={styles.errorCard}>
                  <Ionicons name="alert-circle-outline" size={18} color={Colors.error} />
                  <Text style={[styles.errorText, isRtl && styles.rtlText]}>{errorMessage}</Text>
                </View>
              ) : null}

              {languageRefreshMessage ? (
                <View style={[styles.infoCard, isRtl && styles.rtlRow]}>
                    <Ionicons name="language" size={18} color="#2DCE89" />
                  <Text style={[styles.infoText, isRtl && styles.rtlText]}>
                    {languageRefreshMessage}
                  </Text>
                </View>
              ) : null}

              {showReadyMessage ? (
                <View style={[styles.readyToast, isRtl && styles.rtlRow]}>
                  <Ionicons name="checkmark-circle" size={18} color={Colors.success} />
                  <Text style={[styles.readyToastText, isRtl && styles.rtlText]}>
                    {t.recommendationReady}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>

          {localizedResult ? (
            <>
              <View style={[styles.resultContextCard, isRtl && styles.rtlRow]}>
                <View style={styles.resultContextItem}>
                  <Text style={[styles.resultContextLabel, isRtl && styles.rtlText]}>
                    {t.shareFeeling}
                  </Text>
                  <Text style={[styles.resultContextValue, isRtl && styles.rtlText]}>
                    {localizedResult.feeling}
                  </Text>
                </View>
                <View style={styles.resultContextItem}>
                  <Text style={[styles.resultContextLabel, isRtl && styles.rtlText]}>
                    {t.conditions}
                  </Text>
                  <Text style={[styles.resultContextValue, isRtl && styles.rtlText]}>
                    {localizedConditionSummary}
                  </Text>
                </View>
              </View>

              <View style={[styles.resultsGrid, isWideLayout && styles.resultsGridWide]}>
              <View style={[styles.resultsPanel, isWideLayout && styles.nutrientsPanelWide]}>
                <View style={styles.sectionHeader}>
                  <Text style={[styles.sectionKicker, isRtl && styles.rtlText]}>{t.supportiveNutrients}</Text>
                  <Text style={[styles.sectionTitle, isRtl && styles.rtlText]}>{t.nutrientBadges}</Text>
                </View>

                <View style={[styles.nutrientBadgeWrap, isRtl && styles.rtlRow]}>
                  {localizedNutrients.map((nutrient, index) => (
                    <View key={`${nutrient}-${index}`} style={styles.nutrientBadge}>
                      <Ionicons
                        name={NUTRIENT_ICONS[index % NUTRIENT_ICONS.length]}
                        size={16}
                        color="#2DCE89"
                      />
                      <Text style={[styles.nutrientBadgeText, isRtl && styles.rtlText]}>
                        {nutrient}
                      </Text>
                    </View>
                  ))}
                </View>

                <View style={styles.foodsSection}>
                  <View style={styles.sectionHeader}>
                    <Text style={[styles.sectionKicker, isRtl && styles.rtlText]}>{t.usdaMatches}</Text>
                    <Text style={[styles.sectionTitle, isRtl && styles.rtlText]}>{t.recommendedFoods}</Text>
                  </View>

                  {localizedResult.foods.length > 0 ? (
                    <View style={styles.foodList}>
                      {localizedResult.foods.slice(0, 5).map((food) => (
                        <View key={food.description} style={[styles.foodItem, isRtl && styles.rtlRow]}>
                          <View style={styles.foodIcon}>
                            <Ionicons name="restaurant" size={15} color="#2DCE89" />
                          </View>
                          <Text style={[styles.foodItemText, isRtl && styles.rtlText]}>{food.description}</Text>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <Text style={[styles.foodEmptyText, isRtl && styles.rtlText]}>
                      {t.noFoods}
                    </Text>
                  )}
                  <View style={[styles.scientificSourceRow, isRtl && styles.rtlRow]}>
                    <Ionicons name="library-outline" size={13} color={DS.colors.slate} />
                    <Text style={[styles.scientificSourceText, isRtl && styles.rtlText]}>
                      {scientificSource}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={[styles.resultsPanel, styles.recommendationPanel]}>
                <View style={styles.sectionHeader}>
                  <Text style={[styles.sectionKicker, isRtl && styles.rtlText]}>{t.yourPlan}</Text>
                  <Text style={[styles.sectionTitle, isRtl && styles.rtlText]}>{t.bigRecommendation}</Text>
                </View>

                <View style={styles.recommendationCard}>
                  <View style={styles.recommendationIcon}>
                    <Ionicons name="chatbubble-ellipses" size={22} color={Colors.textInverse} />
                  </View>
                  <Text style={[styles.recommendationText, isRtl && styles.rtlText]}>{localizedResult.recommendation}</Text>
                  <View style={styles.medicalDisclaimerBox}>
                    <Text style={[styles.medicalDisclaimerText, isRtl && styles.rtlText]}>
                      {t.medicalDisclaimer}
                    </Text>
                  </View>

                  <Pressable
                    onPress={handleShareRecommendation}
                    style={({ pressed }) => [styles.shareButton, pressed && styles.pressed]}
                  >
                    <Ionicons name="paper-plane" size={18} color="#000000" />
                    <Text style={[styles.shareButtonText, isRtl && styles.rtlText]}>{t.shareButton}</Text>
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
              <Text style={[styles.welcomeTitle, isRtl && styles.rtlText]}>{t.welcomeEmptyTitle}</Text>
              <Text style={[styles.welcomeText, isRtl && styles.rtlText]}>{t.welcomeEmptyText}</Text>
            </View>
          )}
          <Text style={[styles.versionText, isRtl && styles.rtlText]}>{`${ui.version}: v1.1.0`}</Text>
          <Text style={[styles.versionRightsText, isRtl && styles.rtlText]}>{ui.rightsReserved}</Text>
        </ScrollView>
      </KeyboardAvoidingView>
      <Pressable
        onPress={() => router.push('/relief')}
        accessibilityRole="button"
        accessibilityLabel={`${ui.quickTips}: ${localizedStaticLabels.sos}`}
        style={({ pressed }) => [
          styles.sosFab,
          { bottom: Math.max(insets.bottom + 16, 28) },
          pressed && styles.pressed,
        ]}
      >
        <Ionicons name="warning" size={20} color="#FFFFFF" />
        <Text style={[styles.sosFabText, isRtl && styles.rtlText]}>{`${ui.quickTips}: ${localizedStaticLabels.sos}`}</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F4F5F0' },
  keyboardView: { flex: 1 },
  content: {
    backgroundColor: 'transparent',
    borderColor: '#B2AC88',
    borderRadius: 15,
    borderWidth: 1,
    flexGrow: 1,
    gap: 24,
    padding: 20,
    paddingBottom: Spacing.xxl + 36,
  },
  contentWide: { alignSelf: 'center', maxWidth: 1120, paddingHorizontal: Spacing.xl, width: '100%' },
  sosFab: {
    alignItems: 'center',
    backgroundColor: '#D7263D',
    borderColor: '#B91C2F',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: Spacing.xs,
    justifyContent: 'center',
    minHeight: 56,
    paddingHorizontal: 16,
    paddingVertical: 12,
    position: 'absolute',
    right: 20,
    shadowColor: '#D7263D',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 16,
    zIndex: 2000,
  },
  sosFabText: {
    color: '#FFFFFF',
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.sm,
  },
  reliefMenuCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#ECE7D9',
    borderRadius: 15,
    borderWidth: 1,
    gap: Spacing.md,
    padding: 20,
    shadowColor: '#102018',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  reliefSymptomRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  reliefSymptomChip: {
    backgroundColor: '#F3F0E5',
    borderColor: '#E2DBC6',
    borderRadius: 15,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  reliefSymptomChipSelected: {
    backgroundColor: '#B2AC88',
    borderColor: '#A39D7B',
  },
  reliefSymptomText: {
    color: '#7E795D',
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.sm,
  },
  reliefSymptomTextSelected: {
    color: '#FFFFFF',
  },
  reliefTipsBox: {
    gap: Spacing.sm,
  },
  reliefTipRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  reliefTipText: {
    color: '#15212D',
    flex: 1,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  reliefMoreButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#B2AC88',
    borderRadius: 15,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  reliefMoreButtonText: {
    color: '#FFFFFF',
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.sm,
  },
  topActionsRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.sm,
    justifyContent: 'flex-end',
    marginBottom: Spacing.sm,
  },
  settingsQuickButton: {
    alignItems: 'center',
    backgroundColor: '#B2AC88',
    borderColor: '#A39D7B',
    borderRadius: 15,
    borderWidth: 1,
    flexDirection: 'row',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
  },
  settingsQuickButtonText: {
    color: '#FFFFFF',
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
  },
  historyQuickButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E0D2',
    borderRadius: 15,
    borderWidth: 1,
    flexDirection: 'row',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
  },
  historyQuickButtonText: {
    color: '#7E795D',
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
  },
  loginQuickButton: {
    alignItems: 'center',
    backgroundColor: DS.colors.sage,
    borderColor: DS.colors.sage,
    borderRadius: DS.borderRadii.button,
    borderWidth: 1,
    flexDirection: 'row',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
  },
  loginQuickButtonText: {
    color: DS.colors.white,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
  },
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
    borderColor: '#E5E0D2',
    borderRadius: 15,
    borderWidth: 1,
    marginBottom: 0,
    padding: 24,
    ...Shadows.md,
  },
  eyebrow: {
    alignSelf: 'flex-start', alignItems: 'center', backgroundColor: 'rgba(45,206,137,0.12)',
    borderColor: 'rgba(45,206,137,0.35)', borderRadius: BorderRadius.full, borderWidth: 1,
    flexDirection: 'row', gap: 6, marginBottom: Spacing.md, paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  eyebrowText: { color: DS.colors.sageDark, fontFamily: FontFamily.sansSemiBold, fontSize: FontSize.xs },
  rankTitle: {
    color: DS.colors.navy,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xl,
    letterSpacing: -0.2,
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  xpPill: {
    backgroundColor: DS.colors.sageSoft,
    borderColor: '#CFE0D6',
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
  },
  xpPillText: {
    color: DS.colors.sageDark,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xs,
  },
  xpTrack: {
    alignSelf: 'stretch',
    backgroundColor: DS.colors.creamTrack,
    borderRadius: BorderRadius.full,
    height: 8,
    marginBottom: Spacing.md,
    overflow: 'hidden',
  },
  xpFill: {
    backgroundColor: DS.colors.sage,
    borderRadius: BorderRadius.full,
    height: '100%',
  },
  rankUpBadge: {
    alignItems: 'center',
    backgroundColor: DS.colors.sage,
    borderRadius: DS.borderRadii.button,
    flexDirection: 'row',
    gap: 6,
    marginBottom: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 7,
  },
  rankUpBadgeText: {
    color: DS.colors.white,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xs,
  },
  celebrationBadge: {
    alignItems: 'center',
    backgroundColor: '#D4A373',
    borderRadius: 20,
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
    color: DS.colors.navy, fontFamily: FontFamily.displayBold, fontSize: 44,
    letterSpacing: -0.8, lineHeight: 48,
  },
  heroSubtitle: {
    color: DS.colors.slate, fontFamily: FontFamily.sansRegular, fontSize: FontSize.md,
    lineHeight: 24, marginTop: Spacing.md, maxWidth: 560,
  },
  promptChips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.lg },
  promptChip: {
    backgroundColor: DS.colors.white, borderColor: DS.colors.border, borderRadius: DS.borderRadii.button,
    borderWidth: 1, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, ...Shadows.sm,
  },
  promptChipText: { color: DS.colors.navy, fontFamily: FontFamily.sansMedium, fontSize: FontSize.sm },
  languageTopWrap: {
    alignSelf: 'stretch',
    backgroundColor: '#FFFFFF',
    borderColor: '#DADBCF',
    borderRadius: 15,
    borderWidth: 1,
    marginBottom: Spacing.sm,
    padding: Spacing.sm,
  },
  languageRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    justifyContent: 'center',
  },
  languageButton: {
    backgroundColor: DS.colors.white,
    borderColor: DS.colors.border,
    borderRadius: DS.borderRadii.button,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  languageButtonActive: {
    backgroundColor: DS.colors.sage,
    borderColor: DS.colors.sage,
  },
  languageButtonText: {
    color: DS.colors.slate,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xs,
  },
  languageButtonTextActive: {
    color: DS.colors.white,
  },
  inputCard: {
    backgroundColor: DS.colors.white, borderColor: DS.colors.border, borderRadius: DS.borderRadii.card,
    borderWidth: 1, flex: 1, minWidth: 0, padding: Spacing.lg, ...Shadows.md,
  },
  inputHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  inputLabel: { color: DS.colors.navy, fontFamily: FontFamily.sansSemiBold, fontSize: FontSize.sm },
  clearButton: {
    alignItems: 'center',
    backgroundColor: DS.colors.creamSoft,
    borderColor: DS.colors.border,
    borderRadius: DS.borderRadii.button,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
  },
  clearButtonDisabled: { opacity: 0.45 },
  clearButtonText: {
    color: DS.colors.sageDark,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.xs,
  },
  textArea: {
    backgroundColor: '#FDFEFC', borderColor: DS.colors.border, borderRadius: DS.borderRadii.card,
    borderWidth: 1, color: DS.colors.navy, fontFamily: FontFamily.sansRegular, fontSize: FontSize.md,
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
    color: DS.colors.navy,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
  },
  scoreButtons: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  scoreButton: {
    alignItems: 'center',
    backgroundColor: DS.colors.sage,
    borderRadius: DS.borderRadii.button,
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
    backgroundColor: DS.colors.creamSoft,
    borderColor: DS.colors.border,
    borderRadius: DS.borderRadii.card,
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
    color: DS.colors.sageDark,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xs,
    marginBottom: 3,
    textTransform: 'uppercase',
  },
  todayStatusText: {
    color: DS.colors.navy,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
  },
  todayStatusAddButton: {
    alignItems: 'center',
    backgroundColor: DS.colors.sage,
    borderRadius: DS.borderRadii.button,
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
    borderColor: '#A39D7B',
    borderRadius: 15,
    borderWidth: 1,
    flexDirection: 'row',
    gap: Spacing.md,
    justifyContent: 'center',
    minHeight: 76,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    ...Shadows.md,
  },
  primaryPhotoIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 20,
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
    backgroundColor: DS.colors.creamSoft,
    borderColor: DS.colors.border,
    borderRadius: DS.borderRadii.button,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  optionChipActive: {
    backgroundColor: DS.colors.sageSoft,
    borderColor: DS.colors.sage,
  },
  optionChipText: {
    color: DS.colors.slate,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.xs,
    textTransform: 'capitalize',
  },
  optionChipTextActive: {
    color: DS.colors.navy,
  },
  generateButton: {
    alignItems: 'center', backgroundColor: DS.colors.sage, borderRadius: DS.borderRadii.button,
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
    backgroundColor: DS.colors.white,
    borderColor: '#E5E0D2',
    borderRadius: 15,
    borderWidth: 1,
    marginTop: 0,
    padding: 24,
    ...Shadows.sm,
  },
  chartCard: {
    backgroundColor: DS.colors.white,
    borderColor: '#E5E0D2',
    borderRadius: 15,
    borderWidth: 1,
    marginTop: 0,
    padding: 24,
  },
  dailyScoreCard: {
    backgroundColor: DS.colors.white,
    borderColor: '#E5E0D2',
    borderRadius: 15,
    borderWidth: 1,
    marginTop: 0,
    padding: 24,
    ...DS.shadows.soft,
  },
  dailyScoreSummary: {
    color: DS.colors.slate,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.sm,
    lineHeight: 22,
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
    color: DS.colors.slate,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xs,
  },
  chartPopup: {
    backgroundColor: DS.colors.creamSoft,
    borderColor: DS.colors.border,
    borderRadius: DS.borderRadii.card,
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
    color: DS.colors.navy,
    flex: 1,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.sm,
  },
  chartPopupText: {
    color: DS.colors.slate,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.sm,
    lineHeight: 21,
  },
  photoHistoryList: {
    gap: Spacing.sm,
  },
  photoHistoryItem: {
    alignItems: 'center',
    backgroundColor: '#FDFEFC',
    borderColor: DS.colors.border,
    borderRadius: DS.borderRadii.card,
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
    color: DS.colors.navy,
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
    backgroundColor: DS.colors.sage,
    borderRadius: DS.borderRadii.button,
    flexDirection: 'row',
    gap: Spacing.sm,
    justifyContent: 'center',
    marginTop: Spacing.md,
    minHeight: 46,
  },
  historyButtonText: {
    color: DS.colors.white,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.sm,
  },
  heatmapCard: {
    backgroundColor: DS.colors.white,
    borderColor: '#E5E0D2',
    borderRadius: 15,
    borderWidth: 1,
    marginTop: 0,
    padding: 24,
  },
  heatmapGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  heatmapCell: {
    backgroundColor: DS.colors.creamSoft,
    borderColor: DS.colors.border,
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
    color: DS.colors.slate,
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
    backgroundColor: DS.colors.white,
    borderColor: DS.colors.border,
    borderRadius: DS.borderRadii.card,
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
    color: DS.colors.sageDark,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xs,
    marginBottom: 3,
    textTransform: 'uppercase',
  },
  resultContextValue: {
    color: DS.colors.navy,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  resultsGrid: { gap: Spacing.lg, marginTop: Spacing.lg },
  resultsGridWide: { alignItems: 'stretch', flexDirection: 'row' },
  resultsPanel: {
    backgroundColor: DS.colors.white, borderColor: DS.colors.border, borderRadius: DS.borderRadii.card,
    borderWidth: 1, padding: Spacing.lg, ...Shadows.sm,
  },
  nutrientsPanelWide: { flex: 0.9 },
  recommendationPanel: { flex: 1.1 },
  sectionHeader: { marginBottom: Spacing.md },
  sectionKicker: {
    color: DS.colors.sageDark, fontFamily: FontFamily.sansBold, fontSize: FontSize.xs,
    letterSpacing: 0.8, marginBottom: 2, textTransform: 'uppercase',
  },
  sectionTitle: { color: DS.colors.navy, fontFamily: FontFamily.sansExtraBold, fontSize: 25, letterSpacing: -0.3 },
  nutrientBadgeWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  nutrientBadge: {
    alignItems: 'center',
    backgroundColor: '#102C20',
    borderColor: '#164934',
    borderRadius: DS.borderRadii.button,
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
    borderTopColor: DS.colors.border,
    borderTopWidth: 1,
    marginTop: Spacing.lg,
    paddingTop: Spacing.lg,
  },
  foodList: {
    gap: Spacing.sm,
  },
  foodItem: {
    alignItems: 'center',
    backgroundColor: '#FDFEFC',
    borderColor: DS.colors.border,
    borderRadius: DS.borderRadii.card,
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
    color: DS.colors.navy,
    flex: 1,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  foodEmptyText: {
    color: DS.colors.slate,
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  scientificSourceRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    marginTop: Spacing.md,
  },
  scientificSourceText: {
    color: DS.colors.slate,
    flex: 1,
    fontFamily: FontFamily.sansMedium,
    fontSize: 11,
    lineHeight: 16,
    opacity: 0.78,
  },
  recommendationCard: { backgroundColor: DS.colors.sageSoft, borderRadius: DS.borderRadii.card, overflow: 'hidden', padding: Spacing.lg },
  recommendationIcon: {
    alignItems: 'center', backgroundColor: Colors.secondary + '55', borderRadius: BorderRadius.full,
    height: 46, justifyContent: 'center', marginBottom: Spacing.md, width: 46,
  },
  recommendationText: { color: DS.colors.navy, fontFamily: FontFamily.displayMedium, fontSize: 25, lineHeight: 36 },
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
    backgroundColor: DS.colors.sage,
    borderRadius: DS.borderRadii.button,
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  shareButtonText: {
    color: DS.colors.white,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.sm,
  },
  welcomeState: {
    alignItems: 'center',
    backgroundColor: DS.colors.white,
    borderColor: DS.colors.border,
    borderRadius: DS.borderRadii.card,
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
    color: DS.colors.navy,
    fontFamily: FontFamily.displaySemiBold,
    fontSize: FontSize.xl,
    lineHeight: 30,
    textAlign: 'center',
  },
  welcomeText: {
    color: DS.colors.slate,
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.md,
    lineHeight: 24,
    marginTop: Spacing.sm,
    maxWidth: 560,
    textAlign: 'center',
  },
  versionText: {
    color: '#7E795D',
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xs,
    marginTop: Spacing.md,
    textAlign: 'center',
  },
  versionRightsText: {
    color: '#8B866A',
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.xs,
    marginTop: 4,
    textAlign: 'center',
  },
  pressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
});
