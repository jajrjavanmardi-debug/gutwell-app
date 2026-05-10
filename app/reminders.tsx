import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Toast } from '../components/ui/Toast';
import {
  scheduleDailyCheckInReminder,
  cancelDailyCheckInReminder,
  requestPermissions,
  getPermissionStatus,
  isInQuietHours,
  requestNotificationPermissions,
  syncReminders,
} from '../lib/notifications';
import { EmptyState } from '../components/ui/EmptyState';
import { Colors, Spacing, FontSize, BorderRadius, FontFamily } from '../constants/theme';

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

const QUIET_START = '22:00';
const QUIET_END = '08:00';

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
  const [permissionGranted, setPermissionGranted] = useState(true);
  const [quietHoursEnabled, setQuietHoursEnabled] = useState(true);

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

  useEffect(() => {
    loadReminders();
    // Check permission status on mount
    getPermissionStatus().then((status) => {
      setPermissionGranted(status === 'granted');
    });
  }, [loadReminders]);

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

  // Determine if the currently selected time falls in quiet hours
  const selectedTimeInQuietHours = quietHoursEnabled
    ? isInQuietHours(
        `${String(newHour).padStart(2, '0')}:${String(newMinute).padStart(2, '0')}`,
        QUIET_START,
        QUIET_END,
      )
    : false;

  const handleAdd = async () => {
    if (!user) return;

    const granted = await requestPermissions();
    if (!granted) {
      setPermissionGranted(false);
      setToast({ visible: true, message: 'Please enable notifications in Settings', type: 'error' });
      return;
    }
    setPermissionGranted(true);

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
      setSaving(false);
      return;
    }

    // For check-in reminders, also schedule via the new engine (respects quiet hours)
    if (newType === 'checkin') {
      const notifId = await scheduleDailyCheckInReminder(
        newHour,
        newMinute,
        quietHoursEnabled ? QUIET_START : '00:00',
        quietHoursEnabled ? QUIET_END : '00:00',
      );
      if (notifId === null && quietHoursEnabled) {
        // Time was in quiet hours — still saved to DB but notification not scheduled
        setToast({ visible: true, message: 'Reminder saved (quiet hours — notification paused)', type: 'success' });
      } else {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setToast({ visible: true, message: 'Reminder added!', type: 'success' });
      }
    } else {
      await syncReminders(user.id);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setToast({ visible: true, message: 'Reminder added!', type: 'success' });
    }

    setShowAdd(false);
    await loadReminders();
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
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Reminders</Text>
        <TouchableOpacity
          onPress={() => setShowAdd(true)}
          style={styles.addBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="add" size={22} color={Colors.textInverse} />
        </TouchableOpacity>
      </View>

      {/* Permission Banner */}
      {!permissionGranted && (
        <View style={styles.permissionBanner}>
          <Ionicons name="notifications-off-outline" size={18} color={Colors.textInverse} />
          <Text style={styles.permissionBannerText}>
            Notifications are disabled. Enable them in Settings to receive reminders.
          </Text>
        </View>
      )}

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Empty State */}
        {reminders.length === 0 && !loading && (
          <EmptyState
            icon="notifications-outline"
            title="No reminders yet"
            message="Daily reminders help you spot what affects your gut. Set one now."
            actionLabel="Add Your First Reminder"
            onAction={() => setShowAdd(true)}
          />
        )}

        {/* Reminder Cards */}
        {reminders.map((r) => (
          <View key={r.id} style={styles.reminderCard}>
            <View style={styles.reminderRow}>
              <View style={styles.reminderIconWrap}>
                <Ionicons
                  name={typeInfo(r.reminder_type).icon}
                  size={20}
                  color={Colors.primary}
                />
              </View>
              <View style={styles.reminderInfo}>
                <Text style={styles.reminderType}>
                  {typeInfo(r.reminder_type).label}
                </Text>
                <Text style={styles.reminderTime}>
                  {formatTime(r.time)}
                </Text>
              </View>
              <Switch
                value={r.enabled}
                onValueChange={(v) => toggleReminder(r.id, v)}
                trackColor={{ false: Colors.border, true: Colors.primary }}
                thumbColor={Colors.surface}
              />
            </View>
            <View style={styles.reminderDivider} />
            <TouchableOpacity
              onPress={() => deleteReminder(r.id)}
              style={styles.deleteRow}
              hitSlop={{ top: 8, bottom: 8 }}
            >
              <Ionicons name="trash-outline" size={15} color={Colors.error} />
              <Text style={styles.deleteText}>Remove</Text>
            </TouchableOpacity>
          </View>
        ))}

        {/* Add Form */}
        {showAdd && (
          <Card style={styles.addCard} variant="elevated">
            <Text style={styles.addTitle}>New Reminder</Text>

            {/* Type Selector */}
            <Text style={styles.addLabel}>Type</Text>
            <View style={styles.typeRow}>
              {REMINDER_TYPES.map((t) => {
                const isActive = newType === t.key;
                return (
                  <TouchableOpacity
                    key={t.key}
                    style={[styles.typePill, isActive && styles.typePillActive]}
                    onPress={() => setNewType(t.key)}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={t.icon}
                      size={16}
                      color={isActive ? Colors.primary : Colors.textTertiary}
                    />
                    <Text
                      style={[
                        styles.typePillLabel,
                        isActive && styles.typePillLabelActive,
                      ]}
                    >
                      {t.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Time Picker */}
            <Text style={styles.addLabel}>Time</Text>
            <View style={styles.timeRow}>
              <View style={styles.timeColumn}>
                <TouchableOpacity
                  onPress={() => setNewHour((h) => (h + 1) % 24)}
                  style={styles.timeArrow}
                  accessibilityLabel="Increase hour"
                >
                  <Ionicons name="chevron-up" size={22} color={Colors.textSecondary} />
                </TouchableOpacity>
                <Text style={styles.timeValue}>
                  {String(newHour % 12 || 12).padStart(2, '0')}
                </Text>
                <TouchableOpacity
                  onPress={() => setNewHour((h) => (h + 23) % 24)}
                  style={styles.timeArrow}
                  accessibilityLabel="Decrease hour"
                >
                  <Ionicons name="chevron-down" size={22} color={Colors.textSecondary} />
                </TouchableOpacity>
              </View>

              <Text style={styles.timeSep}>:</Text>

              <View style={styles.timeColumn}>
                <TouchableOpacity
                  onPress={() => setNewMinute((m) => (m + 5) % 60)}
                  style={styles.timeArrow}
                  accessibilityLabel="Increase minutes"
                >
                  <Ionicons name="chevron-up" size={22} color={Colors.textSecondary} />
                </TouchableOpacity>
                <Text style={styles.timeValue}>
                  {String(newMinute).padStart(2, '0')}
                </Text>
                <TouchableOpacity
                  onPress={() => setNewMinute((m) => (m + 55) % 60)}
                  style={styles.timeArrow}
                  accessibilityLabel="Decrease minutes"
                >
                  <Ionicons name="chevron-down" size={22} color={Colors.textSecondary} />
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                onPress={() => setNewHour((h) => (h < 12 ? h + 12 : h - 12))}
                style={styles.ampmBtn}
              >
                <Text style={styles.ampmText}>
                  {newHour >= 12 ? 'PM' : 'AM'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Quiet Hours Warning */}
            {selectedTimeInQuietHours && (
              <View style={styles.quietWarning}>
                <Ionicons name="moon-outline" size={15} color={Colors.warning ?? '#F59E0B'} />
                <Text style={styles.quietWarningText}>
                  {"This time falls within quiet hours (10 PM – 8 AM). The notification won't fire unless quiet hours are turned off."}
                </Text>
              </View>
            )}

            {/* Day Selector */}
            <Text style={styles.addLabel}>Days</Text>
            <View style={styles.daysRow}>
              {[1, 2, 3, 4, 5, 6, 7].map((day, i) => {
                const isActive = newDays.includes(day);
                return (
                  <TouchableOpacity
                    key={day}
                    style={[styles.dayCircle, isActive && styles.dayCircleActive]}
                    onPress={() => toggleDay(day)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.dayText,
                        isActive && styles.dayTextActive,
                      ]}
                    >
                      {DAY_LABELS[i]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Quiet Hours Toggle */}
            <View style={styles.quietHoursCard}>
              <View style={styles.quietHoursLeft}>
                <View style={styles.quietHoursIconWrap}>
                  <Ionicons name="moon-outline" size={18} color={Colors.primary} />
                </View>
                <View style={styles.quietHoursTextBlock}>
                  <Text style={styles.quietHoursTitle}>Quiet Hours</Text>
                  <Text style={styles.quietHoursSubtext}>No notifications 10 PM – 8 AM</Text>
                </View>
              </View>
              <Switch
                value={quietHoursEnabled}
                onValueChange={setQuietHoursEnabled}
                trackColor={{ false: Colors.border, true: Colors.primary }}
                thumbColor={Colors.surface}
              />
            </View>

            {/* Actions */}
            <View style={styles.addActions}>
              <Button
                title="Cancel"
                onPress={() => setShowAdd(false)}
                variant="outline"
                size="md"
                style={styles.addActionBtn}
              />
              <Button
                title="Save"
                onPress={handleAdd}
                loading={saving}
                size="md"
                style={styles.addActionBtn}
              />
            </View>
          </Card>
        )}
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
  backBtn: {
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
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.secondary,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Permission Banner
  permissionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.error,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  permissionBannerText: {
    flex: 1,
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.xs,
    color: Colors.textInverse,
    lineHeight: 18,
  },

  scroll: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl + 40,
  },


  // Reminder Cards
  reminderCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  reminderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  reminderIconWrap: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.primary + '12',
    justifyContent: 'center',
    alignItems: 'center',
  },
  reminderInfo: {
    flex: 1,
  },
  reminderType: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.md,
    color: Colors.text,
  },
  reminderTime: {
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  reminderDivider: {
    height: 1,
    backgroundColor: Colors.divider,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  deleteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  deleteText: {
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.xs,
    color: Colors.error,
  },

  // Add Form
  addCard: {
    padding: Spacing.lg,
    marginTop: Spacing.md,
  },
  addTitle: {
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.lg,
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  addLabel: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },

  // Type Pills
  typeRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  typePill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surfaceSecondary,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  typePillActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '12',
  },
  typePillLabel: {
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.xs,
    color: Colors.textTertiary,
  },
  typePillLabelActive: {
    color: Colors.primary,
    fontFamily: FontFamily.sansSemiBold,
  },

  // Time Picker
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md,
  },
  timeColumn: {
    alignItems: 'center',
  },
  timeArrow: {
    padding: Spacing.xs,
    minWidth: 44,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeValue: {
    fontFamily: FontFamily.sansBold,
    fontSize: 32,
    color: Colors.text,
    minWidth: 50,
    textAlign: 'center',
  },
  timeSep: {
    fontFamily: FontFamily.sansBold,
    fontSize: 28,
    color: Colors.textTertiary,
    marginTop: -2,
  },
  ampmBtn: {
    backgroundColor: Colors.primary + '15',
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginLeft: Spacing.sm,
  },
  ampmText: {
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.sm,
    color: Colors.primary,
  },

  // Quiet hours warning
  quietWarning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.xs,
    backgroundColor: '#FEF3C7',
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    marginTop: Spacing.sm,
  },
  quietWarningText: {
    flex: 1,
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.xs,
    color: '#92400E',
    lineHeight: 18,
  },

  // Day Selector
  daysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.xs,
  },
  dayCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.surfaceSecondary,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  dayCircleActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  dayText: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.xs,
    color: Colors.textTertiary,
  },
  dayTextActive: {
    color: Colors.textInverse,
  },

  // Quiet Hours Toggle Card
  quietHoursCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginTop: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  quietHoursLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
  },
  quietHoursIconWrap: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
  },
  quietHoursTextBlock: {
    flex: 1,
  },
  quietHoursTitle: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
    color: Colors.text,
  },
  quietHoursSubtext: {
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.xs,
    color: Colors.textTertiary,
    marginTop: 1,
  },

  // Add Actions
  addActions: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.xl,
  },
  addActionBtn: {
    flex: 1,
  },
});
