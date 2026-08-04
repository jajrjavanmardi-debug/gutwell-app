import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Toast } from '../components/ui/Toast';
import { Colors, Spacing, FontSize, BorderRadius, FontFamily } from '../constants/theme';
import { updateTodayScore } from '../lib/scoring';
import { enqueue } from '../lib/offline-queue';
import { track, Events } from '../lib/analytics';
import { useTranslation } from '../lib/i18n';

// `key` is the value persisted to symptoms.symptom_type — never translated.
// Display labels come from t.symptomTypes, keyed by the same value.
const SYMPTOM_TYPES = [
  { key: 'bloating', icon: 'ellipse' as const },
  { key: 'gas', icon: 'cloud' as const },
  { key: 'cramps', icon: 'flash' as const },
  { key: 'nausea', icon: 'water' as const },
  { key: 'heartburn', icon: 'flame' as const },
  { key: 'fatigue', icon: 'bed' as const },
  { key: 'constipation', icon: 'lock-closed' as const },
  { key: 'diarrhea', icon: 'rainy' as const },
  { key: 'acid_reflux', icon: 'arrow-up-circle' as const },
  { key: 'other', icon: 'add-circle' as const },
] as const;

export default function LogSymptomScreen() {
  const t = useTranslation();
  const { user } = useAuth();

  /**
   * Display label for a stored symptom_type. Falls back to the raw value with
   * underscores replaced, so a type written by an older build still reads
   * sensibly instead of rendering blank.
   */
  const symptomLabel = (key: string) =>
    (t.symptomTypes as Record<string, string>)[key] ??
    key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ');

  const [selected, setSelected] = useState<string | null>(null);
  const [severity, setSeverity] = useState(3);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' as 'success' | 'error' });
  const [todaysSymptoms, setTodaysSymptoms] = useState<
    { id: string; symptom_type: string; severity: number; logged_at: string }[]
  >([]);

  useEffect(() => {
    if (!user) return;
    const loadTodaysSymptoms = async () => {
      const now = new Date();
      const startOfDay = new Date(now);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(now);
      endOfDay.setHours(23, 59, 59, 999);

      const { data } = await supabase
        .from('symptoms')
        .select('id, symptom_type, severity, logged_at')
        .eq('user_id', user.id)
        .gte('logged_at', startOfDay.toISOString())
        .lte('logged_at', endOfDay.toISOString())
        .order('logged_at', { ascending: false });

      if (data) {
        setTodaysSymptoms(
          data.map((item) => ({
            id: String(item.id),
            symptom_type: item.symptom_type,
            severity: item.severity,
            logged_at: item.logged_at,
          }))
        );
      }
    };

    loadTodaysSymptoms();
  }, [user]);

  const handleSave = async () => {
    if (!selected) {
      setToast({ visible: true, message: t.logSymptom.selectSymptom, type: 'error' });
      return;
    }
    if (!user) {
      setToast({ visible: true, message: t.logSymptom.loginRequired, type: 'error' });
      return;
    }

    setLoading(true);
    const payload = {
      user_id: user.id,
      symptom_type: selected,
      severity,
      note: note.trim() || null,
      logged_at: new Date().toISOString(),
    };
    const { error } = await supabase.from('symptoms').insert(payload);
    setLoading(false);

    if (error) {
      if (error.message?.includes('network') || error.message?.includes('Network') || error.code === 'PGRST301' || !error.code) {
        await enqueue('symptoms', payload);
        setToast({ visible: true, message: t.logSymptom.savedOffline, type: 'success' });
        setTimeout(() => router.back(), 1200);
      } else {
        setToast({ visible: true, message: t.logSymptom.saveFailed, type: 'error' });
      }
    } else {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      track(Events.SYMPTOM_LOGGED);
      setToast({ visible: true, message: t.logSymptom.success, type: 'success' });
      setTodaysSymptoms((prev) => [
        {
          id: `${Date.now()}`,
          symptom_type: selected,
          severity,
          logged_at: payload.logged_at,
        },
        ...prev,
      ]);
      updateTodayScore(user.id).catch(console.warn);
      setTimeout(() => router.back(), 1500);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={t.common.goBack}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t.logSymptom.headerTitle}</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Heading */}
        <Text style={styles.heading}>{t.logSymptom.heading}</Text>

        {/* Section: Symptom Type */}
        <Text style={styles.sectionLabel}>{t.logSymptom.typeQuestion}</Text>
        <View style={styles.grid}>
          {SYMPTOM_TYPES.map((s) => {
            const isSelected = selected === s.key;
            return (
              <TouchableOpacity
                key={s.key}
                style={[styles.symptomCard, isSelected && styles.symptomCardSelected]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setSelected(s.key);
                }}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={symptomLabel(s.key)}
                accessibilityState={{ selected: isSelected }}
              >
                <View
                  style={[
                    styles.symptomIconWrap,
                    isSelected && styles.symptomIconWrapSelected,
                  ]}
                >
                  <Ionicons
                    name={s.icon}
                    size={22}
                    color={isSelected ? Colors.primary : Colors.textTertiary}
                  />
                </View>
                <Text
                  style={[
                    styles.symptomLabel,
                    isSelected && styles.symptomLabelSelected,
                  ]}
                >
                  {symptomLabel(s.key)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.sectionLabel}>{t.logSymptom.todaysSymptoms}</Text>
        {todaysSymptoms.length > 0 ? (
          <View style={styles.todaysSymptomsList}>
            {todaysSymptoms.map((item) => (
              <View key={`${item.id}-${item.logged_at}`} style={styles.todaysSymptomRow}>
                <Text style={styles.todaysSymptomName}>
                  {symptomLabel(item.symptom_type)}
                </Text>
                <Text style={styles.todaysSymptomMeta}>
                  {t.logSymptom.severityPrefix} {item.severity}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.todaysSymptomsEmpty}>{t.logSymptom.noSymptomsToday}</Text>
        )}

        {/* Section: Severity */}
        <Text style={styles.sectionLabel}>{t.logSymptom.severityQuestion}</Text>
        <View style={styles.severityContainer}>
          <View style={styles.severityRow}>
            {[1, 2, 3, 4, 5].map((v) => {
              const isActive = severity === v;
              return (
                <TouchableOpacity
                  key={v}
                  style={[
                    styles.severityPill,
                    {
                      backgroundColor: isActive
                        ? Colors.severity[v]
                        : Colors.surfaceSecondary,
                      borderColor: isActive
                        ? Colors.severity[v]
                        : Colors.border,
                    },
                  ]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setSeverity(v);
                  }}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`${t.logSymptom.accessSeverity} ${v}: ${t.logSymptom.severityLevels[v - 1]}`}
                  accessibilityState={{ selected: isActive }}
                >
                  <Text
                    style={[
                      styles.severityNum,
                      isActive && styles.severityNumActive,
                    ]}
                  >
                    {v}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={styles.severityLabelRow}>
            <Text style={[styles.severityLabelText, { color: Colors.severity[severity] }]}>
              {t.logSymptom.severityLevels[severity - 1]}
            </Text>
          </View>
        </View>

        {/* Section: Notes */}
        <Text style={styles.sectionLabel}>{t.logSymptom.notesLabel}</Text>
        <Input
          placeholder={t.logSymptom.notesPlaceholder}
          value={note}
          onChangeText={setNote}
          multiline
          style={styles.notesInput}
        />

        {/* Save Button */}
        <Button
          title={t.logSymptom.saveButton}
          onPress={handleSave}
          loading={loading}
          size="lg"
          shape="pill"
          fullWidth
          style={styles.saveBtn}
        />
      </ScrollView>

      <Toast
        message={toast.message}
        type={toast.type}
        visible={toast.visible}
        onDismiss={() => setToast((t) => ({ ...t, visible: false }))}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
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
  headerTitle: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.lg,
    color: Colors.text,
  },
  scroll: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl + 40,
  },
  heading: {
    fontFamily: FontFamily.displayMedium,
    fontSize: FontSize.hero,
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  sectionLabel: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.md,
    color: Colors.text,
    marginBottom: Spacing.md,
    marginTop: Spacing.sm,
  },

  // Symptom Grid
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  symptomCard: {
    width: '47%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  symptomCardSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '15',
  },
  symptomIconWrap: {
    width: 38,
    height: 38,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.surfaceSecondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  symptomIconWrapSelected: {
    backgroundColor: Colors.primary + '20',
  },
  symptomLabel: {
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    flexShrink: 1,
  },
  symptomLabelSelected: {
    color: Colors.primary,
    fontFamily: FontFamily.sansSemiBold,
  },
  todaysSymptomsList: {
    gap: Spacing.xs,
    marginBottom: Spacing.lg,
  },
  todaysSymptomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  todaysSymptomName: {
    flex: 1,
    marginRight: Spacing.sm,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.sm,
    color: Colors.text,
  },
  todaysSymptomMeta: {
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.xs,
    color: Colors.textTertiary,
  },
  todaysSymptomsEmpty: {
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.xs,
    color: Colors.textTertiary,
    marginBottom: Spacing.lg,
  },

  // Severity
  severityContainer: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.xl,
  },
  severityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  severityPill: {
    flex: 1,
    height: 48,
    borderRadius: BorderRadius.full,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
  },
  severityNum: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.md,
    color: Colors.textSecondary,
  },
  severityNumActive: {
    color: Colors.textInverse,
  },
  severityLabelRow: {
    alignItems: 'center',
    marginTop: Spacing.md,
  },
  severityLabelText: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
  },

  // Notes
  notesInput: {
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: Spacing.md,
  },

  // Save
  saveBtn: {
    marginTop: Spacing.md,
  },
});
