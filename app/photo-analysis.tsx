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
import { canUseNativeSpeechToText } from '../lib/runtime-environment';
import { analyzeMealPhoto, analyzeMealText, reviseMealAnalysis } from '../lib/RecommendationEngine';
import { isPremiumFeature } from '../lib/subscription';
import {
  formatQuotaResetTime,
  isDailyPhotoLimitError,
  isDailyRevisionLimitError,
  isPremiumRequiredError,
  isDailyTextLimitError,
  MAX_CORRECTION_LENGTH,
  MAX_MEAL_DESCRIPTION_LENGTH,
  newAnalysisRequestId,
} from '../lib/ai-quota';
import { completeOnboarding, persistStage } from '../lib/onboarding-stage';
import * as Sentry from '@sentry/react-native';
import { saveMealLog } from '../lib/meal-log';
import { parseAnalysisSections } from '../lib/analysis-sections';
import {
  FEELING_FINE,
  nextSymptomSelection,
  serializeCurrentState,
  symptomsForRequest,
} from '../lib/symptom-selection';
import AnalysisResult from '../components/AnalysisResult';
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
  // The onboarding feeling step stores the bare word "Pain" as a stable,
  // language-independent identifier, so it carries none of the phrases below.
  // Matched exactly rather than by adding `\bpain\b` to the pattern: a loose
  // word match would also fire on "no pain" and "pain free" in the free-text
  // description, turning an explicit denial into a pain report.
  if (/^\s*(pain|schmerzen)\s*$/i.test(value)) return true;
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
  const params = useLocalSearchParams<{ historyId?: string; onboarding?: string }>();
  /**
   * ── ONBOARDING MODE ──────────────────────────────────────────────────────
   * Reached only via /photo-analysis?onboarding=1, which the signup screen
   * navigates to. Everything mode-specific in this file keys off this one
   * boolean and is confined to four places, all marked "ONBOARDING":
   *   1. the Describe gate (empty description allowed)
   *   2. the success path (first_analysis_completed + Continue CTA)
   *   3. the failure path (counter → "Skip for now")
   *   4. the onboarding exit (replace → notifications)
   * When false this screen behaves exactly as it did before Phase 4.
   */
  const isOnboarding = params.onboarding === '1';
  /**
   * Genuine analysis failures only — network/backend/analysis errors thrown by
   * runPhotoAnalysis. Cancelling the picker or leaving the screen never
   * increments it.
   *
   * SESSION-SCOPED ON PURPOSE: it lives in component state, so it resets when
   * the screen unmounts or the app restarts. A user who fails twice, quits, and
   * comes back on a working connection should get the normal retry path, not a
   * pre-offered escape hatch. Persisting it would make a transient outage
   * permanently change the UI for that account, which is worse and harder to
   * reason about. The trade-off is that a determined offline user sees the
   * escape hatch only after two failures per launch — acceptable, because the
   * stage keeps them resuming at the camera either way.
   */
  const [onboardingFailures, setOnboardingFailures] = useState(0);
  /**
   * Stable per successful analysis, so the onboarding auto-log upserts on the
   * existing (user_id, client_uuid) unique index. Minted once when the result
   * arrives — generating it per tap would defeat the constraint.
   */
  const onboardingLogKeyRef = useRef<string | null>(null);
  /**
   * Idempotency key for the server's daily photo quota.
   *
   * Deliberately NOT the food-log client_uuid above: that one is minted when a
   * result arrives and identifies a saved meal row, whereas this identifies an
   * ATTEMPT and must exist before the request is sent and survive every retry
   * of it. Reusing the log key would mean a failed analysis had no key at all,
   * so each retry would look like a new scan and be billed as one.
   */
  const analysisRequestIdRef = useRef<string | null>(null);
  /**
   * Idempotency key for the revision quota, paired with the correction text it
   * belongs to. Retrying the same correction reuses the id and is free; typing
   * a different correction mints a new one and costs a slot.
   */
  const revisionRequestRef = useRef<{ correction: string; id: string } | null>(null);
  /** Prevents a double tap firing two writes, as notifications.tsx does. */
  const continuingRef = useRef(false);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [lastImageBase64, setLastImageBase64] = useState('');
  /**
   * True when the user chose to describe the meal instead of photographing it.
   *
   * A mode flag rather than a separate screen: step 2 (description, symptoms,
   * after-meal context) and step 3 (the result) are already photo-independent,
   * so the text path reuses them wholesale. Only the evidence sent to the
   * server differs.
   */
  const [textOnlyMode, setTextOnlyMode] = useState(false);
  /** Set once the server reports the photo ceiling, so step 1 can promote the text path. */
  const [photoQuotaExhausted, setPhotoQuotaExhausted] = useState(false);
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
  // Multi-select: current-state symptoms co-occur. Was a `string | null`
  // toggled like a radio, which silently discarded the previous choice.
  const [currentStateKeys, setCurrentStateKeys] = useState<string[]>([]);
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
        // gut_concern holds one feeling ("Bloated") or several, comma-separated
        // ("Bloated, Heavy"). Split so each reaches the model as its own
        // condition rather than one run-together phrase. A legacy scalar has no
        // comma and so splits to itself — unchanged behaviour for existing rows.
        for (const part of profile.gut_concern.split(',')) {
          const condition = part.trim().replace(/_/g, ' ');
          if (condition) conditions.add(condition);
        }
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
  // The chips are symptoms the user is reporting right now, so they belong
  // here alongside the profile conditions and anything typed in the box. They
  // were previously absent, which is why selecting "Stomach pain" never
  // reached the pain-aware path.
  const selectedStateSymptoms = symptomsForRequest(
    currentStateKeys.filter((k) => k !== FEELING_FINE),
  );
  const currentSymptoms = [
    ...gutProfileContext.conditions,
    ...userEnteredSymptoms,
    ...selectedStateSymptoms,
  ];
  const hasPainSymptom = currentSymptoms.some((symptom) =>
    hasPainText(symptom)
  );
  const shouldShowMealScoreBadge = true; // SCORE badge re-enabled for GutWell meal impact scoring
  const mealImpactScore = extractMealImpactScore(analysis);
  const wizardSubtitle =
    wizardStep === 1 ? t.photoAnalysis.wizardStep1Subtitle : wizardStep === 2 ? t.photoAnalysis.wizardStep2Subtitle : t.photoAnalysis.wizardStep3Subtitle;
  const canRecordFeelings = wizardStep === 2 && (textOnlyMode || Boolean(photoUri && lastImageBase64));
  /**
   * The Describe requirement, derived once. Normal mode keeps it; the
   * onboarding run may analyse a photo alone. Both the button's disabled state
   * and handleGenerateAnalysis read this, so they cannot drift apart.
   */
  const analyzeDisabled =
    isAnalyzing ||
    // The text path needs a description and no image; the photo path the reverse.
    (textOnlyMode ? !mealDescription.trim() : !lastImageBase64.trim()) ||
    (!isOnboarding && !mealDescription.trim());

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

    setIsLoggingMeal(true);
    // Shared write (lib/meal-log.ts) so the payload shape exists once. No
    // clientUuid here on purpose: a user who taps Log meal twice is expressing
    // intent twice, and omitting it preserves the pre-existing insert
    // behaviour exactly. Only the silent onboarding auto-log dedupes.
    const result = await saveMealLog({
      userId: user.id,
      mealName: extractMealName(analysis) || t.photoAnalysis.photoMealDefault,
      mealType: getMealTypeForClock(),
      note: sanitizeMealScoring(analysis),
    });
    setIsLoggingMeal(false);

    if (result.status === 'queued') {
      setToast({ visible: true, message: t.photoAnalysis.logMealOffline, type: 'info' });
      return;
    }
    if (result.status === 'failed') {
      setToast({ visible: true, message: t.photoAnalysis.logMealFailed, type: 'error' });
      return;
    }
    setToast({ visible: true, message: t.photoAnalysis.logMealSuccess, type: 'success' });
  };

  /**
   * ONBOARDING (4/4): the two ways out of the onboarding run. Both live here so
   * the mode's navigation and completion rules are in one place rather than
   * spread through the render tree.
   */
  const handleOnboardingContinue = async () => {
    if (continuingRef.current) return;
    continuingRef.current = true;

    // The Log meal button is hidden in onboarding, so the meal is persisted
    // here instead — otherwise a user would finish onboarding having seen a
    // real analysis and land on an empty Home. Silent by design: no toast, no
    // spinner, nothing that flashes while the screen is being replaced.
    if (user && analysis) {
      const result = await saveMealLog({
        userId: user.id,
        mealName: extractMealName(analysis) || t.photoAnalysis.photoMealDefault,
        mealType: getMealTypeForClock(),
        note: sanitizeMealScoring(analysis),
        clientUuid: onboardingLogKeyRef.current ?? undefined,
      });
      if (result.status === 'failed') {
        // Reported, then ignored for navigation. A missing meal row is a far
        // better outcome than stranding the user at the end of onboarding.
        Sentry.captureException(result.error, { tags: { context: 'onboarding_meal_autolog' } });
      }
    }

    await persistStage('notifications', user?.id ?? null);
    router.replace('/(onboarding)/notifications');
  };

  /**
   * Escape hatch after two genuine failures. Completes onboarding without a
   * result: no fake analysis, no invented Gut Score, no history row, no
   * success event, and notifications are skipped entirely because there is no
   * result to offer a reminder about. Home already has an empty state and a
   * first-scan CTA, so the user lands somewhere usable.
   */
  const handleOnboardingSkipForNow = async () => {
    await completeOnboarding(user?.id ?? null);
    router.replace('/(tabs)');
  };

  const handleGenerateAnalysis = () => {
    const narrative = mealDescription.trim();
    if (textOnlyMode) {
      // Words are the only evidence here, so a description is required in every
      // mode — including onboarding, which may skip it when a photo exists.
      if (!narrative) {
        Alert.alert(t.photoAnalysis.feelingsRequiredTitle, t.photoAnalysis.describeRequiredMessage);
        return;
      }
      void runTextAnalysis(narrative);
      return;
    }
    if (!lastImageBase64.trim() || !photoUri) return;
    // ONBOARDING (1/4): the description stays REQUIRED in the normal flow. Only
    // the onboarding run may proceed without one, so a brand-new user can reach
    // a real result from a photo alone. Removing this gate globally would be a
    // separate product decision and is deliberately not made here.
    if (!narrative && !isOnboarding) {
      Alert.alert(t.photoAnalysis.feelingsRequiredTitle, t.photoAnalysis.feelingsRequiredMessage);
      return;
    }
    void runPhotoAnalysis(lastImageBase64, photoUri, narrative);
  };

  /**
   * Text-only analysis.
   *
   * Everything after the request is identical to the photo path — same parser,
   * same Result Screen, same meal save — so this deliberately sets the same
   * state and does NOT introduce a second result surface.
   */
  const runTextAnalysis = async (description: string) => {
    setIsAnalyzing(true);
    setPlanBMessage('');
    setUserFeedback([]);

    try {
      if (!analysisRequestIdRef.current) analysisRequestIdRef.current = newAnalysisRequestId();
      const rawResult = await analyzeMealText(
        description,
        {
          preferredLanguage: language,
          gutScore: gutProfileContext.gutScore ?? undefined,
          conditions: gutProfileContext.conditions,
          symptoms: currentSymptoms,
          userEnteredSymptoms,
          supplementsTakenToday: todaysSupplements.map((item) => `${item.name} (${item.dosage}, ${item.time})`),
          locationContext,
          retailLocationHint,
          userFeelingsNarrative: gutProfileContext.dietType
            ? `(My diet is ${gutProfileContext.dietType}.) ${description}`
            : description,
          mealContext: (currentStateKeys.length > 0 || afterMealActivity) ? {
            currentState: serializeCurrentState(currentStateKeys),
            afterMealActivity: afterMealActivity ?? undefined,
          } : undefined,
        },
        analysisRequestIdRef.current,
      );
      setAnalysis(rawResult);
      setOnboardingFailures(0);
      track(Events.FOOD_SCANNED);
      setWizardStep(3);
    } catch (error) {
      console.error('Meal text analysis failed:', error);
      if (isDailyTextLimitError(error)) {
        const at = formatQuotaResetTime(error.meta.resetAt, language);
        Alert.alert(
          t.photoAnalysis.textLimitTitle,
          at
            ? `${t.photoAnalysis.textLimitMessage} ${t.photoAnalysis.dailyLimitResetsAt.replace('{time}', at)}`
            : t.photoAnalysis.textLimitMessage,
        );
        return;
      }
      if (isOnboarding) setOnboardingFailures((n) => n + 1);
      Alert.alert(
        t.photoAnalysis.photoAnalysisFailedTitle,
        error instanceof Error ? error.message : t.photoAnalysis.photoAnalysisFailedTryAgain,
      );
    } finally {
      setIsAnalyzing(false);
    }
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
      // Fallback mint covers a restored/resumed session where the ref was lost;
      // without it the request would be rejected for a missing requestId.
      if (!analysisRequestIdRef.current) analysisRequestIdRef.current = newAnalysisRequestId();
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
        // currentState is a single string in the Edge Function contract, so
        // several symptoms are joined rather than restructured — every one
        // still reaches the prompt, and no function change is needed.
        mealContext: (currentStateKeys.length > 0 || afterMealActivity) ? {
          currentState: serializeCurrentState(currentStateKeys),
          afterMealActivity: afterMealActivity ?? undefined,
        } : undefined,
      }, analysisRequestIdRef.current);
      setAnalysis(rawResult);
      // A success clears the failure history. Without this the counter only
      // ever grew, so the "Having trouble?" escape hatch stayed on screen for
      // the rest of the session — including underneath a result that had just
      // succeeded, which reads as the app still reporting an error.
      setOnboardingFailures(0);
      track(Events.FOOD_SCANNED);
      // ONBOARDING (2/4): fired only here — after a real result exists — so it
      // can never fire on retry failure, cancellation or "Skip for now". No
      // payload: no meal text, image data, health values or identifiers.
      if (isOnboarding) {
        track(Events.FIRST_ANALYSIS_COMPLETED);
        // One key per result: a retry that produces a NEW analysis gets a new
        // key and is legitimately a different meal.
        onboardingLogKeyRef.current = `onboarding-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      }
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
      // The daily ceiling is not a failure of the app and must not read like
      // one: no "try again", no technical code, and it does not count toward
      // the onboarding escape hatch, which exists for genuine breakage.
      // The server reached the same conclusion the client gate did — normally
      // because entitlement lapsed mid-session. Same message, no error framing.
      if (isPremiumRequiredError(error)) {
        Alert.alert(
          t.paywall.premiumRequiredTitle,
          t.paywall.premiumRequiredMessage,
          [
            { text: t.paywall.seePlans, onPress: () => router.push({ pathname: '/paywall', params: { source: 'photo_analysis' } }) },
            { text: t.photoAnalysis.describeMealCta, onPress: startTextOnlyFlow },
            { text: t.photoAnalysis.notNow, style: 'cancel' },
          ],
        );
        return;
      }
      if (isDailyPhotoLimitError(error)) {
        // Never a dead end: the text path is still available today, so it is
        // offered as the primary action rather than left for the user to find.
        setPhotoQuotaExhausted(true);
        Alert.alert(
          t.photoAnalysis.dailyLimitTitle,
          t.photoAnalysis.dailyLimitFallbackMessage,
          [
            { text: t.photoAnalysis.describeMealCta, onPress: startTextOnlyFlow },
            { text: t.photoAnalysis.notNow, style: 'cancel' },
          ],
        );
        return;
      }
      // ONBOARDING (3/4): only a thrown analysis error counts. Cancelling the
      // picker or backing out never reaches this catch, so it cannot inflate
      // the count. The stage deliberately stays 'analysis' — a failure is not
      // progress, and the user must resume at the camera.
      if (isOnboarding) setOnboardingFailures((n) => n + 1);
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
    // A new photograph is a new logical analysis, so it gets a new id and will
    // cost a daily slot. Minted here rather than at request time so that every
    // retry of THIS photo reuses it and is free — see lib/ai-quota.ts.
    analysisRequestIdRef.current = newAnalysisRequestId();
    setAnalysis('');
    setPlanBMessage('');
    setUserFeedback([]);
    setWizardStep(1);
    setAccuracyAnswer(null);
    setCorrectionDraft('');
    setMealDescription('');
  };

  /**
   * Premium gate for the photo paths.
   *
   * Returns false and opens the paywall when the user is not entitled. Called
   * BEFORE the camera or picker opens, so a Free user never selects an image,
   * nothing is uploaded, no Gemini call happens and no quota is consumed.
   *
   * This is UX only — it is not the security boundary. The edge function makes
   * the same decision from server-owned entitlement state and returns
   * PREMIUM_REQUIRED, because a client check protects nothing on a
   * cost-bearing endpoint.
   */
  const ensurePhotoEntitlement = (): boolean => {
    if (isPremiumFeature('photo_analysis')) return true;
    Alert.alert(
      t.paywall.premiumRequiredTitle,
      t.paywall.premiumRequiredMessage,
      [
        { text: t.paywall.seePlans, onPress: () => router.push({ pathname: '/paywall', params: { source: 'photo_analysis' } }) },
        // Never a dead end: describing the meal works on every plan.
        { text: t.photoAnalysis.describeMealCta, onPress: startTextOnlyFlow },
        { text: t.photoAnalysis.notNow, style: 'cancel' },
      ],
    );
    return false;
  };

  const takePhoto = async () => {
    if (!ensurePhotoEntitlement()) return;
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
    if (!ensurePhotoEntitlement()) return;

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

  /**
   * Enter the describe-your-meal flow.
   *
   * Jumps straight to step 2, which already asks what you ate and how you feel.
   * Any photo taken earlier is cleared so a stale image cannot be sent with a
   * typed description.
   */
  const startTextOnlyFlow = () => {
    if (isAnalyzing) return;
    setTextOnlyMode(true);
    setPhotoUri(null);
    setLastImageBase64('');
    setAnalysis('');
    setPlanBMessage('');
    setUserFeedback([]);
    analysisRequestIdRef.current = newAnalysisRequestId();
    setWizardStep(2);
  };

  const submitChatCorrection = async (rawCorrection: string) => {
    const correction = rawCorrection.trim();
    if (!correction || !analysis || isCorrecting) return;
    const correctionIsDifferentFood = isDifferentFoodCorrection(correction);

    // One id per correction SUBMISSION. Distinct corrections are distinct
    // logical work and each costs a slot; only a retry of the same submission
    // reuses the id. Keyed by the correction text so a retry of the identical
    // text after a failure is recognised as the same request.
    if (revisionRequestRef.current?.correction !== correction) {
      revisionRequestRef.current = { correction, id: newAnalysisRequestId() };
    }

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
      }, revisionRequestRef.current?.id);
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
      // Consumed successfully — the next correction is new work.
      revisionRequestRef.current = null;
    } catch (error) {
      console.error('Meal correction failed:', error);
      // A reached limit is not breakage: no retry prompt, because nothing the
      // user does before reset can succeed. The draft is left in the box so
      // their words are not thrown away.
      if (isDailyRevisionLimitError(error)) {
        const at = formatQuotaResetTime(error.meta.resetAt, language);
        Alert.alert(
          t.photoAnalysis.revisionLimitTitle,
          at
            ? `${t.photoAnalysis.revisionLimitMessage} ${t.photoAnalysis.dailyLimitResetsAt.replace('{time}', at)}`
            : t.photoAnalysis.revisionLimitMessage,
        );
        return;
      }
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
    setCurrentStateKeys([]);
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

  /*
   * ── Onboarding first-result derivations ───────────────────────────────────
   * Only meaningful in onboarding mode; the normal result below reads none of
   * them and is byte-for-byte unchanged.
   */
  const onboardingSections = parseAnalysisSections(isOnboarding ? analysis : '');

  /**
   * Profile context as one line, or '' when the profile carries nothing.
   *
   * Deliberately computed separately from the normal result's own inline
   * version rather than refactoring that one to share it: the normal surface
   * is out of scope for this change, and it needs an "empty" fallback string
   * that onboarding must not show. Here, no context simply means no row.
   */
  const onboardingProfileLine = (() => {
    const parts: string[] = [];
    if (gutProfileContext.gutScore != null) {
      parts.push(`${t.photoAnalysis.profileContextScore} ${gutProfileContext.gutScore}/10`);
    }
    if (gutProfileContext.conditions.length > 0) {
      parts.push(gutProfileContext.conditions.join(', '));
    }
    return parts.length > 0
      ? `${t.photoAnalysis.profileContextPrefix}${parts.join(' · ')}`
      : '';
  })();

  const onboardingPlanB = planBMessage ? sanitizeAnalysisForDisplay(planBMessage) : '';

  /**
   * "More detail" for the first result — strictly what the concise surface does
   * not already show.
   *
   * This previously re-rendered the entire raw reply, which made the disclosure
   * a duplicate of the three sections directly above it. Now it carries only
   * profile context, any preamble the model emitted before its first heading,
   * and Plan B.
   *
   * `undefined` when none of those exist, so the affordance disappears instead
   * of opening onto nothing. In practice that is the common case today.
   */
  const onboardingMoreContent =
    onboardingProfileLine || onboardingSections.preamble || onboardingPlanB ? (
      <>
        {onboardingProfileLine ? (
          <View style={styles.profileCard}>
            <Ionicons name="person-circle-outline" size={18} color={Colors.primary} />
            <Text style={styles.profileText}>{onboardingProfileLine}</Text>
          </View>
        ) : null}
        {onboardingSections.preamble ? (
          <Text style={styles.resultText}>{onboardingSections.preamble}</Text>
        ) : null}
        {onboardingPlanB ? (
          <View style={styles.planBCard}>
            <View style={styles.planBHeader}>
              <Ionicons name="shield-checkmark" size={18} color={Colors.secondary} />
              <Text style={styles.planBTitle}>{t.photoAnalysis.planBTitle}</Text>
            </View>
            <Text style={styles.planBText}>{onboardingPlanB}</Text>
          </View>
        ) : null}
      </>
    ) : undefined;

  /**
   * Instant relief guidance, when the profile or the user's own description
   * mentions pain.
   *
   * Audited as safety-critical and therefore NOT eligible for "More": a user
   * who has just reported pain must not have to open a disclosure to reach it.
   * The normal result shows the identical card unconditionally in its own flow.
   */
  const onboardingSafetyNotice = hasPainSymptom ? (
    <View style={styles.instantReliefCard}>
      <View style={styles.instantReliefHeader}>
        <Ionicons name="medkit" size={18} color="#F59E0B" />
        <Text style={styles.instantReliefTitle}>{t.photoAnalysis.instantReliefTitle}</Text>
      </View>
      <Text style={styles.instantReliefText}>{t.photoAnalysis.instantReliefText}</Text>
    </View>
  ) : undefined;

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
            accessibilityLabel={t.foodHistory.headerTitle}
            accessibilityHint={t.photoAnalysis.accessHistoryHint}
          >
            {/* Icon-only: the 40x40 control also carried the screen title, which
                wrapped to "Fotoa / nalyse" in German. The name now lives in the
                accessibility label, where it is not width-constrained. */}
            <Ionicons name="time-outline" size={18} color="#FFFFFF" />
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

              <Text style={[styles.step2PromptText]}>
                {textOnlyMode ? t.photoAnalysis.describeMealHint : t.photoAnalysis.step2Prompt}
              </Text>

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
                // In the text path the words ARE the meal, so the placeholder
                // teaches what to include instead of only asking how you feel.
                placeholder={
                  textOnlyMode
                    ? t.photoAnalysis.describeMealPlaceholder
                    : t.photoAnalysis.howYouFeelPlaceholder
                }
                placeholderTextColor={Colors.textTertiary}
                maxLength={MAX_MEAL_DESCRIPTION_LENGTH}
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
                        onPress={() => setCurrentStateKeys((prev) => nextSymptomSelection(prev, key))}
                        style={[styles.contextChip, currentStateKeys.includes(key) && styles.contextChipSelected]}
                        // checkbox, not button: several symptoms can be on at
                        // once, and VoiceOver must not imply otherwise.
                        accessibilityRole="checkbox"
                        accessibilityLabel={label}
                        accessibilityState={{ checked: currentStateKeys.includes(key) }}
                        hitSlop={4}
                      >
                        <Text style={[styles.contextChipText, currentStateKeys.includes(key) && styles.contextChipTextSelected]}>
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
                disabled={analyzeDisabled}
                accessibilityRole="button"
                accessibilityLabel={
                  isOnboarding && !mealDescription.trim()
                    ? t.photoAnalysis.onboardingSkipDescription
                    : t.photoAnalysis.generateAnalysis
                }
                accessibilityState={{ disabled: analyzeDisabled }}
                // Styling reads analyzeDisabled rather than restating it. The
                // copy that used to live here always required an image, so on
                // the text-only path the button was enabled but painted with
                // the disabled colour and 0.55 opacity — it looked dead while
                // working. One source of truth is what the comment above
                // analyzeDisabled already promised.
                style={({ pressed }) => [
                  styles.analyzeCombinedButton,
                  analyzeDisabled && styles.analyzeCombinedButtonDisabled,
                  pressed && !analyzeDisabled && styles.pressed,
                ]}
              >
                <Ionicons name="sparkles" size={20} color="#000000" />
                <Text style={styles.analyzeCombinedButtonText}>
                  {isOnboarding && !mealDescription.trim()
                    ? t.photoAnalysis.onboardingSkipDescription
                    : t.photoAnalysis.generateAnalysis}
                </Text>
              </Pressable>

              {/* ONBOARDING: escape hatch, shown only after two genuine analysis
                  failures so a user cannot be trapped by a persistent outage.
                  Retry stays available above — this is additive, not a
                  replacement. */}
              {isOnboarding && onboardingFailures >= 2 ? (
                <View style={styles.onboardingSkipBlock}>
                  <Pressable
                    onPress={() => void handleOnboardingSkipForNow()}
                    accessibilityRole="button"
                    accessibilityLabel={t.photoAnalysis.onboardingSkipForNow}
                    style={({ pressed }) => [styles.onboardingSkipButton, pressed && styles.pressed]}
                  >
                    <Text style={styles.onboardingSkipText}>{t.photoAnalysis.onboardingSkipForNow}</Text>
                  </Pressable>
                  <Text style={styles.onboardingSkipHint}>{t.photoAnalysis.onboardingSkipForNowHint}</Text>
                </View>
              ) : null}

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
              // Last wins: the 96pt tail above was sized for an in-flow
              // Continue. With the onboarding footer pinned, that much padding
              // is just dead space under the disclaimer. Normal mode keeps it.
              wizardStep === 3 && isOnboarding ? styles.onboardingResultsContent : undefined,
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

                {/* Permanent second entry point. Deliberately NOT conditional:
                    it is the only analysis a Free user will have once photo is
                    Premium-gated, and the fallback the moment the daily photo
                    ceiling is reached — so it must never be something the user
                    has to discover. */}
                <Pressable
                  onPress={startTextOnlyFlow}
                  disabled={isAnalyzing}
                  accessibilityRole="button"
                  accessibilityLabel={t.photoAnalysis.describeMealCta}
                  accessibilityHint={t.photoAnalysis.describeMealHint}
                  style={({ pressed }) => [
                    styles.describeMealButton,
                    photoQuotaExhausted && styles.describeMealButtonPromoted,
                    isAnalyzing && styles.disabledButton,
                    pressed && !isAnalyzing && styles.pressed,
                  ]}
                >
                  <Ionicons name="create-outline" size={22} color={Colors.textInverse} />
                  <View style={styles.describeMealTextGroup}>
                    <Text style={styles.describeMealTitle}>{t.photoAnalysis.describeMealCta}</Text>
                    <Text style={styles.describeMealSubtitle}>
                      {photoQuotaExhausted
                        ? t.photoAnalysis.dailyLimitFallbackMessage
                        : t.photoAnalysis.describeMealHint}
                    </Text>
                  </View>
                </Pressable>

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

            {wizardStep === 3 && isOnboarding ? (
              /* ONBOARDING: concise first-result surface. The normal result
                 below is untouched — this is an additional branch, not a
                 rewrite of it. Actions (Log meal, Share, Copy, accuracy, New
                 Scan) are omitted here; the meal is persisted by Continue. */
              <AnalysisResult
                photoUri={photoUri}
                // extractMealTitle, not extractMealName: the latter returns the
                // MEAL section's prose ("You had some pizza with cheese and…"),
                // which is an explanation, not a headline.
                mealName={extractMealTitle(analysis)}
                score={mealImpactScore}
                scoreReason={extractScoreReason(analysis)}
                sections={onboardingSections}
                raw={sanitizeAnalysisForDisplay(analysis)}
                safetyNotice={onboardingSafetyNotice}
                moreContent={onboardingMoreContent}
              />
            ) : null}

            {wizardStep === 3 && !isOnboarding ? (
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
                  accessibilityLabel={locationContext ? t.photoAnalysis.locationSuggestionsEnabled : t.photoAnalysis.locationSuggestionsLabel}
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
                            // Matches the server's correction cap, so a long
                            // correction stops visibly at the keyboard rather
                            // than being silently truncated server-side and
                            // answered as if all of it had been read.
                            maxLength={MAX_CORRECTION_LENGTH}
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

        {wizardStep === 3 && isOnboarding ? (
          /* PINNED — a sibling of the ScrollView, not a child of it.
             Continue is the only exit from the first result, so it must stay
             reachable however long the analysis runs; inside the scroll it
             could sit below the fold on a 375pt screen. Onboarding only: the
             normal result keeps its own in-flow footer row. */
          <View style={[styles.onboardingFooter, { paddingBottom: Spacing.md + insets.bottom }]}>
            <Pressable
              onPress={() => void handleOnboardingContinue()}
              accessibilityRole="button"
              accessibilityLabel={t.photoAnalysis.onboardingContinue}
              style={({ pressed }) => [styles.onboardingContinueButton, pressed && styles.pressed]}
            >
              <Text style={styles.onboardingContinueText}>{t.photoAnalysis.onboardingContinue}</Text>
              <Ionicons name="arrow-forward" size={18} color="#0B1F14" />
            </Pressable>
          </View>
        ) : null}
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
  // ── Onboarding-mode affordances (photo-analysis?onboarding=1) ─────────────
  onboardingSkipBlock: { marginTop: 14, alignItems: 'center', gap: 6 },
  onboardingSkipButton: { paddingVertical: 10, paddingHorizontal: 16 },
  onboardingSkipText: { fontFamily: FontFamily.sansMedium, fontSize: 15, color: 'rgba(255,255,255,0.75)' },
  onboardingSkipHint: {
    fontFamily: FontFamily.sansRegular,
    fontSize: 13,
    lineHeight: 18,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  onboardingContinueButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#52B788',
    borderRadius: 28,
    paddingVertical: 16,
  },
  onboardingContinueText: { fontFamily: FontFamily.sansSemiBold, fontSize: 17, color: '#0B1F14' },
  /* The pinned bar itself. Opaque, with a hairline so long results scrolling
     underneath read as passing behind it rather than colliding with it. */
  onboardingResultsContent: {
    paddingBottom: Spacing.lg,
  },
  onboardingFooter: {
    backgroundColor: Colors.background,
    borderTopColor: 'rgba(255,255,255,0.08)',
    borderTopWidth: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },

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
  describeMealButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginTop: 12,
  },
  /* When the photo ceiling is reached this stops being the alternative and
     becomes the way forward, so it gains the emphasis. */
  describeMealButtonPromoted: {
    borderColor: Colors.secondary,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  describeMealTextGroup: { flex: 1, gap: 2 },
  describeMealTitle: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: 16,
    color: Colors.textInverse,
  },
  describeMealSubtitle: {
    fontFamily: FontFamily.sansRegular,
    fontSize: 13,
    lineHeight: 18,
    color: 'rgba(255,255,255,0.7)',
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