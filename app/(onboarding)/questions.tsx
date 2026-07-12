import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
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
import {
  ONBOARDING_STEPS,
  TOTAL_STEPS,
  type OnboardingStep,
} from '../../lib/onboarding-config';

const ANSWERS_KEY = 'onboarding_answers';
const FADE_OUT_MS = 220;
const FADE_IN_MS = 320;

type AnswerValue = string | number | string[];
type Answers = Record<string, AnswerValue>;

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const CURRENT_YEAR = new Date().getFullYear();

/** Whether the current step has enough input to enable the Continue CTA. */
function canAdvance(step: OnboardingStep, value: AnswerValue | undefined): boolean {
  switch (step.type) {
    case 'single-select':
      return typeof value === 'string' && value.length > 0;
    case 'multi-select':
      return step.optional || (Array.isArray(value) && value.length > 0);
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
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const contentOpacity = useRef(new Animated.Value(1)).current;

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
    (nextIndex: number) => {
      Animated.timing(contentOpacity, {
        toValue: 0,
        duration: FADE_OUT_MS,
        useNativeDriver: true,
      }).start(() => {
        setIndex(nextIndex);
        Animated.timing(contentOpacity, {
          toValue: 1,
          duration: FADE_IN_MS,
          useNativeDriver: true,
        }).start();
      });
    },
    [contentOpacity],
  );

  const handleContinue = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    track(Events.ONBOARDING_STEP, { step: step.id });
    const isLast = index === ONBOARDING_STEPS.length - 1;
    if (isLast) {
      track(Events.ONBOARDING_STEP, { step: 'quiz_completed' });
      router.push('/(onboarding)/analysing');
      return;
    }
    goToStep(index + 1);
  }, [goToStep, index, step.id]);

  const handleBack = useCallback(() => {
    if (index === 0) {
      router.back();
      return;
    }
    goToStep(index - 1);
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
              accessibilityLabel="Go back"
              activeOpacity={0.7}
            >
              <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
            </TouchableOpacity>
            <View style={styles.progressWrap}>
              <StepProgressBar
                progress={progress}
                trackColor="rgba(255,255,255,0.12)"
                fillColor="#52B788"
              />
            </View>
          </View>
        </SafeAreaView>

        <Animated.View style={[styles.body, { opacity: contentOpacity }]}>
          <StepContent
            step={step}
            value={currentValue}
            onSetField={setField}
          />
        </Animated.View>

        <View style={styles.bottomSection}>
          <TouchableOpacity
            style={[styles.cta, !advanceEnabled && styles.ctaDisabled]}
            onPress={handleContinue}
            disabled={!advanceEnabled}
            accessibilityRole="button"
            accessibilityLabel={ctaLabel(step)}
            activeOpacity={0.88}
          >
            <Text style={styles.ctaText}>{ctaLabel(step)}</Text>
          </TouchableOpacity>

          {isSkippable(step) ? (
            <TouchableOpacity
              onPress={handleContinue}
              accessibilityRole="button"
              accessibilityLabel="Skip this step"
              activeOpacity={0.7}
            >
              <Text style={styles.skipText}>Skip</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function ctaLabel(step: OnboardingStep): string {
  if (step.type === 'info' && step.cta) return step.cta;
  if (step.type === 'referral') return 'Continue';
  return 'Continue';
}

function isSkippable(step: OnboardingStep): boolean {
  return step.type === 'info' && !!step.skippable;
}

// ─── Per-step content renderer ──────────────────────────────────────────────

type StepContentProps = {
  step: OnboardingStep;
  value: AnswerValue | undefined;
  onSetField: (field: string, value: AnswerValue) => void;
};

function StepContent({ step, value, onSetField }: StepContentProps) {
  switch (step.type) {
    case 'single-select':
    case 'multi-select':
    case 'referral':
      return <ScrollableStep step={step} value={value} onSetField={onSetField} />;
    case 'wheel':
      return <WheelStepView step={step} value={value} onSetField={onSetField} />;
    case 'ruler':
      return <RulerStepView step={step} value={value} onSetField={onSetField} />;
    case 'info':
      return <InfoStepView step={step} />;
    default:
      return null;
  }
}

function Header({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.headerText}>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

function ScrollableStep({ step, value, onSetField }: StepContentProps) {
  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <Header title={step.title} subtitle={step.subtitle} />

      {step.type === 'single-select' ? (
        <View style={styles.options}>
          {step.options.map((opt) => {
            const selected = value === opt.value;
            const icon = opt.icon ? (
              <Ionicons name={opt.icon} size={22} color={selected ? '#52B788' : '#FFFFFF'} />
            ) : undefined;
            return step.variant === 'card' ? (
              <OptionCard
                key={opt.value}
                title={opt.label}
                subtitle={opt.description}
                icon={icon}
                selected={selected}
                onPress={() => onSetField(step.field, opt.value)}
              />
            ) : (
              <OptionRow
                key={opt.value}
                label={opt.label}
                description={opt.description}
                icon={icon}
                selected={selected}
                onPress={() => onSetField(step.field, opt.value)}
              />
            );
          })}
        </View>
      ) : null}

      {step.type === 'multi-select' ? (
        <View style={styles.options}>
          {step.options.map((opt) => {
            const list = Array.isArray(value) ? value : [];
            const selected = list.includes(opt.value);
            const icon = opt.icon ? (
              <Ionicons name={opt.icon} size={22} color={selected ? '#52B788' : '#FFFFFF'} />
            ) : undefined;
            return (
              <OptionRow
                key={opt.value}
                label={opt.label}
                description={opt.description}
                icon={icon}
                multiSelect
                selected={selected}
                onPress={() => {
                  const next = selected
                    ? list.filter((v) => v !== opt.value)
                    : [...list, opt.value];
                  onSetField(step.field, next);
                }}
              />
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
            placeholder="Enter code"
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

function InfoStepView({ step }: { step: Extract<OnboardingStep, { type: 'info' }> }) {
  return (
    <View style={styles.infoBody}>
      <InfoIllustration step={step} />
      <Text style={styles.infoTitle}>{step.title}</Text>
      {step.body ? <Text style={styles.infoText}>{step.body}</Text> : null}

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

      {step.caption ? <Text style={styles.infoCaption}>{step.caption}</Text> : null}
    </View>
  );
}

function InfoIllustration({ step }: { step: Extract<OnboardingStep, { type: 'info' }> }) {
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
          <Text style={styles.chartAxisLabel}>Now</Text>
          <Text style={styles.chartAxisLabel}>12 weeks</Text>
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
  headerText: {
    marginTop: 24,
    marginBottom: 8,
  },
  title: {
    fontFamily: FontFamily.displayBold,
    fontSize: 32,
    color: '#FFFFFF',
    lineHeight: 40,
  },
  subtitle: {
    fontFamily: FontFamily.sansRegular,
    fontSize: 15,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 10,
    lineHeight: 22,
  },
  options: {
    marginTop: 28,
    gap: 10,
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
  infoBody: {
    flex: 1,
    paddingHorizontal: 24,
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
  },
  ctaDisabled: {
    opacity: 0.35,
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
