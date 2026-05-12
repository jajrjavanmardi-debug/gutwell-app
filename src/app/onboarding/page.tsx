import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  APP_LANGUAGE_OPTIONS,
  APP_LANGUAGE_STORAGE_KEY,
  isRtlLanguage,
  parseStoredLanguage,
  type AppLanguage,
} from '../../../lib/app-language';
import { useAuth } from '../../../contexts/AuthContext';
import { saveGuestOnboarding } from '../../../lib/guest-mode';
import { supabase } from '../../../lib/supabase';
import { saveUserProfileSettings } from '../../../lib/user-profile-settings';

type Question = {
  id: string;
  title: string;
  helper: string;
  options: { value: string; label: string }[];
};

type OnboardingCopy = {
  selectorTitle: string;
  selectorHelper: string;
  questionCount: (step: number, total: number) => string;
  summaryHeader: string;
  summaryTitle: string;
  mainGoal: string;
  focusAreas: string;
  habits: string;
  saving: string;
  startTracking: string;
  back: string;
  demoMode: string;
  signInRequired: string;
  saveError: string;
  questions: Question[];
  focusLabels: Record<string, string>;
  habitLabels: Record<string, string>;
};

const QUESTION_TOTAL = 9;

const ONBOARDING_COPY: Record<AppLanguage, OnboardingCopy> = {
  en: {
    selectorTitle: 'Choose your language',
    selectorHelper: 'English, Deutsch, and فارسی update this onboarding instantly.',
    questionCount: (step, total) => `Question ${step} of ${total}`,
    summaryHeader: 'Your personalized summary',
    summaryTitle: 'Your GutWell starting plan',
    mainGoal: 'Main goal',
    focusAreas: 'Focus areas',
    habits: 'Suggested first habits',
    saving: 'Saving profile...',
    startTracking: 'Start tracking',
    back: 'Back',
    demoMode: 'Demo Mode – data stored locally',
    signInRequired: 'Please sign in before saving your profile.',
    saveError: 'Could not save your profile. Please try again.',
    questions: [
      { id: 'bowelFrequency', title: 'How often do you have a bowel movement?', helper: 'Tap one option to continue.', options: [
        { value: '2_3_per_day', label: '2–3 per day' },
        { value: 'once_per_day', label: 'Once per day' },
        { value: 'every_2_3_days', label: 'Every 2–3 days' },
        { value: 'less_than_3_per_week', label: '< 3 per week' },
      ] },
      { id: 'stoolConsistency', title: 'How would you describe your stool consistency?', helper: 'Pick the answer closest to your usual pattern.', options: [
        { value: 'too_hard', label: 'Too hard' },
        { value: 'normal', label: 'Normal' },
        { value: 'too_loose', label: 'Too loose' },
        { value: 'varies', label: 'Varies' },
      ] },
      { id: 'symptoms', title: 'Which symptom shows up most often for you?', helper: 'Choose the one you notice most.', options: [
        { value: 'bloating', label: 'Bloating' },
        { value: 'gas', label: 'Gas' },
        { value: 'constipation', label: 'Constipation' },
        { value: 'diarrhea', label: 'Diarrhea' },
        { value: 'pain', label: 'Pain' },
        { value: 'none', label: 'None' },
      ] },
      { id: 'diet', title: 'How would you describe your current diet?', helper: 'No judgement. This helps personalize your first plan.', options: [
        { value: 'very_healthy', label: 'Very healthy' },
        { value: 'mostly_balanced', label: 'Mostly balanced' },
        { value: 'inconsistent', label: 'Inconsistent' },
        { value: 'processed', label: 'Processed' },
      ] },
      { id: 'fiber', title: 'How would you rate your fiber intake?', helper: 'Think fruits, vegetables, legumes, grains, nuts, and seeds.', options: [
        { value: 'high', label: 'High' },
        { value: 'moderate', label: 'Moderate' },
        { value: 'low', label: 'Low' },
        { value: 'dont_know', label: "Don't know" },
      ] },
      { id: 'stress', title: 'How much does stress affect your digestion?', helper: 'Stress can change gut rhythm quickly.', options: [
        { value: 'not_at_all', label: 'Not at all' },
        { value: 'a_little', label: 'A little' },
        { value: 'moderately', label: 'Moderately' },
        { value: 'strongly', label: 'Strongly' },
      ] },
      { id: 'sleep', title: 'How would you rate your sleep quality?', helper: 'Sleep helps your gut recover and regulate.', options: [
        { value: 'excellent', label: 'Excellent' },
        { value: 'good', label: 'Good' },
        { value: 'fair', label: 'Fair' },
        { value: 'poor', label: 'Poor' },
      ] },
      { id: 'triggers', title: 'Have you identified any trigger foods?', helper: 'This can be refined later as you log meals.', options: [
        { value: 'yes_clearly', label: 'Yes clearly' },
        { value: 'sometimes', label: 'Sometimes' },
        { value: 'rarely', label: 'Rarely' },
        { value: 'dont_know', label: "Don't know" },
      ] },
      { id: 'goal', title: 'What is your main goal right now?', helper: 'Your first GutWell plan starts here.', options: [
        { value: 'reduce_bloating', label: 'Reduce bloating' },
        { value: 'improve_regularity', label: 'Improve regularity' },
        { value: 'improve_consistency', label: 'Improve consistency' },
        { value: 'identify_triggers', label: 'Identify triggers' },
        { value: 'general_health', label: 'General health' },
      ] },
    ],
    focusLabels: {
      mindfulEating: 'Mindful eating',
      hydration: 'Hydration',
      fiberBalance: 'Fiber balance',
      foodPatternTracking: 'Food pattern tracking',
      dailyConsistency: 'Daily consistency',
      stressSupport: 'Stress support',
      sleepRoutine: 'Sleep routine',
      fiberQuality: 'Fiber quality',
      triggerDiscovery: 'Trigger discovery',
    },
    habitLabels: {
      mealRoutine: 'Start with one simple, repeatable meal routine each day.',
      slowEating: 'Eat more slowly and pause halfway through meals.',
      fiberWater: 'Add one fiber-rich food and one extra glass of water daily.',
      breathing: 'Take a 5-minute breathing break before one meal.',
      trackPatterns: 'Track meals and symptoms for 7 days to spot patterns.',
    },
  },
  de: {
    selectorTitle: 'Sprache wählen',
    selectorHelper: 'English, Deutsch und فارسی aktualisieren dieses Onboarding sofort.',
    questionCount: (step, total) => `Frage ${step} von ${total}`,
    summaryHeader: 'Deine persönliche Zusammenfassung',
    summaryTitle: 'Dein GutWell-Startplan',
    mainGoal: 'Hauptziel',
    focusAreas: 'Fokusbereiche',
    habits: 'Erste Gewohnheiten',
    saving: 'Profil wird gespeichert...',
    startTracking: 'Tracking starten',
    back: 'Zurück',
    demoMode: 'Demo-Modus – Daten werden lokal gespeichert',
    signInRequired: 'Bitte melde dich an, bevor du dein Profil speicherst.',
    saveError: 'Dein Profil konnte nicht gespeichert werden. Bitte versuche es erneut.',
    questions: [
      { id: 'bowelFrequency', title: 'Wie oft hast du Stuhlgang?', helper: 'Tippe eine Option an, um fortzufahren.', options: [
        { value: '2_3_per_day', label: '2–3 Mal pro Tag' },
        { value: 'once_per_day', label: 'Einmal pro Tag' },
        { value: 'every_2_3_days', label: 'Alle 2–3 Tage' },
        { value: 'less_than_3_per_week', label: '< 3 Mal pro Woche' },
      ] },
      { id: 'stoolConsistency', title: 'Wie würdest du deine Stuhlkonsistenz beschreiben?', helper: 'Wähle, was deinem üblichen Muster am nächsten kommt.', options: [
        { value: 'too_hard', label: 'Zu hart' },
        { value: 'normal', label: 'Normal' },
        { value: 'too_loose', label: 'Zu weich' },
        { value: 'varies', label: 'Wechselt' },
      ] },
      { id: 'symptoms', title: 'Welches Symptom tritt bei dir am häufigsten auf?', helper: 'Wähle das, was du am meisten bemerkst.', options: [
        { value: 'bloating', label: 'Blähbauch' },
        { value: 'gas', label: 'Gas' },
        { value: 'constipation', label: 'Verstopfung' },
        { value: 'diarrhea', label: 'Durchfall' },
        { value: 'pain', label: 'Schmerzen' },
        { value: 'none', label: 'Keine' },
      ] },
      { id: 'diet', title: 'Wie würdest du deine aktuelle Ernährung beschreiben?', helper: 'Ohne Bewertung. Das hilft beim Personalisieren.', options: [
        { value: 'very_healthy', label: 'Sehr gesund' },
        { value: 'mostly_balanced', label: 'Meist ausgewogen' },
        { value: 'inconsistent', label: 'Unregelmäßig' },
        { value: 'processed', label: 'Viele Fertigprodukte' },
      ] },
      { id: 'fiber', title: 'Wie schätzt du deine Ballaststoffzufuhr ein?', helper: 'Denk an Obst, Gemüse, Hülsenfrüchte, Getreide, Nüsse und Samen.', options: [
        { value: 'high', label: 'Hoch' },
        { value: 'moderate', label: 'Mittel' },
        { value: 'low', label: 'Niedrig' },
        { value: 'dont_know', label: 'Weiß ich nicht' },
      ] },
      { id: 'stress', title: 'Wie stark beeinflusst Stress deine Verdauung?', helper: 'Stress kann den Darmrhythmus schnell verändern.', options: [
        { value: 'not_at_all', label: 'Gar nicht' },
        { value: 'a_little', label: 'Ein wenig' },
        { value: 'moderately', label: 'Mäßig' },
        { value: 'strongly', label: 'Stark' },
      ] },
      { id: 'sleep', title: 'Wie würdest du deine Schlafqualität bewerten?', helper: 'Schlaf hilft deinem Darm, sich zu regulieren.', options: [
        { value: 'excellent', label: 'Ausgezeichnet' },
        { value: 'good', label: 'Gut' },
        { value: 'fair', label: 'Okay' },
        { value: 'poor', label: 'Schlecht' },
      ] },
      { id: 'triggers', title: 'Hast du Trigger-Lebensmittel erkannt?', helper: 'Das kannst du später mit Mahlzeiten-Logs verfeinern.', options: [
        { value: 'yes_clearly', label: 'Ja, eindeutig' },
        { value: 'sometimes', label: 'Manchmal' },
        { value: 'rarely', label: 'Selten' },
        { value: 'dont_know', label: 'Weiß ich nicht' },
      ] },
      { id: 'goal', title: 'Was ist gerade dein wichtigstes Ziel?', helper: 'Dein erster GutWell-Plan beginnt hier.', options: [
        { value: 'reduce_bloating', label: 'Blähungen reduzieren' },
        { value: 'improve_regularity', label: 'Regelmäßigkeit verbessern' },
        { value: 'improve_consistency', label: 'Konsistenz verbessern' },
        { value: 'identify_triggers', label: 'Trigger erkennen' },
        { value: 'general_health', label: 'Allgemeine Gesundheit' },
      ] },
    ],
    focusLabels: {
      mindfulEating: 'Achtsames Essen',
      hydration: 'Hydration',
      fiberBalance: 'Ballaststoff-Balance',
      foodPatternTracking: 'Essensmuster tracken',
      dailyConsistency: 'Tägliche Konstanz',
      stressSupport: 'Stress-Unterstützung',
      sleepRoutine: 'Schlafroutine',
      fiberQuality: 'Ballaststoffqualität',
      triggerDiscovery: 'Trigger entdecken',
    },
    habitLabels: {
      mealRoutine: 'Starte mit einer einfachen, wiederholbaren Mahlzeitenroutine pro Tag.',
      slowEating: 'Iss langsamer und pausiere einmal in der Mitte der Mahlzeit.',
      fiberWater: 'Ergänze täglich ein ballaststoffreiches Lebensmittel und ein Glas Wasser.',
      breathing: 'Mach vor einer Mahlzeit eine 5-minütige Atempause.',
      trackPatterns: 'Tracke Mahlzeiten und Symptome 7 Tage lang, um Muster zu erkennen.',
    },
  },
  fa: {
    selectorTitle: 'زبان را انتخاب کنید',
    selectorHelper: 'English، Deutsch و فارسی متن این شروع برنامه را فوری تغییر می‌دهند.',
    questionCount: (step, total) => `سؤال ${step} از ${total}`,
    summaryHeader: 'خلاصه شخصی تو',
    summaryTitle: 'برنامه شروع GutWell تو',
    mainGoal: 'هدف اصلی',
    focusAreas: 'بخش‌های تمرکز',
    habits: 'عادت‌های پیشنهادی اول',
    saving: 'در حال ذخیره پروفایل...',
    startTracking: 'شروع پیگیری',
    back: 'بازگشت',
    demoMode: 'حالت دمو – داده ها فقط محلی ذخیره می شوند',
    signInRequired: 'برای ذخیره پروفایل، لطفاً وارد شوید.',
    saveError: 'ذخیره پروفایل انجام نشد. لطفاً دوباره تلاش کنید.',
    questions: [
      { id: 'bowelFrequency', title: 'چند وقت یک‌بار اجابت مزاج داری؟', helper: 'برای ادامه، یک گزینه را انتخاب کن.', options: [
        { value: '2_3_per_day', label: '۲ تا ۳ بار در روز' },
        { value: 'once_per_day', label: 'یک بار در روز' },
        { value: 'every_2_3_days', label: 'هر ۲ تا ۳ روز' },
        { value: 'less_than_3_per_week', label: 'کمتر از ۳ بار در هفته' },
      ] },
      { id: 'stoolConsistency', title: 'قوام مدفوعت را چطور توصیف می‌کنی؟', helper: 'گزینه‌ای را بزن که به حالت معمولت نزدیک‌تر است.', options: [
        { value: 'too_hard', label: 'خیلی سفت' },
        { value: 'normal', label: 'طبیعی' },
        { value: 'too_loose', label: 'خیلی شل' },
        { value: 'varies', label: 'متغیر' },
      ] },
      { id: 'symptoms', title: 'کدام نشانه بیشتر برایت پیش می‌آید؟', helper: 'چیزی را انتخاب کن که بیشتر متوجهش می‌شوی.', options: [
        { value: 'bloating', label: 'نفخ' },
        { value: 'gas', label: 'گاز' },
        { value: 'constipation', label: 'یبوست' },
        { value: 'diarrhea', label: 'اسهال' },
        { value: 'pain', label: 'درد' },
        { value: 'none', label: 'هیچ‌کدام' },
      ] },
      { id: 'diet', title: 'رژیم غذایی فعلی‌ات را چطور توصیف می‌کنی؟', helper: 'بدون قضاوت. این برای شخصی‌سازی برنامه کمک می‌کند.', options: [
        { value: 'very_healthy', label: 'خیلی سالم' },
        { value: 'mostly_balanced', label: 'اغلب متعادل' },
        { value: 'inconsistent', label: 'نامنظم' },
        { value: 'processed', label: 'فرآوری‌شده' },
      ] },
      { id: 'fiber', title: 'مصرف فیبرت را چطور ارزیابی می‌کنی؟', helper: 'به میوه، سبزی، حبوبات، غلات، مغزها و دانه‌ها فکر کن.', options: [
        { value: 'high', label: 'زیاد' },
        { value: 'moderate', label: 'متوسط' },
        { value: 'low', label: 'کم' },
        { value: 'dont_know', label: 'نمی‌دانم' },
      ] },
      { id: 'stress', title: 'استرس چقدر روی هضمت اثر می‌گذارد؟', helper: 'استرس می‌تواند ریتم روده را سریع تغییر دهد.', options: [
        { value: 'not_at_all', label: 'اصلاً' },
        { value: 'a_little', label: 'کمی' },
        { value: 'moderately', label: 'متوسط' },
        { value: 'strongly', label: 'زیاد' },
      ] },
      { id: 'sleep', title: 'کیفیت خوابت را چطور ارزیابی می‌کنی؟', helper: 'خواب به روده کمک می‌کند تنظیم و بازسازی شود.', options: [
        { value: 'excellent', label: 'عالی' },
        { value: 'good', label: 'خوب' },
        { value: 'fair', label: 'قابل قبول' },
        { value: 'poor', label: 'ضعیف' },
      ] },
      { id: 'triggers', title: 'آیا غذاهای محرک خودت را شناخته‌ای؟', helper: 'بعداً با ثبت وعده‌ها دقیق‌ترش می‌کنی.', options: [
        { value: 'yes_clearly', label: 'بله، کاملاً' },
        { value: 'sometimes', label: 'گاهی' },
        { value: 'rarely', label: 'به ندرت' },
        { value: 'dont_know', label: 'نمی‌دانم' },
      ] },
      { id: 'goal', title: 'هدف اصلی‌ات الان چیست؟', helper: 'اولین برنامه GutWell تو از اینجا شروع می‌شود.', options: [
        { value: 'reduce_bloating', label: 'کاهش نفخ' },
        { value: 'improve_regularity', label: 'بهبود نظم دفع' },
        { value: 'improve_consistency', label: 'بهبود قوام' },
        { value: 'identify_triggers', label: 'شناخت محرک‌ها' },
        { value: 'general_health', label: 'سلامت عمومی' },
      ] },
    ],
    focusLabels: {
      mindfulEating: 'آگاهانه غذا خوردن',
      hydration: 'آبرسانی',
      fiberBalance: 'تعادل فیبر',
      foodPatternTracking: 'پیگیری الگوهای غذایی',
      dailyConsistency: 'پیوستگی روزانه',
      stressSupport: 'حمایت در برابر استرس',
      sleepRoutine: 'روتین خواب',
      fiberQuality: 'کیفیت فیبر',
      triggerDiscovery: 'شناخت محرک‌ها',
    },
    habitLabels: {
      mealRoutine: 'هر روز با یک روتین غذایی ساده و قابل تکرار شروع کن.',
      slowEating: 'آرام‌تر غذا بخور و وسط وعده کمی مکث کن.',
      fiberWater: 'روزانه یک غذای پرفیبر و یک لیوان آب بیشتر اضافه کن.',
      breathing: 'قبل از یک وعده، ۵ دقیقه تنفس آرام انجام بده.',
      trackPatterns: '۷ روز غذا و نشانه‌ها را ثبت کن تا الگوها مشخص شوند.',
    },
  },
};

