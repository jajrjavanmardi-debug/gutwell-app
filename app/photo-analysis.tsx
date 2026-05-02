import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
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

import { Toast } from '../components/ui/Toast';
import { useAuth } from '../contexts/AuthContext';
import { BorderRadius, Colors, FontFamily, FontSize, Shadows, Spacing } from '../constants/theme';
import {
  parseRnVoiceError,
  teardownExpoSpeechRecognition,
  tryStartExpoSpeechRecognition,
} from '../lib/meal-voice-session';
import { enqueue } from '../lib/offline-queue';
import { canUseNativeSpeechToText } from '../lib/runtime-environment';
import { analyzeMealPhoto, reviseMealAnalysis } from '../lib/RecommendationEngine';
import {
  extractMealName,
  extractMealImpactScore,
  getPhotoAnalysisHistory,
  savePhotoAnalysisHistoryItem,
} from '../lib/photo-analysis-history';
import { getRecentSupplements, type SupplementHistoryItem } from '../lib/supplement-history';
import { supabase } from '../lib/supabase';
import {
  addXpForAction,
  getUserProgressProfile,
  recordTriggerFeedback,
  type TriggerFeedbackItem,
} from '../lib/user-progress';

type AppLanguage = 'en' | 'de';
type WizardStep = 1 | 2 | 3;
const APP_LANGUAGE_STORAGE_KEY = 'gutwell_app_language';
/** When set to `Germany`, skips GPS and fixes AI context to Nürtingen (dev/testing only). */
const DEV_LOCATION_OVERRIDE = process.env.EXPO_PUBLIC_DEV_LOCATION_OVERRIDE?.trim() ?? '';
const TEST_GUT_PROFILE = {
  gutScore: 4,
  conditions: ['IBS', 'Bloating'],
};

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
    profileContext: 'Personalized for Gut Score 4/10, IBS and bloating',
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
    symptomsPlaceholder: 'Before taking a photo you can note symptoms; after capture, describe how you feel.',
    howYouFeelLabel: 'What is it & how do you feel?',
    howYouFeelPlaceholder: 'Example: This is lentil soup—I feel bloated and sluggish.',
    photoCapturedPrompt: 'Photo captured! Speak or type how you feel.',
    analyzeCombined: 'Analyze Meal',
    feelingsRequiredTitle: 'Describe the meal first',
    feelingsRequiredMessage: 'Speak or type how you feel (and what the food is if you want)—then tap Generate Analysis.',
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
    profileContext: 'Personalisiert für Darm-Score 4/10, IBS und Blähungen',
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
    symptomsPlaceholder: 'Vor dem Foto optional Symptome; nach der Aufnahme beschreibst du dein Befinden.',
    howYouFeelLabel: 'Was ist es & wie fühlst du dich?',
    howYouFeelPlaceholder: 'Zum Beispiel: Das ist Linsensuppe—Ich fühle mich aufgebläht.',
    photoCapturedPrompt: 'Foto gespeichert! Sprich oder tippe, wie du dich fühlst.',
    analyzeCombined: 'Mahlzeit analysieren',
    feelingsRequiredTitle: 'Erst die Mahlzeit beschreiben',
    feelingsRequiredMessage: 'Bitte per Sprache oder Text beschreiben, wie du dich fühlst (und optional das Essen)—danach „Analyse erstellen“.',
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
    expoGoTextOnlyHint:
      'Expo Go (Entwicklung): Halten-zum-Sprechen ist aus. Beschreib Mahlzeit und Befinden im Textfeld — Analyse, Nürtingen-Hinweise und der 4-Schritte-Ablauf bleiben aktiv.',
  },
} as const;

type NativeLocationModule = {
  Accuracy: { Balanced: number };
  requestForegroundPermissionsAsync: () => Promise<{ status: string }>;
  getCurrentPositionAsync: (options: { accuracy: number }) => Promise<{
    coords: { latitude: number; longitude: number };
  }>;
  reverseGeocodeAsync: (coords: { latitude: number; longitude: number }) => Promise<Array<{
    city?: string | null;
    district?: string | null;
    subregion?: string | null;
    region?: string | null;
    country?: string | null;
  }>>;
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
  return /stomach ache|stomach pain|abdominal pain|belly pain|cramp|bloating pain|bauchschmerz|bauchschmerzen|krampf/i.test(value);
}

function getVoiceLocale(language: AppLanguage): string {
  return {
    en: 'en-US',
    de: 'de-DE',
  }[language];
}

function getCorrectionLanguage(correction: string, currentLanguage: AppLanguage): AppLanguage {
  return /[äöüß]|\b(ich|du|das|tee|brot|kartoffel|zucchini|reis)\b/i.test(correction)
    ? 'de'
    : currentLanguage === 'de'
      ? 'de'
      : 'en';
}

