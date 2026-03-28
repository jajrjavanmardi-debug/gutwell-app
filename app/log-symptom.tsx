import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Toast } from '../components/ui/Toast';
import { Colors, Spacing, FontSize, BorderRadius, FontFamily } from '../constants/theme';
import { updateTodayScore } from '../lib/scoring';

const SYMPTOM_TYPES = [
  { key: 'bloating', label: 'Bloating', icon: 'ellipse' as const },
  { key: 'gas', label: 'Gas', icon: 'cloud' as const },
  { key: 'cramps', label: 'Cramps', icon: 'flash' as const },
  { key: 'nausea', label: 'Nausea', icon: 'water' as const },
  { key: 'heartburn', label: 'Heartburn', icon: 'flame' as const },
  { key: 'fatigue', label: 'Fatigue', icon: 'bed' as const },
  { key: 'constipation', label: 'Constipation', icon: 'lock-closed' as const },
  { key: 'diarrhea', label: 'Diarrhea', icon: 'rainy' as const },
  { key: 'acid_reflux', label: 'Acid Reflux', icon: 'arrow-up-circle' as const },
  { key: 'other', label: 'Other', icon: 'add-circle' as const },
];

const SEVERITY_LABELS = ['Mild', 'Minor', 'Moderate', 'Strong', 'Severe'];

export default function LogSymptomScreen() {
  const { user } = useAuth();
  const [selected, setSelected] = useState<string | null>(null);
  const [severity, setSeverity] = useState(3);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' as 'success' | 'error' });

  const handleSave = async () => {
    if (!selected) {
      setToast({ visible: true, message: 'Please select a symptom', type: 'error' });
      return;
    }
    if (!user) return;

    setLoading(true);
    const { error } = await supabase.from('symptoms').insert({
      user_id: user.id,
      symptom_type: selected,
      severity,
      note: note.trim() || null,
    });
    setLoading(false);

    if (error) {
      setToast({ visible: true, message: 'Failed to log symptom', type: 'error' });
    } else {
      setToast({ visible: true, message: 'Symptom logged!', type: 'success' });
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
          style={styles.closeBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="close" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Log Symptom</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Section: Symptom Type */}
        <Text style={styles.sectionLabel}>What are you experiencing?</Text>
        <View style={styles.grid}>
          {SYMPTOM_TYPES.map((s) => {
            const isSelected = selected === s.key;
            return (
              <TouchableOpacity
                key={s.key}
                style={[styles.symptomCard, isSelected && styles.symptomCardSelected]}
                onPress={() => setSelected(s.key)}
                activeOpacity={0.7}
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
                  {s.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Section: Severity */}
        <Text style={styles.sectionLabel}>How severe is it?</Text>
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
                  onPress={() => setSeverity(v)}
                  activeOpacity={0.7}
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
              {SEVERITY_LABELS[severity - 1]}
            </Text>
          </View>
        </View>

        {/* Section: Notes */}
        <Text style={styles.sectionLabel}>Notes</Text>
        <Input
          placeholder="Any additional details..."
          value={note}
          onChangeText={setNote}
          multiline
          style={styles.notesInput}
        />

        {/* Save Button */}
        <Button
          title="Log Symptom"
          onPress={handleSave}
          loading={loading}
          size="lg"
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
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surfaceSecondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.lg,
    color: Colors.text,
  },
  headerSpacer: {
    width: 36,
  },
  scroll: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl + 40,
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
    borderRadius: BorderRadius.md,
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
