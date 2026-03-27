import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Toast } from '../../components/ui/Toast';
import { Colors, Spacing, FontSize, BorderRadius } from '../../constants/theme';
import { updateTodayScore } from '../../lib/scoring';

const BRISTOL_TYPES = [
  { type: 1, desc: 'Hard lumps' },
  { type: 2, desc: 'Lumpy sausage' },
  { type: 3, desc: 'Cracked sausage' },
  { type: 4, desc: 'Smooth sausage' },
  { type: 5, desc: 'Soft blobs' },
  { type: 6, desc: 'Mushy' },
  { type: 7, desc: 'Liquid' },
];

const SLIDER_LABELS = ['None', 'Mild', 'Moderate', 'Strong', 'Severe'];

export default function CheckinScreen() {
  const { user } = useAuth();
  const [stoolType, setStoolType] = useState<number | null>(null);
  const [bloating, setBloating] = useState(1);
  const [pain, setPain] = useState(1);
  const [energy, setEnergy] = useState(3);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' as const });

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
      note: note.trim() || null,
    });
    setLoading(false);

    if (error) {
      setToast({ visible: true, message: 'Failed to save check-in', type: 'error' });
    } else {
      setToast({ visible: true, message: 'Check-in saved!', type: 'success' });
      updateTodayScore(user.id).catch(console.warn);
      setStoolType(null);
      setBloating(1);
      setPain(1);
      setEnergy(3);
      setNote('');
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Daily Check-in</Text>
        <Text style={styles.subtitle}>How's your gut today?</Text>

        <Text style={styles.sectionTitle}>Stool Type</Text>
        <View style={styles.bristolGrid}>
          {BRISTOL_TYPES.map(b => (
            <TouchableOpacity
              key={b.type}
              style={[
                styles.bristolItem,
                stoolType === b.type && styles.bristolSelected,
                { borderColor: stoolType === b.type ? Colors.bristol[b.type] : Colors.border },
              ]}
              onPress={() => setStoolType(b.type)}
              activeOpacity={0.7}
            >
              <Text style={[styles.bristolType, stoolType === b.type && { color: Colors.bristol[b.type] }]}>
                {b.type}
              </Text>
              <Text style={styles.bristolDesc}>{b.desc}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {stoolType === 4 && <Text style={styles.idealBadge}>Ideal range</Text>}

        <Text style={styles.sectionTitle}>Bloating</Text>
        <SliderRow value={bloating} onChange={setBloating} />

        <Text style={styles.sectionTitle}>Abdominal Pain</Text>
        <SliderRow value={pain} onChange={setPain} />

        <Text style={styles.sectionTitle}>Energy Level</Text>
        <SliderRow value={energy} onChange={setEnergy} labels={['Low', 'Below avg', 'Normal', 'Good', 'High']} />

        <Text style={styles.sectionTitle}>Notes (optional)</Text>
        <Input
          placeholder="Anything else to note..."
          value={note}
          onChangeText={setNote}
          multiline
          numberOfLines={3}
          style={{ minHeight: 80, textAlignVertical: 'top' }}
        />

        <Button title="Save Check-in" onPress={handleSave} loading={loading} size="lg" style={{ marginTop: Spacing.lg }} />
      </ScrollView>
      <Toast message={toast.message} type={toast.type} visible={toast.visible} onDismiss={() => setToast(t => ({ ...t, visible: false }))} />
    </SafeAreaView>
  );
}

function SliderRow({ value, onChange, labels = SLIDER_LABELS }: { value: number; onChange: (v: number) => void; labels?: string[] }) {
  return (
    <View style={styles.sliderRow}>
      {[1, 2, 3, 4, 5].map(v => (
        <TouchableOpacity
          key={v}
          style={[styles.sliderDot, {
            backgroundColor: value === v ? Colors.severity[v] : Colors.surfaceSecondary,
            borderColor: value === v ? Colors.severity[v] : Colors.border,
          }]}
          onPress={() => onChange(v)}
        >
          <Text style={[styles.sliderNum, value === v && { color: Colors.textInverse }]}>{v}</Text>
        </TouchableOpacity>
      ))}
      <Text style={styles.sliderLabel}>{labels[value - 1]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: Spacing.lg, paddingBottom: Spacing.xxl },
  title: { fontSize: FontSize.xxl, fontWeight: '700', color: Colors.text },
  subtitle: { fontSize: FontSize.md, color: Colors.textSecondary, marginBottom: Spacing.lg },
  sectionTitle: { fontSize: FontSize.lg, fontWeight: '600', color: Colors.text, marginTop: Spacing.lg, marginBottom: Spacing.sm },
  bristolGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  bristolItem: {
    width: '30%', flexGrow: 1, backgroundColor: Colors.surface, borderRadius: BorderRadius.md,
    padding: Spacing.md, alignItems: 'center', borderWidth: 2, gap: 4,
  },
  bristolSelected: { backgroundColor: Colors.surfaceSecondary },
  bristolType: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.textSecondary },
  bristolDesc: { fontSize: FontSize.xs, color: Colors.textTertiary, textAlign: 'center' },
  idealBadge: { fontSize: FontSize.xs, color: Colors.secondary, fontWeight: '600', textAlign: 'center', marginTop: Spacing.xs },
  sliderRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  sliderDot: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', borderWidth: 1.5 },
  sliderNum: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textSecondary },
  sliderLabel: { fontSize: FontSize.sm, color: Colors.textTertiary, marginLeft: Spacing.sm },
});