const COLORS = {
  background: '#F8F6EE',
  card: '#FFFFFF',
  cardSelected: '#E6F3EC',
  textPrimary: '#15212D',
  textSecondary: '#4E5B66',
  accent: '#6FA987',
  border: '#DDE6DF',
};

function getAnswerLabel(language: AppLanguage, questionId: string, value: string) {
  const question = ONBOARDING_COPY[language].questions.find((item) => item.id === questionId);
  return question?.options.find((option) => option.value === value)?.label ?? value;
}

function computeFocusAreas(answers: Record<string, string>) {
  const focus = new Set<string>();
  const mainGoal = answers.goal ?? 'general_health';
  if (mainGoal === 'reduce_bloating') focus.add('mindfulEating');
  if (mainGoal === 'improve_regularity') focus.add('hydration');
  if (mainGoal === 'improve_consistency') focus.add('fiberBalance');
  if (mainGoal === 'identify_triggers') focus.add('foodPatternTracking');
  if (mainGoal === 'general_health') focus.add('dailyConsistency');
  if (answers.stress === 'moderately' || answers.stress === 'strongly') focus.add('stressSupport');
  if (answers.sleep === 'fair' || answers.sleep === 'poor') focus.add('sleepRoutine');
  if (answers.fiber === 'low' || answers.fiber === 'dont_know') focus.add('fiberQuality');
  if (answers.triggers === 'rarely' || answers.triggers === 'dont_know') focus.add('triggerDiscovery');
  return Array.from(focus).slice(0, 3);
}

