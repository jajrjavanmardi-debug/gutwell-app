import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Toast } from '../../components/ui/Toast';
import { useAuth } from '../../contexts/AuthContext';
import { BorderRadius, Colors, FontFamily, FontSize, Shadows, Spacing } from '../../constants/theme';
import {
  parseRnVoiceError,
  teardownExpoSpeechRecognition,
  tryStartExpoSpeechRecognition,
} from '../../lib/meal-voice-session';
import { enqueue } from '../../lib/offline-queue';
import { canUseNativeSpeechToText } from '../../lib/runtime-environment';
import { analyzeMealPhoto, reviseMealAnalysis } from '../../lib/RecommendationEngine';
import {
  APP_LANGUAGE_STORAGE_KEY,
  isRtlLanguage as isAppRtlLanguage,
  parseStoredLanguage,
  type AppLanguage,
} from '../../lib/app-language';
import {
  applyDynamicMealImpactScore,
  extractMealName,
  getPhotoAnalysisHistory,
  resolveMealImpactScore,
  savePhotoAnalysisHistoryItem,
} from '../../lib/photo-analysis-history';
import { getRecentSupplements, type SupplementHistoryItem } from '../../lib/supplement-history';
import { supabase } from '../../lib/supabase';
import {
  addXpForAction,
  getUserProgressProfile,
  recordTriggerFeedback,
  type TriggerFeedbackItem,
} from '../../lib/user-progress';
import {
  getPromptConditions,
  getUserProfileSettings,
  type MedicalCondition,
} from '../../lib/user-profile-settings';

type WizardStep = 1 | 2 | 3;
/** When set to `Germany`, skips GPS and fixes AI context to Nürtingen (dev/testing only). */
const DEV_LOCATION_OVERRIDE = process.env.EXPO_PUBLIC_DEV_LOCATION_OVERRIDE?.trim() ?? '';

const SYMPTOM_OPTIONS = [
  { key: 'bloating', promptLabel: 'Bloating', labels: { en: 'Bloating', de: 'Blähungen', fa: 'نفخ' } },
  { key: 'pain', promptLabel: 'Stomach pain', labels: { en: 'Pain', de: 'Schmerzen', fa: 'درد' } },
  { key: 'heaviness', promptLabel: 'Heaviness', labels: { en: 'Heaviness', de: 'Schweregefühl', fa: 'سنگینی' } },
  { key: 'gas', promptLabel: 'Gas', labels: { en: 'Gas', de: 'Gas', fa: 'گاز' } },
  { key: 'cramps', promptLabel: 'Cramps', labels: { en: 'Cramps', de: 'Krämpfe', fa: 'گرفتگی' } },
  { key: 'nausea', promptLabel: 'Nausea', labels: { en: 'Nausea', de: 'Übelkeit', fa: 'تهوع' } },
  { key: 'reflux', promptLabel: 'Reflux', labels: { en: 'Reflux', de: 'Reflux', fa: 'ریفلاکس' } },
  { key: 'diarrhea', promptLabel: 'Diarrhea', labels: { en: 'Diarrhea', de: 'Durchfall', fa: 'اسهال' } },
  { key: 'constipation', promptLabel: 'Constipation', labels: { en: 'Constipation', de: 'Verstopfung', fa: 'یبوست' } },
  { key: 'lowEnergy', promptLabel: 'Low energy', labels: { en: 'Low energy', de: 'Wenig Energie', fa: 'انرژی کم' } },
] as const;

type SymptomKey = (typeof SYMPTOM_OPTIONS)[number]['key'];

