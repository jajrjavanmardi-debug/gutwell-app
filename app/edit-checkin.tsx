import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Toast } from '../components/ui/Toast';
import { MoodSelector } from '../components/MoodSelector';
import { WaterTracker } from '../components/WaterTracker';
import { Colors, Spacing, FontSize, BorderRadius, Shadows, FontFamily } from '../constants/theme';
import { useTranslation } from '../lib/i18n';

// The numeric Bristol type is what gets persisted; descriptions come from
// t.editCheckin.bristolDescriptions, keyed by the same number.
const BRISTOL_TYPES = [1, 2, 3, 4, 5, 6, 7] as const;

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
              accessibilityRole="button"
              accessibilityLabel={`${v}: ${labels[v - 1]}`}
              accessibilityState={{ selected: isSelected }}
            >
              <Text style={[styles.pillText, isSelected && styles.pillTextSelected]}>
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

export default function EditCheckinScreen() {
  const t = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();

  const [fetching, setFetching] = useState(true);
  const [stoolType, setStoolType] = useState<number | null>(null);
  const [bloating, setBloating] = useState(1);
  const [pain, setPain] = useState(1);
  const [energy, setEnergy] = useState(3);
  const [mood, setMood] = useState<number | null>(null);
  const [waterGlasses, setWaterGlasses] = useState(0);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' as 'success' | 'error' });

  // The load effect runs once per check-in id. It reads copy through a ref so
  // it never lists `t` as a dependency — depending on `t` would refetch the
  // check-in every time the user switches language.
  const tRef = useRef(t);
  tRef.current = t;

  useEffect(() => {
    if (!id) {
      setToast({ visible: true, message: tRef.current.editCheckin.missingId, type: 'error' });
      setFetching(false);
      return;
    }
    (async () => {
      const { data, error } = await supabase
        .from('check_ins')
        .select('*')
        .eq('id', id)
        .single();
      if (error || !data) {
        setToast({ visible: true, message: tRef.current.editCheckin.loadFailed, type: 'error' });
        setFetching(false);
        return;
      }
      setStoolType(data.stool_type ?? null);
      setBloating(data.bloating ?? 1);
      setPain(data.pain ?? 1);
      setEnergy(data.energy ?? 3);
      setMood(data.mood ?? null);
      setWaterGlasses(data.water_intake ?? 0);
      setNote(data.note ?? '');
      setFetching(false);
    })();
  }, [id]);

  const handleSave = async () => {
    if (!stoolType) {
      setToast({ visible: true, message: t.editCheckin.selectStoolType, type: 'error' });
      return;
    }
    if (!id) {
      setToast({ visible: true, message: t.editCheckin.missingId, type: 'error' });
      return;
    }
    if (!user) {
      setToast({ visible: true, message: t.editCheckin.loginRequired, type: 'error' });
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from('check_ins')
      .update({
        stool_type: stoolType,
        bloating,
        pain,
        energy,
        mood,
        water_intake: waterGlasses,
        note: note.trim() || null,
      })
      .eq('id', id);
    setSaving(false);
    if (error) {
      setToast({ visible: true, message: t.editCheckin.saveFailed, type: 'error' });
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setToast({ visible: true, message: t.editCheckin.success, type: 'success' });
      setTimeout(() => router.back(), 800);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      t.editCheckin.deleteTitle,
      t.editCheckin.deleteMessage,
      [
        { text: t.common.cancel, style: 'cancel' },
        {
          text: t.common.delete,
          style: 'destructive',
          onPress: async () => {
            if (!id) {
              setToast({ visible: true, message: t.editCheckin.missingId, type: 'error' });
              return;
            }
            if (!user) {
              setToast({ visible: true, message: t.editCheckin.loginRequired, type: 'error' });
              return;
            }
            setDeleting(true);
            const { error } = await supabase
              .from('check_ins')
              .delete()
              .eq('id', id);
            setDeleting(false);
            if (error) {
              setToast({ visible: true, message: t.editCheckin.deleteFailed, type: 'error' });
            } else {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
              router.back();
            }
          },
        },
      ]
    );
  };

  if (fetching) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={Colors.secondary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={t.common.goBack}
        >
          <Ionicons name="chevron-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t.editCheckin.headerTitle}</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Heading */}
        <Text style={styles.heading}>{t.editCheckin.heading}</Text>

        {/* Bristol Stool Chart */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t.editCheckin.stoolTypeTitle}</Text>
          <Text style={styles.sectionHint}>{t.editCheckin.stoolTypeHint}</Text>
          <View style={styles.bristolGrid}>
            {BRISTOL_TYPES.map(type => {
              const isSelected = stoolType === type;
              const color = Colors.bristol[type];
              const desc = t.editCheckin.bristolDescriptions[type];
              return (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.bristolItem,
                    isSelected && {
                      backgroundColor: color + '26',
                      borderColor: color,
                    },
                  ]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setStoolType(type);
                  }}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`${t.editCheckin.stoolTypeTitle} ${type}: ${desc}`}
                  accessibilityState={{ selected: isSelected }}
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
                    {type}
                  </Text>
                  <Text style={[
                    styles.bristolDesc,
                    isSelected && { color: Colors.text },
                  ]}>
                    {desc}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {stoolType === 4 && (
            <View style={styles.idealBadge}>
              <Ionicons name="leaf" size={14} color={Colors.secondary} />
              <Text style={styles.idealBadgeText}>{t.editCheckin.idealRange}</Text>
            </View>
          )}
        </View>

        {/* Symptoms */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t.editCheckin.symptomsTitle}</Text>
          <Text style={styles.sectionHint}>{t.editCheckin.symptomsHint}</Text>

          <View style={styles.symptomCard}>
            <View style={styles.symptomHeader}>
              <Ionicons name="balloon-outline" size={18} color={Colors.primaryLight} />
              <Text style={styles.symptomLabel}>{t.editCheckin.bloating}</Text>
            </View>
            <PillSlider value={bloating} onChange={setBloating} labels={[...t.editCheckin.severityLabels]} />
          </View>

          <View style={styles.symptomCard}>
            <View style={styles.symptomHeader}>
              <Ionicons name="flash-outline" size={18} color={Colors.primaryLight} />
              <Text style={styles.symptomLabel}>{t.editCheckin.abdominalPain}</Text>
            </View>
            <PillSlider value={pain} onChange={setPain} labels={[...t.editCheckin.severityLabels]} />
          </View>

          <View style={styles.symptomCard}>
            <View style={styles.symptomHeader}>
              <Ionicons name="battery-charging-outline" size={18} color={Colors.primaryLight} />
              <Text style={styles.symptomLabel}>{t.editCheckin.energyLevel}</Text>
            </View>
            <PillSlider value={energy} onChange={setEnergy} labels={[...t.editCheckin.energyLabels]} />
          </View>
        </View>

        {/* Mood */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t.editCheckin.moodTitle}</Text>
          <Text style={styles.sectionHint}>{t.editCheckin.moodHint}</Text>
          <MoodSelector value={mood} onChange={setMood} />
        </View>

        {/* Water Tracking */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t.editCheckin.waterTitle}</Text>
          <Text style={styles.sectionHint}>{t.editCheckin.waterHint}</Text>
          <WaterTracker
            glasses={waterGlasses}
            onAdd={() => setWaterGlasses(g => Math.min(g + 1, 12))}
            onRemove={() => setWaterGlasses(g => Math.max(g - 1, 0))}
          />
        </View>

        {/* Notes */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t.editCheckin.notesTitle}</Text>
          <Text style={styles.sectionHint}>{t.editCheckin.notesHint}</Text>
          <Input
            placeholder={t.editCheckin.notesPlaceholder}
            value={note}
            onChangeText={setNote}
            multiline
            numberOfLines={3}
            maxLength={1000}
            style={styles.notesInput}
          />
        </View>

        {/* Save Button */}
        <Button
          title={t.editCheckin.saveButton}
          onPress={handleSave}
          loading={saving}
          size="lg"
          shape="pill"
          fullWidth
          style={styles.saveButton}
        />

        {/* Delete Button */}
        <TouchableOpacity
          style={[styles.deleteButton, deleting && styles.deleteButtonDisabled]}
          onPress={handleDelete}
          activeOpacity={0.7}
          disabled={deleting}
          accessibilityRole="button"
          accessibilityLabel={t.editCheckin.deleteEntry}
        >
          {deleting ? (
            <ActivityIndicator size="small" color={Colors.error} />
          ) : (
            <Ionicons name="trash-outline" size={18} color={Colors.error} />
          )}
          <Text style={styles.deleteButtonText}>{deleting ? t.editCheckin.deleting : t.editCheckin.deleteEntry}</Text>
        </TouchableOpacity>
      </ScrollView>

      <Toast
        message={toast.message}
        type={toast.type}
        visible={toast.visible}
        onDismiss={() => setToast(t => ({ ...t, visible: false }))}
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
  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  headerTitle: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.lg,
    color: Colors.text,
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

  scroll: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl + Spacing.xl,
  },
  heading: {
    fontFamily: FontFamily.displayMedium,
    fontSize: FontSize.hero,
    color: Colors.text,
    marginBottom: Spacing.lg,
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

  // Buttons
  saveButton: {
    marginTop: Spacing.md,
    marginBottom: Spacing.md,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.error + '10',
    borderRadius: BorderRadius.full,
    paddingVertical: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.error + '30',
    marginBottom: Spacing.xl,
  },
  deleteButtonDisabled: {
    opacity: 0.5,
  },
  deleteButtonText: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.md,
    color: Colors.error,
  },
});