function computeHabits(answers: Record<string, string>) {
  const habits = new Set<string>();
  habits.add('mealRoutine');
  if (answers.goal === 'reduce_bloating') habits.add('slowEating');
  if (answers.goal === 'improve_regularity' || answers.fiber === 'low') habits.add('fiberWater');
  if (answers.stress === 'strongly' || answers.stress === 'moderately') habits.add('breathing');
  if (answers.triggers !== 'yes_clearly') habits.add('trackPatterns');
  return Array.from(habits).slice(0, 3);
}

export default function OnboardingPage() {
  const router = useRouter();
  const { user, isGuest, loading: authLoading, refreshProfile } = useAuth();
  const [language, setLanguageState] = useState<AppLanguage>('en');
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const copy = ONBOARDING_COPY[language];
  const isRtl = isRtlLanguage(language);
  const questions = copy.questions;
  const isSummary = step >= questions.length;
  const currentQuestion = questions[step];
  const currentAnswer = currentQuestion ? answers[currentQuestion.id] : undefined;
  const progressPercent = isSummary ? 100 : Math.round(((step + 1) / questions.length) * 100);
  const isPublicWebGuestFlow = isGuest || (!user?.id && Platform.OS === 'web');

  useEffect(() => {
    AsyncStorage.getItem(APP_LANGUAGE_STORAGE_KEY)
      .then((storedLanguage) => setLanguageState(parseStoredLanguage(storedLanguage)))
      .catch(console.warn);
  }, []);

  const setLanguage = (nextLanguage: AppLanguage) => {
    setLanguageState(nextLanguage);
    AsyncStorage.setItem(APP_LANGUAGE_STORAGE_KEY, nextLanguage).catch(console.warn);
  };

  const summary = useMemo(() => ({
    mainGoal: getAnswerLabel(language, 'goal', answers.goal ?? 'general_health'),
    focusAreas: computeFocusAreas(answers).map((area) => copy.focusLabels[area]),
    habits: computeHabits(answers).map((habit) => copy.habitLabels[habit]),
  }), [answers, copy, language]);

  const handleSelect = (value: string) => {
    if (!currentQuestion) return;
    setSaveError('');
    setAnswers((prev) => ({ ...prev, [currentQuestion.id]: value }));
    setStep((prev) => Math.min(prev + 1, questions.length));
  };

  const handleStartTracking = async () => {
    if (isSaving || authLoading) return;

    const authUser = user;
    if (!authUser?.id && !isPublicWebGuestFlow) {
      setSaveError(copy.signInRequired);
      router.push('/login');
      return;
    }

    setIsSaving(true);
    setSaveError('');
    try {
      const completedAt = new Date().toISOString();
      if (isPublicWebGuestFlow) {
        await saveGuestOnboarding({
          answers,
          language,
          focusAreas: computeFocusAreas(answers),
          habits: computeHabits(answers),
          completedAt,
        });
        await saveUserProfileSettings({
          conditions: [],
          preferredLanguage: language,
        });
        await refreshProfile();
        router.replace('/(tabs)');
        return;
      }

      if (!authUser?.id) {
        throw new Error(copy.signInRequired);
      }

      const { error: profileDetailsError } = await supabase
        .from('user_profiles')
        .upsert(
          {
            user_id: authUser.id,
            onboarding_answers: answers,
            main_goal: answers.goal ?? 'general_health',
            stool_frequency_baseline: answers.bowelFrequency ?? '',
            stool_type_baseline: answers.stoolConsistency ?? '',
            symptoms_baseline: answers.symptoms ? [answers.symptoms] : [],
            diet_pattern_baseline: answers.diet ?? '',
            fiber_intake_baseline: answers.fiber ?? '',
            stress_impact_baseline: answers.stress ?? '',
            sleep_quality_baseline: answers.sleep ?? '',
            trigger_food_awareness: answers.triggers ?? '',
            focus_areas: computeFocusAreas(answers),
            first_habits: computeHabits(answers),
            preferred_language: language,
            updated_at: completedAt,
          },
          { onConflict: 'user_id' }
        );

      if (profileDetailsError) throw profileDetailsError;

      const { error: profileError } = await supabase
        .from('profiles')
        .upsert(
          {
            id: authUser.id,
            display_name: authUser.user_metadata?.display_name ?? authUser.email?.split('@')[0] ?? null,
            onboarding_completed: true,
            gut_concern: answers.symptoms ?? null,
            symptom_frequency: answers.bowelFrequency ?? null,
            goal: answers.goal ?? 'general_health',
          },
          { onConflict: 'id' }
        );

      if (profileError) throw profileError;

      await refreshProfile();
      router.replace('/(tabs)');
    } catch (error) {
      console.error('Failed to save onboarding profile:', error);
      setSaveError(error instanceof Error ? error.message : copy.saveError);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.languageCard}>
          <Text style={[styles.selectorTitle, isRtl && styles.rtlText]}>{copy.selectorTitle}</Text>
          <Text style={[styles.selectorHelper, isRtl && styles.rtlText]}>{copy.selectorHelper}</Text>
          <View style={[styles.languageRow, isRtl && styles.rtlRow]}>
            {APP_LANGUAGE_OPTIONS.map((option) => {
              const selected = language === option.value;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => setLanguage(option.value)}
                  style={[styles.languageButton, selected && styles.languageButtonSelected]}
                >
                  <Text style={[styles.languageButtonText, selected && styles.languageButtonTextSelected]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {isPublicWebGuestFlow ? (
          <View style={[styles.demoBadge, isRtl && styles.rtlRow]}>
            <Text style={[styles.demoBadgeDot, isRtl && styles.rtlText]}>•</Text>
            <Text style={[styles.demoBadgeText, isRtl && styles.rtlText]}>{copy.demoMode}</Text>
          </View>
        ) : null}

        <View style={styles.progressWrap}>
          <View style={[styles.progressTrack, isRtl && styles.progressTrackRtl]}>
            <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
          </View>
          <Text style={[styles.progressText, isRtl && styles.rtlText]}>
            {isSummary ? copy.summaryHeader : copy.questionCount(step + 1, QUESTION_TOTAL)}
          </Text>
        </View>

        {!isSummary ? (
          <>
            <View style={styles.card}>
              <Text style={[styles.questionTitle, isRtl && styles.rtlText]}>{currentQuestion.title}</Text>
              <Text style={[styles.questionSubtitle, isRtl && styles.rtlText]}>{currentQuestion.helper}</Text>
            </View>
            <View style={styles.optionList}>
              {currentQuestion.options.map((option) => {
                const selected = currentAnswer === option.value;
                return (
                  <Pressable
                    key={option.value}
                    onPress={() => handleSelect(option.value)}
                    style={[styles.optionButton, selected && styles.optionButtonSelected]}
                  >
                    <Text style={[styles.optionText, selected && styles.optionTextSelected, isRtl && styles.rtlText]}>
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : (
          <View style={styles.card}>
            <Text style={[styles.summaryTitle, isRtl && styles.rtlText]}>{copy.summaryTitle}</Text>
            <Text style={[styles.sectionTitle, isRtl && styles.rtlText]}>{copy.mainGoal}</Text>
            <Text style={[styles.sectionBody, isRtl && styles.rtlText]}>{summary.mainGoal}</Text>
            <Text style={[styles.sectionTitle, isRtl && styles.rtlText]}>{copy.focusAreas}</Text>
            {summary.focusAreas.map((area) => (
              <Text key={area} style={[styles.sectionBody, isRtl && styles.rtlText]}>{`\u2022 ${area}`}</Text>
            ))}
            <Text style={[styles.sectionTitle, isRtl && styles.rtlText]}>{copy.habits}</Text>
            {summary.habits.map((habit) => (
              <Text key={habit} style={[styles.sectionBody, isRtl && styles.rtlText]}>{`\u2022 ${habit}`}</Text>
            ))}
            {saveError ? (
              <Text style={[styles.errorText, isRtl && styles.rtlText]}>{saveError}</Text>
            ) : null}
            <Pressable
              onPress={handleStartTracking}
              disabled={isSaving || authLoading}
              style={[styles.startButton, (isSaving || authLoading) && styles.startButtonDisabled]}
            >
              <Text style={styles.startButtonText}>
                {isSaving || authLoading ? copy.saving : copy.startTracking}
              </Text>
            </Pressable>
          </View>
        )}

        {step > 0 && !isSummary ? (
          <Pressable onPress={() => setStep((prev) => Math.max(prev - 1, 0))} style={styles.backButton}>
            <Text style={styles.backButtonText}>{copy.back}</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 16, paddingBottom: 40, gap: 18 },
  languageCard: { backgroundColor: COLORS.card, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border, padding: 16, gap: 10 },
  selectorTitle: { color: COLORS.textPrimary, fontSize: 18, fontWeight: '700' },
  selectorHelper: { color: COLORS.textSecondary, fontSize: 14, lineHeight: 20 },
  languageRow: { flexDirection: 'row', gap: 8 },
  languageButton: { flex: 1, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, backgroundColor: '#F9FBF8', paddingVertical: 12, alignItems: 'center' },
  languageButtonSelected: { borderColor: COLORS.accent, backgroundColor: COLORS.cardSelected },
  languageButtonText: { color: COLORS.textPrimary, fontSize: 15, fontWeight: '700' },
  languageButtonTextSelected: { color: '#245A3F' },
  demoBadge: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#E8F5EC',
    borderColor: '#BFE5CB',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  demoBadgeDot: {
    color: COLORS.accent,
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 18,
  },
  demoBadgeText: {
    color: '#276E3A',
    fontSize: 12,
    fontWeight: '700',
  },
  progressWrap: { gap: 10 },
  progressTrack: { height: 10, borderRadius: 999, backgroundColor: '#E8EDE9', overflow: 'hidden', alignItems: 'flex-start' },
  progressTrackRtl: { alignItems: 'flex-end' },
  progressFill: { height: '100%', backgroundColor: COLORS.accent },
  progressText: { color: COLORS.textSecondary, fontSize: 15, fontWeight: '500' },
  card: { backgroundColor: COLORS.card, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border, padding: 20, gap: 10 },
  questionTitle: { color: COLORS.textPrimary, fontSize: 28, lineHeight: 34, fontWeight: '700' },
  questionSubtitle: { color: COLORS.textSecondary, fontSize: 16, lineHeight: 22 },
  optionList: { gap: 12 },
  optionButton: { borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.card, paddingVertical: 16, paddingHorizontal: 18 },
  optionButtonSelected: { borderColor: COLORS.accent, backgroundColor: COLORS.cardSelected },
  optionText: { color: COLORS.textPrimary, fontSize: 18, fontWeight: '500' },
  optionTextSelected: { fontWeight: '600' },
  summaryTitle: { color: COLORS.textPrimary, fontSize: 30, lineHeight: 36, fontWeight: '700', marginBottom: 8 },
  sectionTitle: { color: COLORS.textPrimary, fontSize: 18, fontWeight: '700', marginTop: 8 },
  sectionBody: { color: COLORS.textSecondary, fontSize: 16, lineHeight: 22 },
  startButton: { marginTop: 12, borderRadius: 16, backgroundColor: COLORS.accent, paddingVertical: 14, alignItems: 'center' },
  startButtonDisabled: { opacity: 0.8 },
  startButtonText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  errorText: { color: '#C1444B', fontSize: 14, fontWeight: '700', lineHeight: 20 },
  backButton: { borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, backgroundColor: '#FFFFFF', paddingVertical: 10, paddingHorizontal: 16, alignSelf: 'flex-start' },
  backButtonText: { color: COLORS.textPrimary, fontSize: 16, fontWeight: '600' },
  rtlRow: { flexDirection: 'row-reverse' },
  rtlText: { textAlign: 'right', writingDirection: 'rtl' },
});