const copy = {
  en: {
    back: 'Back',
    title: 'Photo Analysis',
    wizardStep1Subtitle: 'Step 1 of 4 — Capture',
    wizardStep2Subtitle: 'Step 2 of 4 — Voice & feeling',
    wizardStep3Subtitle: 'Step 3 of 4 — Analysis',
    wizardStep4Hint: 'Step 4 of 4 — Final check',
    wizardNext: 'Next',
    changePhoto: 'Change photo',
    step2Prompt: 'What is this food? How do you feel?',
    generateAnalysis: 'Generate Analysis',
    isThisAccurate: 'Is this accurate?',
    yes: 'Yes',
    no: 'No',
    correctionPlaceholder: 'Tell us what to fix…',
    applyCorrection: 'Apply correction',
    recommendationUnchanged: 'Recommendation remains unchanged.',
    subtitle: 'Four steps: capture a photo, describe with voice or text, review the analysis, then confirm accuracy.',
    profileContext: 'Personalized for your gut profile, symptoms, and selected conditions',
    findingLocation: 'Finding nearby food options...',
    usingLocation: 'Using local context:',
    locationUnavailable: 'Location unavailable. Suggestions will stay general.',
    takePhoto: 'Take a Photo',
    takePhotoText: 'Opens your camera. When you have a clear shot, tap Next.',
    chooseGallery: 'Choose from Gallery',
    chooseGalleryText: 'Pick a meal photo, then tap Next.',
    analyzing: 'Analyzing your photo and notes with your gut profile...',
    analyzingBrand: 'NutriFlow',
    resultTitle: 'Personalized gut guidance',
    symptomsLabel: 'Symptoms & notes',
    symptomSelectorLabel: 'Select symptoms',
    symptomSelectorHint: 'Choose all that apply so the score reflects your current reaction.',
    symptomsPlaceholder: 'Before taking a photo you can note symptoms; after capture, describe how you feel.',
    howYouFeelLabel: 'Meal details & extra notes',
    howYouFeelPlaceholder: 'Example: This is lentil soup with onions. I ate a large bowl.',
    photoCapturedPrompt: 'Photo captured! Speak or type how you feel.',
    analyzeCombined: 'Analyze Meal',
    feelingsRequiredTitle: 'Add meal context first',
    feelingsRequiredMessage: 'Select at least one symptom or type a short meal note before generating the analysis.',
    share: 'Share Result',
    scoreLabel: 'Meal Impact Score',
    shareTitle: 'My NutriFlow meal analysis',
    snapshotHeading: 'NutriFlow meal snapshot',
    shareErrorTitle: 'Sharing unavailable',
    shareErrorMessage: 'Unable to open sharing right now.',
    disagree: "This didn't work for my body",
    planBTitle: 'Plan B',
    planBText: "I'm sorry this suggestion bothered you. I marked it as a trigger and your safer Plan B is: pause this food for now, sip ginger or peppermint tea, hydrate, and choose a very simple meal like rice, banana, or soup until your gut settles.",
    instantReliefTitle: 'Instant Relief',
    instantReliefText: 'Try peppermint tea, a warm compress on your belly, slow breathing, hydration, and rest. Pause the suspected trigger food for now. If pain is severe, worsening, or unusual, get medical help.',
    painApology: "I'm sorry this food may have bothered your body. Let's switch to a safer Plan B first.",
    medicalDisclaimer:
      'Important note: This analysis is for informational purposes only and does not replace a medical diagnosis. Seek medical care if you notice severe symptoms.',
    rankUp: 'Rank Up',
    chatPlaceholder: 'Correct or add details...',
    send: 'Send',
    newScan: 'New Scan',
    voiceUnavailableTitle: 'Voice unavailable',
    voiceUnavailableMessage:
      'Speech-to-text could not start. You can still type. If this persists, check microphone and speech recognition permissions for NutriFlow.',
    microphoneDisabledToast:
      'Microphone disabled. Please enable Microphone permissions in your Phone Settings (Settings > NutriFlow > Microphone).',
    voiceInputA11yLabel: 'Voice input',
    voiceInputA11yHint: 'Hold to record; release to finish.',
    correcting: 'Updating with your correction...',
    recording: 'Recording…',
    photoAnalysisFailedTitle: 'Photo analysis failed',
    photoAnalysisFailedTryAgain: 'Please try again.',
    photoUnavailableTitle: 'Photo unavailable',
    photoUnavailableMessage: 'Could not read the photo data. Please try again.',
    cameraNeededTitle: 'Camera access needed',
    cameraNeededMessage: 'Please allow camera access to take a meal photo.',
    libraryNeededTitle: 'Photo library access needed',
    libraryNeededMessage: 'Please allow photo library access to choose a meal photo.',
    correctionFailedTitle: 'Correction failed',
    correctionFailedTryAgain: 'Please try again.',
    logMeal: 'Log meal',
    logMealSuccess: 'Meal logged!',
    logMealFailed: 'Could not save meal',
    logMealOffline: 'Saved offline — will sync when connected',
    loginRequired: 'Please sign in to log meals.',
    pendingScore: 'Pending',
    photoMealDefault: 'Photo meal',
    analysisInsightTitle: 'Analysis Insight',
    scientificSource: 'Scientific Source: USDA FoodData Central & Localized AI Adaptation.',
    insightFallbacks: {
      fructan: 'High fructan content detected',
      ibsTrigger: 'Potential IBS trigger identified',
      lowFiber: 'Low fiber density for your gut profile',
      inflammatory: 'High inflammatory food combination',
      symptomMatch: 'Current symptoms weighted in the score',
      gentle: 'Gentle digestion profile identified',
      profileSensitive: 'Adjusted for your selected gut profile',
    },
    expoGoTextOnlyHint:
      'Expo Go (development): hold-to-talk voice is off. Describe your meal and how you feel below — analysis, Nürtingen-style prompts, and the 4-step flow still work.',
  },
  de: {
    back: 'Zurück',
    title: 'Fotoanalyse',
    wizardStep1Subtitle: 'Schritt 1 von 4 — Aufnahme',
    wizardStep2Subtitle: 'Schritt 2 von 4 — Stimme & Befinden',
    wizardStep3Subtitle: 'Schritt 3 von 4 — Analyse',
    wizardStep4Hint: 'Schritt 4 von 4 — Abschluss',
    wizardNext: 'Weiter',
    changePhoto: 'Foto ändern',
    step2Prompt: 'Was ist das für Essen? Wie fühlst du dich?',
    generateAnalysis: 'Analyse erstellen',
    isThisAccurate: 'Stimmt das so?',
    yes: 'Ja',
    no: 'Nein',
    correctionPlaceholder: 'Was sollen wir korrigieren?',
    applyCorrection: 'Korrektur anwenden',
    recommendationUnchanged: 'Die Empfehlung bleibt unverändert.',
    subtitle: 'Vier Schritte: Foto, Beschreibung per Sprache oder Text, Analyse prüfen, Genauigkeit bestätigen.',
    profileContext: 'Personalisiert für dein Darmprofil, Symptome und ausgewählte Bedingungen',
    findingLocation: 'Suche nach lokalen Essensoptionen...',
    usingLocation: 'Lokaler Kontext:',
    locationUnavailable: 'Standort nicht verfügbar. Vorschläge bleiben allgemein.',
    takePhoto: 'Foto aufnehmen',
    takePhotoText: 'Öffnet die Kamera. Wenn das Foto passt, tippe auf Weiter.',
    chooseGallery: 'Aus Galerie wählen',
    chooseGalleryText: 'Wähle ein Mahlzeitenfoto, dann tippe auf Weiter.',
    analyzing: 'Foto und Notizen werden mit deinem Darmprofil ausgewertet...',
    analyzingBrand: 'NutriFlow',
    resultTitle: 'Personalisierte Darm-Empfehlung',
    symptomsLabel: 'Symptome & Notizen',
    symptomSelectorLabel: 'Symptome auswählen',
    symptomSelectorHint: 'Wähle alles aus, was zutrifft, damit der Score deine aktuelle Reaktion berücksichtigt.',
    symptomsPlaceholder: 'Vor dem Foto optional Symptome; nach der Aufnahme beschreibst du dein Befinden.',
    howYouFeelLabel: 'Mahlzeitdetails & Zusatznotizen',
    howYouFeelPlaceholder: 'Zum Beispiel: Das ist Linsensuppe mit Zwiebeln. Ich habe eine große Schüssel gegessen.',
    photoCapturedPrompt: 'Foto gespeichert! Sprich oder tippe, wie du dich fühlst.',
    analyzeCombined: 'Mahlzeit analysieren',
    feelingsRequiredTitle: 'Erst Kontext ergänzen',
    feelingsRequiredMessage: 'Wähle mindestens ein Symptom aus oder tippe eine kurze Mahlzeitnotiz, bevor du die Analyse erstellst.',
    share: 'Ergebnis teilen',
    scoreLabel: 'Mahlzeiten-Score',
    shareTitle: 'Meine NutriFlow-Mahlzeitenanalyse',
    snapshotHeading: 'NutriFlow Mahlzeiten-Snapshot',
    shareErrorTitle: 'Teilen nicht verfügbar',
    shareErrorMessage: 'Teilen kann gerade nicht geöffnet werden.',
    disagree: "Das hat meinem Körper nicht gutgetan",
    planBTitle: 'Plan B',
    planBText: 'Es tut mir leid, dass diese Empfehlung dir nicht gutgetan hat. Ich habe sie als Trigger gespeichert. Sicherer Plan B: pausiere dieses Lebensmittel, trinke Ingwer- oder Pfefferminztee, bleib hydriert und iss vorerst etwas Einfaches wie Reis, Banane oder Suppe.',
    instantReliefTitle: 'Soforthilfe',
    instantReliefText: 'Versuche Pfefferminztee, eine warme Kompresse auf dem Bauch, ruhiges Atmen, Wasser und etwas Ruhe. Pausiere das vermutete Trigger-Lebensmittel. Bei starken, zunehmenden oder ungewöhnlichen Schmerzen bitte medizinische Hilfe holen.',
    painApology: 'Es tut mir leid, dass dieses Essen deinem Körper nicht gutgetan haben könnte. Lass uns zuerst zu einem sichereren Plan B wechseln.',
    medicalDisclaimer:
      'Wichtiger Hinweis: Diese Analyse dient nur der Information und ersetzt keine ärztliche Diagnose. Suchen Sie bei schweren Symptomen einen Arzt auf.',
    rankUp: 'Levelaufstieg',
    chatPlaceholder: 'Korrigieren oder Details ergänzen...',
    send: 'Senden',
    newScan: 'Neuer Scan',
    voiceUnavailableTitle: 'Sprache nicht verfügbar',
    voiceUnavailableMessage:
      'Spracherkennung konnte nicht gestartet werden. Du kannst tippen. Prüfe ggf. Mikrofon- und Spracherkennungs-Berechtigungen für NutriFlow.',
    microphoneDisabledToast:
      'Mikrofon deaktiviert. Bitte aktiviere die Mikrofon-Berechtigung in den Telefoneinstellungen (Einstellungen > NutriFlow > Mikrofon).',
    voiceInputA11yLabel: 'Spracheingabe',
    voiceInputA11yHint: 'Halten zum Aufnehmen; loslassen zum Beenden.',
    correcting: 'Analyse wird mit deiner Korrektur aktualisiert...',
    recording: 'Aufnahme…',
    photoAnalysisFailedTitle: 'Fotoanalyse fehlgeschlagen',
    photoAnalysisFailedTryAgain: 'Bitte versuche es erneut.',
    photoUnavailableTitle: 'Foto nicht verfügbar',
    photoUnavailableMessage: 'Die Fotodaten konnten nicht gelesen werden. Bitte erneut versuchen.',
    cameraNeededTitle: 'Kamerazugriff nötig',
    cameraNeededMessage: 'Bitte erlaube den Kamerazugriff, um ein Mahlzeitenfoto aufzunehmen.',
    libraryNeededTitle: 'Fotomediathek-Zugriff nötig',
    libraryNeededMessage: 'Bitte erlaube den Zugriff auf die Fotomediathek, um ein Bild auszuwählen.',
    correctionFailedTitle: 'Korrektur fehlgeschlagen',
    correctionFailedTryAgain: 'Bitte versuche es erneut.',
    logMeal: 'Mahlzeit speichern',
    logMealSuccess: 'Mahlzeit gespeichert!',
    logMealFailed: 'Mahlzeit konnte nicht gespeichert werden',
    logMealOffline: 'Offline gespeichert — Synchronisation folgt bei Verbindung',
    loginRequired: 'Bitte melde dich an, um Mahlzeiten zu speichern.',
    pendingScore: 'Ausstehend',
    photoMealDefault: 'Mahlzeit (Foto)',
    analysisInsightTitle: 'Analyse-Einblick',
    scientificSource: 'Wissenschaftliche Quelle: USDA FoodData Central & lokalisierte KI-Anpassung.',
    insightFallbacks: {
      fructan: 'Hoher Fruktangehalt erkannt',
      ibsTrigger: 'Möglicher Reizdarm-Trigger identifiziert',
      lowFiber: 'Geringe Ballaststoffdichte für dein Darmprofil',
      inflammatory: 'Entzündungsfördernde Lebensmittelkombination',
      symptomMatch: 'Aktuelle Symptome im Score berücksichtigt',
      gentle: 'Sanftes Verdauungsprofil erkannt',
      profileSensitive: 'An dein ausgewähltes Darmprofil angepasst',
    },
    expoGoTextOnlyHint:
      'Expo Go (Entwicklung): Halten-zum-Sprechen ist aus. Beschreib Mahlzeit und Befinden im Textfeld — Analyse, Nürtingen-Hinweise und der 4-Schritte-Ablauf bleiben aktiv.',
  },
  fa: {
    back: 'بازگشت',
    title: 'تحلیل عکس غذا',
    wizardStep1Subtitle: 'مرحله ۱ از ۴ - عکس',
    wizardStep2Subtitle: 'مرحله ۲ از ۴ - صدا و احساس',
    wizardStep3Subtitle: 'مرحله ۳ از ۴ - تحلیل',
    wizardStep4Hint: 'مرحله ۴ از ۴ - بررسی نهایی',
    wizardNext: 'بعدی',
    changePhoto: 'تغییر عکس',
    step2Prompt: 'این غذا چیست؟ چه احساسی دارید؟',
    generateAnalysis: 'ایجاد تحلیل',
    isThisAccurate: 'این تحلیل درست است؟',
    yes: 'بله',
    no: 'خیر',
    correctionPlaceholder: 'بگویید چه چیزی را اصلاح کنیم...',
    applyCorrection: 'اعمال اصلاح',
    recommendationUnchanged: 'پیشنهاد بدون تغییر ماند.',
    subtitle: 'چهار مرحله: عکس بگیرید، با صدا یا متن توضیح دهید، تحلیل را ببینید و دقت آن را تأیید کنید.',
    profileContext: 'شخصی سازی شده بر اساس پروفایل گوارش، علائم و شرایط انتخاب شده شما',
    findingLocation: 'در حال یافتن گزینه های غذایی نزدیک...',
    usingLocation: 'استفاده از زمینه محلی:',
    locationUnavailable: 'موقعیت در دسترس نیست. پیشنهادها عمومی می مانند.',
    takePhoto: 'گرفتن عکس',
    takePhotoText: 'دوربین را باز می کند. وقتی عکس واضح بود، روی بعدی بزنید.',
    chooseGallery: 'انتخاب از گالری',
    chooseGalleryText: 'یک عکس غذا انتخاب کنید، سپس روی بعدی بزنید.',
    analyzing: 'در حال تحلیل عکس و یادداشت ها با پروفایل گوارش شما...',
    analyzingBrand: 'NutriFlow',
    resultTitle: 'تأثیر غذا',
    symptomsLabel: 'علائم و یادداشت ها',
    symptomSelectorLabel: 'انتخاب علائم',
    symptomSelectorHint: 'هر موردی را که صدق می کند انتخاب کنید تا امتیاز بر اساس واکنش فعلی شما باشد.',
    symptomsPlaceholder: 'قبل از عکس می توانید علائم را بنویسید؛ بعد از عکس، احساس خود را توضیح دهید.',
    howYouFeelLabel: 'جزئیات غذا و یادداشت های بیشتر',
    howYouFeelPlaceholder: 'مثال: این سوپ عدس با پیاز است. یک کاسه بزرگ خوردم.',
    photoCapturedPrompt: 'عکس ثبت شد! احساس خود را بگویید یا بنویسید.',
    analyzeCombined: 'تحلیل غذا',
    feelingsRequiredTitle: 'ابتدا زمینه غذا را اضافه کنید',
    feelingsRequiredMessage: 'قبل از ایجاد تحلیل، حداقل یک علامت انتخاب کنید یا یک یادداشت کوتاه درباره غذا بنویسید.',
    share: 'اشتراک گذاری نتیجه',
    scoreLabel: 'امتیاز تأثیر غذا',
    shareTitle: 'تحلیل غذای NutriFlow من',
    snapshotHeading: 'خلاصه غذای NutriFlow',
    shareErrorTitle: 'اشتراک گذاری در دسترس نیست',
    shareErrorMessage: 'اکنون امکان باز کردن اشتراک گذاری وجود ندارد.',
    disagree: 'این برای بدن من خوب نبود',
    planBTitle: 'برنامه جایگزین',
    planBText: 'متأسفم که این پیشنهاد حال شما را بدتر کرد. آن را به عنوان محرک ثبت کردم. برنامه امن تر: فعلا این غذا را کنار بگذارید، چای زنجبیل یا نعناع بنوشید، آب کافی بخورید و تا آرام شدن معده یک غذای ساده مثل برنج، موز یا سوپ انتخاب کنید.',
    instantReliefTitle: 'آرام سازی فوری',
    instantReliefText: 'چای نعناع، کمپرس گرم روی شکم، تنفس آرام، آب کافی و استراحت را امتحان کنید. فعلا غذای محرک احتمالی را کنار بگذارید. اگر درد شدید، بدترشونده یا غیرمعمول است، کمک پزشکی بگیرید.',
    painApology: 'متأسفم که این غذا ممکن است بدن شما را اذیت کرده باشد. اول سراغ یک برنامه جایگزین امن تر برویم.',
    medicalDisclaimer:
      'نکته مهم: این تحلیل فقط برای اطلاع است و جایگزین تشخیص پزشکی نیست. اگر علائم شدید دارید، کمک پزشکی بگیرید.',
    rankUp: 'ارتقای رتبه',
    chatPlaceholder: 'اصلاح کنید یا جزئیات اضافه کنید...',
    send: 'ارسال',
    newScan: 'اسکن جدید',
    voiceUnavailableTitle: 'صدا در دسترس نیست',
    voiceUnavailableMessage:
      'تبدیل گفتار به متن شروع نشد. همچنان می توانید تایپ کنید. اگر ادامه داشت، مجوزهای میکروفون و تشخیص گفتار NutriFlow را بررسی کنید.',
    microphoneDisabledToast:
      'میکروفون غیرفعال است. لطفا مجوز میکروفون را در تنظیمات گوشی فعال کنید (Settings > NutriFlow > Microphone).',
    voiceInputA11yLabel: 'ورودی صوتی',
    voiceInputA11yHint: 'برای ضبط نگه دارید؛ برای پایان رها کنید.',
    correcting: 'در حال به روزرسانی با اصلاح شما...',
    recording: 'در حال ضبط...',
    photoAnalysisFailedTitle: 'تحلیل عکس ناموفق بود',
    photoAnalysisFailedTryAgain: 'لطفا دوباره تلاش کنید.',
    photoUnavailableTitle: 'عکس در دسترس نیست',
    photoUnavailableMessage: 'داده های عکس خوانده نشد. لطفا دوباره تلاش کنید.',
    cameraNeededTitle: 'دسترسی به دوربین لازم است',
    cameraNeededMessage: 'برای گرفتن عکس غذا، اجازه دسترسی به دوربین را بدهید.',
    libraryNeededTitle: 'دسترسی به گالری لازم است',
    libraryNeededMessage: 'برای انتخاب عکس غذا، اجازه دسترسی به گالری را بدهید.',
    correctionFailedTitle: 'اصلاح ناموفق بود',
    correctionFailedTryAgain: 'لطفا دوباره تلاش کنید.',
    logMeal: 'ثبت غذا',
    logMealSuccess: 'غذا ثبت شد!',
    logMealFailed: 'ذخیره غذا ممکن نبود',
    logMealOffline: 'آفلاین ذخیره شد - پس از اتصال همگام می شود',
    loginRequired: 'برای ثبت غذا وارد شوید.',
    pendingScore: 'در انتظار',
    photoMealDefault: 'غذای عکس',
    analysisInsightTitle: 'بینش تحلیل',
    scientificSource: 'منبع علمی: USDA FoodData Central و سازگاری محلی هوش مصنوعی.',
    insightFallbacks: {
      fructan: 'محتوای بالای فروکتان شناسایی شد',
      ibsTrigger: 'محرک احتمالی IBS شناسایی شد',
      lowFiber: 'تراکم فیبر برای پروفایل گوارش شما پایین است',
      inflammatory: 'ترکیب غذایی التهاب زا شناسایی شد',
      symptomMatch: 'علائم فعلی در امتیاز لحاظ شد',
      gentle: 'الگوی هضم ملایم شناسایی شد',
      profileSensitive: 'بر اساس پروفایل گوارش انتخابی شما تنظیم شد',
    },
    expoGoTextOnlyHint:
      'Expo Go (توسعه): نگه داشتن برای صحبت غیرفعال است. غذا و احساس خود را در کادر متن توضیح دهید؛ تحلیل و روند چهار مرحله ای همچنان کار می کند.',
  },
} as const;

