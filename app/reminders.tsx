import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Toast } from '../components/ui/Toast';
import { requestNotificationPermissions, syncReminders } from '../lib/notifications';
import { Colors, Spacing, FontSize, BorderRadius } from '../constants/theme';

type ReminderType = 'checkin' | 'food' | 'symptom';
type Reminder = {
  id: number;
  reminder_type: ReminderType;
  time: string;
  enabled: boolean;
  days: number[];
};

const REMINDER_TYPES: { key: ReminderType; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'checkin', label: 'Check-in', icon: 'body' },
  { key: 'food', label: 'Meal Log', icon: 'restaurant' },
  { key: 'symptom', label: 'Symptom', icon: 'medical' },
];

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export default function RemindersScreen() {
  const { user } = useAuth();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newType, setNewType] = useState<ReminderType>('checkin');
  const [newHour, setNewHour] = useState(9);
  const [newMinute, setNewMinute] = useState(0);
  const [newDays, setNewDays] = useState<number[]>([1, 2, 3, 4, 5, 6, 7]);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' as 'success' | 'error' });

  const loadReminders = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('reminders')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });
    setReminders(data ?? []);
    setLoading(false);
  }, [user]);

  useEffect(() => { loadReminders(); }, [loadReminders]);

  const toggleReminder = async (id: number, enabled: boolean) => {
    setReminders(rs => rs.map(r => r.id === id ? { ...r, enabled } : r));
    const { error } = await supabase.from('reminders').update({ enabled }).eq('id', id);
    if (error) {
      setReminders(rs => rs.map(r => r.id === id ? { ...r, enabled: !enabled } : r));
      setToast({ visible: true, message: 'Failed to update reminder', type: 'error' });
      return;
    }
    if (user) await syncReminders(user.id);
  };

  const deleteReminder = (id: number) => {
    Alert.alert('Delete Reminder', 'Remove this reminder?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          await supabase.from('reminders').delete().eq('id', id);
          setReminders(rs => rs.filter(r => r.id !== id));
          if (user) await syncReminders(user.id);
        },
      },
    ]);
  };

  const handleAdd = async () => {
    if (!user) return;

    const granted = await requestNotificationPermissions();
    if (!granted) {
      setToast({ visible: true, message: 'Please enable notifications in Settings', type: 'error' });
      return;
    }

    setSaving(true);
    const timeStr = `${String(newHour).padStart(2, '0')}:${String(newMinute).padStart(2, '0')}`;

    const { error } = await supabase.from('reminders').insert({
      user_id: user.id,
      reminder_type: newType,
      time: timeStr,
      enabled: true,
      days: newDays,
    });

    if (error) {
      setToast({ visible: true, message: 'Failed to save reminder', type: 'error' });
    } else {
      await syncReminders(user.id);
      setToast({ visible: true, message: 'Reminder added!', type: 'success' });
      setShowAdd(false);
      await loadReminders();
    }
    setSaving(false);
  };

  const toggleDay = (day: number) => {
    setNewDays(ds => ds.includes(day) ? ds.filter(d => d !== day) : [...ds, day].sort());
  };

  const formatTime = (time: string) => {
    const [h, m] = time.split(':').map(Number);
    const suffix = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 || 12;
    return `${hour12}:${String(m).padStart(2, '0')} ${suffix}`;
  };

  const typeInfo = (type: ReminderType) => REMINDER_TYPES.find(t => t.key === type)!;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="close" size={28} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Reminders</Text>
        <TouchableOpacity onPress={() => setShowAdd(true)}>
          <Ionicons name="add-circle" size={28} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {reminders.length === 0 && !loading && (
          <Card style={styles.emptyCard}>
            <Ionicons name="notifications-off" size={40} color={Colors.textTertiary} />
            <Text style={styles.emptyText}>No reminders yet</Text>
            <Text style={styles.emptySubtext}>Daily reminders help you spot what affects your gut. Set one now.</Text>
            <Button title="Add Reminder" onPress={() => setShowAdd(true)} variant="secondary" size="md" style={{ marginTop: Spacing.md }} />
          </Card>
        )}

        {reminders.map(r => (
          <Card key={r.id} style={styles.reminderCard}>
            <View style={styles.reminderRow}>
              <View style={[styles.reminderIcon, { backgroundColor: Colors.primary + '15' }]}>
                <Ionicons name={typeInfo(r.reminder_type).icon} size={20} color={Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.reminderLabel}>{typeInfo(r.reminder_type).label}</Text>
                <Text style={styles.reminderTime}>{formatTime(r.time)}</Text>
              </View>
              <Switch
                value={r.enabled}
                onValueChange={(v) => toggleReminder(r.id, v)}
                trackColor={{ false: Colors.border, true: Colors.primary }}
                thumbColor={Colors.surface}
              />
            </View>
            <TouchableOpacity onPress={() => deleteReminder(r.id)} style={styles.deleteBtn}>
              <Ionicons name="trash-outline" size={16} color={Colors.severity[4]} />
              <Text style={styles.deleteText}>Remove</Text>
            </TouchableOpacity>
          </Card>
        ))}

        {showAdd && (
          <Card style={styles.addCard} variant="elevated">
            <Text style={styles.addTitle}>New Reminder</Text>

            <Text style={styles.addLabel}>Type</Text>
            <View style={styles.typeRow}>
              {REMINDER_TYPES.map(t => (
                <TouchableOpacity
                  key={t.key}
                  style={[styles.typeBtn, newType === t.key && styles.typeBtnSelected]}
                  onPress={() => setNewType(t.key)}
                >
                  <Ionicons name={t.icon} size={18} color={newType === t.key ? Colors.primary : Colors.textTertiary} />
                  <Text style={[styles.typeBtnLabel, newType === t.key && { color: Colors.primary }]}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.addLabel}>Time</Text>
            <View style={styles.timeRow}>
              <TouchableOpacity onPress={() => setNewHour(h => (h + 1) % 24)} style={styles.timeArrow} accessibilityLabel="Increase hour">
                <Ionicons name="chevron-up" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
              <Text style={styles.timeValue}>{String(newHour % 12 || 12).padStart(2, '0')}</Text>
              <TouchableOpacity onPress={() => setNewHour(h => (h + 23) % 24)} style={styles.timeArrow} accessibilityLabel="Decrease hour">
                <Ionicons name="chevron-down" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
              <Text style={styles.timeSep}>:</Text>
              <TouchableOpacity onPress={() => setNewMinute(m => (m + 5) % 60)} style={styles.timeArrow} accessibilityLabel="Increase minutes">
                <Ionicons name="chevron-up" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
              <Text style={styles.timeValue}>{String(newMinute).padStart(2, '0')}</Text>
              <TouchableOpacity onPress={() => setNewMinute(m => (m + 55) % 60)} style={styles.timeArrow} accessibilityLabel="Decrease minutes">
                <Ionicons name="chevron-down" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setNewHour(h => h < 12 ? h + 12 : h - 12)}
                style={styles.ampmBtn}
              >
                <Text style={styles.ampmText}>{newHour >= 12 ? 'PM' : 'AM'}</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.addLabel}>Days</Text>
            <View style={styles.daysRow}>
              {[1, 2, 3, 4, 5, 6, 7].map((day, i) => (
                <TouchableOpacity
                  key={day}
                  style={[styles.dayBtn, newDays.includes(day) && styles.dayBtnSelected]}
                  onPress={() => toggleDay(day)}
                >
                  <Text style={[styles.dayText, newDays.includes(day) && styles.dayTextSelected]}>
                    {DAY_LABELS[i]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.addActions}>
              <Button title="Cancel" onPress={() => setShowAdd(false)} variant="outline" size="md" style={{ flex: 1 }} />
              <Button title="Save" onPress={handleAdd} loading={saving} size="md" style={{ flex: 1 }} />
            </View>
          </Card>
        )}
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
  emptyCard: { alignItems: 'center', padding: Spacing.xl },
  emptyText: { fontSize: FontSize.md, fontWeight: '600', color: Colors.textSecondary, marginTop: Spacing.md },
  emptySubtext: { fontSize: FontSize.sm, color: Colors.textTertiary, textAlign: 'center', marginTop: Spacing.xs },
  reminderCard: { marginBottom: Spacing.sm },
  reminderRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  reminderIcon: { width: 40, height: 40, borderRadius: BorderRadius.sm, justifyContent: 'center', alignItems: 'center' },
  reminderLabel: { fontSize: FontSize.md, fontWeight: '600', color: Colors.text },
  reminderTime: { fontSize: FontSize.sm, color: Colors.textSecondary },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginTop: Spacing.sm, paddingTop: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.border },
  deleteText: { fontSize: FontSize.xs, color: Colors.severity[4] },
  addCard: { padding: Spacing.lg, marginTop: Spacing.md },
  addTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.text, marginBottom: Spacing.md },
  addLabel: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textSecondary, marginTop: Spacing.md, marginBottom: Spacing.sm },
  typeRow: { flexDirection: 'row', gap: Spacing.sm },
  typeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.xs, padding: Spacing.sm, borderRadius: BorderRadius.md, backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.border },
  typeBtnSelected: { borderColor: Colors.primary, backgroundColor: Colors.primary + '10' },
  typeBtnLabel: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.textTertiary },
  daysRow: { flexDirection: 'row', gap: Spacing.sm },
  dayBtn: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.border },
  dayBtnSelected: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  dayText: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.textTertiary },
  dayTextSelected: { color: Colors.textInverse },
  timeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  timeArrow: { padding: Spacing.sm, minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  timeValue: { fontSize: FontSize.xxl, fontWeight: '700', color: Colors.text, minWidth: 40, textAlign: 'center' },
  timeSep: { fontSize: FontSize.xxl, fontWeight: '700', color: Colors.textTertiary },
  ampmBtn: { backgroundColor: Colors.surfaceSecondary, borderRadius: BorderRadius.sm, paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs, marginLeft: Spacing.sm },
  ampmText: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.primary },
  addActions: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.lg },
});
