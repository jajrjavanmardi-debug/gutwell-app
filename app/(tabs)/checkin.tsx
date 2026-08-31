import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Animated, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Toast } from '../../components/ui/Toast';
import { MoodSelector } from '../../components/MoodSelector';
import { WaterTracker } from '../../components/WaterTracker';
import { BristolStoolChart } from '../../components/BristolStoolChart';
import { Colors, Spacing, FontSize, BorderRadius, Shadows, FontFamily, Typography } from '../../constants/theme';
import { updateTodayScore } from '../../lib/scoring';
import { updateWidgetData, reloadWidget } from '../../lib/widget-data';
import { track, Events } from '../../lib/analytics';
import { enqueue } from '../../lib/offline-queue';
import { CheckInSuccessOverlay } from '../../components/CheckInSuccessOverlay';
import { StreakPopup } from '../../components/StreakPopup';
import * as StoreReview from 'expo-store-review';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getStreakSnapshot, refreshStreakSnapshot } from '../../lib/streaks';
import { cancelStreakAtRiskAlert } from '../../lib/notifications';
import { getLocalDateKey } from '../../lib/date';
import { useTranslation } from '../../lib/i18n';
import { useReducedMotion } from '../../lib/useReducedMotion';

const STREAK_MILESTONES = [7, 14, 30, 100, 180, 366];


// ─── Progress Indicator ──────────────────────────────────────────────────────