type NativeLocationModule = {
  Accuracy: { Balanced: number };
  requestForegroundPermissionsAsync: () => Promise<{ status: string }>;
  getCurrentPositionAsync: (options: { accuracy: number }) => Promise<{
    coords: { latitude: number; longitude: number };
  }>;
  reverseGeocodeAsync: (coords: { latitude: number; longitude: number }) => Promise<{
    city?: string | null;
    district?: string | null;
    subregion?: string | null;
    region?: string | null;
    country?: string | null;
  }[]>;
};

type VoiceModule = {
  start: (locale?: string) => Promise<void>;
  stop: () => Promise<void>;
  destroy?: () => Promise<void>;
  removeAllListeners?: () => void;
  onSpeechResults?: (event: { value?: string[] }) => void;
  onSpeechPartialResults?: (event: { value?: string[] }) => void;
  onSpeechError?: (event: unknown) => void;
};

function formatTriggerMemories(items: TriggerFeedbackItem[]): string[] {
  return items.map((item) =>
    [
      item.mealName,
      item.adviceSummary,
      item.symptoms?.length ? `Symptoms: ${item.symptoms.join(', ')}` : '',
    ]
      .filter(Boolean)
      .join(' - ')
  );
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('Unable to read image file.'));
    reader.readAsDataURL(file);
  });
}

let loadedVoiceModule: VoiceModule | null = null;

async function loadVoiceModule(): Promise<VoiceModule | null> {
  try {
    const voiceModule = await import('@react-native-voice/voice');
    const Voice = (voiceModule.default ?? voiceModule) as VoiceModule;

    if (typeof Voice.start !== 'function' || typeof Voice.stop !== 'function') {
      return null;
    }

    loadedVoiceModule = Voice;
    return Voice;
  } catch (error) {
    console.warn('Voice module unavailable:', error);
    return null;
  }
}

function getMealTypeForClock(): 'breakfast' | 'lunch' | 'dinner' | 'snack' {
  const hour = new Date().getHours();
  if (hour < 11) return 'breakfast';
  if (hour < 14) return 'lunch';
  if (hour < 17) return 'snack';
  return 'dinner';
}

function formatLocationContext(
  coordinates: { latitude: number; longitude: number },
  place?: {
    city?: string | null;
    district?: string | null;
    subregion?: string | null;
    region?: string | null;
    country?: string | null;
  }
): string {
  const areaParts = [
    place?.city,
    place?.district,
    place?.subregion,
    place?.region,
    place?.country,
  ].filter(Boolean);
  const area = Array.from(new Set(areaParts)).join(', ') || 'Unknown area';
  const latitude = coordinates.latitude.toFixed(4);
  const longitude = coordinates.longitude.toFixed(4);

  return `${area} (${latitude}, ${longitude})`;
}

/** City / region / country for AI retail prompts (no coordinates). */
function formatRetailLocationHint(place?: {
  city?: string | null;
  district?: string | null;
  subregion?: string | null;
  region?: string | null;
  country?: string | null;
}): string {
  if (!place) return '';
  const parts = [place.city, place.region ?? place.subregion, place.country].filter(Boolean);
  return [...new Set(parts.map(String))].join(', ');
}

function ensurePainApology(analysis: string, apology: string, hasPainSymptom: boolean): string {
  if (!hasPainSymptom) return analysis;
  return analysis.trim().startsWith(apology) ? analysis : `${apology}\n\n${analysis}`;
}

function hasPainText(value: string): boolean {
  return /stomach ache|stomach pain|abdominal pain|belly pain|cramp|bloating pain|bauchschmerz|bauchschmerzen|krampf|درد|دل درد|گرفتگی/i.test(value);
}

