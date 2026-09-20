import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { FontFamily } from '../../constants/theme';
import StarFieldBackground from '../../components/StarFieldBackground';
import { track, Events } from '../../lib/analytics';
import { StepProgressBar } from '../../components/ui/StepProgressBar';
import { OptionRow } from '../../components/ui/OptionRow';
import { OptionCard } from '../../components/ui/OptionCard';
import { WheelPicker, type WheelPickerOption } from '../../components/ui/WheelPicker';
import { RulerSlider } from '../../components/ui/RulerSlider';
import { useTranslation } from '../../lib/i18n';
import LanguageSwitcher from '../../components/LanguageSwitcher';
import { useReducedMotion } from '../../lib/useReducedMotion';
import { saveLocalStage } from '../../lib/onboarding-stage';
import {
  ONBOARDING_STEPS,
  TOTAL_STEPS,
  type OnboardingStep,
} from '../../lib/onboarding-config';

const ANSWERS_KEY = 'onboarding_answers';

/**
 * Localized copy for a step.
 *
 * The step definitions in lib/onboarding-config.ts carry English strings only.
 * Before v1.0 the stepper rendered those directly, so the questionnaire showed
 * English even in German — t.onboardingSteps existed but nothing read it.
 * This resolves i18n first and falls back to the config, so a missing key
 * degrades to English rather than to a blank screen.
 */
function stepCopy(
  dict: Record<string, unknown>,
  stepId: string,
): Record<string, any> | undefined {
  const entry = dict?.[stepId];
  return entry && typeof entry === 'object' ? (entry as Record<string, any>) : undefined;
}

/** Resolve an option's label/description through i18n, falling back to config. */
function optionCopy(
  copy: Record<string, any> | undefined,
  opt: { value: string; label: string; description?: string },
): { label: string; description?: string } {
  const raw = copy?.options?.[opt.value];
  if (typeof raw === 'string') return { label: raw, description: opt.description };
  if (raw && typeof raw === 'object') {
    return { label: raw.label ?? opt.label, description: raw.description ?? opt.description };
  }
  return { label: opt.label, description: opt.description };
}
/**
 * Motion budget for the stepper.
 *
 * Everything here is decorative. The screen must reach its next state at the
 * same moment whether or not it animates, so no value below gates an
 * interaction and nothing waits on a spring settling. Reduce Motion collapses
 * the translations to zero and the stagger to a single instant fade — see
 * `useReducedMotion` and the `reduce` branches at each call site.
 *
 * Durations are deliberately short of the 300ms most transitions reach for:
 * a wellness questionnaire that glides feels slow by the third tap, and the
 * user is answering, not watching.
 */
const FADE_OUT_MS = 160;
const FADE_IN_MS = 240;
/** How far the outgoing/incoming step slides, in px. Small on purpose. */
const STEP_SLIDE_PX = 18;
/** Per-option entrance. */
const OPTION_ENTER_MS = 260;
const OPTION_STAGGER_MS = 45;
const OPTION_ENTER_PX = 14;
/** Selection feedback. Scale is barely visible and that is the point. */
const OPTION_SELECT_SCALE = 1.015;
const OPTION_SELECT_MS = 140;

type AnswerValue = string | number | string[];
type Answers = Record<string, AnswerValue>;

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const CURRENT_YEAR = new Date().getFullYear();

/** Whether the current step has enough input to enable the Continue CTA. */
/**
 * Next selection for a multi-select tap, honouring mutually exclusive values.
 *
 * Rules, in order:
 *   - tapping a SELECTED exclusive value does nothing. It is already the whole
 *     answer, so deselecting it could only produce an empty selection and a
 *     disabled CTA. An exclusive value is cleared by choosing something else,
 *     never by unpicking it.
 *   - tapping an unselected exclusive value replaces the selection with just it
 *   - tapping any other value drops every exclusive value that was selected
 *   - tapping a selected non-exclusive value toggles it off as usual
 *
 * Pure and exported so the interaction rules are tested directly rather than
 * through the component.
 */
export function nextMultiSelect(
  current: readonly string[],
  tapped: string,
  exclusiveValues: readonly string[] = [],
): string[] {
  const isExclusive = exclusiveValues.includes(tapped);
  if (current.includes(tapped)) {
    // No-op for an already-selected exclusive value; normal toggle otherwise.
    return isExclusive ? [...current] : current.filter((v) => v !== tapped);
  }
  if (isExclusive) return [tapped];
  return [...current.filter((v) => !exclusiveValues.includes(v)), tapped];
}

