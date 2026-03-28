import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  Share,
  Platform,
  ActionSheetIOS,
  Modal,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Colors, Spacing, FontSize, BorderRadius, Shadows, FontFamily } from '../constants/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

type DietType = 'Standard' | 'Vegan' | 'Vegetarian' | 'Gluten-Free' | 'Dairy-Free' | 'Low-FODMAP';
type DailyGoal = 'Reduce Bloating' | 'Improve Regularity' | 'Track Symptoms' | 'General Wellness';

interface Settings {
  dietType: DietType;
  dailyGoal: DailyGoal;
  metricUnits: boolean;
  dailyReminderEnabled: boolean;
  streakAlertsEnabled: boolean;
  reminderHour: number;
  reminderMinute: number;
}

const DEFAULT_SETTINGS: Settings = {
  dietType: 'Standard',
  dailyGoal: 'General Wellness',
  metricUnits: true,
  dailyReminderEnabled: false,
  streakAlertsEnabled: true,
  reminderHour: 8,
  reminderMinute: 0,
};

const SETTINGS_KEY = 'gutwell_settings';

const DIET_OPTIONS: DietType[] = ['Standard', 'Vegan', 'Vegetarian', 'Gluten-Free', 'Dairy-Free', 'Low-FODMAP'];
const GOAL_OPTIONS: DailyGoal[] = ['Reduce Bloating', 'Improve Regularity', 'Track Symptoms', 'General Wellness'];

const HOUR_OPTIONS = Array.from({ length: 12 }, (_, i) => i + 1); // 1-12
const MINUTE_OPTIONS = [0, 15, 30, 45];

function formatTime(hour: number, minute: number): string {
  const period = hour < 12 ? 'AM' : 'PM';
  const h = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  const m = minute.toString().padStart(2, '0');
  return `${h}:${m} ${period}`;
}

// ─── Sub-Components ───────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return <Text style={styles.sectionHeader}>{title}</Text>;
}

function SettingsRow({
  icon,
  label,
  subtitle,
  onPress,
  right,
  destructive,
  isFirst,
  isLast,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  subtitle?: string;
  onPress?: () => void;
  right?: React.ReactNode;
  destructive?: boolean;
  isFirst?: boolean;
  isLast?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.row,
        isFirst && styles.rowFirst,
        isLast && styles.rowLast,
      ]}
      onPress={onPress}
      activeOpacity={onPress ? 0.6 : 1}
      disabled={!onPress}
    >
      <View style={[styles.rowIcon, destructive && styles.rowIconDestructive]}>
        <Ionicons
          name={icon}
          size={20}
          color={destructive ? Colors.error : Colors.primary}
        />
      </View>
      <View style={styles.rowContent}>
        <Text style={[styles.rowLabel, destructive && styles.rowLabelDestructive]}>
          {label}
        </Text>
        {subtitle && <Text style={styles.rowSubtitle}>{subtitle}</Text>}
      </View>
      {right ?? (
        onPress ? <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} /> : null
      )}
    </TouchableOpacity>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

// ─── Android picker modal ─────────────────────────────────────────────────────

