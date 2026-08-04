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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Colors, Spacing, FontSize, BorderRadius, FontFamily } from '../constants/theme';
import {
  scheduleDailyCheckInReminder,
  cancelDailyCheckInReminder,
} from '../lib/notifications';
import { flush, getPendingCount } from '../lib/offline-queue';
import * as StoreReview from 'expo-store-review';
import { track, Events } from '../lib/analytics';
import { useTranslation } from '../lib/i18n';
import { LANGUAGE_LABELS, SUPPORTED_LANGUAGES, type AppLanguage } from '../lib/language';
import { useLanguage } from '../lib/LanguageContext';

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
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${label}, ${subtitle}` : label}
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
  const t = useTranslation();
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
          <Text style={styles.modalTitle}>{t.settings.setReminderTime}</Text>
          <View style={styles.timePicker}>
            {/* Hour */}
            <View style={styles.timeColumn}>
              <Text style={styles.timeColumnLabel}>{t.settings.hour}</Text>
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
              <Text style={styles.timeColumnLabel}>{t.settings.minute}</Text>
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
              <Text style={styles.timeColumnLabel}>{t.settings.period}</Text>
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
          <TouchableOpacity style={styles.timeConfirmBtn} onPress={handleDone} accessibilityRole="button" accessibilityLabel={t.settings.accessConfirmTime}>
            <Text style={styles.timeConfirmText}>{t.common.confirm}</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const { user } = useAuth();
  const t = useTranslation();
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [dietModalVisible, setDietModalVisible] = useState(false);
  const [timeModalVisible, setTimeModalVisible] = useState(false);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  // Language lives in LanguageContext so a change re-renders the whole app
  // immediately, not just this screen. The context also persists the choice.
  const { language: appLanguage, setLanguage } = useLanguage();

  const handleLanguageChange = async (lang: AppLanguage) => {
    await setLanguage(lang);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

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
    getPendingCount().then(setPendingSyncCount).catch(() => {});
  }, []);

  const handleSyncNow = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const synced = await flush();
      const remaining = await getPendingCount();
      setPendingSyncCount(remaining);
      Alert.alert(
        remaining === 0 ? t.settings.allSynced : t.settings.partiallySynced,
        remaining === 0
          ? `${synced} ${synced === 1 ? t.settings.syncedEntry : t.settings.syncedEntries}`
          : `${synced} ${t.settings.syncedPartialMessage.replace('{remaining}', String(remaining))}`,
      );
    } catch {
      Alert.alert(t.settings.syncFailed, t.settings.syncError);
    }
  }, [t]);

  const save = useCallback((partial: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...partial };
      AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next)).catch(console.warn);

      // Sync notification scheduling when reminder settings change
      if ('dailyReminderEnabled' in partial || 'reminderHour' in partial || 'reminderMinute' in partial) {
        if (next.dailyReminderEnabled) {
          scheduleDailyCheckInReminder(next.reminderHour, next.reminderMinute)
            .then((id) => {
              if (id === null) {
                // Scheduling refused (time falls in 22:00–08:00 quiet hours) —
                // tell the user instead of silently never reminding them.
                Alert.alert(
                  t.settings.reminderNotScheduledTitle,
                  t.settings.reminderNotScheduledMessage,
                );
              }
            })
            .catch(console.warn);
        } else if ('dailyReminderEnabled' in partial && !partial.dailyReminderEnabled) {
          cancelDailyCheckInReminder().catch(console.warn);
        }
      }

      return next;
    });
  }, [t]);

  // Diet picker
  const openDietPicker = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [...DIET_OPTIONS, t.common.cancel],
          cancelButtonIndex: DIET_OPTIONS.length,
          title: t.settings.dietType,
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

  const handleExportData = async () => {
    if (!user) return;
    Alert.alert(t.settings.preparingData, undefined, undefined, { cancelable: false });

    try {
      // Every user-owned table — a GDPR access request must return it all.
      const [checkIns, foodLogs, symptomLogs, waterLogs, gutScores, favorites, reminders, profileRow] = await Promise.all([
        supabase.from('check_ins').select('*').eq('user_id', user.id),
        supabase.from('food_logs').select('*').eq('user_id', user.id),
        supabase.from('symptoms').select('*').eq('user_id', user.id),
        supabase.from('water_logs').select('*').eq('user_id', user.id),
        supabase.from('gut_scores').select('*').eq('user_id', user.id),
        supabase.from('favorites').select('*').eq('user_id', user.id),
        supabase.from('reminders').select('*').eq('user_id', user.id),
        supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
      ]);

      const exportData = {
        exportedAt: new Date().toISOString(),
        profile: profileRow.data ?? null,
        checkIns: checkIns.data || [],
        foodLogs: foodLogs.data || [],
        symptomLogs: symptomLogs.data || [],
        waterLogs: waterLogs.data || [],
        gutScores: gutScores.data || [],
        favorites: favorites.data || [],
        reminders: reminders.data || [],
      };

      await Share.share({
        message: JSON.stringify(exportData, null, 2),
        title: t.settings.exportSubject,
      });
      track(Events.DATA_EXPORTED);
    } catch {
      Alert.alert(t.settings.exportFailed, t.settings.exportError);
    }
  };

  const handleClearData = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      t.settings.clearAllData,
      t.settings.clearAllMessage,
      [
        { text: t.common.cancel, style: 'cancel' },
        {
          text: t.settings.clearConfirm,
          style: 'destructive',
          onPress: async () => {
            if (!user) return;
            const results = await Promise.all([
              supabase.from('check_ins').delete().eq('user_id', user.id),
              supabase.from('food_logs').delete().eq('user_id', user.id),
              supabase.from('symptoms').delete().eq('user_id', user.id),
              supabase.from('water_logs').delete().eq('user_id', user.id),
              supabase.from('gut_scores').delete().eq('user_id', user.id),
              supabase.from('favorites').delete().eq('user_id', user.id),
              supabase.from('streaks').delete().eq('user_id', user.id),
            ]);
            const failed = results.filter((r) => r.error);
            if (failed.length > 0) {
              Alert.alert(
                t.settings.partiallyCleared,
                t.settings.partiallyClearedMessage,
              );
            } else {
              Alert.alert(t.settings.clearDone, t.settings.clearSuccess);
            }
          },
        },
      ]
    );
  };

  const handleRateApp = async () => {
    // Native in-app review sheet — no store IDs needed and works the moment
    // the app is live. Falls back silently where unsupported (e.g. web).
    try {
      if (await StoreReview.hasAction()) {
        await StoreReview.requestReview();
      }
    } catch {
      // Review prompt is best-effort.
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel={t.common.goBack}>
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t.settings.title}</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* PREFERENCES */}
        <SectionHeader title={t.settings.sectionPreferences} />
        <View style={styles.card}>
          <SettingsRow
            icon="leaf-outline"
            label={t.settings.dietType}
            subtitle={settings.dietType}
            onPress={openDietPicker}
            isFirst
          />
        </View>

        {/* NOTIFICATIONS */}
        <SectionHeader title={t.settings.sectionNotifications} />
        <View style={styles.card}>
          <SettingsRow
            icon="alarm-outline"
            label={t.settings.dailyReminder}
            right={
              <Switch
                value={settings.dailyReminderEnabled}
                onValueChange={(v) => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); save({ dailyReminderEnabled: v }); }}
                trackColor={{ false: Colors.border, true: Colors.secondary }}
                thumbColor={Colors.surface}
                accessibilityLabel={t.settings.accessToggleDaily}
              />
            }
            isFirst
          />
          <Divider />
          <SettingsRow
            icon="flame-outline"
            label={t.settings.streakAlerts}
            subtitle={t.settings.streakAlertsSubtitle}
            right={
              <Switch
                value={settings.streakAlertsEnabled}
                onValueChange={(v) => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); save({ streakAlertsEnabled: v }); }}
                trackColor={{ false: Colors.border, true: Colors.secondary }}
                thumbColor={Colors.surface}
                accessibilityLabel={t.settings.accessToggleStreak}
              />
            }
            isLast={!settings.dailyReminderEnabled}
          />
          {settings.dailyReminderEnabled && (
            <>
              <Divider />
              <SettingsRow
                icon="time-outline"
                label={t.settings.reminderTime}
                subtitle={formatTime(settings.reminderHour, settings.reminderMinute)}
                onPress={() => setTimeModalVisible(true)}
                isLast
              />
            </>
          )}
        </View>

        {/* DATA */}
        <SectionHeader title={t.settings.sectionData} />
        <View style={styles.card}>
          {pendingSyncCount > 0 && (
            <>
              <SettingsRow
                icon="cloud-upload-outline"
                label={t.settings.syncNow}
                subtitle={`${pendingSyncCount} ${pendingSyncCount === 1 ? 'entry' : 'entries'} saved offline — tap to sync now`}
                onPress={handleSyncNow}
                isFirst
              />
              <Divider />
            </>
          )}
          <SettingsRow
            icon="download-outline"
            label={t.settings.exportMyData}
            subtitle={t.settings.exportSubtitle}
            onPress={handleExportData}
            isFirst={pendingSyncCount === 0}
          />
          <Divider />
          <SettingsRow
            icon="trash-outline"
            label={t.settings.clearAllData}
            onPress={handleClearData}
            destructive
            isLast
          />
        </View>

        {/* LANGUAGE */}
        <SectionHeader title={t.settings.sectionLanguage} />
        <View style={styles.card}>
          {SUPPORTED_LANGUAGES.map((lang, idx, arr) => (
            <React.Fragment key={lang}>
              <SettingsRow
                icon={appLanguage === lang ? 'radio-button-on-outline' : 'radio-button-off-outline'}
                label={LANGUAGE_LABELS[lang]}
                onPress={() => handleLanguageChange(lang)}
                isFirst={idx === 0}
                isLast={idx === arr.length - 1}
                right={
                  appLanguage === lang ? (
                    <Ionicons name="checkmark" size={18} color={Colors.secondary} />
                  ) : undefined
                }
              />
              {idx < arr.length - 1 && <Divider />}
            </React.Fragment>
          ))}
        </View>
        <Text style={styles.languageNote}>
          {t.settings.languageNote}
        </Text>

        {/* ACCOUNT */}
        <SectionHeader title={t.settings.sectionAccount} />
        <View style={styles.card}>
          <SettingsRow
            icon="lock-closed-outline"
            label={t.settings.changePassword}
            onPress={() => router.push('/change-password')}
            isFirst
            isLast
          />
        </View>

        {/* ABOUT */}
        <SectionHeader title={t.settings.sectionAbout} />
        <View style={styles.card}>
          <SettingsRow
            icon="information-circle-outline"
            label={t.settings.appVersion}
            right={<Text style={styles.versionText}>1.0.0</Text>}
            isFirst
          />
          <Divider />
          <SettingsRow
            icon="shield-checkmark-outline"
            label={t.settings.privacyPolicy}
            onPress={() => router.push('/privacy-policy')}
          />
          <Divider />
          <SettingsRow
            icon="star-outline"
            label={t.settings.rateApp}
            onPress={handleRateApp}
            isLast
          />
        </View>

        <View style={{ height: Spacing.xxl }} />
      </ScrollView>

      {/* Android modals */}
      <PickerModal
        visible={dietModalVisible}
        title={t.settings.dietType}
        options={DIET_OPTIONS}
        selected={settings.dietType}
        onSelect={(v) => save({ dietType: v })}
        onClose={() => setDietModalVisible(false)}
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  backButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.lg,
    color: Colors.text,
  },

  // Scroll
  scroll: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
  },

  // Section Header
  languageNote: {
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
    textAlign: 'center',
  },
  sectionHeader: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    letterSpacing: 0.2,
    marginBottom: Spacing.sm,
    marginTop: Spacing.lg,
    paddingLeft: Spacing.xs,
  },

  // Card
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    marginBottom: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.border,
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