function ProgressDots({ stoolFilled, symptomsFilled, moodFilled }: {
  stoolFilled: boolean;
  symptomsFilled: boolean;
  moodFilled: boolean;
}) {
  const t = useTranslation();
  const sections = [
    { label: t.checkin.sectionStool, filled: stoolFilled },
    { label: t.checkin.sectionSymptoms, filled: symptomsFilled },
    { label: t.checkin.sectionMood, filled: moodFilled },
  ];
  const filledCount = sections.filter(s => s.filled).length;

  return (
    <View style={styles.progressContainer}>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${(filledCount / sections.length) * 100}%` }]} />
      </View>
      <View style={styles.progressDots}>
        {sections.map(s => (
          <View key={s.label} style={styles.progressDotRow}>
            <View style={[styles.progressDot, s.filled && styles.progressDotFilled]}>
              {s.filled && <Ionicons name="checkmark" size={10} color={Colors.textInverse} />}
            </View>
            <Text style={[styles.progressDotLabel, s.filled && styles.progressDotLabelFilled]}>
              {s.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── Pill Slider ─────────────────────────────────────────────────────────────

function PillSlider({ value, onChange, labels, field }: {
  value: number;
  onChange: (v: number) => void;
  labels: string[];
  /** Metric name, spoken first so the slider identifies itself. */
  field: string;
}) {
  const t = useTranslation();
  return (
    <View style={styles.pillContainer}>
      <View style={styles.pillRow}>
        {[1, 2, 3, 4, 5].map(v => {
          const isSelected = value === v;
          const color = Colors.severity[v];
          return (
            <TouchableOpacity
              key={v}
              style={[
                styles.pill,
                isSelected && { backgroundColor: color },
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onChange(v);
              }}
              activeOpacity={0.7}
              accessibilityRole="button"
              /* Was `stoolLabels[v-1] … accessMoodLevel` — so the bloating,
                 pain and energy sliders all announced STOOL wording and then
                 called themselves "mood level". Now each reads its own metric,
                 its own label and its position on the scale. */
              accessibilityLabel={t.checkin.accessLevel
                .replace('{field}', field)
                .replace('{label}', labels[v - 1] ?? String(v))
                .replace('{n}', String(v))}
              accessibilityState={{ selected: isSelected }}
            >
              <Text style={[
                styles.pillText,
                isSelected && styles.pillTextSelected,
              ]}>
                {v}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={styles.pillLabel}>{labels[value - 1]}</Text>
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function CheckinScreen() {
  const t = useTranslation();
  const { user } = useAuth();
  const [stoolType, setStoolType] = useState<number | null>(null);
  const [bloating, setBloating] = useState(1);
  const [pain, setPain] = useState(1);
  const [energy, setEnergy] = useState(3);
  const [mood, setMood] = useState<number | null>(null);
  const [waterGlasses, setWaterGlasses] = useState(0);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' as 'success' | 'error' | 'info' });
  const [showSuccess, setShowSuccess] = useState(false);
  const [savedScore, setSavedScore] = useState<number | null>(null);
  const [currentStreak, setCurrentStreak] = useState(0);
  const [showStreakPopup, setShowStreakPopup] = useState(false);

  // Section entrance animation
  const reduceMotion = useReducedMotion();
  const sectionFade = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  useEffect(() => {
    // Decorative only. Under Reduce Motion the sections are simply present on
    // the first frame — nothing is scheduled and every field behaves the same.
    if (reduceMotion) {
      sectionFade.setValue(1);
      return;
    }
    const animation = Animated.timing(sectionFade, {
      toValue: 1,
      duration: 500,
      delay: 100,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [sectionFade, reduceMotion]);

  useEffect(() => {
    if (!user) {
      setToast({ visible: true, message: t.checkin.errorNotLoggedIn, type: 'error' });
      return;
    }
    getStreakSnapshot(user.id)
      .then((snapshot) => setCurrentStreak(snapshot?.currentStreak ?? 0))
      .catch(() => setCurrentStreak(0));
  }, [user]);

  const handleSave = async () => {
    if (!stoolType) {
      setToast({ visible: true, message: t.checkin.errorNoStool, type: 'error' });
      return;
    }
    if (!user) return;

    setLoading(true);
    const today = getLocalDateKey();
    const payload = {
      user_id: user.id,
      entry_date: today,
      stool_type: stoolType,
      bloating,
      pain,
      energy,
      mood,
      water_intake: waterGlasses,
      note: note.trim() || null,
    };
    const { error } = await supabase
      .from('check_ins')
      .upsert(payload, { onConflict: 'user_id,entry_date' });
    setLoading(false);

    if (error) {
      // Network error — queue offline and let the user continue
      if (error.message?.includes('network') || error.message?.includes('Network') || error.code === 'PGRST301' || !error.code) {
        await enqueue('check_ins', payload, { operation: 'upsert', onConflict: 'user_id,entry_date' });
        setToast({ visible: true, message: t.checkin.savedOffline, type: 'info' });
        setShowSuccess(true);
        setStoolType(null);
        setBloating(1);
        setPain(1);
        setEnergy(3);
        setMood(null);
        setWaterGlasses(0);
        setNote('');
        return;
      }
      setToast({ visible: true, message: t.checkin.errorSaveFailed, type: 'error' });
    } else {
      const freshScore = await updateTodayScore(user.id).catch(() => null);
      setSavedScore(freshScore);

      // Check for streak milestones
      const streakSnapshot = await refreshStreakSnapshot(user.id).catch(() => ({ currentStreak: 0 }));
      const newStreak = streakSnapshot?.currentStreak ?? 0;
      setCurrentStreak(newStreak);

      // Today's check-in is in — the streak is no longer at risk.
      cancelStreakAtRiskAlert().catch(() => {});

      // Event only — never send health values (stool type, scores) to analytics.
      track(Events.CHECKIN_LOGGED);

      // Update widget with latest data
      updateWidgetData({
        streak: newStreak,
        gutScore: freshScore ?? 0,
        lastCheckIn: 'Today', // internal value, not displayed directly
      }).then(reloadWidget).catch(() => {});

      if (STREAK_MILESTONES.includes(newStreak)) {
        track(Events.STREAK_MILESTONE, { streak: newStreak });
        // Delay streak popup until after success overlay dismisses
        setTimeout(() => setShowStreakPopup(true), 2500);

        // Prompt for App Store review once after a meaningful milestone (7 or 30 days)
        if (newStreak === 7 || newStreak === 30) {
          setTimeout(async () => {
            try {
              const alreadyPrompted = await AsyncStorage.getItem('rate_app_prompted');
              if (!alreadyPrompted) {
                const isAvailable = await StoreReview.isAvailableAsync();
                if (isAvailable) {
                  await StoreReview.requestReview();
                }
                await AsyncStorage.setItem('rate_app_prompted', 'true');
              }
            } catch {
              // Silently fail — review prompt is non-critical
            }
          }, 4500); // 2s after streak popup shows (2500 + 2000)
        }
      }

      setShowSuccess(true);
      setToast({ visible: true, message: t.checkin.successSaved, type: 'success' });
      setStoolType(null);
      setBloating(1);
      setPain(1);
      setEnergy(3);
      setMood(null);
      setWaterGlasses(0);
      setNote('');
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header — pushed view, needs a back affordance */}
      <View style={styles.navHeader}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={t.checkin.accessGoBack}
        >
          <Ionicons name="chevron-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.navTitle}>{t.checkin.headerTitle}</Text>
        <View style={styles.backBtn} />
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Animated.View style={{ opacity: sectionFade }}>
        {/* Heading */}
        <Text style={styles.title}>{t.checkin.heading}</Text>
        <Text style={styles.subtitle}>{t.checkin.subtitle}</Text>

        {/* Progress */}
        <ProgressDots
          stoolFilled={stoolType !== null}
          symptomsFilled={bloating > 1 || pain > 1 || energy !== 3}
          moodFilled={mood !== null}
        />

        {/* Bristol Stool Chart */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t.checkin.stoolTypeTitle}</Text>
          <Text style={styles.sectionHint}>{t.checkin.stoolSelectPrompt}</Text>
          <BristolStoolChart
            selected={stoolType}
            onSelect={(t) => {
              setStoolType(t);
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
          />
        </View>

        {/* Symptoms */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t.checkin.sectionSymptoms}</Text>
          <Text style={styles.sectionHint}>{t.checkin.symptomsHint}</Text>

          <View style={styles.symptomCard}>
            <View style={styles.symptomHeader}>
              <Ionicons name="balloon-outline" size={18} color={Colors.primaryLight} />
              <Text style={styles.symptomLabel}>{t.checkin.bloating}</Text>
            </View>
            <PillSlider value={bloating} onChange={setBloating} labels={[...t.checkin.severityLabels]} field={t.checkin.bloating} />
          </View>

          <View style={styles.symptomCard}>
            <View style={styles.symptomHeader}>
              <Ionicons name="flash-outline" size={18} color={Colors.primaryLight} />
              <Text style={styles.symptomLabel}>{t.checkin.abdominalPain}</Text>
            </View>
            <PillSlider value={pain} onChange={setPain} labels={[...t.checkin.severityLabels]} field={t.checkin.abdominalPain} />
          </View>

          <View style={styles.symptomCard}>
            <View style={styles.symptomHeader}>
              <Ionicons name="battery-charging-outline" size={18} color={Colors.primaryLight} />
              <Text style={styles.symptomLabel}>{t.checkin.energyLevel}</Text>
            </View>
            <PillSlider value={energy} onChange={setEnergy} labels={[...t.checkin.energyLabels]} field={t.checkin.energyLevel} />
          </View>
        </View>

        {/* Mood */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t.checkin.sectionMood}</Text>
          <Text style={styles.sectionHint}>{t.checkin.moodHint}</Text>
          <MoodSelector value={mood} onChange={setMood} />
        </View>

        {/* Water Tracking */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t.checkin.waterTitle}</Text>
          <Text style={styles.sectionHint}>{t.checkin.waterHint}</Text>
          <WaterTracker
            glasses={waterGlasses}
            onAdd={() => setWaterGlasses(g => Math.min(g + 1, 12))}
            onRemove={() => setWaterGlasses(g => Math.max(g - 1, 0))}
          />
        </View>

        {/* Notes */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t.checkin.sectionNotes}</Text>
          <Text style={styles.sectionHint}>{t.checkin.notesHint}</Text>
          <Input
            placeholder={t.checkin.notesPlaceholder}
            value={note}
            onChangeText={setNote}
            multiline
            numberOfLines={3}
            maxLength={1000}
            style={styles.notesInput}
          />
        </View>

        {/* Save */}
        <Button
          title={t.checkin.saveButton}
          accessibilityLabel={t.checkin.accessSave}
          onPress={handleSave}
          loading={loading}
          size="lg"
          shape="pill"
          fullWidth
          style={styles.saveButton}
        />
        </Animated.View>
      </ScrollView>
      </KeyboardAvoidingView>

      <Toast
        message={toast.message}
        type={toast.type}
        visible={toast.visible}
        onDismiss={() => setToast(t => ({ ...t, visible: false }))}
      />
      <CheckInSuccessOverlay
        visible={showSuccess}
        score={savedScore ?? undefined}
        streak={currentStreak}
        onDone={() => {
          setShowSuccess(false);
          router.replace('/(tabs)');
        }}
      />
      <StreakPopup
        visible={showStreakPopup}
        currentStreak={currentStreak}
        bestStreak={currentStreak}
        streakState="active"
        completionRate={1}
        onClose={() => setShowStreakPopup(false)}
      />
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scroll: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl + Spacing.xl,
  },

  // Nav header (back chevron + centered title)
  navHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  backBtn: {
    width: 42,
    height: 42,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  navTitle: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.lg,
    color: Colors.text,
  },

  // Heading
  title: {
    fontFamily: FontFamily.displayMedium,
    fontSize: FontSize.hero,
    color: Colors.text,
    lineHeight: 42,
  },
  subtitle: {
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
    marginBottom: Spacing.md,
  },

  // Progress
  progressContainer: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.sm,
  },
  progressTrack: {
    height: 4,
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: Spacing.md,
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.secondary,
    borderRadius: 2,
  },
  progressDots: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  progressDotRow: {
    alignItems: 'center',
    gap: Spacing.xs,
  },
  progressDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.surfaceSecondary,
    borderWidth: 1.5,
    borderColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressDotFilled: {
    backgroundColor: Colors.secondary,
    borderColor: Colors.secondary,
  },
  progressDotLabel: {
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.xs,
    color: Colors.textTertiary,
  },
  progressDotLabelFilled: {
    color: Colors.secondary,
  },

  // Section
  section: {
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    fontFamily: FontFamily.displayMedium,
    fontSize: FontSize.xl,
    color: Colors.text,
    marginBottom: 2,
  },
  sectionHint: {
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.sm,
    color: Colors.textTertiary,
    marginBottom: Spacing.md,
  },

  // Symptom Cards
  symptomCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.sm,
  },
  symptomHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  symptomLabel: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.md,
    color: Colors.text,
  },

  // Pill Slider
  pillContainer: {
    gap: Spacing.sm,
  },
  pillRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  pill: {
    flex: 1,
    height: 40,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surfaceSecondary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  pillText: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  pillTextSelected: {
    color: Colors.textInverse,
  },
  pillLabel: {
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.sm,
    color: Colors.textTertiary,
    textAlign: 'center',
  },

  // Notes
  notesInput: {
    minHeight: 88,
    textAlignVertical: 'top',
  },

  // Save
  saveButton: {
    marginTop: Spacing.md,
  },
});