function isDifferentFoodCorrection(correction: string): boolean {
  return /\b(it is|it's|this is|actually|not|instead|tea|herbal tea|soup|rice|potato|zucchini|yogurt|banana|das ist|eigentlich|tee|suppe|reis|kartoffel)\b/i.test(correction);
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
  const isRtlLanguage = false;
  const userEnteredSymptoms = mealDescription
      .split(/[,\n]+/)
      .map((symptom) => symptom.trim())
      .filter(Boolean);
  const currentSymptoms = [
    ...TEST_GUT_PROFILE.conditions,
    ...userEnteredSymptoms,
  ];
  const hasPainSymptom = currentSymptoms.some((symptom) =>
    hasPainText(symptom)
  );
  const mealImpactScore = extractMealImpactScore(analysis);
  const wizardSubtitle =
    wizardStep === 1 ? t.wizardStep1Subtitle : wizardStep === 2 ? t.wizardStep2Subtitle : t.wizardStep3Subtitle;
  const canRecordFeelings = wizardStep === 2 && Boolean(photoUri && lastImageBase64);

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

  useEffect(() => {
    AsyncStorage.getItem(APP_LANGUAGE_STORAGE_KEY)
      .then((storedLanguage) => {
        if (storedLanguage === 'en' || storedLanguage === 'de') {
          setLanguage(storedLanguage);
        } else {
          setLanguage('en');
        }
      })
      .catch(console.warn);
  }, []);

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

    getPhotoAnalysisHistory()
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
        setMealDescription(
          savedAnalysis.symptoms
            .filter((symptom) => !TEST_GUT_PROFILE.conditions.includes(symptom))
            .join(', ')
        );
      })
      .catch(console.warn);
  }, [params.historyId]);

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

  const handleGenerateAnalysis = () => {
    if (!lastImageBase64.trim() || !photoUri) return;
    const narrative = mealDescription.trim();
    if (!narrative) {
      Alert.alert(t.feelingsRequiredTitle, t.feelingsRequiredMessage);
      return;
    }
    void runPhotoAnalysis(lastImageBase64, photoUri, narrative);
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
        gutScore: TEST_GUT_PROFILE.gutScore,
        conditions: TEST_GUT_PROFILE.conditions,
        symptoms: currentSymptoms,
        userEnteredSymptoms,
        supplementsTakenToday: todaysSupplements.map((item) => `${item.name} (${item.dosage}, ${item.time})`),
        triggerMemories: [],
        locationContext,
        retailLocationHint,
        userFeelingsNarrative: feelingsNarrative,
      });
      setAnalysis(rawResult);
      setResultsScrollKey((key) => key + 1);
      setWizardStep(3);
      setAccuracyAnswer(null);
      setCorrectionDraft('');
      await savePhotoAnalysisHistoryItem({
        imageUri: uri,
        aiText: rawResult,
        symptoms: currentSymptoms,
        mealImpactScore: extractMealImpactScore(rawResult),
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

  const takePhoto = async () => {
    if (isAnalyzing) return;

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
        preferredLanguage: getCorrectionLanguage(correction, language),
        previousAnalysis: correctionIsDifferentFood
          ? 'Previous meal context intentionally cleared because the user described a different food. Do not mention the old guessed food.'
          : [
            lastImageBase64 ? 'Photo context is still available from this scan.' : 'Photo context is from saved analysis text only.',
            analysis,
          ].join('\n\n'),
        correction,
        gutScore: TEST_GUT_PROFILE.gutScore,
        conditions: TEST_GUT_PROFILE.conditions,
        symptoms: [...currentSymptoms, correction],
        triggerMemories: [],
        locationContext,
        retailLocationHint,
        priorUserCorrections: userFeedback,
      });
      const correctedAnalysis = ensurePainApology(
        revisedAnalysis,
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
                disabled={!mealDescription.trim() || isAnalyzing || !lastImageBase64.trim()}
                accessibilityRole="button"
                accessibilityLabel={t.generateAnalysis}
                accessibilityState={{
                  disabled: !mealDescription.trim() || isAnalyzing || !lastImageBase64.trim(),
                }}
                style={({ pressed }) => [
                  styles.analyzeCombinedButton,
                  (!mealDescription.trim() || isAnalyzing || !lastImageBase64.trim()) &&
                    styles.analyzeCombinedButtonDisabled,
                  pressed &&
                    mealDescription.trim() &&
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
                      <View style={styles.resultTitleRow}>
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
                        <Text style={styles.scoreBadgeLabel}>{t.scoreLabel}</Text>
                        <Text style={styles.scoreBadgeValue}>{mealImpactScore}</Text>
                      </View>
                    ) : null}
                    <Text style={[styles.resultText, isRtlLanguage && styles.rtlText]}>{analysis}</Text>
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