function cleanMarkdownLine(value: string): string {
  return value
    .replace(/^#+\s*/, '')
    .replace(/^[-*•]\s*/, '')
    .replace(/^\d+[.)]\s*/, '')
    .replace(/\*\*/g, '')
    .replace(/[`_]/g, '')
    .trim();
}

function isAnalysisInsightHeader(line: string, language: AppLanguage): boolean {
  const normalized = cleanMarkdownLine(line)
    .replace(/[:：]\s*$/, '')
    .toLocaleLowerCase();
  const localizedTitle = copy[language].analysisInsightTitle.toLocaleLowerCase();

  return [
    localizedTitle,
    'analysis insight',
    'analyse-einblick',
    'analyse einblick',
    'بینش تحلیل',
  ].includes(normalized);
}

function isInsightSectionBoundary(line: string, language: AppLanguage): boolean {
  const normalized = cleanMarkdownLine(line)
    .replace(/[:：]\s*$/, '')
    .toLocaleLowerCase();

  return [
    copy[language].analysisInsightTitle.toLocaleLowerCase(),
    'tips',
    'tipps',
    'نکات',
    copy[language].instantReliefTitle.toLocaleLowerCase(),
    copy[language].scoreLabel.toLocaleLowerCase(),
    'gut score',
    'darm-score',
    'امتیاز روده',
  ].includes(normalized);
}

function extractAnalysisInsightBullets(aiText: string, language: AppLanguage): string[] {
  const lines = aiText.split('\n');
  const insights: string[] = [];
  let isCollecting = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!isCollecting && isAnalysisInsightHeader(trimmed, language)) {
      isCollecting = true;
      continue;
    }

    if (!isCollecting) continue;
    if (!trimmed) {
      if (insights.length > 0) break;
      continue;
    }

    if (insights.length > 0 && isInsightSectionBoundary(trimmed, language)) break;
    if (trimmed.startsWith('|')) continue;

    const cleaned = cleanMarkdownLine(trimmed);
    if (!cleaned || isInsightSectionBoundary(cleaned, language)) {
      if (insights.length > 0) break;
      continue;
    }

    insights.push(cleaned.replace(/[.;؛]\s*$/, ''));
    if (insights.length >= 3) break;
  }

  return insights;
}

function stripAnalysisInsightSection(aiText: string, language: AppLanguage): string {
  const lines = aiText.split('\n');
  const keptLines: string[] = [];
  let isSkipping = false;
  let skippedAnyInsight = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!isSkipping && isAnalysisInsightHeader(trimmed, language)) {
      isSkipping = true;
      skippedAnyInsight = true;
      continue;
    }

    if (isSkipping) {
      if (!trimmed) {
        isSkipping = false;
        continue;
      }

      if (isInsightSectionBoundary(trimmed, language) && !isAnalysisInsightHeader(trimmed, language)) {
        isSkipping = false;
        keptLines.push(line);
      }
      continue;
    }

    keptLines.push(line);
  }

  return skippedAnyInsight ? keptLines.join('\n').replace(/\n{3,}/g, '\n\n').trim() : aiText;
}

function buildFallbackAnalysisInsights(
  aiText: string,
  symptoms: string[],
  conditions: string[],
  language: AppLanguage,
): string[] {
  const insightCopy = copy[language].insightFallbacks;
  const combinedText = `${aiText} ${symptoms.join(' ')} ${conditions.join(' ')}`.toLocaleLowerCase();
  const insights: string[] = [];
  const addInsight = (value: string) => {
    if (!insights.includes(value) && insights.length < 3) insights.push(value);
  };

  if (/onion|garlic|wheat|barley|beans?|lentils?|high-fodmap|fodmap|پیاز|سیر|گندم|حبوبات|عدس/i.test(combinedText)) {
    addInsight(insightCopy.fructan);
  }
  if (/ibs|bloating|gas|pain|cramp|reflux|reizdarm|bläh|schmerz|نفخ|گاز|درد|ریفلاکس/i.test(combinedText)) {
    addInsight(insightCopy.ibsTrigger);
  }
  if (/low fiber|refined|white bread|pasta|cookie|cake|sugar|processed|wenig ballast|کم فیبر|قند|شیرینی/i.test(combinedText)) {
    addInsight(insightCopy.lowFiber);
  }
  if (/fried|greasy|spicy|high-fat|inflammatory|frittiert|scharf|چرب|سرخ|تند|التهاب/i.test(combinedText)) {
    addInsight(insightCopy.inflammatory);
  }
  if (symptoms.length > 0) addInsight(insightCopy.symptomMatch);
  if (/gentle|supportive|easy to digest|gut-friendly|sanft|verträglich|ملایم|آسان/i.test(combinedText)) {
    addInsight(insightCopy.gentle);
  }
  addInsight(insightCopy.profileSensitive);

  return insights.slice(0, 3);
}

function getVoiceLocale(language: AppLanguage): string {
  return {
    en: 'en-US',
    de: 'de-DE',
    fa: 'fa-IR',
  }[language];
}

function isDifferentFoodCorrection(correction: string): boolean {
  return /\b(it is|it's|this is|actually|not|instead|tea|herbal tea|soup|rice|potato|zucchini|yogurt|banana|das ist|eigentlich|tee|suppe|reis|kartoffel)\b/i.test(correction)
    || /(?:این|غذا|چای|سوپ|برنج|سیب زمینی|ماست|موز)/.test(correction);
}

export default function PhotoAnalysisScreen() {
  const params = useLocalSearchParams<{ historyId?: string }>();
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [lastImageBase64, setLastImageBase64] = useState('');
  const [analysis, setAnalysis] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isCorrecting, setIsCorrecting] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceTarget, setVoiceTarget] = useState<'feelings' | 'correction' | null>(null);
  const [locationContext, setLocationContext] = useState('');
  const [retailLocationHint, setRetailLocationHint] = useState('');
  const [isLocationLoading, setIsLocationLoading] = useState(true);
  const [language, setLanguage] = useState<AppLanguage>('en');
  /** Pre-analyze field: what the meal is + how the user feels (voice or text). */
  const [wizardStep, setWizardStep] = useState<WizardStep>(1);
  const [accuracyAnswer, setAccuracyAnswer] = useState<'yes' | 'no' | null>(null);
  const [correctionDraft, setCorrectionDraft] = useState('');
  const [mealDescription, setMealDescription] = useState('');
  const [selectedSymptoms, setSelectedSymptoms] = useState<SymptomKey[]>([]);
  const [profileConditions, setProfileConditions] = useState<MedicalCondition[]>([]);
  /** Corrections the user submitted this session (typed or sent after voice); fed to revise prompts as prior context. */
  const [userFeedback, setUserFeedback] = useState<string[]>([]);
  const [todaysSupplements, setTodaysSupplements] = useState<SupplementHistoryItem[]>([]);
  const [triggerMemories, setTriggerMemories] = useState<TriggerFeedbackItem[]>([]);
  const [planBMessage, setPlanBMessage] = useState('');
  const [rankUpBadge, setRankUpBadge] = useState('');
  /** Remount results ScrollView after a fresh analysis so the pane scrolls cleanly away from prior inputs. */
  const [resultsScrollKey, setResultsScrollKey] = useState(0);
  const micGlowOpacity = useRef(new Animated.Value(1)).current;
  const expoSpeechStopRef = useRef<(() => Promise<void>) | null>(null);
  const voiceEngineRef = useRef<'rn-voice' | 'expo-speech' | null>(null);
  const voiceDestinationRef = useRef<'feelings' | 'correction'>('feelings');
  const latestTranscriptRef = useRef('');
  const voiceHoldActiveRef = useRef(false);
  /** Pulse scale + glow opacity while the mic is actively listening. */
  const recordingPulse = useRef(new Animated.Value(1)).current;
  const { user } = useAuth();
  const [toast, setToast] = useState({
    visible: false,
    message: '',
    type: 'success' as 'success' | 'error' | 'info',
  });
  const [isLoggingMeal, setIsLoggingMeal] = useState(false);
  const t = copy[language];
  /** Dev client / standalone only — Expo Go has no custom native STT modules. */
  const voiceNativeEnabled = canUseNativeSpeechToText();
  const isRtlLanguage = isAppRtlLanguage(language);
  const selectedSymptomLabels = selectedSymptoms.map((symptomKey) => {
    const option = SYMPTOM_OPTIONS.find((item) => item.key === symptomKey);
    return option?.promptLabel ?? symptomKey;
  });
  const selectedSymptomSummary = selectedSymptomLabels.length > 0
    ? selectedSymptomLabels.join(', ')
    : 'None selected';
  const mealDescriptionText = mealDescription.trim();
  const analysisInputSummary = [
    mealDescriptionText ? `Meal details: ${mealDescriptionText}` : '',
    selectedSymptomLabels.length > 0 ? `Selected symptoms: ${selectedSymptomSummary}` : '',
  ].filter(Boolean).join('\n');
  const hasAnalysisInput = Boolean(mealDescriptionText || selectedSymptoms.length > 0);
  const userEnteredSymptoms = selectedSymptomLabels;
  const promptConditions = getPromptConditions(profileConditions);
  const currentSymptoms = [
    ...promptConditions,
    ...userEnteredSymptoms,
  ];
  const hasPainSymptom = currentSymptoms.some((symptom) =>
    hasPainText(symptom)
  );
  const mealImpactScore = resolveMealImpactScore(analysis, currentSymptoms, mealDescriptionText, language);
  const extractedAnalysisInsights = extractAnalysisInsightBullets(analysis, language);
  const analysisInsights = extractedAnalysisInsights.length > 0
    ? extractedAnalysisInsights
    : buildFallbackAnalysisInsights(analysis, currentSymptoms, promptConditions, language);
  const displayAnalysisText = stripAnalysisInsightSection(analysis, language);
  const wizardSubtitle =
    wizardStep === 1 ? t.wizardStep1Subtitle : wizardStep === 2 ? t.wizardStep2Subtitle : t.wizardStep3Subtitle;
  const canRecordFeelings = wizardStep === 2 && Boolean(photoUri && lastImageBase64);

  useEffect(() => {
    getUserProfileSettings()
      .then((settings) => setProfileConditions(settings.conditions))
      .catch(console.warn);
  }, []);

  useEffect(() => {
    if (!voiceNativeEnabled) {
      recordingPulse.setValue(1);
      micGlowOpacity.setValue(1);
      return;
    }
    if (!isListening || voiceTarget === null) {
      recordingPulse.setValue(1);
      micGlowOpacity.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(recordingPulse, {
            toValue: 1.14,
            duration: 520,
            useNativeDriver: true,
          }),
          Animated.timing(recordingPulse, {
            toValue: 1,
            duration: 520,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(micGlowOpacity, {
            toValue: 0.58,
            duration: 520,
            useNativeDriver: true,
          }),
          Animated.timing(micGlowOpacity, {
            toValue: 1,
            duration: 520,
            useNativeDriver: true,
          }),
        ]),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [voiceNativeEnabled, isListening, voiceTarget, recordingPulse, micGlowOpacity]);

  useEffect(() => {
    let isMounted = true;

    const loadLocation = async () => {
      if (DEV_LOCATION_OVERRIDE.toLowerCase() === 'germany') {
        if (isMounted) {
          setLocationContext('User is in Nürtingen, Germany');
          setRetailLocationHint('Nürtingen, Baden-Württemberg, Germany');
          setIsLocationLoading(false);
        }
        return;
      }

      if (Platform.OS === 'web') {
        setLocationContext('');
        setRetailLocationHint('');
        setIsLocationLoading(false);
        return;
      }

      try {
        const Location = await import('expo-location') as NativeLocationModule;
        const { status } = await Location.requestForegroundPermissionsAsync();

        if (status !== 'granted') {
          if (isMounted) {
            setLocationContext('');
            setRetailLocationHint('');
            setIsLocationLoading(false);
          }
          return;
        }

        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const places = await Location.reverseGeocodeAsync(position.coords);

        if (isMounted) {
          const place = places[0];
          setLocationContext(formatLocationContext(position.coords, place));
          setRetailLocationHint(formatRetailLocationHint(place));
        }
      } catch (error) {
        console.warn('Location lookup failed:', error);
        if (isMounted) {
          setLocationContext('');
          setRetailLocationHint('');
        }
      } finally {
        if (isMounted) setIsLocationLoading(false);
      }
    };

    void loadLocation();

    return () => {
      isMounted = false;
    };
  }, []);

  useFocusEffect(useCallback(() => {
    let isActive = true;

    AsyncStorage.getItem(APP_LANGUAGE_STORAGE_KEY)
      .then((storedLanguage) => {
        if (isActive) setLanguage(parseStoredLanguage(storedLanguage));
      })
      .catch(console.warn);

    return () => {
      isActive = false;
    };
  }, []));

  useEffect(() => {
    console.log('NutriFlow Core Updated: Focus English/German, Voice Active, Memory Cleared');
  }, []);

  useEffect(() => {
    Promise.all([getRecentSupplements(12), getUserProgressProfile()])
      .then(([supplements, progress]) => {
        setTodaysSupplements(supplements);
        setTriggerMemories(progress.triggers);
      })
      .catch(console.warn);
  }, []);

  useEffect(() => () => {
    loadedVoiceModule?.destroy?.();
    loadedVoiceModule?.removeAllListeners?.();
    if (voiceNativeEnabled) {
      teardownExpoSpeechRecognition();
    }
  }, [voiceNativeEnabled]);

  useEffect(() => {
    if (!params.historyId) return;

    getPhotoAnalysisHistory(user?.id)
      .then((history) => {
        const savedAnalysis = history.find((item) => item.id === params.historyId);
        if (!savedAnalysis) return;

        setPhotoUri(savedAnalysis.imageUri);
        setLastImageBase64('');
        setAnalysis(savedAnalysis.aiText);
        setPlanBMessage('');
        setUserFeedback([]);
        setWizardStep(3);
        setAccuracyAnswer(null);
        setCorrectionDraft('');
        const savedUserSymptoms = savedAnalysis.symptoms.filter(
          (symptom) => !promptConditions.includes(symptom as MedicalCondition) && symptom !== 'General Gut Health'
        );
        const savedSymptomKeys = SYMPTOM_OPTIONS
          .filter((option) =>
            savedUserSymptoms.some((symptom) =>
              ([option.promptLabel, option.labels.en, option.labels.de, option.labels.fa] as string[]).includes(symptom)
            )
          )
          .map((option) => option.key);
        setSelectedSymptoms(savedSymptomKeys);
        setMealDescription(
          savedUserSymptoms
            .filter((symptom) =>
              !SYMPTOM_OPTIONS.some((option) =>
                ([option.promptLabel, option.labels.en, option.labels.de, option.labels.fa] as string[]).includes(symptom)
              )
            )
            .join(', ')
        );
      })
      .catch(console.warn);
  }, [params.historyId, user?.id]);

  const handleShareAnalysis = async () => {
    if (!analysis) return;

    try {
      const summary = [
        t.snapshotHeading,
        `${t.scoreLabel}: ${mealImpactScore ?? t.pendingScore}`,
        `${t.profileContext}`,
        '',
        analysis,
      ].join('\n');

      await Share.share({
        title: t.shareTitle,
        message: summary,
      });
    } catch (error) {
      console.error('Photo analysis share failed:', error);
      Alert.alert(t.shareErrorTitle, error instanceof Error ? error.message : t.shareErrorMessage);
    }
  };

  const handleLogPhotoAnalysis = async () => {
    if (!analysis || !user) {
      setToast({ visible: true, message: t.loginRequired, type: 'error' });
      return;
    }

    const mealName = extractMealName(analysis).trim().slice(0, 200) || t.photoMealDefault;
    const scoreNote = mealImpactScore ? `${t.scoreLabel}: ${mealImpactScore}` : `${t.scoreLabel}: ${t.pendingScore}`;
    const payload = {
      user_id: user.id,
      meal_name: mealName,
      meal_type: getMealTypeForClock(),
      foods: null as string[] | null,
      note: `${scoreNote}. ${analysis.slice(0, 600)}`,
      logged_at: new Date().toISOString(),
    };

    setIsLoggingMeal(true);
    const { error } = await supabase.from('food_logs').insert(payload);
    setIsLoggingMeal(false);

    if (error) {
      if (
        error.message?.includes('network') ||
        error.message?.includes('Network') ||
        error.code === 'PGRST301' ||
        !error.code
      ) {
        await enqueue('food_logs', payload);
        setToast({ visible: true, message: t.logMealOffline, type: 'info' });
      } else {
        setToast({ visible: true, message: t.logMealFailed, type: 'error' });
      }
      return;
    }

    setToast({ visible: true, message: t.logMealSuccess, type: 'success' });
  };

  const toggleSymptom = (symptomKey: SymptomKey) => {
    setSelectedSymptoms((current) =>
      current.includes(symptomKey)
        ? current.filter((item) => item !== symptomKey)
        : [...current, symptomKey]
    );
  };

  const handleGenerateAnalysis = () => {
    if (!lastImageBase64.trim() || !photoUri) return;
    if (!hasAnalysisInput) {
      Alert.alert(t.feelingsRequiredTitle, t.feelingsRequiredMessage);
      return;
    }
    void runPhotoAnalysis(lastImageBase64, photoUri, analysisInputSummary);
  };

  const runPhotoAnalysis = async (
    imageBase64: string,
    uri: string,
    feelingsNarrative: string,
  ) => {
    setIsAnalyzing(true);
    setPhotoUri(uri);
    setLastImageBase64(imageBase64);
    setPlanBMessage('');
    setUserFeedback([]);

    try {
      const rawResult = await analyzeMealPhoto(imageBase64, 'image/jpeg', {
        preferredLanguage: language,
        conditions: promptConditions,
        symptoms: currentSymptoms,
        userEnteredSymptoms,
        supplementsTakenToday: todaysSupplements.map((item) => `${item.name} (${item.dosage}, ${item.time})`),
        triggerMemories: [],
        locationContext,
        retailLocationHint,
        userFeelingsNarrative: feelingsNarrative,
      });
      const dynamicResult = applyDynamicMealImpactScore(rawResult, currentSymptoms, feelingsNarrative, language);
      const dynamicMealImpactScore = resolveMealImpactScore(dynamicResult, currentSymptoms, feelingsNarrative, language);
      setAnalysis(dynamicResult);
      setResultsScrollKey((key) => key + 1);
      setWizardStep(3);
      setAccuracyAnswer(null);
      setCorrectionDraft('');
      await savePhotoAnalysisHistoryItem({
        imageUri: uri,
        aiText: dynamicResult,
        symptoms: currentSymptoms,
        mealImpactScore: dynamicMealImpactScore,
        language,
        userId: user?.id,
      });
      const xpResult = await addXpForAction(10);
      if (hasPainSymptom) {
        const progress = await recordTriggerFeedback({
          mealName: extractMealName(rawResult),
          adviceSummary: rawResult.slice(0, 240),
          symptoms: currentSymptoms,
        });
        setTriggerMemories(progress.triggers);
      }
      if (xpResult.leveledUp) {
        setRankUpBadge(`${t.rankUp}: ${xpResult.profile.rank}`);
        setTimeout(() => setRankUpBadge(''), 3600);
      }
    } catch (error) {
      console.error('Meal photo analysis failed:', error);
      Alert.alert(
        t.photoAnalysisFailedTitle,
        error instanceof Error ? error.message : t.photoAnalysisFailedTryAgain,
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  const storeCapturedPhoto = (asset: ImagePicker.ImagePickerAsset) => {
    if (!asset.base64) {
      Alert.alert(t.photoUnavailableTitle, t.photoUnavailableMessage);
      return;
    }
    // Listen-before-analyze: no Groq call here—only after Step 2 voice/text and Generate Analysis.
    setPhotoUri(asset.uri);
    setLastImageBase64(asset.base64);
    setAnalysis('');
    setPlanBMessage('');
    setUserFeedback([]);
    setWizardStep(1);
    setAccuracyAnswer(null);
    setCorrectionDraft('');
    setMealDescription('');
  };

  const pickImageFileOnWeb = () => {
    if (typeof document === 'undefined') return;

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.style.display = 'none';

    input.onchange = async () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) return;

      try {
        const dataUrl = await readFileAsDataUrl(file);
        const [, base64 = ''] = dataUrl.split(',');
        if (!base64) {
          Alert.alert(t.photoUnavailableTitle, t.photoUnavailableMessage);
          return;
        }
        storeCapturedPhoto({
          uri: dataUrl,
          base64,
          width: 0,
          height: 0,
        } as ImagePicker.ImagePickerAsset);
      } catch (error) {
        console.error('Web image read failed:', error);
        Alert.alert(t.photoUnavailableTitle, t.photoUnavailableMessage);
      }
    };

    document.body.appendChild(input);
    input.click();
  };

  const takePhotoOnWeb = async () => {
    if (typeof document === 'undefined' || typeof navigator === 'undefined') return;

    if (!navigator.mediaDevices?.getUserMedia) {
      Alert.alert(t.cameraNeededTitle, 'Camera access is not available in this browser. Please use Safari/Chrome on HTTPS or choose from gallery.');
      pickImageFileOnWeb();
      return;
    }

    let stream: MediaStream | null = null;
    const overlay = document.createElement('div');
    const video = document.createElement('video');
    const actions = document.createElement('div');
    const captureButton = document.createElement('button');
    const cancelButton = document.createElement('button');

    const cleanup = () => {
      stream?.getTracks().forEach((track) => track.stop());
      overlay.remove();
    };

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 960 },
        },
        audio: false,
      });
    } catch (error) {
      console.error('Web camera permission failed:', error);
      Alert.alert(t.cameraNeededTitle, 'Please allow camera access in your browser, then try again.');
      return;
    }

    overlay.style.cssText = [
      'position:fixed',
      'inset:0',
      'z-index:99999',
      'background:#000',
      'display:flex',
      'flex-direction:column',
      'align-items:center',
      'justify-content:center',
      'padding:16px',
      'box-sizing:border-box',
    ].join(';');
    video.style.cssText = [
      'width:100%',
      'max-width:520px',
      'max-height:75vh',
      'border-radius:20px',
      'object-fit:cover',
      'background:#111',
    ].join(';');
    actions.style.cssText = [
      'display:flex',
      'gap:12px',
      'margin-top:16px',
      'width:100%',
      'max-width:520px',
    ].join(';');
    captureButton.textContent = 'Use Photo';
    cancelButton.textContent = 'Cancel';
    [captureButton, cancelButton].forEach((button) => {
      button.type = 'button';
      button.style.cssText = [
        'flex:1',
        'min-height:48px',
        'border:0',
        'border-radius:16px',
        'font:600 16px system-ui,-apple-system,BlinkMacSystemFont,sans-serif',
      ].join(';');
    });
    captureButton.style.background = '#2DCE89';
    captureButton.style.color = '#000';
    cancelButton.style.background = '#1F2937';
    cancelButton.style.color = '#FFF';

    video.autoplay = true;
    video.playsInline = true;
    video.muted = true;
    video.srcObject = stream;

    captureButton.onclick = () => {
      const width = video.videoWidth || 1280;
      const height = video.videoHeight || 960;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) {
        cleanup();
        Alert.alert(t.photoUnavailableTitle, t.photoUnavailableMessage);
        return;
      }
      context.drawImage(video, 0, 0, width, height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
      const [, base64 = ''] = dataUrl.split(',');
      cleanup();
      storeCapturedPhoto({
        uri: dataUrl,
        base64,
        width,
        height,
      } as ImagePicker.ImagePickerAsset);
    };
    cancelButton.onclick = cleanup;

    actions.append(captureButton, cancelButton);
    overlay.append(video, actions);
    document.body.appendChild(overlay);
    await video.play().catch((error) => {
      console.error('Web camera preview failed:', error);
    });
  };

  const takePhoto = async () => {
    if (isAnalyzing) return;

    if (Platform.OS === 'web') {
      takePhotoOnWeb();
      return;
    }

    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(t.cameraNeededTitle, t.cameraNeededMessage);
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.72,
      base64: true,
    });

    if (!result.canceled && result.assets[0]) {
      storeCapturedPhoto(result.assets[0]);
    }
  };

  const pickImage = async () => {
    if (isAnalyzing) return;

    if (Platform.OS === 'web') {
      pickImageFileOnWeb();
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(t.libraryNeededTitle, t.libraryNeededMessage);
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.72,
      base64: true,
    });

    if (!result.canceled && result.assets[0]) {
      storeCapturedPhoto(result.assets[0]);
    }
  };

  const submitChatCorrection = async (rawCorrection: string) => {
    const correction = rawCorrection.trim();
    if (!correction || !analysis || isCorrecting) return;
    const correctionIsDifferentFood = isDifferentFoodCorrection(correction);

    setIsCorrecting(true);

    try {
      const revisedAnalysis = await reviseMealAnalysis({
        preferredLanguage: language,
        previousAnalysis: correctionIsDifferentFood
          ? 'Previous meal context intentionally cleared because the user described a different food. Do not mention the old guessed food.'
          : [
            lastImageBase64 ? 'Photo context is still available from this scan.' : 'Photo context is from saved analysis text only.',
            analysis,
          ].join('\n\n'),
        correction,
        conditions: promptConditions,
        symptoms: [...currentSymptoms, correction],
        triggerMemories: formatTriggerMemories(triggerMemories),
        locationContext,
        retailLocationHint,
        priorUserCorrections: userFeedback,
      });
      const dynamicRevisedAnalysis = applyDynamicMealImpactScore(
        revisedAnalysis,
        [...currentSymptoms, correction],
        correction,
        language,
      );
      const correctedAnalysis = ensurePainApology(
        dynamicRevisedAnalysis,
        t.painApology,
        hasPainSymptom || hasPainText(correction)
      );
      setAnalysis(correctedAnalysis);
      setResultsScrollKey((key) => key + 1);
      setUserFeedback((prior) => [...prior, correction]);
      setAccuracyAnswer(null);
      if (correctionIsDifferentFood) {
        setPlanBMessage('');
      }
      const xpResult = await addXpForAction(5);
      if (xpResult.leveledUp) {
        setRankUpBadge(`${t.rankUp}: ${xpResult.profile.rank}`);
        setTimeout(() => setRankUpBadge(''), 3600);
      }

      if (hasPainSymptom || hasPainText(correction)) {
        const progress = await recordTriggerFeedback({
          mealName: extractMealName(correctedAnalysis),
          adviceSummary: correctedAnalysis.slice(0, 240),
          symptoms: [...currentSymptoms, correction],
        });
        setTriggerMemories(progress.triggers);
      }
      setCorrectionDraft('');
    } catch (error) {
      console.error('Meal correction failed:', error);
      Alert.alert(
        t.correctionFailedTitle,
        error instanceof Error ? error.message : t.correctionFailedTryAgain,
      );
    } finally {
      setIsCorrecting(false);
    }
  };

  const applyVoiceTranscript = (destination: 'feelings' | 'correction', text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (destination === 'feelings') setMealDescription(trimmed);
    else setCorrectionDraft(trimmed);
  };

  const bindVoiceHandlers = (Voice: VoiceModule, destination: 'feelings' | 'correction') => {
    Voice.onSpeechResults = (event) => {
      const spokenText = event.value?.[0]?.trim();
      if (!spokenText || !voiceHoldActiveRef.current) return;
      latestTranscriptRef.current = spokenText;
      if (destination === 'correction') {
        setCorrectionDraft(spokenText);
      } else {
        setMealDescription(spokenText);
      }
    };
    Voice.onSpeechPartialResults = (event) => {
      const spokenText = event.value?.[0]?.trim();
      if (!spokenText || !voiceHoldActiveRef.current) return;
      latestTranscriptRef.current = spokenText;
      if (destination === 'correction') {
        setCorrectionDraft(spokenText);
      } else {
        setMealDescription(spokenText);
      }
    };
    Voice.onSpeechError = (err: unknown) => {
      voiceHoldActiveRef.current = false;
      voiceEngineRef.current = null;
      setIsListening(false);
      setVoiceTarget(null);
      if (parseRnVoiceError(err) === 'mic') {
        setToast({ visible: true, message: t.microphoneDisabledToast, type: 'info' });
      } else {
        setToast({ visible: true, message: t.voiceUnavailableMessage, type: 'info' });
      }
    };
  };

  const beginVoiceHold = async (destination: 'feelings' | 'correction') => {
    if (isListening || !voiceNativeEnabled) return;
    teardownExpoSpeechRecognition();
    expoSpeechStopRef.current = null;
    voiceEngineRef.current = null;

    voiceDestinationRef.current = destination;
    voiceHoldActiveRef.current = true;
    latestTranscriptRef.current = '';
    setVoiceTarget(destination);
    setIsListening(true);

    const locale = getVoiceLocale(language);
    const pushTranscript = (spokenText: string) => {
      if (!voiceHoldActiveRef.current) return;
      const next = spokenText.trim();
      if (!next) return;
      latestTranscriptRef.current = next;
      if (destination === 'correction') setCorrectionDraft(next);
      else setMealDescription(next);
    };

    const micToast = () =>
      setToast({ visible: true, message: t.microphoneDisabledToast, type: 'info' });
    const voiceToast = () =>
      setToast({ visible: true, message: t.voiceUnavailableMessage, type: 'info' });

    try {
      const Voice = await loadVoiceModule();
      if (Voice) {
        bindVoiceHandlers(Voice, destination);
        try {
          await Voice.start(locale);
          voiceEngineRef.current = 'rn-voice';
          return;
        } catch (rnStartErr) {
          console.warn('react-native-voice start failed; trying expo-speech-recognition:', rnStartErr);
          try {
            await Voice.stop?.();
          } catch {
            /* noop */
          }
          Voice.removeAllListeners?.();
        }
      }

      const stopExpo = await tryStartExpoSpeechRecognition(
        locale,
        pushTranscript,
        () => {
          voiceHoldActiveRef.current = false;
          setIsListening(false);
          setVoiceTarget(null);
          micToast();
        },
        () => {
          voiceHoldActiveRef.current = false;
          setIsListening(false);
          setVoiceTarget(null);
          voiceToast();
        },
      );

      if (!stopExpo) {
        voiceHoldActiveRef.current = false;
        setIsListening(false);
        setVoiceTarget(null);
        return;
      }

      expoSpeechStopRef.current = stopExpo;
      voiceEngineRef.current = 'expo-speech';
    } catch (error) {
      console.warn('Voice start failed:', error);
      voiceHoldActiveRef.current = false;
      setIsListening(false);
      setVoiceTarget(null);
      voiceToast();
    }
  };

  const finishVoiceHold = async () => {
    voiceHoldActiveRef.current = false;
    try {
      if (voiceEngineRef.current === 'expo-speech' && expoSpeechStopRef.current) {
        await expoSpeechStopRef.current();
      } else {
        await loadedVoiceModule?.stop?.();
      }
    } catch (error) {
      console.warn('Voice stop failed:', error);
    }
    expoSpeechStopRef.current = null;
    voiceEngineRef.current = null;

    const dest = voiceDestinationRef.current;
    const finalText = latestTranscriptRef.current.trim();
    if (finalText) applyVoiceTranscript(dest, finalText);
    latestTranscriptRef.current = '';
    setIsListening(false);
    setVoiceTarget(null);
  };

  const handleNewScan = () => {
    setPhotoUri(null);
    setLastImageBase64('');
    setAnalysis('');
    setPlanBMessage('');
    setRankUpBadge('');
    setMealDescription('');
    setSelectedSymptoms([]);
    setUserFeedback([]);
    setWizardStep(1);
    setAccuracyAnswer(null);
    setCorrectionDraft('');
    setTriggerMemories([]);
    setIsAnalyzing(false);
    setIsCorrecting(false);
  };

  const handleChangePhoto = () => {
    setPhotoUri(null);
    setLastImageBase64('');
    setAnalysis('');
    setMealDescription('');
    setSelectedSymptoms([]);
    setWizardStep(1);
    setAccuracyAnswer(null);
    setCorrectionDraft('');
  };

  const handleApplyCorrection = async () => {
    const trimmed = correctionDraft.trim();
    if (!trimmed) {
      setToast({ visible: true, message: t.recommendationUnchanged, type: 'info' });
      return;
    }
    await submitChatCorrection(trimmed);
  };

  const insets = useSafeAreaInsets();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.screenBody}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backButton}>
            <Ionicons name="chevron-back" size={20} color="#FFFFFF" />
            <Text style={styles.backButtonText}>{t.back}</Text>
          </Pressable>
          <View style={styles.headerTextBlock}>
            <Text style={[styles.title, isRtlLanguage && styles.rtlText]}>{t.title}</Text>
            <Text style={[styles.subtitle, isRtlLanguage && styles.rtlText]}>{wizardSubtitle}</Text>
          </View>
        </View>

        {wizardStep === 2 ? (
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={90}
            style={styles.keyboardAvoidFill}
          >
            <ScrollView
              style={styles.scrollFlex}
              contentContainerStyle={[styles.content, styles.wizardStep2Content]}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {photoUri ? (
                <Image source={{ uri: photoUri }} style={styles.wizardThumbnail} />
              ) : null}

              <Text style={[styles.step2PromptText, isRtlLanguage && styles.rtlText]}>{t.step2Prompt}</Text>

              {!voiceNativeEnabled ? (
                <View style={[styles.expoGoHintCard, isRtlLanguage && styles.rtlRow]}>
                  <Ionicons name="information-circle-outline" size={20} color={Colors.secondaryLight} />
                  <Text style={[styles.expoGoHintText, isRtlLanguage && styles.rtlText]}>{t.expoGoTextOnlyHint}</Text>
                </View>
              ) : null}

              {voiceNativeEnabled ? (
                <>
                  <View style={styles.wizardMicCenter}>
                    {canRecordFeelings && isListening && voiceTarget === 'feelings' ? (
                      <Animated.View style={{ transform: [{ scale: recordingPulse }] }}>
                        <Pressable
                          onPressIn={() => void beginVoiceHold('feelings')}
                          onPressOut={() => void finishVoiceHold()}
                          accessibilityRole="button"
                          accessibilityLabel={t.voiceInputA11yLabel}
                          accessibilityHint={t.voiceInputA11yHint}
                          accessibilityState={{ busy: true }}
                          style={({ pressed }) => [
                            styles.wizardMicLarge,
                            styles.micRecording,
                            pressed && styles.pressed,
                          ]}
                        >
                          <Animated.View style={{ opacity: micGlowOpacity }}>
                            <Ionicons name="mic" size={34} color="#FFFFFF" />
                          </Animated.View>
                        </Pressable>
                      </Animated.View>
                    ) : (
                      <Pressable
                        disabled={!canRecordFeelings}
                        onPressIn={() => void beginVoiceHold('feelings')}
                        onPressOut={() => void finishVoiceHold()}
                        accessibilityRole="button"
                        accessibilityLabel={t.voiceInputA11yLabel}
                        accessibilityHint={t.voiceInputA11yHint}
                        accessibilityState={{ busy: false }}
                        style={({ pressed }) => [
                          styles.wizardMicLarge,
                          !canRecordFeelings && styles.wizardMicLargeDisabled,
                          pressed && canRecordFeelings && styles.pressed,
                        ]}
                      >
                        <Ionicons name="mic-outline" size={34} color="#FFFFFF" />
                      </Pressable>
                    )}
                  </View>

                  {canRecordFeelings && isListening && voiceTarget === 'feelings' ? (
                    <View style={[styles.recordingIndicatorInline, styles.wizardRecordingCenter, isRtlLanguage && styles.rtlRow]}>
                      <ActivityIndicator color="#EF4444" size="small" />
                      <Text style={[styles.correctingText, isRtlLanguage && styles.rtlText]}>{t.recording}</Text>
                    </View>
                  ) : null}
                </>
              ) : null}

              <View style={styles.symptomSelectorCard}>
                <Text style={[styles.symptomsLabel, isRtlLanguage && styles.rtlText]}>
                  {t.symptomSelectorLabel}
                </Text>
                <Text style={[styles.symptomSelectorHint, isRtlLanguage && styles.rtlText]}>
                  {t.symptomSelectorHint}
                </Text>
                <View style={[styles.symptomChipWrap, isRtlLanguage && styles.rtlRow]}>
                  {SYMPTOM_OPTIONS.map((option) => {
                    const isSelected = selectedSymptoms.includes(option.key);
                    return (
                      <Pressable
                        key={option.key}
                        onPress={() => toggleSymptom(option.key)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isSelected }}
                        style={({ pressed }) => [
                          styles.symptomChip,
                          isSelected && styles.symptomChipSelected,
                          pressed && styles.pressed,
                        ]}
                      >
                        <Text
                          style={[
                            styles.symptomChipText,
                            isSelected && styles.symptomChipTextSelected,
                          ]}
                        >
                          {option.labels[language]}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <TextInput
                value={mealDescription}
                onChangeText={setMealDescription}
                placeholder={t.howYouFeelPlaceholder}
                placeholderTextColor={Colors.textTertiary}
                multiline
                textAlignVertical="top"
                style={[
                  styles.wizardFeelingsInput,
                  !voiceNativeEnabled && styles.wizardFeelingsInputExpoGo,
                  isRtlLanguage && styles.rtlText,
                ]}
              />

              <Pressable
                onPress={handleGenerateAnalysis}
                disabled={!hasAnalysisInput || isAnalyzing || !lastImageBase64.trim()}
                accessibilityRole="button"
                accessibilityLabel={t.generateAnalysis}
                accessibilityState={{
                  disabled: !hasAnalysisInput || isAnalyzing || !lastImageBase64.trim(),
                }}
                style={({ pressed }) => [
                  styles.analyzeCombinedButton,
                  (!hasAnalysisInput || isAnalyzing || !lastImageBase64.trim()) &&
                    styles.analyzeCombinedButtonDisabled,
                  pressed &&
                    hasAnalysisInput &&
                    !isAnalyzing &&
                    lastImageBase64.trim() &&
                    styles.pressed,
                ]}
              >
                <Ionicons name="sparkles" size={20} color="#000000" />
                <Text style={styles.analyzeCombinedButtonText}>{t.generateAnalysis}</Text>
              </Pressable>

              <Pressable onPress={handleChangePhoto} style={({ pressed }) => [styles.changePhotoLink, pressed && styles.pressed]}>
                <Text style={[styles.changePhotoLinkText, isRtlLanguage && styles.rtlText]}>{t.changePhoto}</Text>
              </Pressable>

              {isAnalyzing ? (
                <View style={styles.scanNotice}>
                  <ActivityIndicator size="large" color={Colors.primary} />
                  <Text style={[styles.scanNoticeBrand, isRtlLanguage && styles.rtlText]}>{t.analyzingBrand}</Text>
                  <Text style={[styles.scanNoticeText, isRtlLanguage && styles.rtlText]}>{t.analyzing}</Text>
                </View>
              ) : null}
            </ScrollView>
          </KeyboardAvoidingView>
        ) : (
          <ScrollView
            key={
              wizardStep === 3 && analysis
                ? `analysis-${resultsScrollKey}`
                : `wizard-${wizardStep}`
            }
            style={styles.scrollFlex}
            contentContainerStyle={[
              styles.content,
              wizardStep === 3 && analysis ? styles.analysisResultsContent : undefined,
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {wizardStep === 1 ? (
              <>
                <View style={styles.actionGrid}>
                  <Pressable
                    disabled={isAnalyzing}
                    onPress={takePhoto}
                    style={({ pressed }) => [
                      styles.photoActionButton,
                      styles.takePhotoButton,
                      isAnalyzing && styles.disabledButton,
                      pressed && !isAnalyzing && styles.pressed,
                    ]}
                  >
                    <View style={styles.photoActionIcon}>
                      <Ionicons name="camera" size={30} color={Colors.textInverse} />
                    </View>
                    <Text style={[styles.photoActionTitle, isRtlLanguage && styles.rtlText]}>{t.takePhoto}</Text>
                    <Text style={[styles.photoActionText, isRtlLanguage && styles.rtlText]}>{t.takePhotoText}</Text>
                  </Pressable>

                  <Pressable
                    disabled={isAnalyzing}
                    onPress={pickImage}
                    style={({ pressed }) => [
                      styles.photoActionButton,
                      styles.galleryButton,
                      isAnalyzing && styles.disabledButton,
                      pressed && !isAnalyzing && styles.pressed,
                    ]}
                  >
                    <View style={styles.photoActionIcon}>
                      <Ionicons name="images" size={30} color={Colors.textInverse} />
                    </View>
                    <Text style={[styles.photoActionTitle, isRtlLanguage && styles.rtlText]}>{t.chooseGallery}</Text>
                    <Text style={[styles.photoActionText, isRtlLanguage && styles.rtlText]}>{t.chooseGalleryText}</Text>
                  </Pressable>
                </View>

                {photoUri ? <Image source={{ uri: photoUri }} style={styles.previewImage} /> : null}

                {photoUri && lastImageBase64 ? (
                  <Pressable
                    onPress={() => setWizardStep(2)}
                    disabled={isAnalyzing}
                    accessibilityRole="button"
                    accessibilityLabel={t.wizardNext}
                    style={({ pressed }) => [
                      styles.wizardNextButton,
                      isAnalyzing && styles.wizardNextButtonDisabled,
                      pressed && !isAnalyzing && styles.pressed,
                    ]}
                  >
                    <Text style={styles.wizardNextButtonText}>{t.wizardNext}</Text>
                    <Ionicons name="arrow-forward" size={22} color="#000000" />
                  </Pressable>
                ) : null}
              </>
            ) : null}

            {wizardStep === 3 ? (
              <>
                <View style={[
                  styles.profileCard,
                  hasPainSymptom && styles.profilePainCard,
                  isRtlLanguage && styles.rtlRow,
                ]}>
                  <Ionicons
                    name={hasPainSymptom ? 'warning' : 'person-circle-outline'}
                    size={18}
                    color={hasPainSymptom ? '#F59E0B' : Colors.primary}
                  />
                  <Text style={[styles.profileText, isRtlLanguage && styles.rtlText]}>
                    {t.profileContext}
                  </Text>
                </View>

                <View style={styles.locationCard}>
                  <Ionicons name="location-outline" size={17} color={Colors.primary} />
                  <Text style={[styles.locationText, isRtlLanguage && styles.rtlText]}>
                    {isLocationLoading
                      ? t.findingLocation
                      : locationContext
                        ? `${t.usingLocation} ${locationContext}`
                        : t.locationUnavailable}
                  </Text>
                </View>

                {(isAnalyzing || isCorrecting) && analysis ? (
                  <View style={styles.scanNotice}>
                    <ActivityIndicator size="large" color={Colors.primary} />
                    <Text style={[styles.scanNoticeBrand, isRtlLanguage && styles.rtlText]}>{t.analyzingBrand}</Text>
                    <Text style={[styles.scanNoticeText, isRtlLanguage && styles.rtlText]}>
                      {isCorrecting ? t.correcting : t.analyzing}
                    </Text>
                  </View>
                ) : null}

                {analysis ? (
                  <>
                  <View style={styles.resultCard}>
                    {rankUpBadge ? (
                      <View style={[styles.rankUpBadge, isRtlLanguage && styles.rtlRow]}>
                        <Ionicons name="trophy" size={15} color="#000000" />
                        <Text style={styles.rankUpBadgeText}>{rankUpBadge}</Text>
                      </View>
                    ) : null}
                    <View style={styles.resultHeader}>
                      <View style={[styles.resultTitleRow, isRtlLanguage && styles.rtlRow]}>
                        <Ionicons name="nutrition" size={20} color={Colors.secondary} />
                        <Text style={[styles.resultTitle, isRtlLanguage && styles.rtlText]}>{t.resultTitle}</Text>
                      </View>
                    </View>
                    {mealImpactScore ? (
                      <View style={[
                        styles.scoreBadge,
                        hasPainSymptom && styles.scorePainBadge,
                        isRtlLanguage && styles.rtlRow,
                      ]}>
                        <Ionicons name="speedometer" size={18} color={Colors.textInverse} />
                        <Text style={[styles.scoreBadgeLabel, isRtlLanguage && styles.rtlText]}>{t.scoreLabel}</Text>
                        <Text style={styles.scoreBadgeValue}>{mealImpactScore}</Text>
                      </View>
                    ) : null}
                    {analysisInsights.length > 0 ? (
                      <View style={styles.analysisInsightCard}>
                        <View style={[styles.analysisInsightHeader, isRtlLanguage && styles.rtlRow]}>
                          <View style={styles.analysisInsightIcon}>
                            <Ionicons name="analytics" size={17} color="#D8FBEA" />
                          </View>
                          <Text style={[styles.analysisInsightTitle, isRtlLanguage && styles.rtlText]}>
                            {t.analysisInsightTitle}
                          </Text>
                        </View>
                        <View style={styles.analysisInsightList}>
                          {analysisInsights.map((insight, index) => (
                            <View key={`${insight}-${index}`} style={[styles.analysisInsightItem, isRtlLanguage && styles.rtlRow]}>
                              <View style={styles.analysisInsightDot} />
                              <Text style={[styles.analysisInsightText, isRtlLanguage && styles.rtlText]}>
                                {insight}
                              </Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    ) : null}
                    <Text style={[styles.resultText, isRtlLanguage && styles.rtlText]}>{displayAnalysisText}</Text>
                    {hasPainSymptom ? (
                      <View style={styles.instantReliefCard}>
                        <View style={[styles.instantReliefHeader, isRtlLanguage && styles.rtlRow]}>
                          <Ionicons name="medkit" size={18} color="#F59E0B" />
                          <Text style={[styles.instantReliefTitle, isRtlLanguage && styles.rtlText]}>
                            {t.instantReliefTitle}
                          </Text>
                        </View>
                        <Text style={[styles.instantReliefText, isRtlLanguage && styles.rtlText]}>
                          {t.instantReliefText}
                        </Text>
                      </View>
                    ) : null}
                    {planBMessage ? (
                      <View style={styles.planBCard}>
                        <View style={[styles.planBHeader, isRtlLanguage && styles.rtlRow]}>
                          <Ionicons name="shield-checkmark" size={18} color="#2DCE89" />
                          <Text style={[styles.planBTitle, isRtlLanguage && styles.rtlText]}>{t.planBTitle}</Text>
                        </View>
                        <Text style={[styles.planBText, isRtlLanguage && styles.rtlText]}>{planBMessage}</Text>
                      </View>
                    ) : null}
                    <View style={styles.medicalDisclaimerBox}>
                      <Text style={[styles.medicalDisclaimerText, isRtlLanguage && styles.rtlText]}>
                        {t.medicalDisclaimer}
                      </Text>
                    </View>
                    <View style={[styles.scientificSourceRow, isRtlLanguage && styles.rtlRow]}>
                      <Ionicons name="library-outline" size={13} color="#8CA99A" />
                      <Text style={[styles.scientificSourceText, isRtlLanguage && styles.rtlText]}>
                        {t.scientificSource}
                      </Text>
                    </View>

                    <View style={styles.resultActionsRow}>
                      <Pressable
                        disabled={isLoggingMeal}
                        onPress={() => void handleLogPhotoAnalysis()}
                        style={({ pressed }) => [
                          styles.logMealButton,
                          pressed && !isLoggingMeal && styles.pressed,
                          isLoggingMeal && styles.resultActionDisabled,
                        ]}
                      >
                        {isLoggingMeal ? (
                          <ActivityIndicator color="#52B788" size="small" />
                        ) : (
                          <Ionicons name="restaurant-outline" size={18} color="#52B788" />
                        )}
                        <Text style={styles.logMealButtonText}>{t.logMeal}</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => void handleShareAnalysis()}
                        style={({ pressed }) => [
                          styles.shareButton,
                          pressed && styles.pressed,
                        ]}
                      >
                        <Ionicons name="share-outline" size={18} color="#000000" />
                        <Text style={styles.shareButtonText}>{t.share}</Text>
                      </Pressable>
                    </View>
                  </View>

                  <View style={styles.accuracySectionCard}>
                    <Text style={[styles.wizardStep4Hint, isRtlLanguage && styles.rtlText]}>{t.wizardStep4Hint}</Text>
                    <Text style={[styles.accuracyQuestion, isRtlLanguage && styles.rtlText]}>{t.isThisAccurate}</Text>
                    <View style={[styles.accuracyRow, isRtlLanguage && styles.rtlRow]}>
                      <Pressable
                        onPress={() => setAccuracyAnswer('yes')}
                        style={({ pressed }) => [
                          styles.accuracyChip,
                          accuracyAnswer === 'yes' && styles.accuracyChipSelectedYes,
                          pressed && styles.pressed,
                        ]}
                      >
                        <Text style={[
                          styles.accuracyChipText,
                          accuracyAnswer === 'yes' && styles.accuracyChipTextSelected,
                        ]}>
                          {t.yes}
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => setAccuracyAnswer('no')}
                        style={({ pressed }) => [
                          styles.accuracyChip,
                          accuracyAnswer === 'no' && styles.accuracyChipSelectedNo,
                          pressed && styles.pressed,
                        ]}
                      >
                        <Text style={[
                          styles.accuracyChipText,
                          accuracyAnswer === 'no' && styles.accuracyChipTextSelectedNo,
                        ]}>
                          {t.no}
                        </Text>
                      </Pressable>
                    </View>

                    {accuracyAnswer === 'no' ? (
                      <View style={styles.correctionBox}>
                        <View style={[styles.correctionInputRow, isRtlLanguage && styles.rtlRow]}>
                          <TextInput
                            value={correctionDraft}
                            onChangeText={setCorrectionDraft}
                            placeholder={t.correctionPlaceholder}
                            placeholderTextColor={Colors.textTertiary}
                            multiline
                            textAlignVertical="top"
                            style={[
                              styles.correctionInput,
                              !voiceNativeEnabled && styles.correctionInputExpoGoFull,
                              isRtlLanguage && styles.rtlText,
                            ]}
                          />
                          {voiceNativeEnabled ? (
                            isListening && voiceTarget === 'correction' ? (
                              <Animated.View style={{ transform: [{ scale: recordingPulse }] }}>
                                <Pressable
                                  onPressIn={() => void beginVoiceHold('correction')}
                                  onPressOut={() => void finishVoiceHold()}
                                  accessibilityRole="button"
                                  accessibilityLabel={t.voiceInputA11yLabel}
                                  accessibilityHint={t.voiceInputA11yHint}
                                  accessibilityState={{ busy: true }}
                                  disabled={isCorrecting}
                                  style={({ pressed }) => [
                                    styles.symptomsMicButton,
                                    styles.micRecording,
                                    pressed && styles.pressed,
                                  ]}
                                >
                                  <Animated.View style={{ opacity: micGlowOpacity }}>
                                    <Ionicons name="mic" size={20} color="#FFFFFF" />
                                  </Animated.View>
                                </Pressable>
                              </Animated.View>
                            ) : (
                              <Pressable
                                onPressIn={() => void beginVoiceHold('correction')}
                                onPressOut={() => void finishVoiceHold()}
                                accessibilityRole="button"
                                accessibilityLabel={t.voiceInputA11yLabel}
                                accessibilityHint={t.voiceInputA11yHint}
                                accessibilityState={{ busy: false }}
                                disabled={isCorrecting}
                                style={({ pressed }) => [styles.symptomsMicButton, pressed && styles.pressed]}
                              >
                                <Ionicons name="mic-outline" size={20} color="#FFFFFF" />
                              </Pressable>
                            )
                          ) : null}
                        </View>
                        {voiceNativeEnabled && isListening && voiceTarget === 'correction' ? (
                          <View style={[styles.recordingIndicatorInline, isRtlLanguage && styles.rtlRow]}>
                            <ActivityIndicator color="#EF4444" size="small" />
                            <Text style={[styles.correctingText, isRtlLanguage && styles.rtlText]}>{t.recording}</Text>
                          </View>
                        ) : null}
                        <Pressable
                          disabled={isCorrecting}
                          onPress={() => void handleApplyCorrection()}
                          style={({ pressed }) => [
                            styles.applyCorrectionButton,
                            isCorrecting && styles.applyCorrectionButtonDisabled,
                            pressed && !isCorrecting && styles.pressed,
                          ]}
                        >
                          {isCorrecting ? (
                            <ActivityIndicator color="#000000" size="small" />
                          ) : (
                            <Text style={styles.applyCorrectionButtonText}>{t.applyCorrection}</Text>
                          )}
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                  </>
                ) : null}

                <View style={[styles.wizardFooterRow, { paddingBottom: Spacing.md + insets.bottom }]}>
                  <Pressable onPress={handleNewScan} style={({ pressed }) => [styles.newScanButton, pressed && styles.pressed]}>
                    <Ionicons name="scan" size={16} color="#2DCE89" />
                    <Text style={styles.newScanText}>{t.newScan}</Text>
                  </Pressable>
                </View>
              </>
            ) : null}
          </ScrollView>
        )}
      </View>
      <Toast
        message={toast.message}
        type={toast.type}
        visible={toast.visible}
        onDismiss={() => setToast((prev) => ({ ...prev, visible: false }))}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#000000',
    flex: 1,
  },
  screenBody: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  keyboardAvoidFill: {
    flex: 1,
  },
  scrollFlex: {
    flex: 1,
  },
  analysisResultsContent: {
    flexGrow: 1,
    paddingBottom: Spacing.xl * 3,
  },
  centered: {
    alignItems: 'center',
    backgroundColor: '#000000',
    flex: 1,
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.md,
    padding: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  headerTextBlock: {
    flex: 1,
  },
  backButton: {
    alignItems: 'center',
    backgroundColor: '#101010',
    borderColor: '#242424',
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    minHeight: 40,
    paddingHorizontal: Spacing.md,
  },
  backButtonText: {
    color: '#FFFFFF',
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.sm,
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  title: {
    color: '#FFFFFF',
    fontFamily: FontFamily.displaySemiBold,
    fontSize: FontSize.xl,
  },
  subtitle: {
    color: '#A7A7A7',
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.sm,
    marginTop: 2,
  },
  content: {
    gap: Spacing.md,
    padding: Spacing.lg,
    paddingBottom: Spacing.lg,
    paddingTop: 0,
  },
  profileCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: Spacing.sm,
    padding: Spacing.md,
  },
  profilePainCard: {
    backgroundColor: '#1B1205',
    borderColor: '#F59E0B66',
  },
  profileText: {
    color: '#D8FBEA',
    flex: 1,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  symptomsCard: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.md,
  },
  symptomsLabel: {
    color: '#FFFFFF',
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
    marginBottom: Spacing.sm,
  },
  symptomSelectorCard: {
    backgroundColor: 'rgba(45,206,137,0.08)',
    borderColor: 'rgba(45,206,137,0.28)',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.md,
  },
  symptomSelectorHint: {
    color: '#BEBEBE',
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.xs,
    lineHeight: 18,
    marginBottom: Spacing.sm,
  },
  symptomChipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  symptomChip: {
    backgroundColor: '#111111',
    borderColor: '#2A2A2A',
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  symptomChipSelected: {
    backgroundColor: '#2DCE89',
    borderColor: '#68F3B3',
  },
  symptomChipText: {
    color: '#D8D8D8',
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
  },
  symptomChipTextSelected: {
    color: '#000000',
  },
  symptomsInput: {
    backgroundColor: '#111111',
    borderColor: '#242424',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    color: '#FFFFFF',
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.md,
    minHeight: 76,
    padding: Spacing.md,
  },
  symptomsInputRow: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  symptomsInputFlex: {
    flex: 1,
  },
  symptomsMicButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: BorderRadius.full,
    height: 42,
    justifyContent: 'center',
    marginBottom: 2,
    width: 42,
  },
  recordingIndicatorInline: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginTop: Spacing.sm,
  },
  capturedCard: {
    backgroundColor: 'rgba(45,206,137,0.1)',
    borderColor: 'rgba(45,206,137,0.35)',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    gap: Spacing.md,
    marginTop: Spacing.sm,
    padding: Spacing.md,
  },
  capturedPrompt: {
    color: '#D8FBEA',
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.md,
    lineHeight: 22,
  },
  analyzeCombinedButton: {
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: '#2DCE89',
    borderRadius: BorderRadius.lg,
    flexDirection: 'row',
    gap: Spacing.sm,
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    ...Shadows.sm,
  },
  analyzeCombinedButtonDisabled: {
    backgroundColor: '#2a3d34',
    opacity: 0.55,
  },
  analyzeCombinedButtonText: {
    color: '#000000',
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.md,
  },
  locationCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: Spacing.sm,
    padding: Spacing.md,
  },
  locationText: {
    color: '#BEBEBE',
    flex: 1,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  actionGrid: {
    gap: Spacing.md,
  },
  photoActionButton: {
    borderRadius: BorderRadius.xl,
    minHeight: 156,
    overflow: 'hidden',
    padding: Spacing.lg,
    ...Shadows.md,
  },
  takePhotoButton: {
    backgroundColor: '#073D2B',
  },
  galleryButton: {
    backgroundColor: '#111111',
    borderColor: '#1E3B2F',
    borderWidth: 1,
  },
  photoActionIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: BorderRadius.full,
    height: 58,
    justifyContent: 'center',
    marginBottom: Spacing.md,
    width: 58,
  },
  photoActionTitle: {
    color: Colors.textInverse,
    fontFamily: FontFamily.displaySemiBold,
    fontSize: FontSize.xl,
  },
  photoActionText: {
    color: 'rgba(255,255,255,0.84)',
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.sm,
    lineHeight: 20,
    marginTop: Spacing.xs,
  },
  pressed: {
    opacity: 0.86,
    transform: [{ scale: 0.99 }],
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.lg,
    flexDirection: 'row',
    gap: Spacing.sm,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    ...Shadows.md,
  },
  primaryButtonText: {
    color: Colors.textInverse,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.md,
  },
  secondaryButton: {
    marginTop: Spacing.sm,
    padding: Spacing.md,
  },
  secondaryButtonText: {
    color: Colors.primary,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.sm,
  },
  disabledButton: {
    backgroundColor: '#242424',
  },
  permissionTitle: {
    color: Colors.text,
    fontFamily: FontFamily.displaySemiBold,
    fontSize: FontSize.xl,
    marginTop: Spacing.md,
  },
  permissionText: {
    color: Colors.textSecondary,
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.md,
    lineHeight: 23,
    marginBottom: Spacing.md,
    marginTop: Spacing.sm,
    textAlign: 'center',
  },
  scanNotice: {
    alignItems: 'center',
    backgroundColor: '#0B2618',
    borderColor: Colors.primary,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    flexDirection: 'column',
    gap: Spacing.sm,
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  scanNoticeBrand: {
    color: Colors.primaryLight,
    fontFamily: FontFamily.displaySemiBold,
    fontSize: FontSize.lg,
    letterSpacing: 0.5,
  },
  scanNoticeText: {
    color: Colors.secondaryLight,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
    textAlign: 'center',
  },
  previewImage: {
    borderRadius: BorderRadius.xl,
    height: 180,
    width: '100%',
  },
  resultCard: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    padding: Spacing.lg,
    ...Shadows.sm,
  },
  rankUpBadge: {
    alignItems: 'center',
    alignSelf: 'flex-start',
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
  resultHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.sm,
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  resultTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flex: 1,
    flexShrink: 1,
    gap: Spacing.sm,
  },
  resultShareButton: {
    alignItems: 'center',
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  resultTitle: {
    color: '#FFFFFF',
    fontFamily: FontFamily.displaySemiBold,
    fontSize: FontSize.lg,
  },
  scoreBadge: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#102C20',
    borderRadius: BorderRadius.full,
    flexDirection: 'row',
    gap: Spacing.xs,
    marginBottom: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    ...Shadows.sm,
  },
  scorePainBadge: {
    backgroundColor: '#F59E0B',
  },
  scoreBadgeLabel: {
    color: '#B7F7D6',
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.xs,
    opacity: 0.9,
  },
  scoreBadgeValue: {
    color: '#2DCE89',
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.md,
  },
  analysisInsightCard: {
    backgroundColor: '#0F2D22',
    borderColor: '#2DCE8966',
    borderRadius: 15,
    borderWidth: 1,
    marginBottom: Spacing.lg,
    padding: Spacing.md,
    shadowColor: '#2DCE89',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 18,
    elevation: 3,
  },
  analysisInsightHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  analysisInsightIcon: {
    alignItems: 'center',
    backgroundColor: '#2DCE8940',
    borderRadius: BorderRadius.full,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  analysisInsightTitle: {
    color: '#FFFFFF',
    flex: 1,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.md,
  },
  analysisInsightList: {
    gap: Spacing.sm,
  },
  analysisInsightItem: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  analysisInsightDot: {
    backgroundColor: '#7DD9A8',
    borderRadius: BorderRadius.full,
    height: 7,
    marginTop: 7,
    width: 7,
  },
  analysisInsightText: {
    color: '#D8FBEA',
    flex: 1,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  instantReliefCard: {
    backgroundColor: '#1B1205',
    borderColor: '#F59E0B66',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    marginTop: Spacing.lg,
    padding: Spacing.md,
  },
  instantReliefHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  instantReliefTitle: {
    color: '#FFFFFF',
    flex: 1,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.md,
  },
  instantReliefText: {
    color: '#F5D9A8',
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.sm,
    lineHeight: 21,
  },
  resultText: {
    color: '#F5F5F5',
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.md,
    lineHeight: 24,
  },
  planBCard: {
    backgroundColor: '#101010',
    borderColor: '#2DCE8944',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    marginTop: Spacing.lg,
    padding: Spacing.md,
  },
  planBHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  planBTitle: {
    color: '#FFFFFF',
    flex: 1,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.md,
  },
  planBText: {
    color: '#D8D8D8',
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.sm,
    lineHeight: 21,
  },
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
  scientificSourceRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    marginTop: Spacing.sm,
  },
  scientificSourceText: {
    color: '#8CA99A',
    flex: 1,
    fontFamily: FontFamily.sansMedium,
    fontSize: 11,
    lineHeight: 16,
  },
  disagreeButton: {
    alignItems: 'center',
    backgroundColor: '#171717',
    borderColor: '#333333',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: Spacing.sm,
    justifyContent: 'center',
    marginTop: Spacing.lg,
    minHeight: 50,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  disagreeButtonText: {
    color: '#FFFFFF',
    flexShrink: 1,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.sm,
    textAlign: 'center',
  },
  resultActionsRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.lg,
  },
  logMealButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderColor: 'rgba(82,183,136,0.45)',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: Spacing.sm,
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  logMealButtonText: {
    color: '#E8FDF4',
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.sm,
  },
  resultActionDisabled: {
    opacity: 0.65,
  },
  shareButton: {
    alignItems: 'center',
    backgroundColor: '#2DCE89',
    borderRadius: BorderRadius.lg,
    flex: 1,
    flexDirection: 'row',
    gap: Spacing.sm,
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    ...Shadows.sm,
  },
  shareButtonText: {
    color: '#000000',
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.md,
  },
  chatThread: {
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  chatBubble: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    maxWidth: '88%',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  chatBubbleUser: {
    alignSelf: 'flex-end',
    backgroundColor: 'rgba(45,206,137,0.18)',
    borderColor: 'rgba(45,206,137,0.32)',
  },
  chatBubbleAssistant: {
    alignSelf: 'flex-start',
  },
  chatBubbleText: {
    color: '#E8E8E8',
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.sm,
    lineHeight: 21,
  },
  chatBubbleUserText: {
    color: '#D8FBEA',
    fontFamily: FontFamily.sansMedium,
  },
  chatDock: {
    backgroundColor: 'rgba(8,8,8,0.88)',
    borderColor: 'rgba(255,255,255,0.12)',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    padding: Spacing.md,
    paddingTop: Spacing.md,
  },
  chatDockHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.sm,
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  newScanButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(45,206,137,0.1)',
    borderColor: 'rgba(45,206,137,0.25)',
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
  },
  newScanText: {
    color: '#2DCE89',
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xs,
  },
  correctingPill: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'flex-end',
  },
  correctingText: {
    color: '#A7A7A7',
    flexShrink: 1,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.xs,
  },
  chatInputRow: {
    alignItems: 'flex-end',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    flexDirection: 'row',
    gap: Spacing.sm,
    padding: Spacing.sm,
  },
  micButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: BorderRadius.full,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  micRecording: {
    backgroundColor: '#DC2626',
  },
  chatInput: {
    color: '#FFFFFF',
    flex: 1,
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.md,
    lineHeight: 24,
    maxHeight: 96,
    minHeight: 42,
    paddingHorizontal: Spacing.sm,
    paddingTop: 9,
  },
  sendButton: {
    alignItems: 'center',
    backgroundColor: '#2DCE89',
    borderRadius: BorderRadius.full,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  sendButtonDisabled: {
    opacity: 0.4,
  },
  wizardStep2Content: {
    paddingBottom: Spacing.xl * 2,
  },
  accuracySectionCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    gap: Spacing.sm,
    marginTop: Spacing.md,
    padding: Spacing.md,
  },
  wizardThumbnail: {
    alignSelf: 'center',
    borderRadius: BorderRadius.lg,
    height: 160,
    width: '100%',
  },
  step2PromptText: {
    color: '#FFFFFF',
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.md,
    lineHeight: 22,
    textAlign: 'center',
  },
  expoGoHintCard: {
    alignItems: 'flex-start',
    backgroundColor: 'rgba(45,206,137,0.08)',
    borderColor: 'rgba(45,206,137,0.28)',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: Spacing.sm,
    padding: Spacing.md,
  },
  expoGoHintText: {
    color: '#D8FBEA',
    flex: 1,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  wizardMicCenter: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: Spacing.sm,
  },
  wizardMicLarge: {
    alignItems: 'center',
    backgroundColor: 'rgba(45,206,137,0.35)',
    borderColor: 'rgba(45,206,137,0.65)',
    borderRadius: BorderRadius.full,
    borderWidth: 2,
    height: 88,
    justifyContent: 'center',
    width: 88,
    ...Shadows.md,
  },
  wizardMicLargeDisabled: {
    opacity: 0.45,
  },
  wizardRecordingCenter: {
    alignSelf: 'center',
    justifyContent: 'center',
  },
  wizardFeelingsInput: {
    backgroundColor: '#111111',
    borderColor: '#242424',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    color: '#FFFFFF',
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.md,
    minHeight: 120,
    padding: Spacing.md,
  },
  wizardFeelingsInputExpoGo: {
    minHeight: 152,
  },
  changePhotoLink: {
    alignSelf: 'center',
    marginTop: Spacing.sm,
    padding: Spacing.sm,
  },
  changePhotoLinkText: {
    color: Colors.primaryLight,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
  },
  wizardNextButton: {
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: '#2DCE89',
    borderRadius: BorderRadius.lg,
    flexDirection: 'row',
    gap: Spacing.sm,
    justifyContent: 'center',
    marginTop: Spacing.sm,
    minHeight: 52,
    paddingHorizontal: Spacing.lg,
    ...Shadows.sm,
  },
  wizardNextButtonDisabled: {
    opacity: 0.55,
  },
  wizardNextButtonText: {
    color: '#000000',
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.md,
  },
  wizardFooterRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'flex-start',
    marginTop: Spacing.md,
  },
  wizardStep4Hint: {
    color: '#888888',
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.xs,
    marginBottom: Spacing.xs,
    marginTop: Spacing.lg,
  },
  accuracyQuestion: {
    color: '#FFFFFF',
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
    marginBottom: Spacing.sm,
  },
  accuracyRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  accuracyChip: {
    alignItems: 'center',
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: Spacing.md,
  },
  accuracyChipSelectedYes: {
    backgroundColor: 'rgba(45,206,137,0.2)',
    borderColor: '#2DCE89',
  },
  accuracyChipSelectedNo: {
    backgroundColor: 'rgba(248,113,113,0.12)',
    borderColor: '#F87171',
  },
  accuracyChipText: {
    color: '#D0D0D0',
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
  },
  accuracyChipTextSelected: {
    color: '#FFFFFF',
  },
  accuracyChipTextSelectedNo: {
    color: '#FECACA',
  },
  correctionBox: {
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    gap: Spacing.sm,
    marginTop: Spacing.md,
    padding: Spacing.md,
  },
  correctionInputRow: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  correctionInput: {
    backgroundColor: '#111111',
    borderColor: '#242424',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    color: '#FFFFFF',
    flex: 1,
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.sm,
    minHeight: 72,
    padding: Spacing.sm,
  },
  correctionInputExpoGoFull: {
    minHeight: 96,
  },
  applyCorrectionButton: {
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: '#2DCE89',
    borderRadius: BorderRadius.lg,
    justifyContent: 'center',
    minHeight: 46,
    paddingHorizontal: Spacing.md,
  },
  applyCorrectionButtonDisabled: {
    opacity: 0.55,
  },
  applyCorrectionButtonText: {
    color: '#000000',
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.sm,
  },
  rtlText: {
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  rtlRow: {
    flexDirection: 'row-reverse',
  },
});
