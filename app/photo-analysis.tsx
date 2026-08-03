import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
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
import * as Clipboard from 'expo-clipboard';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScanTutorial } from '../components/ScanTutorial';
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
  extractMealTitle,
  extractScoreReason,
  extractMealImpactScore,
  getPhotoAnalysisHistory,
  savePhotoAnalysisHistoryItem,
} from '../lib/photo-analysis-history';
import { getRecentSupplements, type SupplementHistoryItem } from '../lib/supplement-history';
import { supabase } from '../lib/supabase';
import { track, Events } from '../lib/analytics';
import type { AppLanguage } from '../lib/language';
import { useLanguage } from '../lib/LanguageContext';
import { useTranslation } from '../lib/i18n';
import {
  getTriggerMemories,
  recordTriggerFeedback,
  type TriggerFeedbackItem,
} from '../lib/user-progress';

type WizardStep = 1 | 2 | 3;
/** Shows the 4-slide scan tutorial only on the user's first visit to this screen. */
const SCAN_TUTORIAL_SEEN_KEY = 'gutwell_scan_tutorial_seen';
/** When set to `Germany`, skips GPS and fixes AI context to Nürtingen (dev/testing only). */
const DEV_LOCATION_OVERRIDE = process.env.EXPO_PUBLIC_DEV_LOCATION_OVERRIDE?.trim() ?? '';
/**
 * The user's real gut context sent to the AI: their latest computed gut score
 * (0–100, mapped to the prompt's 1–10 scale) and the conditions/concerns they
 * actually told us about. Empty when unknown — the server prompt treats
 * missing context as "not provided" instead of assuming a condition.
 */
type GutProfileContext = { gutScore: number | null; conditions: string[]; dietType: string | null };

// copy object removed — strings migrated to lib/i18n.ts photoAnalysis namespace

