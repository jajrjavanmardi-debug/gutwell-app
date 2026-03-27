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
import { Colors, Spacing, FontSize, BorderRadius } from '../constants/theme';
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

export default function LogSymptomScreen() {
  const { user } = useAuth();
  const [selected, setSelected] = useState<string | null>(null);
  const [severity, setSeverity] = useState(3);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' as const });

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
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="close" size={28} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Log Symptom</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.sectionTitle}>What are you experiencing?</Text>
        <View style={styles.grid}>
          {SYMPTOM_TYPES.map(s => (
            <TouchableOpacity
              key={s.key}
              style={[styles.symptomBtn, selected === s.key && styles.symptomSelected]}
              onPress={() => setSelected(s.key)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={s.icon}
                size={24}
                color={selected === s.key ? Colors.primary : Colors.textTertiary}
              />
              <Text style={[styles.symptomLabel, selected === s.key && styles.symptomLabelSelected]}>
                {s.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Severity</Text>
        <View style={styles.severityRow}>
          {[1, 2, 3, 4, 5].map(v => (
            <TouchableOpacity
              key={v}
              style={[styles.sevDot, {
                backgroundColor: severity === v ? Colors.severity[v] : Colors.surfaceSecondary,
                borderColor: severity === v ? Colors.severity[v] : Colors.border,
              }]}
              onPress={() => setSeverity(v)}
            >
              <Text style={[styles.sevNum, severity === v && { color: Colors.textInverse }]}>{v}</Text>
            </TouchableOpacity>
          ))}
          <Text style={styles.sevLabel}>
            {['Mild', 'Minor', 'Moderate', 'Strong', 'Severe'][severity - 1]}
          </Text>
        </View>

        <Input
          label="Notes (optional)"
          placeholder="Any details..."
          value={note}
          onChangeText={setNote}
          multiline
          style={{ minHeight: 60, textAlignVertical: 'top' }}
        />

        <Button title="Log Symptom" onPress={handleSave} loading={loading} size="lg" style={{ marginTop: Spacing.lg }} />
      </ScrollView>
      <Toast message={toast.message} type={toast.type} visible={toast.visible} onDismiss={() => setToast(t => ({ ...t, visible: false }))} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.md, paddingTop: Spacing.sm },
  title: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.text },
  scroll: { padding: Spacing.lg, paddingBottom: Spacing.xxl },
  sectionTitle: { fontSize: FontSize.lg, fontWeight: '600', color: Colors.text, marginBottom: Spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.lg },
  symptomBtn: {
    width: '30%', flexGrow: 1, backgroundColor: Colors.surface, borderRadius: BorderRadius.md,
    padding: Spacing.md, alignItems: 'center', gap: 6, borderWidth: 1.5, borderColor: Colors.border,
  },
  symptomSelected: { borderColor: Colors.primary, backgroundColor: Colors.surfaceSecondary },
  symptomLabel: { fontSize: FontSize.xs, color: Colors.textTertiary, fontWeight: '500', textAlign: 'center' },
  symptomLabelSelected: { color: Colors.primary },
  severityRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.lg },
  sevDot: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', borderWidth: 1.5 },
  sevNum: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textSecondary },
  sevLabel: { fontSize: FontSize.sm, color: Colors.textTertiary, marginLeft: Spacing.sm },
});