/**
 * Legacy blobs stored meal_feeling as a single string. Coerce so an existing
 * partially-completed onboarding hydrates into the multi-select without
 * crashing, and so a resumed user keeps the answer they already gave.
 */
export function asSelectionArray(value: AnswerValue | undefined): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
  if (typeof value === 'string' && value.length > 0) return [value];
  return [];
}

function canAdvance(step: OnboardingStep, value: AnswerValue | undefined): boolean {
  switch (step.type) {
    case 'single-select':
      return typeof value === 'string' && value.length > 0;
    case 'multi-select':
      // asSelectionArray so a legacy scalar counts as one answer rather than
      // stranding a resuming user on a CTA that will not enable.
      return step.optional || asSelectionArray(value).length > 0;
    case 'wheel':
    case 'ruler':
      return value !== undefined; // pickers always hold a value
    case 'referral':
      return step.optional || (typeof value === 'string' && value.trim().length > 0);
    case 'info':
      return true;
    default:
      return true;
  }
}

export default function QuestionsScreen() {
  const t = useTranslation();
  const reduceMotion = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const contentOpacity = useRef(new Animated.Value(1)).current;
  /**
   * Horizontal offset for the step transition, in px.
   *
   * One value drives both halves: the outgoing step slides toward the edge it
   * is leaving by, the incoming step is placed on the opposite edge and slides
   * back to 0. Forward travel reads right-to-left, Back reads left-to-right,
   * which is the direction the stack itself moves and the only thing that
   * makes the two feel different rather than identical.
   */
  const contentShift = useRef(new Animated.Value(0)).current;

  const step = ONBOARDING_STEPS[index];
  const progress = (index + 1) / TOTAL_STEPS;

  // Hydrate any previously saved answers (so a resumed quiz keeps selections).
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(ANSWERS_KEY).then((raw) => {
      if (!active || !raw) return;
      try {
        const parsed = JSON.parse(raw) as Answers;
        setAnswers((prev) => ({ ...parsed, ...prev }));
      } catch {
        // ignore malformed cache
      }
    });
    return () => {
      active = false;
    };
  }, []);

  // Seed default values for picker steps so the CTA is enabled immediately and
  // the saved answer matches what's shown even if the user never scrolls.
  useEffect(() => {
    const field = 'field' in step ? step.field : undefined;
    if (!field) return;
    setAnswers((prev) => {
      if (prev[field] !== undefined) return prev;
      if (step.type === 'wheel' && step.mode === 'number') {
        return { ...prev, [field]: step.defaultValue ?? step.min ?? 0 };
      }
      if (step.type === 'wheel' && step.mode === 'date') {
        return { ...prev, [field]: `${CURRENT_YEAR - 30}-01-01` };
      }
      if (step.type === 'ruler') {
        return { ...prev, [field]: step.defaultValue };
      }
      return prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  const persist = useCallback(async (next: Answers) => {
    try {
      await AsyncStorage.setItem(ANSWERS_KEY, JSON.stringify(next));
    } catch {
      // Persisting onboarding answers is best-effort; never block navigation.
    }
  }, []);

  const setField = useCallback(
    (field: string, value: AnswerValue) => {
      setAnswers((prev) => {
        const next = { ...prev, [field]: value };
        void persist(next);
        return next;
      });
    },
    [persist],
  );

  const goToStep = useCallback(
    (nextIndex: number, direction: 'forward' | 'back' = 'forward') => {
      // Reduce Motion: swap the content on a short cross-fade with no
      // translation at all. The step still changes at the same moment, so
      // nothing about the flow depends on which branch runs.
      if (reduceMotion) {
        contentShift.setValue(0);
        Animated.timing(contentOpacity, {
          toValue: 0,
          duration: 90,
          useNativeDriver: true,
        }).start(({ finished }) => {
          // Same guard as the animated branch below: a cancelled fade — a fast
          // double-tap, or Back landing mid-transition — must not commit the
          // index or start the incoming half. Both branches behave identically
          // here; only the duration and the absence of translation differ.
          if (!finished) return;
          setIndex(nextIndex);
          Animated.timing(contentOpacity, {
            toValue: 1,
            duration: 90,
            useNativeDriver: true,
          }).start();
        });
        return;
      }

      const leaving = direction === 'forward' ? -STEP_SLIDE_PX : STEP_SLIDE_PX;
      const entering = -leaving;

      Animated.parallel([
        Animated.timing(contentOpacity, {
          toValue: 0,
          duration: FADE_OUT_MS,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(contentShift, {
          toValue: leaving,
          duration: FADE_OUT_MS,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        // A cancelled animation (a fast double-tap) must not leave the screen
        // faded out and stranded: only the completing run owns the swap.
        if (!finished) return;
        setIndex(nextIndex);
        contentShift.setValue(entering);
        Animated.parallel([
          Animated.timing(contentOpacity, {
            toValue: 1,
            duration: FADE_IN_MS,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(contentShift, {
            toValue: 0,
            duration: FADE_IN_MS,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]).start();
      });
    },
    [contentOpacity, contentShift, reduceMotion],
  );

  const handleContinue = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    track(Events.ONBOARDING_STEP, { step: step.id });
    const isLast = index === ONBOARDING_STEPS.length - 1;
    if (isLast) {
      track(Events.ONBOARDING_STEP, { step: 'quiz_completed' });
      // Both questions answered — the example screen is next. Stage is written
      // before navigating so a relaunch resumes there rather than re-asking.
      void saveLocalStage('example');
      router.push('/(onboarding)/example');
      return;
    }
    // Advancing off the goal question means the feeling question is next.
    //
    // The stage stays 'feeling' for every non-final step, including the move
    // onto the context interlude. That is deliberate and not a gap: the stage
    // selects a SCREEN, not an index — routing sends both 'goal' and 'feeling'
    // to this same stepper, which always opens at index 0 and rehydrates the
    // saved answers. There is no stage value that could resume mid-stepper, so
    // adding one for the interlude would change nothing except the enum.
    void saveLocalStage('feeling');
    goToStep(index + 1, 'forward');
  }, [goToStep, index, step.id]);

  const handleBack = useCallback(() => {
    if (index === 0) {
      router.back();
      return;
    }
    goToStep(index - 1, 'back');
  }, [goToStep, index]);

  const currentValue =
    'field' in step ? answers[step.field] : undefined;
  const advanceEnabled = canAdvance(step, currentValue);

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.container}>
        <StatusBar style="light" />
        <LinearGradient colors={['#0B1F14', '#1B4332']} style={StyleSheet.absoluteFill} />
        <StarFieldBackground count={110} seed={99} />

        <SafeAreaView edges={['top']} style={styles.safeTop}>
          <View style={styles.headerRow}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={handleBack}
              accessibilityRole="button"
              accessibilityLabel={t.questions.accessGoBack}
              activeOpacity={0.7}
            >
              <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
            </TouchableOpacity>
            <View style={styles.progressWrap}>
              <StepProgressBar
                progress={progress}
                trackColor="rgba(255,255,255,0.12)"
                fillColor="#52B788"
                reduceMotion={reduceMotion}
              />
            </View>
            {/* Covers BOTH question steps — this screen is the stepper, so the
                switcher is reachable on the goal step and the feeling step.
                Outside the ScrollView, so it stays put as content scrolls. */}
            <LanguageSwitcher />
          </View>
        </SafeAreaView>

        <Animated.View
          style={[
            styles.body,
            { opacity: contentOpacity, transform: [{ translateX: contentShift }] },
          ]}
        >
          {/* Keyed on the step id so each step's options mount fresh and run
              their entrance stagger. Without the key React reuses the rows and
              only their props change, so the second question would appear
              fully formed while the first animated in. */}
          <StepContent
            key={step.id}
            step={step}
            value={currentValue}
            onSetField={setField}
            reduceMotion={reduceMotion}
          />
        </Animated.View>

        <View style={styles.bottomSection}>
          <TouchableOpacity
            style={[styles.cta, !advanceEnabled && styles.ctaDisabled]}
            onPress={handleContinue}
            disabled={!advanceEnabled}
            accessibilityRole="button"
            accessibilityLabel={ctaLabel(step, t.questions.continueButton)}
            activeOpacity={0.88}
          >
            <Text style={styles.ctaText}>{ctaLabel(step, t.questions.continueButton)}</Text>
          </TouchableOpacity>

          {isSkippable(step) ? (
            <TouchableOpacity
              onPress={handleContinue}
              accessibilityRole="button"
              accessibilityLabel={t.questions.accessSkip}
              activeOpacity={0.7}
            >
              <Text style={styles.skipText}>{t.questions.skip}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function ctaLabel(step: OnboardingStep, continueLabel: string): string {
  if (step.type === 'info' && step.cta) return step.cta;
  return continueLabel;
}

function isSkippable(step: OnboardingStep): boolean {
  return step.type === 'info' && !!step.skippable;
}

// ─── Per-step content renderer ──────────────────────────────────────────────

type StepContentProps = {
  step: OnboardingStep;
  value: AnswerValue | undefined;
  onSetField: (field: string, value: AnswerValue) => void;
  /** Threaded down so every animated surface reads one source, not its own. */
  reduceMotion?: boolean;
};

function StepContent({ step, value, onSetField, reduceMotion }: StepContentProps) {
  switch (step.type) {
    case 'single-select':
    case 'multi-select':
    case 'referral':
      return (
        <ScrollableStep
          step={step}
          value={value}
          onSetField={onSetField}
          reduceMotion={reduceMotion}
        />
      );
    case 'wheel':
      return <WheelStepView step={step} value={value} onSetField={onSetField} />;
    case 'ruler':
      return <RulerStepView step={step} value={value} onSetField={onSetField} />;
    case 'info':
      return <InfoStepView step={step} reduceMotion={reduceMotion} />;
    default:
      return null;
  }
}

/**
 * Question heading.
 *
 * Deliberately uncapped: no `maxFontSizeMultiplier` on either line. Both sit
 * inside ScrollableStep's ScrollView, so at large Dynamic Type sizes the text
 * wraps, the content grows and the user scrolls — nothing clips. Capping here
 * would trim a user's chosen text size purely to keep the layout tidy, which
 * is the wrong trade in an accessibility setting they opted into.
 */
function Header({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.headerText}>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

/**
 * Fade-and-rise entrance, shared by the option rows and the interlude.
 *
 * Returns a 0→1 driver. Callers read it for opacity and interpolate it for
 * translateY, so both surfaces move identically rather than by two copies of
 * the same timing that could drift apart.
 *
 * Under Reduce Motion the value starts AND stays at 1: the element is at its
 * final state on the first frame, with no animation scheduled at all.
 */
function useEntrance(reduceMotion: boolean, delay = 0): Animated.Value {
  const value = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;

  useEffect(() => {
    if (reduceMotion) {
      value.setValue(1);
      return;
    }
    const animation = Animated.timing(value, {
      toValue: 1,
      duration: OPTION_ENTER_MS,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [value, delay, reduceMotion]);

  return value;
}

/** Opacity + rise, from a useEntrance driver. */
function entranceStyle(driver: Animated.Value) {
  return {
    opacity: driver,
    translateY: driver.interpolate({
      inputRange: [0, 1],
      outputRange: [OPTION_ENTER_PX, 0],
    }),
  };
}

/**
 * Entrance + selection motion for one option row/card.
 *
 * Wraps the shared OptionRow/OptionCard rather than changing them: both are
 * used only by this screen today, but they are generic UI components and a
 * questionnaire's entrance choreography is not their business.
 *
 * Under Reduce Motion the item mounts at its final state and the selection
 * scale is skipped entirely — the selected styling inside OptionRow/OptionCard
 * still changes, so selection remains just as visible without moving anything.
 */
function AnimatedOption({
  index,
  selected,
  reduceMotion,
  children,
}: {
  index: number;
  selected: boolean;
  reduceMotion: boolean;
  children: React.ReactNode;
}) {
  const enter = useEntrance(reduceMotion, index * OPTION_STAGGER_MS);
  const scale = useRef(new Animated.Value(1)).current;

  /**
   * First-run guard for the selection pulse.
   *
   * Without it the effect fires on mount, and mount happens far more often
   * than a user selecting something: `key={step.id}` remounts the whole step
   * on every transition, so arriving at a question, resuming an onboarding
   * with saved answers, or pressing Back to a question already answered would
   * each replay the pulse. Worse, on arrival every option pulsed at once,
   * on top of its own entrance.
   *
   * The pulse should acknowledge a user's tap and nothing else, so the first
   * run — which is mount, never a tap — is skipped.
   */
  const selectionSettled = useRef(false);

  useEffect(() => {
    if (!selectionSettled.current) {
      selectionSettled.current = true;
      return;
    }
    if (reduceMotion) return;
    // Driven by `selected` changing rather than by the touch, so a
    // multi-select deselect gets the same acknowledgement as a select.
    const animation = Animated.sequence([
      Animated.timing(scale, {
        toValue: OPTION_SELECT_SCALE,
        duration: OPTION_SELECT_MS,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 1,
        duration: OPTION_SELECT_MS,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [selected, scale, reduceMotion]);

  const { opacity, translateY } = entranceStyle(enter);

  return (
    <Animated.View style={{ opacity, transform: [{ translateY }, { scale }] }}>
      {children}
    </Animated.View>
  );
}

/**
 * Selection haptic.
 *
 * `selectionAsync` is the light tick iOS uses for pickers and segmented
 * controls — distinct from the `impactAsync(Light)` the Continue button
 * already fires, so choosing an answer and advancing do not feel identical.
 * Failures are swallowed: haptics are unavailable on the simulator and a
 * rejected promise must never break a tap.
 */
function tapFeedback() {
  Haptics.selectionAsync().catch(() => {});
}

function ScrollableStep({ step, value, onSetField, reduceMotion = false }: StepContentProps) {
  // Sub-components need their own hook — hooks do not cross function boundaries.
  const t = useTranslation();
  const copy = stepCopy(t.onboardingSteps as unknown as Record<string, unknown>, step.id);
  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <Header title={copy?.title ?? step.title} subtitle={copy?.subtitle ?? step.subtitle} />

      {step.type === 'single-select' ? (
        <View style={styles.options}>
          {step.options.map((opt, i) => {
            const selected = value === opt.value;
            const oc = optionCopy(copy, opt);
            const icon = opt.icon ? (
              <Ionicons name={opt.icon} size={22} color={selected ? '#52B788' : '#FFFFFF'} />
            ) : undefined;
            const onPress = () => {
              tapFeedback();
              onSetField(step.field, opt.value);
            };
            return (
              <AnimatedOption
                key={opt.value}
                index={i}
                selected={selected}
                reduceMotion={reduceMotion}
              >
                {step.variant === 'card' ? (
                  <OptionCard
                    title={oc.label}
                    subtitle={oc.description}
                    icon={icon}
                    selected={selected}
                    onPress={onPress}
                  />
                ) : (
                  <OptionRow
                    label={oc.label}
                    description={oc.description}
                    icon={icon}
                    selected={selected}
                    onPress={onPress}
                  />
                )}
              </AnimatedOption>
            );
          })}
        </View>
      ) : null}

      {/* The optional "anything you tend to avoid?" chip row used to render
          here. It wrote an `avoid` array that nothing ever read — no profile
          column, no analyze-food field, no screen — so it asked for dietary
          information and discarded it. Removed with its config entry and its
          translations; see the note in lib/onboarding-config.ts. */}

      {step.type === 'multi-select' ? (
        <View style={styles.options}>
          {step.options.map((opt, i) => {
            const list = asSelectionArray(value);
            const selected = list.includes(opt.value);
            const oc = optionCopy(copy, opt);
            const icon = opt.icon ? (
              <Ionicons name={opt.icon} size={22} color={selected ? '#52B788' : '#FFFFFF'} />
            ) : undefined;
            const onPress = () => {
              tapFeedback();
              onSetField(step.field, nextMultiSelect(list, opt.value, step.exclusiveValues));
            };
            // Honours `variant` exactly as single-select does, so a step can be
            // multi-select without losing the card design it was approved with.
            return (
              <AnimatedOption
                key={opt.value}
                index={i}
                selected={selected}
                reduceMotion={reduceMotion}
              >
                {step.variant === 'card' ? (
                  <OptionCard
                    title={oc.label}
                    subtitle={oc.description}
                    icon={icon}
                    multiSelect
                    selected={selected}
                    onPress={onPress}
                  />
                ) : (
                  <OptionRow
                    label={oc.label}
                    description={oc.description}
                    icon={icon}
                    multiSelect
                    selected={selected}
                    onPress={onPress}
                  />
                )}
              </AnimatedOption>
            );
          })}
        </View>
      ) : null}

      {step.type === 'referral' ? (
        <View style={styles.referralWrap}>
          <View style={styles.referralIcon}>
            <Ionicons name={step.icon} size={32} color="#52B788" />
          </View>
          <TextInput
            style={styles.referralInput}
            value={typeof value === 'string' ? value : ''}
            onChangeText={(text) => onSetField(step.field, text.toUpperCase())}
            placeholder={t.questions.enterCode}
            placeholderTextColor="rgba(255,255,255,0.35)"
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType="done"
          />
        </View>
      ) : null}
    </ScrollView>
  );
}

function WheelStepView({ step, value, onSetField }: StepContentProps) {
  if (step.type !== 'wheel') return null;
  if (step.mode === 'date') {
    return <DateWheel step={step} value={typeof value === 'string' ? value : undefined} onSetField={onSetField} />;
  }
  return <NumberWheel step={step} value={value} onSetField={onSetField} />;
}

function NumberWheel({
  step,
  value,
  onSetField,
}: {
  step: Extract<OnboardingStep, { type: 'wheel' }>;
  value: AnswerValue | undefined;
  onSetField: (field: string, value: AnswerValue) => void;
}) {
  const min = step.min ?? 0;
  const max = step.max ?? 100;
  const options: WheelPickerOption[] = useMemo(
    () =>
      Array.from({ length: max - min + 1 }, (_, i) => {
        const n = min + i;
        return { label: step.unit ? `${n} ${step.unit}` : String(n), value: n };
      }),
    [min, max, step.unit],
  );
  const current = typeof value === 'number' ? value : step.defaultValue ?? min;

  return (
    <View style={styles.centerBody}>
      <Header title={step.title} subtitle={step.subtitle} />
      <View style={styles.pickerArea}>
        <WheelPicker
          options={options}
          value={current}
          onChange={(v) => onSetField(step.field, typeof v === 'number' ? v : Number(v))}
        />
      </View>
    </View>
  );
}

function DateWheel({
  step,
  value,
  onSetField,
}: {
  step: Extract<OnboardingStep, { type: 'wheel' }>;
  value: string | undefined;
  onSetField: (field: string, value: AnswerValue) => void;
}) {
  const [year, month, day] = useMemo(() => {
    const parts = (value ?? `${CURRENT_YEAR - 30}-01-01`).split('-').map(Number);
    return [parts[0] || CURRENT_YEAR - 30, parts[1] || 1, parts[2] || 1];
  }, [value]);

  const monthOptions: WheelPickerOption[] = useMemo(
    () => MONTHS.map((m, i) => ({ label: m, value: i + 1 })),
    [],
  );
  const dayOptions: WheelPickerOption[] = useMemo(
    () => Array.from({ length: 31 }, (_, i) => ({ label: String(i + 1), value: i + 1 })),
    [],
  );
  const yearOptions: WheelPickerOption[] = useMemo(
    () =>
      Array.from({ length: 90 }, (_, i) => {
        const y = CURRENT_YEAR - 13 - i;
        return { label: String(y), value: y };
      }),
    [],
  );

  const commit = (y: number, m: number, d: number) => {
    const mm = String(m).padStart(2, '0');
    const dd = String(d).padStart(2, '0');
    onSetField(step.field, `${y}-${mm}-${dd}`);
  };

  return (
    <View style={styles.centerBody}>
      <Header title={step.title} subtitle={step.subtitle} />
      <View style={styles.dateRow}>
        <View style={styles.dateColWide}>
          <WheelPicker
            options={monthOptions}
            value={month}
            onChange={(v) => commit(year, Number(v), day)}
          />
        </View>
        <View style={styles.dateColNarrow}>
          <WheelPicker
            options={dayOptions}
            value={day}
            onChange={(v) => commit(year, month, Number(v))}
          />
        </View>
        <View style={styles.dateColMid}>
          <WheelPicker
            options={yearOptions}
            value={year}
            onChange={(v) => commit(Number(v), month, day)}
          />
        </View>
      </View>
    </View>
  );
}

function RulerStepView({ step, value, onSetField }: StepContentProps) {
  if (step.type !== 'ruler') return null;
  const current = typeof value === 'number' ? value : step.defaultValue;
  return (
    <View style={styles.centerBody}>
      <Header title={step.title} subtitle={step.subtitle} />
      <View style={styles.pickerArea}>
        <RulerSlider
          min={step.min}
          max={step.max}
          step={step.step}
          value={current}
          unit={`${current} ${step.unit}`}
          onChange={(v) => onSetField(step.field, v)}
        />
      </View>
    </View>
  );
}

/**
 * Interstitial step.
 *
 * Resolves its copy through i18n exactly as ScrollableStep does. It previously
 * read `step.title` / `step.body` straight from the config, which are English
 * fallbacks — so an info step in the live flow would have rendered English to
 * a German user while every question around it translated correctly. No info
 * step was reachable when that was written; `context_interlude` is the first,
 * and it would have shipped the bug.
 */
function InfoStepView({
  step,
  reduceMotion = false,
}: {
  step: Extract<OnboardingStep, { type: 'info' }>;
  reduceMotion?: boolean;
}) {
  const t = useTranslation();
  const copy = stepCopy(t.onboardingSteps as unknown as Record<string, unknown>, step.id);
  const enter = useEntrance(reduceMotion);
  const { opacity, translateY } = entranceStyle(enter);

  /**
   * A ScrollView, not a View — and the centring lives on the content
   * container, not the outer element.
   *
   * `flexGrow: 1` + `justifyContent: 'center'` centres the content while it is
   * shorter than the viewport, which is every normal text size. Once large
   * Dynamic Type makes it taller, the container simply grows past the viewport
   * and scrolls instead. Nothing is capped and nothing is truncated, so the
   * user keeps the text size they chose.
   *
   * The alternative — capping the text with maxFontSizeMultiplier — trades a
   * user's accessibility setting for a tidy layout. Scrolling costs nothing.
   */
  return (
    <Animated.View style={{ flex: 1, opacity, transform: [{ translateY }] }}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.infoBody}
        showsVerticalScrollIndicator={false}
      >
        <InfoIllustration step={step} />
        <Text style={styles.infoTitle}>{copy?.title ?? step.title}</Text>
        {copy?.body ?? step.body ? (
          <Text style={styles.infoText}>{copy?.body ?? step.body}</Text>
        ) : null}

        {step.bullets && step.bullets.length > 0 ? (
          <View style={styles.bullets}>
            {step.bullets.map((b, i) => (
              <View key={i} style={styles.bulletRow}>
                <View style={styles.bulletIcon}>
                  <Ionicons name={b.icon} size={16} color="#52B788" />
                </View>
                <Text style={styles.bulletText}>{b.text}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {copy?.caption ?? step.caption ? (
          <Text style={styles.infoCaption}>{copy?.caption ?? step.caption}</Text>
        ) : null}
      </ScrollView>
    </Animated.View>
  );
}

function InfoIllustration({ step }: { step: Extract<OnboardingStep, { type: 'info' }> }) {
  // Sub-components need their own hook — hooks do not cross function boundaries.
  const t = useTranslation();
  if (step.illustration === 'comparison') {
    return (
      <View style={styles.comparison}>
        <View style={styles.compCol}>
          <View style={[styles.compBar, styles.compBarMuted]}>
            <Ionicons name="person-outline" size={22} color="rgba(255,255,255,0.5)" />
          </View>
          <Text style={styles.compLabelMuted}>Without{'\n'}Gutwell</Text>
        </View>
        <View style={styles.compCol}>
          <View style={[styles.compBar, styles.compBarActive]}>
            <Ionicons name="leaf" size={24} color="#0B1F14" />
          </View>
          <Text style={styles.compLabelActive}>With{'\n'}Gutwell</Text>
        </View>
      </View>
    );
  }

  if (step.illustration === 'trend' || step.illustration === 'transition') {
    const down = step.illustration === 'trend';
    return (
      <View style={styles.chartCard}>
        <View style={styles.chartRow}>
          <View style={[styles.chartDot, { alignSelf: down ? 'flex-start' : 'flex-end' }]} />
          <View style={styles.chartLineWrap}>
            <Ionicons
              name={down ? 'trending-down-outline' : 'trending-up-outline'}
              size={120}
              color="#52B788"
            />
          </View>
          <View style={[styles.chartDot, { alignSelf: down ? 'flex-end' : 'flex-start' }]} />
        </View>
        <View style={styles.chartAxis}>
          <Text style={styles.chartAxisLabel}>{t.questions.chartNow}</Text>
          <Text style={styles.chartAxisLabel}>{t.questions.chartTwelveWeeks}</Text>
        </View>
      </View>
    );
  }

  if (step.illustration === 'rating') {
    return (
      <View style={styles.ratingRow}>
        {[0, 1, 2, 3, 4].map((i) => (
          <Ionicons key={i} name="star" size={30} color="#D4A373" />
        ))}
      </View>
    );
  }

  return (
    <View style={styles.infoIconRing}>
      <Ionicons name={step.icon} size={44} color="#52B788" />
    </View>
  );
}

const styles = StyleSheet.create({
  // The avoid-food chip styles lived here. Removed with the chip row itself —
  // the field had no consumer. See lib/onboarding-config.ts.

  flex: { flex: 1 },
  container: { flex: 1 },
  safeTop: { paddingHorizontal: 16 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
    paddingRight: 8,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressWrap: {
    flex: 1,
    // Yields width to the language chip when accessibility text sizes grow it,
    // so the header never pushes the switcher out of reach.
    flexShrink: 1,
  },
  body: {
    flex: 1,
  },

  // Selects / referral (scrollable)
  scroll: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  // ── Question hierarchy ────────────────────────────────────────────────────
  // Three tiers, separated by space rather than by rules or boxes: the
  // question, the line that qualifies it, then the answers. Previously the
  // subtitle sat 10pt under the title and the options 28pt under that, which
  // read as one block of text with buttons attached. Widening the gap before
  // the options and tightening the one after the title groups the two pieces
  // of copy together and makes the answer list the next thing the eye lands
  // on. No component changed — only spacing and weight.
  headerText: {
    marginTop: 28,
    marginBottom: 8,
  },
  title: {
    fontFamily: FontFamily.displayBold,
    fontSize: 32,
    color: '#FFFFFF',
    // 1.2× rather than 1.25×: at 32pt the extra leading pushed a two-line
    // German question far enough down to crowd the options on an SE.
    lineHeight: 38,
    letterSpacing: -0.4,
  },
  subtitle: {
    fontFamily: FontFamily.sansRegular,
    fontSize: 15,
    // Dimmer than before (0.6 → 0.55) so it reads as a qualifier rather than
    // competing with the option labels, which sit at full white.
    color: 'rgba(255,255,255,0.55)',
    marginTop: 8,
    lineHeight: 22,
  },
  options: {
    marginTop: 36,
    gap: 12,
  },
  referralWrap: {
    marginTop: 40,
    alignItems: 'center',
    gap: 24,
  },
  referralIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(82,183,136,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(82,183,136,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  referralInput: {
    width: '100%',
    height: 60,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 20,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: 18,
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: 2,
  },

  // Picker steps (centered)
  centerBody: {
    flex: 1,
    paddingHorizontal: 24,
  },
  pickerArea: {
    flex: 1,
    justifyContent: 'center',
  },
  dateRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateColWide: { flex: 1.4 },
  dateColNarrow: { flex: 0.7 },
  dateColMid: { flex: 1 },

  // Info / persuasion steps
  // Used as a ScrollView contentContainerStyle, so this is flexGrow, NOT flex.
  // `flex: 1` would pin the content to the viewport height and the view would
  // never scroll — the text would clip at large Dynamic Type sizes instead,
  // which is the exact failure this container exists to avoid. flexGrow lets
  // it fill the screen when short (so centring still applies) and exceed it
  // when tall.
  infoBody: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingVertical: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoIconRing: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: 'rgba(82,183,136,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(82,183,136,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 32,
  },
  infoTitle: {
    fontFamily: FontFamily.displayBold,
    fontSize: 30,
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 38,
  },
  infoText: {
    fontFamily: FontFamily.sansRegular,
    fontSize: 16,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    lineHeight: 24,
    marginTop: 16,
    maxWidth: 320,
  },
  infoCaption: {
    fontFamily: FontFamily.sansMedium,
    fontSize: 14,
    color: 'rgba(82,183,136,0.9)',
    textAlign: 'center',
    marginTop: 24,
    maxWidth: 300,
  },
  bullets: {
    marginTop: 28,
    gap: 14,
    alignSelf: 'stretch',
    paddingHorizontal: 8,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  bulletIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(82,183,136,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bulletText: {
    fontFamily: FontFamily.sansMedium,
    fontSize: 15,
    color: '#FFFFFF',
    flex: 1,
  },

  // Comparison illustration
  comparison: {
    flexDirection: 'row',
    gap: 20,
    marginBottom: 36,
    alignItems: 'flex-end',
  },
  compCol: {
    alignItems: 'center',
    gap: 12,
  },
  compBar: {
    width: 92,
    height: 130,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  compBarMuted: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    height: 104,
  },
  compBarActive: {
    backgroundColor: '#52B788',
  },
  compLabelMuted: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
  },
  compLabelActive: {
    fontFamily: FontFamily.sansBold,
    fontSize: 14,
    color: '#FFFFFF',
    textAlign: 'center',
  },

  // Trend / transition chart illustration
  chartCard: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    padding: 20,
    marginBottom: 36,
  },
  chartRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 120,
  },
  chartLineWrap: {
    flex: 1,
    alignItems: 'center',
  },
  chartDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#52B788',
  },
  chartAxis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  chartAxisLabel: {
    fontFamily: FontFamily.sansMedium,
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
  },

  // Rating illustration
  ratingRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 36,
  },

  // Bottom CTA
  bottomSection: {
    paddingBottom: 36,
    paddingHorizontal: 24,
    paddingTop: 8,
    gap: 12,
    alignItems: 'center',
  },
  cta: {
    width: '100%',
    height: 60,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    // Lifts the white pill off the dark gradient so it reads as the primary
    // action rather than a flat panel. Shadow only — size, colour, radius and
    // hit area are unchanged.
    shadowColor: '#000000',
    shadowOpacity: 0.28,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  ctaDisabled: {
    // 0.35 read as "broken" rather than "not yet". At 0.45 with the shadow
    // dropped, the button still clearly cannot be pressed but no longer looks
    // like a rendering fault before the first answer is chosen.
    opacity: 0.45,
    shadowOpacity: 0,
  },
  ctaText: {
    fontFamily: FontFamily.sansBold,
    fontSize: 17,
    color: '#0B1F14',
    letterSpacing: -0.3,
  },
  skipText: {
    fontFamily: FontFamily.sansRegular,
    fontSize: 15,
    color: 'rgba(255,255,255,0.45)',
  },
});