type NativeLocationModule = {
  Accuracy: { Balanced: number };
  requestForegroundPermissionsAsync: () => Promise<{ status: string }>;
  getForegroundPermissionsAsync: () => Promise<{ status: string }>;
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
  // Privacy: only coarse place names ever leave the device — never raw
  // coordinates. (The coords parameter remains for reverse geocoding only.)
  void coordinates;
  return Array.from(new Set(areaParts)).join(', ');
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

function sanitizeMealScoring(text: string): string {
  const lines = text.split('\n');
  const result: string[] = [];
  const scoreSectionHeadings = [
    /^##?\s*Meal Fit Estimate/i,
    /^##?\s*Orientierende Mahlzeiten-Einschätzung/i,
  ];
  const scoreLinePatterns = [
    /^Educational Meal Estimate\s*:/i,
    /^Orientierende Mahlzeiten-Einschätzung\s*:/i,
    /^Pattern-based estimate/i,
    /^Musterbasierte Einschätzung/i,
    /\[#{1,20}[-─\s]*\].*\/10/,
    /\[[-─\s]*#{1,20}\].*\/10/,
    /^This is an educational estimate based on your profile/i,
    /^Dies ist eine orientierende Einschätzung/i,
  ];
  let skipSection = false;
  for (const line of lines) {
    const startsScoreSection = scoreSectionHeadings.some(p => p.test(line));
    if (startsScoreSection) { skipSection = true; continue; }
    if (skipSection) {
      const isNewHeading = /^##?\s/.test(line);
      if (isNewHeading && !scoreSectionHeadings.some(p => p.test(line))) {
        skipSection = false;
      } else {
        continue;
      }
    }
    if (scoreLinePatterns.some(p => p.test(line))) continue;
    result.push(line);
  }
  return result.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function sanitizeAnalysisForDisplay(text: string): string {
  const cleaned = sanitizeMealScoring(text)
    // 1. Remove heading prefixes: ###, ##, # (with optional leading whitespace)
    .replace(/^\s*#{1,3}\s*/gm, '')
    // 2. Remove markdown table separator rows: | --- | :--- | ---: |
    .replace(/^\|?[\s:\-|]+\|?\s*$/gm, '')
    // 3. Strip outer pipes from table rows: | a | b | -> a  b
    .replace(/^\|(.+)\|\s*$/gm, (_: string, inner: string) =>
      inner.split('|').map((c: string) => c.trim()).filter(Boolean).join('  '))
    // 4. Remove bold: **text** -> text
    .replace(/\*\*([^*]+?)\*\*/g, '$1')
    // 5. Remove italic: *text* -> text (not inside words)
    .replace(/(^|\s)\*([^*\n]+?)\*(\s|$)/gm, '$1$2$3')
    // 6. Remove __bold__
    .replace(/__([^_]+?)__/g, '$1')
    // 7. Remove _italic_
    .replace(/(?<![\w])_([^_\n]+?)_(?![\w])/g, '$1')
    // 8. Remove leading bullets: * item, - item, • item
    .replace(/^\s*[*\-\u2022]\s+/gm, '')
    // 9. Remove EN/DE medical disclaimer appended by the model (shown separately in the UI grey card)
    .replace(/Important note:\s*This analysis is for informational purposes only[^\n]*/gi, '')
    .replace(/Wichtiger Hinweis:\s*Diese Analyse dient nur der Information[^\n]*/gi, '')
    // 10. Collapse 3+ blank lines to 2
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return cleaned;
}

function ensurePainApology(analysis: string, apology: string, hasPainSymptom: boolean): string {
  if (!hasPainSymptom) return analysis;
  return analysis.trim().startsWith(apology) ? analysis : `${apology}\n\n${analysis}`;
}

function hasPainText(value: string): boolean {
  return /stomach ache|stomach pain|abdominal pain|belly pain|cramp|bloating pain|bauchschmerz|bauchschmerzen|krampf/i.test(value);
}

function getVoiceLocale(language: AppLanguage): string {
  return ({
    en: 'en-US',
    de: 'de-DE',
  } as Record<AppLanguage, string>)[language] ?? 'en-US';
}

function getCorrectionLanguage(correction: string, currentLanguage: AppLanguage): AppLanguage {
  return /[äöüß]|\b(ich|du|das|tee|brot|kartoffel|zucchini|reis)\b/i.test(correction)
    ? 'de'
    : currentLanguage === 'de'
      ? 'de'
      : currentLanguage;
}

function isDifferentFoodCorrection(correction: string): boolean {
  return /\b(it is|it's|this is|actually|not|instead|tea|herbal tea|soup|rice|potato|zucchini|yogurt|banana|das ist|eigentlich|tee|suppe|reis|kartoffel)\b/i.test(correction);
}

export default function PhotoAnalysisScreen() {
  const t = useTranslation();
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
  // Language comes from LanguageContext — the same source Settings writes to.
  // A previous local loader read an orphan AsyncStorage key that nothing ever
  // wrote, so this screen always fell back to English and sent 'en' to the AI.
  const { language } = useLanguage();
  /** Pre-analyze field: what the meal is + how the user feels (voice or text). */
  const [wizardStep, setWizardStep] = useState<WizardStep>(1);
  const [accuracyAnswer, setAccuracyAnswer] = useState<'yes' | 'no' | null>(null);
  const [correctionDraft, setCorrectionDraft] = useState('');
  const [mealDescription, setMealDescription] = useState('');
  const [currentStateContext, setCurrentStateContext] = useState<string | null>(null);
  const [afterMealActivity, setAfterMealActivity] = useState<string | null>(null);
  const [contextExpanded, setContextExpanded] = useState(true);
  /** Corrections the user submitted this session (typed or sent after voice); fed to revise prompts as prior context. */
  const [userFeedback, setUserFeedback] = useState<string[]>([]);
  const [todaysSupplements, setTodaysSupplements] = useState<SupplementHistoryItem[]>([]);
  const [triggerMemories, setTriggerMemories] = useState<TriggerFeedbackItem[]>([]);
  const [planBMessage, setPlanBMessage] = useState('');
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
  const { user, profile } = useAuth();
  const [toast, setToast] = useState({
    visible: false,
    message: '',
    type: 'success' as 'success' | 'error' | 'info',
  });
  const [gutProfileContext, setGutProfileContext] = useState<GutProfileContext>({
    gutScore: null,
    conditions: [],
    dietType: null,
  });

  useEffect(() => {
    if (!user) {
      setGutProfileContext({ gutScore: null, conditions: [], dietType: null });
      return;
    }
    let cancelled = false;
    (async () => {
      const conditions = new Set<string>();
      if (profile?.gut_concern?.trim()) {
        conditions.add(profile.gut_concern.trim().replace(/_/g, ' '));
      }
      try {
        const { data } = await supabase
          .from('user_profiles')
          .select('medical_conditions')
          .eq('user_id', user.id)
          .maybeSingle();
        if (Array.isArray(data?.medical_conditions)) {
          for (const condition of data.medical_conditions) {
            if (typeof condition === 'string' && condition.trim()) conditions.add(condition.trim());
          }
        }
      } catch {
        // Optional context — analysis still works without it.
      }
      let gutScore: number | null = null;
      try {
        const { data } = await supabase
          .from('gut_scores')
          .select('score')
          .eq('user_id', user.id)
          .order('date', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (typeof data?.score === 'number') {
          gutScore = Math.min(10, Math.max(1, Math.round(data.score / 10)));
        }
      } catch {
        // No score yet (new user) — send nothing rather than a fake number.
      }
      let dietType: string | null = null;
      try {
        const rawSettings = await AsyncStorage.getItem('gutwell_settings');
        const parsed = rawSettings ? JSON.parse(rawSettings) : null;
        if (typeof parsed?.dietType === 'string' && parsed.dietType !== 'Standard') {
          dietType = parsed.dietType;
        }
      } catch {
        // Settings unreadable — diet context is optional.
      }
      if (!cancelled) setGutProfileContext({ gutScore, conditions: [...conditions], dietType });
    })();
    return () => {
      cancelled = true;
    };
  }, [user, profile?.gut_concern]);
  const [isLoggingMeal, setIsLoggingMeal] = useState(false);
  /**
   * Tutorial gating: `null` until we've read AsyncStorage so we never flash the
   * tutorial for returning users. Skipped entirely when opening saved history.
   */
  const [showTutorial, setShowTutorial] = useState<boolean | null>(null);
  // UI chrome and AI output are both EN/DE, driven by the same preference.
  /** Dev client / standalone only — Expo Go has no custom native STT modules. */
  const voiceNativeEnabled = canUseNativeSpeechToText();
  const userEnteredSymptoms = mealDescription
      .split(/[,\n]+/)
      .map((symptom) => symptom.trim())
      .filter(Boolean);
  const currentSymptoms = [
    ...gutProfileContext.conditions,
    ...userEnteredSymptoms,
  ];
  const hasPainSymptom = currentSymptoms.some((symptom) =>
    hasPainText(symptom)
  );
  const shouldShowMealScoreBadge = true; // SCORE badge re-enabled for GutWell meal impact scoring
  const mealImpactScore = extractMealImpactScore(analysis);
  const wizardSubtitle =
    wizardStep === 1 ? t.photoAnalysis.wizardStep1Subtitle : wizardStep === 2 ? t.photoAnalysis.wizardStep2Subtitle : t.photoAnalysis.wizardStep3Subtitle;
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

  /**
   * Location is strictly OPT-IN: no permission prompt on mount. The user taps
   * the location chip to enable local suggestions; the choice persists. On
   * later visits we only load location if the OS permission is ALREADY
   * granted (silent check, never a prompt).
   */
  const loadLocation = useCallback(async (requestPermission: boolean) => {
    if (DEV_LOCATION_OVERRIDE.toLowerCase() === 'germany') {
      setLocationContext('Nürtingen, Germany');
      setRetailLocationHint('Nürtingen, Baden-Württemberg, Germany');
      setIsLocationLoading(false);
      return;
    }

    if (Platform.OS === 'web') {
      setLocationContext('');
      setRetailLocationHint('');
      setIsLocationLoading(false);
      return;
    }

    setIsLocationLoading(true);
    try {
      const Location = await import('expo-location') as NativeLocationModule;
      const { status } = requestPermission
        ? await Location.requestForegroundPermissionsAsync()
        : await Location.getForegroundPermissionsAsync();

      if (status !== 'granted') {
        setLocationContext('');
        setRetailLocationHint('');
        return;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const places = await Location.reverseGeocodeAsync(position.coords);
      const place = places[0];
      setLocationContext(formatLocationContext(position.coords, place));
      setRetailLocationHint(formatRetailLocationHint(place));
      await AsyncStorage.setItem('gutwell_location_suggestions', 'on');
    } catch (error) {
      console.warn('Location lookup failed:', error);
      setLocationContext('');
      setRetailLocationHint('');
    } finally {
      setIsLocationLoading(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    AsyncStorage.getItem('gutwell_location_suggestions')
      .then((pref) => {
        if (!isMounted) return;
        if (pref === 'on') {
          // Previously opted in — refresh silently (no permission prompt).
          void loadLocation(false);
        } else {
          setIsLocationLoading(false);
        }
      })
      .catch(() => setIsLocationLoading(false));

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    // Saved history opens straight to the result — never show the tutorial there.
    if (params.historyId) {
      setShowTutorial(false);
      return;
    }
    AsyncStorage.getItem(SCAN_TUTORIAL_SEEN_KEY)
      .then((seen) => setShowTutorial(seen !== 'yes'))
      .catch(() => setShowTutorial(false));
  }, [params.historyId]);

  const handleTutorialDone = useCallback(() => {
    setShowTutorial(false);
    AsyncStorage.setItem(SCAN_TUTORIAL_SEEN_KEY, 'yes').catch(console.warn);
  }, []);

  useEffect(() => {
    Promise.all([getRecentSupplements(12), getTriggerMemories()])
      .then(([supplements, triggers]) => {
        setTodaysSupplements(supplements);
        setTriggerMemories(triggers);
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
            .filter((symptom) => !gutProfileContext.conditions.includes(symptom))
            .join(', ')
        );
      })
      .catch(console.warn);
  }, [params.historyId]);

  const handleShareAnalysis = async () => {
    const textToShare = sanitizeAnalysisForDisplay(analysis).trim();
    if (!textToShare) {
      setToast({ visible: true, message: t.photoAnalysis.nothingToShareMessage, type: 'info' });
      return;
    }
    try {
      const summary = [t.photoAnalysis.snapshotHeading, textToShare].join('\n\n');
      const result = await Share.share({ title: t.photoAnalysis.shareTitle, message: summary });
      if (result.action === Share.dismissedAction) {
        setToast({ visible: true, message: t.photoAnalysis.shareErrorMessage, type: 'info' });
      }
    } catch (error) {
      if (__DEV__) console.error('Photo analysis share failed:', error);
      setToast({ visible: true, message: t.photoAnalysis.shareErrorMessage, type: 'info' });
    }
  };

  const handleCopyAnalysis = async () => {
    const textToShare = sanitizeAnalysisForDisplay(analysis).trim();
    if (!textToShare) {
      setToast({ visible: true, message: t.photoAnalysis.nothingToShareMessage, type: 'info' });
      return;
    }
    try {
      await Clipboard.setStringAsync(textToShare);
      const verified = await Clipboard.getStringAsync();
      if (verified && verified.length > 0) {
        setToast({ visible: true, message: t.photoAnalysis.copiedToast, type: 'success' });
      } else {
        setToast({ visible: true, message: t.photoAnalysis.shareErrorMessage, type: 'info' });
      }
    } catch (error) {
      if (__DEV__) console.error('Copy failed:', error);
      setToast({ visible: true, message: t.photoAnalysis.shareErrorMessage, type: 'info' });
    }
  };

  const handleLogPhotoAnalysis = async () => {
    if (!analysis || !user) {
      setToast({ visible: true, message: t.photoAnalysis.loginRequired, type: 'error' });
      return;
    }

    const mealName = extractMealName(analysis).trim().slice(0, 200) || t.photoAnalysis.photoMealDefault;

    const payload = {
      user_id: user.id,
      meal_name: mealName,
      meal_type: getMealTypeForClock(),
      foods: null as string[] | null,
      note: `${sanitizeMealScoring(analysis).slice(0, 600)}`,
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
        setToast({ visible: true, message: t.photoAnalysis.logMealOffline, type: 'info' });
      } else {
        setToast({ visible: true, message: t.photoAnalysis.logMealFailed, type: 'error' });
      }
      return;
    }

    setToast({ visible: true, message: t.photoAnalysis.logMealSuccess, type: 'success' });
  };

  const handleGenerateAnalysis = () => {
    if (!lastImageBase64.trim() || !photoUri) return;
    const narrative = mealDescription.trim();
    if (!narrative) {
      Alert.alert(t.photoAnalysis.feelingsRequiredTitle, t.photoAnalysis.feelingsRequiredMessage);
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
        gutScore: gutProfileContext.gutScore ?? undefined,
        conditions: gutProfileContext.conditions,
        symptoms: currentSymptoms,
        userEnteredSymptoms,
        supplementsTakenToday: todaysSupplements.map((item) => `${item.name} (${item.dosage}, ${item.time})`),
        triggerMemories: [],
        locationContext,
        retailLocationHint,
        userFeelingsNarrative: gutProfileContext.dietType
          ? `(My diet is ${gutProfileContext.dietType}.) ${feelingsNarrative}`
          : feelingsNarrative,
        mealContext: (currentStateContext || afterMealActivity) ? {
          currentState: currentStateContext ?? undefined,
          afterMealActivity: afterMealActivity ?? undefined,
        } : undefined,
      });
      setAnalysis(rawResult);
      track(Events.FOOD_SCANNED);
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
      if (hasPainSymptom) {
        const triggers = await recordTriggerFeedback({
          mealName: extractMealName(rawResult),
          adviceSummary: rawResult.slice(0, 240),
          symptoms: currentSymptoms,
        });
        setTriggerMemories(triggers);
      }
    } catch (error) {
      console.error('Meal photo analysis failed:', error);
      Alert.alert(
        t.photoAnalysis.photoAnalysisFailedTitle,
        error instanceof Error ? error.message : t.photoAnalysis.photoAnalysisFailedTryAgain,
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  const storeCapturedPhoto = (asset: ImagePicker.ImagePickerAsset) => {
    if (!asset.base64) {
      Alert.alert(t.photoAnalysis.photoUnavailableTitle, t.photoAnalysis.photoUnavailableMessage);
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
      Alert.alert(t.photoAnalysis.cameraNeededTitle, t.photoAnalysis.cameraNeededMessage);
      return;
    }

    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.4,
        base64: true,
      });
      if (!result.canceled && result.assets[0]) {
        storeCapturedPhoto(result.assets[0]);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message.toLowerCase() : '';
      if (msg.includes('camera') || msg.includes('not available')) {
        Alert.alert(t.photoAnalysis.cameraUnavailableTitle, t.photoAnalysis.cameraUnavailableMessage);
      } else {
        Alert.alert(t.photoAnalysis.photoUnavailableTitle, t.photoAnalysis.photoAnalysisFailedTryAgain);
      }
    }
  };

  const pickImage = async () => {
    if (isAnalyzing) return;

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(t.photoAnalysis.libraryNeededTitle, t.photoAnalysis.libraryNeededMessage);
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.4,
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
        gutScore: gutProfileContext.gutScore ?? undefined,
        conditions: gutProfileContext.conditions,
        symptoms: [...currentSymptoms, correction],
        triggerMemories: [],
        locationContext,
        retailLocationHint,
        priorUserCorrections: userFeedback,
      });
      const correctedAnalysis = ensurePainApology(
        revisedAnalysis,
        t.photoAnalysis.painApology,
        hasPainSymptom || hasPainText(correction)
      );
      setAnalysis(correctedAnalysis);
      setResultsScrollKey((key) => key + 1);
      setUserFeedback((prior) => [...prior, correction]);
      setAccuracyAnswer(null);
      if (correctionIsDifferentFood) {
        setPlanBMessage('');
      }
      if (hasPainSymptom || hasPainText(correction)) {
        const triggers = await recordTriggerFeedback({
          mealName: extractMealName(correctedAnalysis),
          adviceSummary: correctedAnalysis.slice(0, 240),
          symptoms: [...currentSymptoms, correction],
        });
        setTriggerMemories(triggers);
      }
      setCorrectionDraft('');
    } catch (error) {
      console.error('Meal correction failed:', error);
      Alert.alert(
        t.photoAnalysis.correctionFailedTitle,
        error instanceof Error ? error.message : t.photoAnalysis.correctionFailedTryAgain,
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
        setToast({ visible: true, message: t.photoAnalysis.microphoneDisabledToast, type: 'info' });
      } else {
        setToast({ visible: true, message: t.photoAnalysis.voiceUnavailableMessage, type: 'info' });
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
      setToast({ visible: true, message: t.photoAnalysis.microphoneDisabledToast, type: 'info' });
    const voiceToast = () =>
      setToast({ visible: true, message: t.photoAnalysis.voiceUnavailableMessage, type: 'info' });

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

      let stopExpo: (() => Promise<void>) | null = null;
      try {
        stopExpo = await tryStartExpoSpeechRecognition(
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
      } catch {
        voiceHoldActiveRef.current = false;
        setIsListening(false);
        setVoiceTarget(null);
        voiceToast();
        return;
      }

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
    setMealDescription('');
    setCurrentStateContext(null);
    setAfterMealActivity(null);
    setContextExpanded(false);
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

  const handleBack = () => {
    if (params.historyId && wizardStep === 3) {
      // Opened from history — return to history list
      router.back();
    } else if (wizardStep === 3) {
      // Step 3 → Step 2, preserve all state
      setWizardStep(2);
      setAccuracyAnswer(null);
    } else if (wizardStep === 2) {
      // Step 2 → Step 1, preserve image
      setWizardStep(1);
    } else {
      // Step 1 → exit modal
      router.back();
    }
  };

  const handleApplyCorrection = async () => {
    const trimmed = correctionDraft.trim();
    if (!trimmed) {
      setToast({ visible: true, message: t.photoAnalysis.recommendationUnchanged, type: 'info' });
      return;
    }
    await submitChatCorrection(trimmed);
  };

  const insets = useSafeAreaInsets();

  if (showTutorial === null) {
    return <View style={styles.container} />;
  }

  if (showTutorial) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.tutorialHeader}>
          <Pressable
            onPress={handleTutorialDone}
            hitSlop={10}
            style={styles.tutorialSkip}
            accessibilityRole="button"
            accessibilityLabel={t.photoAnalysis.wizardStep4Hint}
          >
            <Text style={styles.tutorialSkipText}>{t.photoAnalysis.back}</Text>
            <Ionicons name="close" size={18} color="#FFFFFF" />
          </Pressable>
        </View>
        <ScanTutorial onDone={handleTutorialDone} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.screenBody}>
        <View style={styles.header}>
          <Pressable onPress={handleBack} hitSlop={10} style={styles.backButton}>
            <Ionicons name="chevron-back" size={20} color="#FFFFFF" />
            <Text style={styles.backButtonText}>{t.photoAnalysis.back}</Text>
          </Pressable>
          <View style={styles.headerTextBlock}>
            <Text style={[styles.title]}>{t.photoAnalysis.title}</Text>
            <Text style={[styles.subtitle]}>{wizardSubtitle}</Text>
          </View>
          <Pressable
            onPress={() => router.push('/food-history')}
            hitSlop={10}
            style={styles.historyButton}
            accessibilityRole="button"
            accessibilityLabel={t.photoAnalysis.back}
            accessibilityHint="Opens a list of your saved photo analyses"
          >
            <Ionicons name="time-outline" size={18} color="#FFFFFF" />
            <Text style={styles.historyButtonLabel}>{t.photoAnalysis.title}</Text>
          </Pressable>
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

              <Text style={[styles.step2PromptText]}>{t.photoAnalysis.step2Prompt}</Text>

              {!voiceNativeEnabled ? (
                <View style={[styles.expoGoHintCard]}>
                  <Ionicons name="information-circle-outline" size={20} color={Colors.secondaryLight} />
                  <Text style={[styles.expoGoHintText]}>{t.photoAnalysis.expoGoTextOnlyHint}</Text>
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
                          accessibilityLabel={t.photoAnalysis.voiceInputA11yLabel}
                          accessibilityHint={t.photoAnalysis.voiceInputA11yHint}
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
                        accessibilityLabel={t.photoAnalysis.voiceInputA11yLabel}
                        accessibilityHint={t.photoAnalysis.voiceInputA11yHint}
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
                    <View style={[styles.recordingIndicatorInline, styles.wizardRecordingCenter]}>
                      <ActivityIndicator color="#EF4444" size="small" />
                      <Text style={[styles.correctingText]}>{t.photoAnalysis.recording}</Text>
                    </View>
                  ) : null}
                </>
              ) : null}

              <TextInput
                value={mealDescription}
                onChangeText={setMealDescription}
                placeholder={t.photoAnalysis.howYouFeelPlaceholder}
                placeholderTextColor={Colors.textTertiary}
                multiline
                textAlignVertical="top"
                style={[
                  styles.wizardFeelingsInput,
                  !voiceNativeEnabled && styles.wizardFeelingsInputExpoGo,
                ]}
              />

              {/* Optional Meal Context chips */}
              <Pressable
                onPress={() => setContextExpanded(prev => !prev)}
                style={styles.contextToggle}
                accessibilityRole="button"
                accessibilityLabel={t.photoAnalysis.contextSectionLabel}
              >
                <Ionicons name={contextExpanded ? 'chevron-up' : 'chevron-down'} size={14} color={Colors.textSecondary} />
                <Text style={styles.contextToggleLabel}>{t.photoAnalysis.contextSectionLabel}</Text>
              </Pressable>

              {contextExpanded ? (
                <View style={styles.contextPanel}>
                  <Text style={styles.contextGroupLabel}>{t.photoAnalysis.currentStateLabel}</Text>
                  <View style={styles.contextChipsRow}>
                    {(Object.entries(t.photoAnalysis.stateOptions) as [string, string][]).map(([key, label]) => (
                      <Pressable
                        key={key}
                        onPress={() => setCurrentStateContext(currentStateContext === key ? null : key)}
                        style={[styles.contextChip, currentStateContext === key && styles.contextChipSelected]}
                        accessibilityRole="button"
                        accessibilityLabel={label}
                        accessibilityState={{ selected: currentStateContext === key }}
                        hitSlop={4}
                      >
                        <Text style={[styles.contextChipText, currentStateContext === key && styles.contextChipTextSelected]}>
                          {label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <Text style={[styles.contextGroupLabel, { marginTop: 12 }]}>{t.photoAnalysis.afterActivityLabel}</Text>
                  <View style={styles.contextChipsRow}>
                    {(Object.entries(t.photoAnalysis.activityOptions) as [string, string][]).map(([key, label]) => (
                      <Pressable
                        key={key}
                        onPress={() => setAfterMealActivity(afterMealActivity === key ? null : key)}
                        style={[styles.contextChip, afterMealActivity === key && styles.contextChipSelected]}
                        accessibilityRole="button"
                        accessibilityLabel={label}
                        accessibilityState={{ selected: afterMealActivity === key }}
                        hitSlop={4}
                      >
                        <Text style={[styles.contextChipText, afterMealActivity === key && styles.contextChipTextSelected]}>
                          {label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ) : null}

              <Pressable
                onPress={handleGenerateAnalysis}
                disabled={!mealDescription.trim() || isAnalyzing || !lastImageBase64.trim()}
                accessibilityRole="button"
                accessibilityLabel={t.photoAnalysis.generateAnalysis}
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
                <Text style={styles.analyzeCombinedButtonText}>{t.photoAnalysis.generateAnalysis}</Text>
              </Pressable>

              <Pressable onPress={handleChangePhoto} style={({ pressed }) => [styles.changePhotoLink, pressed && styles.pressed]}>
                <Text style={[styles.changePhotoLinkText]}>{t.photoAnalysis.changePhoto}</Text>
              </Pressable>

              {isAnalyzing ? (
                <View style={styles.scanNotice}>
                  <ActivityIndicator size="large" color={Colors.primary} />
                  <Text style={[styles.scanNoticeBrand]}>{t.photoAnalysis.analyzingBrand}</Text>
                  <Text style={[styles.scanNoticeText]}>{t.photoAnalysis.analyzing}</Text>
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
                <View style={styles.scanFrame}>
                  <View style={[styles.scanCorner, styles.scanCornerTL]} />
                  <View style={[styles.scanCorner, styles.scanCornerTR]} />
                  <View style={[styles.scanCorner, styles.scanCornerBL]} />
                  <View style={[styles.scanCorner, styles.scanCornerBR]} />
                  {photoUri ? (
                    <Image source={{ uri: photoUri }} style={styles.scanFramePreview} />
                  ) : (
                    <View style={styles.scanFramePlaceholder}>
                      <Ionicons name="scan-outline" size={44} color={Colors.secondary} />
                      <Text style={[styles.scanFrameHint]}>
                        {t.photoAnalysis.subtitle}
                      </Text>
                    </View>
                  )}
                </View>

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
                    <Text style={[styles.photoActionTitle]}>{t.photoAnalysis.takePhoto}</Text>
                    <Text style={[styles.photoActionText]}>{t.photoAnalysis.takePhotoText}</Text>
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
                    <Text style={[styles.photoActionTitle]}>{t.photoAnalysis.chooseGallery}</Text>
                    <Text style={[styles.photoActionText]}>{t.photoAnalysis.chooseGalleryText}</Text>
                  </Pressable>
                </View>

                {photoUri && lastImageBase64 ? (
                  <Pressable
                    onPress={() => setWizardStep(2)}
                    disabled={isAnalyzing}
                    accessibilityRole="button"
                    accessibilityLabel={t.photoAnalysis.wizardNext}
                    style={({ pressed }) => [
                      styles.wizardNextButton,
                      isAnalyzing && styles.wizardNextButtonDisabled,
                      pressed && !isAnalyzing && styles.pressed,
                    ]}
                  >
                    <Text style={styles.wizardNextButtonText}>{t.photoAnalysis.wizardNext}</Text>
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
                ]}>
                  <Ionicons
                    name={hasPainSymptom ? 'warning' : 'person-circle-outline'}
                    size={18}
                    color={hasPainSymptom ? '#F59E0B' : Colors.primary}
                  />
                  <Text style={[styles.profileText]}>
                    {(() => {
                      const parts: string[] = [];
                      if (gutProfileContext.gutScore != null) {
                        parts.push(`${t.photoAnalysis.profileContextScore} ${gutProfileContext.gutScore}/10`);
                      }
                      if (gutProfileContext.conditions.length > 0) {
                        parts.push(gutProfileContext.conditions.join(', '));
                      }
                      return parts.length > 0
                        ? `${t.photoAnalysis.profileContextPrefix}${parts.join(' · ')}`
                        : t.photoAnalysis.profileContextEmpty;
                    })()}
                  </Text>
                </View>

                <Pressable
                  style={styles.locationCard}
                  onPress={() => {
                    if (!locationContext && !isLocationLoading) void loadLocation(true);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={locationContext ? 'Location suggestions enabled' : 'Enable local food suggestions using your location'}
                >
                  <Ionicons name="location-outline" size={17} color={Colors.primary} />
                  <Text style={[styles.locationText]}>
                    {isLocationLoading
                      ? t.photoAnalysis.findingLocation
                      : locationContext
                        ? `${t.photoAnalysis.usingLocation} ${locationContext}`
                        : t.photoAnalysis.locationOptIn}
                  </Text>
                </Pressable>

                {(isAnalyzing || isCorrecting) && analysis ? (
                  <View style={styles.scanNotice}>
                    <ActivityIndicator size="large" color={Colors.primary} />
                    <Text style={[styles.scanNoticeBrand]}>{t.photoAnalysis.analyzingBrand}</Text>
                    <Text style={[styles.scanNoticeText]}>
                      {isCorrecting ? t.photoAnalysis.correcting : t.photoAnalysis.analyzing}
                    </Text>
                  </View>
                ) : null}

                {analysis ? (
                  <>
                  <View style={styles.resultCard}>
                    {photoUri ? (
                      <Image source={{ uri: photoUri }} style={styles.resultHeroImage} />
                    ) : null}
                    <View style={styles.resultHeader}>
                      <View style={styles.resultTitleRow}>
                        <Ionicons name="nutrition" size={20} color={Colors.secondary} />
                        <View style={styles.resultTitleTextBlock}>
                          <Text style={[styles.resultMealName]} numberOfLines={1}>
                            {extractMealTitle(analysis)}
                          </Text>
                          <Text style={[styles.resultTitle]}>{t.photoAnalysis.resultTitle}</Text>
                        </View>
                      </View>
                    </View>
                    {shouldShowMealScoreBadge && mealImpactScore ? (
                      <View style={[
                        styles.scoreBadge,
                        hasPainSymptom && styles.scorePainBadge,
                      ]}>
                        <Ionicons name="speedometer" size={18} color={Colors.textInverse} />
                        <Text style={styles.scoreBadgeValue}>{mealImpactScore}</Text>
                        {extractScoreReason(analysis) ? (
                          <Text style={styles.scoreBadgeLabel} numberOfLines={1}>{extractScoreReason(analysis)}</Text>
                        ) : null}
                      </View>
                    ) : null}

                    {/* Cal AI info-chips row — adapted to gut-impact (NO numeric food score). */}
                    <View style={[styles.chipsRow]}>
                      <View style={styles.infoChip}>
                        <Ionicons
                          name={hasPainSymptom ? 'alert-circle' : 'leaf'}
                          size={14}
                          color={hasPainSymptom ? '#F59E0B' : Colors.secondary}
                        />
                        <Text style={styles.infoChipLabel}>{t.photoAnalysis.chipGutImpact}</Text>
                        <Text style={styles.infoChipValue}>
                          {hasPainSymptom ? t.photoAnalysis.instantReliefTitle : t.photoAnalysis.resultTitle}
                        </Text>
                      </View>
                      <View style={styles.infoChip}>
                        <Ionicons name="restaurant" size={14} color={Colors.secondaryLight} />
                        <Text style={styles.infoChipLabel}>{t.photoAnalysis.chipMealType}</Text>
                        <Text style={styles.infoChipValue} numberOfLines={1}>
                          {extractMealName(analysis)}
                        </Text>
                      </View>
                    </View>

                    {/* Cal AI "Ingredients … + Add more" header — here: gut insights + add detail. */}
                    <View style={[styles.insightsHeaderRow]}>
                      <Text style={[styles.insightsHeading]}>
                        {t.photoAnalysis.insightsHeading}
                      </Text>
                      <Pressable
                        onPress={() => setAccuracyAnswer('no')}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel={t.photoAnalysis.addMore}
                        style={({ pressed }) => [styles.addMoreLink, pressed && styles.pressed]}
                      >
                        <Ionicons name="add" size={16} color={Colors.secondary} />
                        <Text style={styles.addMoreLinkText}>{t.photoAnalysis.addMore}</Text>
                      </Pressable>
                    </View>

                    <Text style={[styles.resultText]}>{sanitizeAnalysisForDisplay(analysis)}</Text>
                    {hasPainSymptom ? (
                      <View style={styles.instantReliefCard}>
                        <View style={[styles.instantReliefHeader]}>
                          <Ionicons name="medkit" size={18} color="#F59E0B" />
                          <Text style={[styles.instantReliefTitle]}>
                            {t.photoAnalysis.instantReliefTitle}
                          </Text>
                        </View>
                        <Text style={[styles.instantReliefText]}>
                          {t.photoAnalysis.instantReliefText}
                        </Text>
                      </View>
                    ) : null}
                    {planBMessage ? (
                      <View style={styles.planBCard}>
                        <View style={[styles.planBHeader]}>
                          <Ionicons name="shield-checkmark" size={18} color={Colors.secondary} />
                          <Text style={[styles.planBTitle]}>{t.photoAnalysis.planBTitle}</Text>
                        </View>
                        <Text style={[styles.planBText]}>{sanitizeAnalysisForDisplay(planBMessage)}</Text>
                      </View>
                    ) : null}
                    <View style={styles.medicalDisclaimerBox}>
                      <Text style={[styles.medicalDisclaimerText]}>
                        {t.photoAnalysis.medicalDisclaimer}
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
                        <Text style={styles.logMealButtonText}>{t.photoAnalysis.logMeal}</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => void handleShareAnalysis()}
                        style={({ pressed }) => [
                          styles.shareButton,
                          pressed && styles.pressed,
                        ]}
                      >
                        <Ionicons name="share-outline" size={18} color="#000000" />
                        <Text style={styles.shareButtonText}>{t.photoAnalysis.share}</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => void handleCopyAnalysis()}
                        style={({ pressed }) => [
                          styles.shareButton,
                          pressed && styles.pressed,
                        ]}
                      >
                        <Ionicons name="copy-outline" size={18} color="#000000" />
                        <Text style={styles.shareButtonText}>{t.photoAnalysis.copyResult}</Text>
                      </Pressable>
                    </View>
                  </View>

                  <View style={styles.accuracySectionCard}>
                    <Text style={[styles.accuracyQuestion]}>{t.photoAnalysis.isThisAccurate}</Text>

                    {/* Cal AI bottom actions: Fix Results (outline) + Done (filled). */}
                    <View style={[styles.fixResultsRow]}>
                      <Pressable
                        onPress={() => setAccuracyAnswer((prev) => (prev === 'no' ? null : 'no'))}
                        accessibilityRole="button"
                        accessibilityLabel={t.photoAnalysis.fixResults}
                        style={({ pressed }) => [
                          styles.fixResultsButton,
                          accuracyAnswer === 'no' && styles.fixResultsButtonActive,
                          pressed && styles.pressed,
                        ]}
                      >
                        <Ionicons name="create-outline" size={18} color="#FFFFFF" />
                        <Text style={styles.fixResultsButtonText}>{t.photoAnalysis.fixResults}</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => setAccuracyAnswer('yes')}
                        accessibilityRole="button"
                        accessibilityLabel={t.photoAnalysis.done}
                        style={({ pressed }) => [
                          styles.doneButton,
                          accuracyAnswer === 'yes' && styles.doneButtonActive,
                          pressed && styles.pressed,
                        ]}
                      >
                        <Ionicons
                          name={accuracyAnswer === 'yes' ? 'checkmark-circle' : 'checkmark'}
                          size={18}
                          color="#000000"
                        />
                        <Text style={styles.doneButtonText}>{t.photoAnalysis.done}</Text>
                      </Pressable>
                    </View>

                    {accuracyAnswer === 'no' ? (
                      <View style={styles.correctionBox}>
                        <View style={[styles.correctionInputRow]}>
                          <TextInput
                            value={correctionDraft}
                            onChangeText={setCorrectionDraft}
                            placeholder={t.photoAnalysis.correctionPlaceholder}
                            placeholderTextColor={Colors.textTertiary}
                            multiline
                            textAlignVertical="top"
                            style={[
                              styles.correctionInput,
                              !voiceNativeEnabled && styles.correctionInputExpoGoFull,
                            ]}
                          />
                          {voiceNativeEnabled ? (
                            isListening && voiceTarget === 'correction' ? (
                              <Animated.View style={{ transform: [{ scale: recordingPulse }] }}>
                                <Pressable
                                  onPressIn={() => void beginVoiceHold('correction')}
                                  onPressOut={() => void finishVoiceHold()}
                                  accessibilityRole="button"
                                  accessibilityLabel={t.photoAnalysis.voiceInputA11yLabel}
                                  accessibilityHint={t.photoAnalysis.voiceInputA11yHint}
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
                                accessibilityLabel={t.photoAnalysis.voiceInputA11yLabel}
                                accessibilityHint={t.photoAnalysis.voiceInputA11yHint}
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
                          <View style={[styles.recordingIndicatorInline]}>
                            <ActivityIndicator color="#EF4444" size="small" />
                            <Text style={[styles.correctingText]}>{t.photoAnalysis.recording}</Text>
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
                            <Text style={styles.applyCorrectionButtonText}>{t.photoAnalysis.applyCorrection}</Text>
                          )}
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                  </>
                ) : null}

                <View style={[styles.wizardFooterRow, { paddingBottom: Spacing.md + insets.bottom }]}>
                  <Pressable onPress={handleNewScan} style={({ pressed }) => [styles.newScanButton, pressed && styles.pressed]}>
                    <Ionicons name="scan" size={16} color={Colors.secondary} />
                    <Text style={styles.newScanText}>{t.photoAnalysis.newScan}</Text>
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
  historyButtonLabel: {
    color: "#FFFFFF",
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    marginTop: 2,
    textAlign: "center",
  },
  historyButton: {
    alignItems: 'center',
    backgroundColor: '#101010',
    borderColor: '#242424',
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    width: 40,
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
    backgroundColor: Colors.secondary,
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
  tutorialHeader: {
    alignItems: 'flex-end',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  tutorialSkip: {
    alignItems: 'center',
    backgroundColor: '#101010',
    borderColor: '#242424',
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    minHeight: 36,
    paddingHorizontal: Spacing.md,
  },
  tutorialSkipText: {
    color: '#FFFFFF',
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.sm,
  },
  scanFrame: {
    alignItems: 'center',
    aspectRatio: 1,
    backgroundColor: '#0A0A0A',
    borderRadius: BorderRadius.xl,
    justifyContent: 'center',
    overflow: 'hidden',
    width: '100%',
  },
  scanCorner: {
    borderColor: Colors.secondary,
    height: 40,
    position: 'absolute',
    width: 40,
    zIndex: 2,
  },
  scanCornerTL: {
    borderLeftWidth: 3,
    borderTopLeftRadius: BorderRadius.md,
    borderTopWidth: 3,
    left: Spacing.md,
    top: Spacing.md,
  },
  scanCornerTR: {
    borderRightWidth: 3,
    borderTopRightRadius: BorderRadius.md,
    borderTopWidth: 3,
    right: Spacing.md,
    top: Spacing.md,
  },
  scanCornerBL: {
    borderBottomLeftRadius: BorderRadius.md,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    bottom: Spacing.md,
    left: Spacing.md,
  },
  scanCornerBR: {
    borderBottomRightRadius: BorderRadius.md,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    bottom: Spacing.md,
    right: Spacing.md,
  },
  scanFramePreview: {
    height: '100%',
    width: '100%',
  },
  scanFramePlaceholder: {
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.xl,
  },
  scanFrameHint: {
    color: Colors.textSecondary,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.sm,
    lineHeight: 20,
    textAlign: 'center',
  },
  resultHeroImage: {
    borderRadius: BorderRadius.lg,
    height: 170,
    marginBottom: Spacing.md,
    width: '100%',
  },
  resultTitleTextBlock: {
    flex: 1,
  },
  resultMealName: {
    color: '#FFFFFF',
    fontFamily: FontFamily.displaySemiBold,
    fontSize: FontSize.xl,
  },
  resultCard: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    padding: Spacing.lg,
    ...Shadows.sm,
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
    color: Colors.secondaryLight,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
    marginTop: 2,
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
    color: Colors.secondary,
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
    borderColor: Colors.secondary + '44',
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
    backgroundColor: Colors.secondary,
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
    color: Colors.secondary,
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
    backgroundColor: Colors.secondary,
    borderRadius: BorderRadius.full,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  sendButtonDisabled: {
    opacity: 0.4,
  },
  contextToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    marginTop: 4,
  },
  contextToggleLabel: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
  },
  contextPanel: {
    marginBottom: 12,
  },
  contextGroupLabel: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    marginBottom: 8,
  },
  contextChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  contextChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  contextChipSelected: {
    borderColor: Colors.secondary,
    backgroundColor: Colors.secondary + '22',
  },
  contextChipText: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
  },
  contextChipTextSelected: {
    color: Colors.secondary,
    fontFamily: 'Inter_500Medium',
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
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
    marginBottom: Spacing.md,
  },
  infoChip: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    flexDirection: 'row',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  infoChipLabel: {
    color: '#9A9A9A',
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.xs,
  },
  infoChipValue: {
    color: '#FFFFFF',
    flexShrink: 1,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.xs,
    maxWidth: 140,
  },
  insightsHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  insightsHeading: {
    color: '#FFFFFF',
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.md,
  },
  addMoreLink: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 2,
  },
  addMoreLinkText: {
    color: Colors.secondary,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
  },
  fixResultsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  fixResultsButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderColor: 'rgba(255,255,255,0.22)',
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: Spacing.sm,
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: Spacing.md,
  },
  fixResultsButtonActive: {
    borderColor: '#F87171',
    backgroundColor: 'rgba(248,113,113,0.12)',
  },
  fixResultsButtonText: {
    color: '#FFFFFF',
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.sm,
  },
  doneButton: {
    alignItems: 'center',
    backgroundColor: Colors.secondary,
    borderRadius: BorderRadius.full,
    flex: 1,
    flexDirection: 'row',
    gap: Spacing.sm,
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: Spacing.md,
    ...Shadows.sm,
  },
  doneButtonActive: {
    backgroundColor: Colors.secondaryLight,
  },
  doneButtonText: {
    color: '#000000',
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.sm,
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
    backgroundColor: Colors.secondary,
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
  accuracyQuestion: {
    color: '#FFFFFF',
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
    marginBottom: Spacing.sm,
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
    backgroundColor: Colors.secondary,
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
});