function PickerModal<T extends string>({
  visible,
  title,
  options,
  selected,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: T[];
  selected: T;
  onSelect: (v: T) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={onClose}>
        <View style={styles.modalSheet}>
          <Text style={styles.modalTitle}>{title}</Text>
          {options.map((opt) => (
            <TouchableOpacity
              key={opt}
              style={[styles.modalOption, opt === selected && styles.modalOptionSelected]}
              onPress={() => { onSelect(opt); onClose(); }}
            >
              <Text style={[styles.modalOptionText, opt === selected && styles.modalOptionTextSelected]}>
                {opt}
              </Text>
              {opt === selected && (
                <Ionicons name="checkmark" size={18} color={Colors.secondary} />
              )}
            </TouchableOpacity>
          ))}
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

function TimePickerModal({
  visible,
  hour,
  minute,
  onSelect,
  onClose,
}: {
  visible: boolean;
  hour: number;
  minute: number;
  onSelect: (hour: number, minute: number) => void;
  onClose: () => void;
}) {
  const [localHour, setLocalHour] = useState(hour);
  const [localMinute, setLocalMinute] = useState(minute);
  const [localPeriod, setLocalPeriod] = useState<'AM' | 'PM'>(hour < 12 ? 'AM' : 'PM');

  useEffect(() => {
    setLocalHour(hour > 12 ? hour - 12 : hour === 0 ? 12 : hour);
    setLocalMinute(minute);
    setLocalPeriod(hour < 12 ? 'AM' : 'PM');
  }, [hour, minute, visible]);

  const handleDone = () => {
    let h = localHour;
    if (localPeriod === 'AM' && h === 12) h = 0;
    else if (localPeriod === 'PM' && h !== 12) h = h + 12;
    onSelect(h, localMinute);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={onClose}>
        <View style={styles.modalSheet}>
          <Text style={styles.modalTitle}>Set Reminder Time</Text>
          <View style={styles.timePicker}>
            {/* Hour */}
            <View style={styles.timeColumn}>
              <Text style={styles.timeColumnLabel}>Hour</Text>
              <ScrollView style={styles.timeScroll} showsVerticalScrollIndicator={false}>
                {HOUR_OPTIONS.map((h) => (
                  <TouchableOpacity
                    key={h}
                    style={[styles.timeOption, h === localHour && styles.timeOptionSelected]}
                    onPress={() => setLocalHour(h)}
                  >
                    <Text style={[styles.timeOptionText, h === localHour && styles.timeOptionTextSelected]}>
                      {h}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
            {/* Minute */}
            <View style={styles.timeColumn}>
              <Text style={styles.timeColumnLabel}>Min</Text>
              <ScrollView style={styles.timeScroll} showsVerticalScrollIndicator={false}>
                {MINUTE_OPTIONS.map((m) => (
                  <TouchableOpacity
                    key={m}
                    style={[styles.timeOption, m === localMinute && styles.timeOptionSelected]}
                    onPress={() => setLocalMinute(m)}
                  >
                    <Text style={[styles.timeOptionText, m === localMinute && styles.timeOptionTextSelected]}>
                      {m.toString().padStart(2, '0')}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
            {/* AM/PM */}
            <View style={styles.timeColumn}>
              <Text style={styles.timeColumnLabel}>Period</Text>
              {(['AM', 'PM'] as const).map((p) => (
                <TouchableOpacity
                  key={p}
                  style={[styles.timeOption, p === localPeriod && styles.timeOptionSelected]}
                  onPress={() => setLocalPeriod(p)}
                >
                  <Text style={[styles.timeOptionText, p === localPeriod && styles.timeOptionTextSelected]}>
                    {p}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <TouchableOpacity style={styles.timeConfirmBtn} onPress={handleDone}>
            <Text style={styles.timeConfirmText}>Confirm</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [dietModalVisible, setDietModalVisible] = useState(false);
  const [goalModalVisible, setGoalModalVisible] = useState(false);
  const [timeModalVisible, setTimeModalVisible] = useState(false);

  // Load settings on mount
  useEffect(() => {
    AsyncStorage.getItem(SETTINGS_KEY).then((raw) => {
      if (raw) {
        try {
          const saved = JSON.parse(raw) as Partial<Settings>;
          setSettings((prev) => ({ ...prev, ...saved }));
        } catch {
          // Ignore parse errors
        }
      }
    });
  }, []);

  const save = useCallback((partial: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...partial };
      AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next)).catch(console.warn);
      return next;
    });
  }, []);

  // Diet picker
  const openDietPicker = () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [...DIET_OPTIONS, 'Cancel'],
          cancelButtonIndex: DIET_OPTIONS.length,
          title: 'Diet Type',
        },
        (index) => {
          if (index < DIET_OPTIONS.length) {
            save({ dietType: DIET_OPTIONS[index] });
          }
        }
      );
    } else {
      setDietModalVisible(true);
    }
  };

  // Goal picker
  const openGoalPicker = () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [...GOAL_OPTIONS, 'Cancel'],
          cancelButtonIndex: GOAL_OPTIONS.length,
          title: 'Daily Goal',
        },
        (index) => {
          if (index < GOAL_OPTIONS.length) {
            save({ dailyGoal: GOAL_OPTIONS[index] });
          }
        }
      );
    } else {
      setGoalModalVisible(true);
    }
  };

  const handleExportData = async () => {
    if (!user) return;
    Alert.alert('Preparing your data...', undefined, undefined, { cancelable: false });

    try {
      const [checkIns, foodLogs, symptomLogs] = await Promise.all([
        supabase.from('check_ins').select('*').eq('user_id', user.id),
        supabase.from('food_logs').select('*').eq('user_id', user.id),
        supabase.from('symptom_logs').select('*').eq('user_id', user.id),
      ]);

      const exportData = {
        exportedAt: new Date().toISOString(),
        checkIns: checkIns.data || [],
        foodLogs: foodLogs.data || [],
        symptomLogs: symptomLogs.data || [],
      };

      await Share.share({
        message: JSON.stringify(exportData, null, 2),
        title: 'GutWell Data Export',
      });
    } catch (err) {
      Alert.alert('Export Failed', 'Could not export your data. Please try again.');
    }
  };

  const handleClearData = () => {
    Alert.alert(
      'Clear All Data',
      'This will permanently delete all your check-ins, food logs, and symptom records. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear Everything',
          style: 'destructive',
          onPress: async () => {
            if (!user) return;
            await Promise.all([
              supabase.from('check_ins').delete().eq('user_id', user.id),
              supabase.from('food_logs').delete().eq('user_id', user.id),
              supabase.from('symptom_logs').delete().eq('user_id', user.id),
            ]);
            Alert.alert('Done', 'All your data has been cleared.');
          },
        },
      ]
    );
  };

  const handleRateApp = () => {
    const url = Platform.OS === 'ios'
      ? 'itms-apps://itunes.apple.com/app/id0000000000?action=write-review'
      : 'market://details?id=com.gutwell.app';
    Linking.canOpenURL(url).then((can) => {
      if (can) Linking.openURL(url);
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={Colors.textInverse} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* PREFERENCES */}
        <SectionHeader title="PREFERENCES" />
        <View style={styles.card}>
          <SettingsRow
            icon="leaf-outline"
            label="Diet Type"
            subtitle={settings.dietType}
            onPress={openDietPicker}
            isFirst
          />
          <Divider />
          <SettingsRow
            icon="flag-outline"
            label="Daily Goal"
            subtitle={settings.dailyGoal}
            onPress={openGoalPicker}
          />
          <Divider />
          <SettingsRow
            icon="speedometer-outline"
            label="Units"
            right={
              <View style={styles.toggleRow}>
                <Text style={[styles.unitLabel, !settings.metricUnits && styles.unitLabelActive]}>
                  Imperial
                </Text>
                <Switch
                  value={settings.metricUnits}
                  onValueChange={(v) => save({ metricUnits: v })}
                  trackColor={{ false: Colors.border, true: Colors.secondary }}
                  thumbColor={Colors.surface}
                />
                <Text style={[styles.unitLabel, settings.metricUnits && styles.unitLabelActive]}>
                  Metric
                </Text>
              </View>
            }
            isLast
          />
        </View>

        {/* NOTIFICATIONS */}
        <SectionHeader title="NOTIFICATIONS" />
        <View style={styles.card}>
          <SettingsRow
            icon="alarm-outline"
            label="Daily Reminder"
            right={
              <Switch
                value={settings.dailyReminderEnabled}
                onValueChange={(v) => save({ dailyReminderEnabled: v })}
                trackColor={{ false: Colors.border, true: Colors.secondary }}
                thumbColor={Colors.surface}
              />
            }
            isFirst
          />
          <Divider />
          <SettingsRow
            icon="flame-outline"
            label="Streak Alerts"
            subtitle="9PM reminder when streak is at risk"
            right={
              <Switch
                value={settings.streakAlertsEnabled}
                onValueChange={(v) => save({ streakAlertsEnabled: v })}
                trackColor={{ false: Colors.border, true: Colors.secondary }}
                thumbColor={Colors.surface}
              />
            }
            isLast={!settings.dailyReminderEnabled}
          />
          {settings.dailyReminderEnabled && (
            <>
              <Divider />
              <SettingsRow
                icon="time-outline"
                label="Reminder Time"
                subtitle={formatTime(settings.reminderHour, settings.reminderMinute)}
                onPress={() => setTimeModalVisible(true)}
                isLast
              />
            </>
          )}
        </View>

        {/* DATA */}
        <SectionHeader title="DATA" />
        <View style={styles.card}>
          <SettingsRow
            icon="download-outline"
            label="Export My Data"
            subtitle="Download all your records as JSON"
            onPress={handleExportData}
            isFirst
          />
          <Divider />
          <SettingsRow
            icon="trash-outline"
            label="Clear All Data"
            onPress={handleClearData}
            destructive
            isLast
          />
        </View>

        {/* ABOUT */}
        <SectionHeader title="ABOUT" />
        <View style={styles.card}>
          <SettingsRow
            icon="information-circle-outline"
            label="App Version"
            right={<Text style={styles.versionText}>1.0.0</Text>}
            isFirst
          />
          <Divider />
          <SettingsRow
            icon="shield-checkmark-outline"
            label="Privacy Policy"
            onPress={() => router.push('/privacy-policy')}
          />
          <Divider />
          <SettingsRow
            icon="star-outline"
            label="Rate GutWell"
            onPress={handleRateApp}
            isLast
          />
        </View>

        <View style={{ height: Spacing.xxl }} />
      </ScrollView>

      {/* Android modals */}
      <PickerModal
        visible={dietModalVisible}
        title="Diet Type"
        options={DIET_OPTIONS}
        selected={settings.dietType}
        onSelect={(v) => save({ dietType: v })}
        onClose={() => setDietModalVisible(false)}
      />
      <PickerModal
        visible={goalModalVisible}
        title="Daily Goal"
        options={GOAL_OPTIONS}
        selected={settings.dailyGoal}
        onSelect={(v) => save({ dailyGoal: v })}
        onClose={() => setGoalModalVisible(false)}
      />
      <TimePickerModal
        visible={timeModalVisible}
        hour={settings.reminderHour}
        minute={settings.reminderMinute}
        onSelect={(h, m) => save({ reminderHour: h, reminderMinute: m })}
        onClose={() => setTimeModalVisible(false)}
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

  // Header
  header: {
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  backButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontFamily: FontFamily.displayMedium,
    fontSize: FontSize.xl,
    color: Colors.textInverse,
  },

  // Scroll
  scroll: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
  },

  // Section Header
  sectionHeader: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: Spacing.sm,
    marginTop: Spacing.md,
    paddingLeft: Spacing.xs,
  },

  // Card
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    marginBottom: Spacing.xs,
    ...Shadows.sm,
  },

  // Row
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    gap: Spacing.md,
    backgroundColor: Colors.surface,
  },
  rowFirst: {
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
  },
  rowLast: {
    borderBottomLeftRadius: BorderRadius.lg,
    borderBottomRightRadius: BorderRadius.lg,
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surfaceSecondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rowIconDestructive: {
    backgroundColor: Colors.error + '18',
  },
  rowContent: {
    flex: 1,
  },
  rowLabel: {
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.md,
    color: Colors.text,
  },
  rowLabelDestructive: {
    color: Colors.error,
  },
  rowSubtitle: {
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.xs,
    color: Colors.textTertiary,
    marginTop: 2,
  },

  // Divider
  divider: {
    height: 1,
    backgroundColor: Colors.divider,
    marginLeft: Spacing.md + 40 + Spacing.md,
    marginRight: Spacing.md,
  },

  // Toggle row
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  unitLabel: {
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.xs,
    color: Colors.textTertiary,
  },
  unitLabelActive: {
    color: Colors.secondary,
    fontFamily: FontFamily.sansSemiBold,
  },

  // Version
  versionText: {
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.md,
    color: Colors.textTertiary,
  },

  // Modal
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalSheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },
  modalTitle: {
    fontFamily: FontFamily.displayMedium,
    fontSize: FontSize.lg,
    color: Colors.text,
    marginBottom: Spacing.md,
    textAlign: 'center',
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.xs,
  },
  modalOptionSelected: {
    backgroundColor: Colors.surfaceSecondary,
  },
  modalOptionText: {
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.md,
    color: Colors.text,
  },
  modalOptionTextSelected: {
    fontFamily: FontFamily.sansSemiBold,
    color: Colors.secondary,
  },

  // Time picker
  timePicker: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  timeColumn: {
    flex: 1,
    alignItems: 'center',
  },
  timeColumnLabel: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.xs,
    color: Colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: Spacing.sm,
  },
  timeScroll: {
    maxHeight: 160,
    width: '100%',
  },
  timeOption: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    marginBottom: 2,
  },
  timeOptionSelected: {
    backgroundColor: Colors.surfaceSecondary,
  },
  timeOptionText: {
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.md,
    color: Colors.text,
  },
  timeOptionTextSelected: {
    fontFamily: FontFamily.sansSemiBold,
    color: Colors.secondary,
  },
  timeConfirmBtn: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  timeConfirmText: {
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.md,
    color: Colors.textInverse,
  },
});
