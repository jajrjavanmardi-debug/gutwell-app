import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
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
import { Colors, Spacing, FontSize, BorderRadius, Shadows, FontFamily, Typography } from '../../constants/theme';
import { updateTodayScore } from '../../lib/scoring';
import { CheckInSuccessOverlay } from '../../components/CheckInSuccessOverlay';

const BRISTOL_TYPES = [
  { type: 1, desc: 'Hard lumps' },
  { type: 2, desc: 'Lumpy sausage' },
  { type: 3, desc: 'Cracked sausage' },
  { type: 4, desc: 'Smooth sausage' },
  { type: 5, desc: 'Soft blobs' },
  { type: 6, desc: 'Mushy' },
  { type: 7, desc: 'Liquid' },
];

const SEVERITY_LABELS = ['None', 'Mild', 'Moderate', 'Strong', 'Severe'];
const ENERGY_LABELS = ['Low', 'Below avg', 'Normal', 'Good', 'High'];

// ─── Progress Indicator ──────────────────────────────────────────────────────

function ProgressDots({ stoolFilled, symptomsFilled, moodFilled }: {
  stoolFilled: boolean;
  symptomsFilled: boolean;
  moodFilled: boolean;
}) {
  const sections = [
    { label: 'Stool', filled: stoolFilled },
    { label: 'Symptoms', filled: symptomsFilled },
    { label: 'Mood', filled: moodFilled },
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

function PillSlider({ value, onChange, labels }: {
  value: number;
  onChange: (v: number) => void;
  labels: string[];
}) {
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
  const { user } = useAuth();
  const [stoolType, setStoolType] = useState<number | null>(null);
  const [bloating, setBloating] = useState(1);
  const [pain, setPain] = useState(1);
  const [energy, setEnergy] = useState(3);
  const [mood, setMood] = useState<number | null>(null);
  const [waterGlasses, setWaterGlasses] = useState(0);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' as 'success' | 'error' });
  const [showSuccess, setShowSuccess] = useState(false);
  const [savedScore, setSavedScore] = useState<number | null>(null);
  const [currentStreak, setCurrentStreak] = useState(0);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('streaks')
      .select('current_streak')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data: sd }) => {
        setCurrentStreak(sd?.current_streak || 0);
      });
  }, [user]);

  const handleSave = async () => {
    if (!stoolType) {
      setToast({ visible: true, message: 'Please select a stool type', type: 'error' });
      return;
    }
    if (!user) return;

    setLoading(true);
    const { error } = await supabase.from('check_ins').insert({
      user_id: user.id,
      stool_type: stoolType,
      bloating,
      pain,
      energy,
      mood,
      note: note.trim() || null,
    });
    setLoading(false);

    if (error) {
      setToast({ visible: true, message: 'Failed to save check-in', type: 'error' });
    } else {
      const freshScore = await updateTodayScore(user.id).catch(() => null);
      setSavedScore(freshScore);
      setShowSuccess(true);
      setToast({ visible: true, message: 'Check-in saved!', type: 'success' });
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
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <Text style={styles.title}>Daily Check-in</Text>
        <Text style={styles.subtitle}>How is your gut feeling today?</Text>

        {/* Progress */}
        <ProgressDots
          stoolFilled={stoolType !== null}
          symptomsFilled={bloating > 1 || pain > 1 || energy !== 3}
          moodFilled={mood !== null}
        />

        {/* Bristol Stool Chart */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Stool Type</Text>
          <Text style={styles.sectionHint}>Select the closest match</Text>
          <View style={styles.bristolGrid}>
            {BRISTOL_TYPES.map(b => {
              const isSelected = stoolType === b.type;
              const color = Colors.bristol[b.type];
              return (
                <TouchableOpacity
                  key={b.type}
                  style={[
                    styles.bristolItem,
                    isSelected && {
                      backgroundColor: color + '26',
                      borderColor: color,
                    },
                  ]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setStoolType(b.type);
                  }}
                  activeOpacity={0.7}
                >
                  {isSelected && (
                    <View style={[styles.bristolCheck, { backgroundColor: color }]}>
                      <Ionicons name="checkmark" size={12} color={Colors.textInverse} />
                    </View>
                  )}
                  <Text style={[
                    styles.bristolType,
                    isSelected && { color, fontFamily: FontFamily.sansBold },
                  ]}>
                    {b.type}
                  </Text>
                  <Text style={[
                    styles.bristolDesc,
                    isSelected && { color: Colors.text },
                  ]}>
                    {b.desc}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {stoolType === 4 && (
            <View style={styles.idealBadge}>
              <Ionicons name="leaf" size={14} color={Colors.secondary} />
              <Text style={styles.idealBadgeText}>Ideal range</Text>
            </View>
          )}
        </View>

        {/* Symptoms */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Symptoms</Text>
          <Text style={styles.sectionHint}>Rate each symptom on a 1-5 scale</Text>

          <View style={styles.symptomCard}>
            <View style={styles.symptomHeader}>
              <Ionicons name="balloon-outline" size={18} color={Colors.primaryLight} />
              <Text style={styles.symptomLabel}>Bloating</Text>
            </View>
            <PillSlider value={bloating} onChange={setBloating} labels={SEVERITY_LABELS} />
          </View>

          <View style={styles.symptomCard}>
            <View style={styles.symptomHeader}>
              <Ionicons name="flash-outline" size={18} color={Colors.primaryLight} />
              <Text style={styles.symptomLabel}>Abdominal Pain</Text>
            </View>
            <PillSlider value={pain} onChange={setPain} labels={SEVERITY_LABELS} />
          </View>

          <View style={styles.symptomCard}>
            <View style={styles.symptomHeader}>
              <Ionicons name="battery-charging-outline" size={18} color={Colors.primaryLight} />
              <Text style={styles.symptomLabel}>Energy Level</Text>
            </View>
            <PillSlider value={energy} onChange={setEnergy} labels={ENERGY_LABELS} />
          </View>
        </View>

        {/* Mood */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Mood</Text>
          <Text style={styles.sectionHint}>How are you feeling emotionally?</Text>
          <MoodSelector value={mood} onChange={setMood} />
        </View>

        {/* Water Tracking */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Water Intake</Text>
          <Text style={styles.sectionHint}>Track your hydration throughout the day</Text>
          <WaterTracker
            glasses={waterGlasses}
            onAdd={() => setWaterGlasses(g => Math.min(g + 1, 12))}
            onRemove={() => setWaterGlasses(g => Math.max(g - 1, 0))}
          />
        </View>

        {/* Notes */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notes</Text>
          <Text style={styles.sectionHint}>Anything else worth noting?</Text>
          <Input
            placeholder="Food reactions, stress, sleep quality..."
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
          title="Save Check-in"
          onPress={handleSave}
          loading={loading}
          size="lg"
          style={styles.saveButton}
        />
      </ScrollView>

      <Toast
        message={toast.message}
        type={toast.type}
        visible={toast.visible}
        onDismiss={() => setToast(t => ({ ...t, visible: false }))}
      />
      <CheckInSuccessOverlay
        visible={showSuccess}
        score={savedScore}
        streak={currentStreak}
        onDone={() => {
          setShowSuccess(false);
          router.push('/(tabs)/');
        }}
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

  // Header
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

  // Bristol Chart
  bristolGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  bristolItem: {
    width: '30%',
    flexGrow: 1,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.border,
    gap: 4,
    minHeight: 80,
    justifyContent: 'center',
    position: 'relative',
  },
  bristolCheck: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bristolType: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.xl,
    color: Colors.textSecondary,
  },
  bristolDesc: {
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.xs,
    color: Colors.textTertiary,
    textAlign: 'center',
  },
  idealBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.sm,
  },
  idealBadgeText: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.xs,
    color: Colors.secondary,
  },

  // Symptom Cards
  symptomCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
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
