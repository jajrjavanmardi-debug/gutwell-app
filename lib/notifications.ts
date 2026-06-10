import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { SchedulableTriggerInputTypes } from 'expo-notifications';
import { supabase } from './supabase';
import { isExpoGo } from './runtime-environment';

// ─── Notification handler ─────────────────────────────────────────────────────
// Controls how notifications are presented while the app is foregrounded.
// SDK 54 replaces the deprecated `shouldShowAlert` with `shouldShowBanner` /
// `shouldShowList`.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// ─── Stable identifiers ───────────────────────────────────────────────────────
// We assign a deterministic identifier to each *logical* reminder so that
// re-scheduling replaces the previous one instead of stacking duplicates, and
// so the cancel helpers can target a specific notification reliably.
const ID_DAILY_CHECKIN = 'gutwell-daily-checkin';
const ID_WEEKLY_DIGEST = 'gutwell-weekly-digest';
const ID_STREAK_AT_RISK = 'gutwell-streak-at-risk';
const ID_REMINDER_PREFIX = 'gutwell-reminder'; // per-DB-row reminders (food/symptom/checkin)

const ANDROID_CHANNEL_ID = 'reminders';

/**
 * Local notifications can only be scheduled from a native runtime. Expo Go on
 * SDK 53+ no longer ships the notifications native module for scheduling, and
 * web has no concept of local scheduled notifications. In those environments we
 * no-op gracefully so callers keep working (DB writes still happen upstream).
 */
function canSchedule(): boolean {
  return Platform.OS !== 'web' && !isExpoGo();
}

/**
 * Ensure the Android notification channel exists. No-op on iOS/web. Safe to call
 * repeatedly. Wrapped by callers in try/catch.
 */
async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: 'Reminders',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#52B788',
  });
}

// ─── Permissions ──────────────────────────────────────────────────────────────

export async function requestPermissions(): Promise<boolean> {
  if (!canSchedule()) return false;
  try {
    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== 'granted') {
      const requested = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
        },
      });
      status = requested.status;
    }
    if (status === 'granted') {
      await ensureAndroidChannel();
    }
    return status === 'granted';
  } catch (err) {
    console.warn('[notifications] requestPermissions failed', err);
    return false;
  }
}

export async function getPermissionStatus(): Promise<'granted' | 'denied' | 'undetermined'> {
  if (!canSchedule()) return 'denied';
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status === 'granted') return 'granted';
    if (status === 'denied') return 'denied';
    return 'undetermined';
  } catch (err) {
    console.warn('[notifications] getPermissionStatus failed', err);
    return 'undetermined';
  }
}

/**
 * Resolve to true only when permission is already granted (does not prompt).
 * Used internally to bail out of scheduling when the user has declined.
 */
async function hasPermission(): Promise<boolean> {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    return status === 'granted';
  } catch {
    return false;
  }
}

// ─── Quiet hours ──────────────────────────────────────────────────────────────

// Quiet hours: returns true if the given time (HH:MM) falls within quiet window
export function isInQuietHours(timeHHMM: string, quietStart: string, quietEnd: string): boolean {
  const toMins = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };
  const current = toMins(timeHHMM);
  const start = toMins(quietStart);
  const end = toMins(quietEnd);
  if (start <= end) {
    return current >= start && current < end;
  }
  // Overnight range (e.g., 22:00 -> 08:00)
  return current >= start || current < end;
}

// ─── Daily check-in reminder ──────────────────────────────────────────────────

// Schedule a daily check-in reminder
export async function scheduleDailyCheckInReminder(
  hour: number,
  minute: number,
  quietStart = '22:00',
  quietEnd = '08:00',
): Promise<string | null> {
  const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
  if (isInQuietHours(timeStr, quietStart, quietEnd)) return null;
  if (!canSchedule()) return null;
  try {
    if (!(await hasPermission())) {
      const granted = await requestPermissions();
      if (!granted) return null;
    }
    await ensureAndroidChannel();
    // Cancel any prior instance so we never stack duplicates.
    await Notifications.cancelScheduledNotificationAsync(ID_DAILY_CHECKIN).catch(() => {});
    return await Notifications.scheduleNotificationAsync({
      identifier: ID_DAILY_CHECKIN,
      content: {
        title: 'Time for your check-in',
        body: 'Log how your gut feels today to keep your insights sharp.',
        sound: true,
        data: { reminderType: 'checkin' },
        ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL_ID } : {}),
      },
      trigger: {
        type: SchedulableTriggerInputTypes.DAILY,
        hour,
        minute,
        ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL_ID } : {}),
      },
    });
  } catch (err) {
    console.warn('[notifications] scheduleDailyCheckInReminder failed', err);
    return null;
  }
}

export async function cancelDailyCheckInReminder(): Promise<void> {
  if (!canSchedule()) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(ID_DAILY_CHECKIN);
  } catch (err) {
    console.warn('[notifications] cancelDailyCheckInReminder failed', err);
  }
}

// ─── Weekly digest ────────────────────────────────────────────────────────────

// Schedule a weekly digest notification for Sunday mornings
export async function scheduleWeeklyDigestNotification(
  hour = 9,
  minute = 0,
): Promise<string | null> {
  if (!canSchedule()) return null;
  try {
    if (!(await hasPermission())) {
      const granted = await requestPermissions();
      if (!granted) return null;
    }
    await ensureAndroidChannel();
    await Notifications.cancelScheduledNotificationAsync(ID_WEEKLY_DIGEST).catch(() => {});
    return await Notifications.scheduleNotificationAsync({
      identifier: ID_WEEKLY_DIGEST,
      content: {
        title: 'Your weekly gut report is ready',
        body: 'See your trends, top triggers, and wins from the past week.',
        sound: true,
        data: { reminderType: 'digest' },
        ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL_ID } : {}),
      },
      trigger: {
        type: SchedulableTriggerInputTypes.WEEKLY,
        // expo weekday: 1 = Sunday .. 7 = Saturday
        weekday: 1,
        hour,
        minute,
        ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL_ID } : {}),
      },
    });
  } catch (err) {
    console.warn('[notifications] scheduleWeeklyDigestNotification failed', err);
    return null;
  }
}

export async function cancelWeeklyDigestNotification(): Promise<void> {
  if (!canSchedule()) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(ID_WEEKLY_DIGEST);
  } catch (err) {
    console.warn('[notifications] cancelWeeklyDigestNotification failed', err);
  }
}

// ─── Streak-at-risk alert ─────────────────────────────────────────────────────

// Schedule a one-time streak-at-risk alert at a specific hour today
export async function scheduleStreakAtRiskAlert(streakDays: number): Promise<void> {
  if (!canSchedule()) return;
  if (streakDays <= 0) return;
  try {
    // Honor the Settings > Streak Alerts toggle (default on).
    try {
      const raw = await AsyncStorage.getItem('gutwell_settings');
      if (raw && JSON.parse(raw)?.streakAlertsEnabled === false) return;
    } catch {
      // unreadable settings -> default on
    }
    if (!(await hasPermission())) return; // never prompt for a background nudge
    await ensureAndroidChannel();
    await Notifications.cancelScheduledNotificationAsync(ID_STREAK_AT_RISK).catch(() => {});

    // Fire at 8:00 PM today if that is still in the future; otherwise skip so we
    // don't deliver immediately at an inappropriate time.
    const fireAt = new Date();
    fireAt.setHours(20, 0, 0, 0);
    if (fireAt.getTime() <= Date.now()) return;

    await Notifications.scheduleNotificationAsync({
      identifier: ID_STREAK_AT_RISK,
      content: {
        title: `Keep your ${streakDays}-day streak alive`,
        body: 'You have not checked in yet today. A quick log keeps your streak going.',
        sound: true,
        data: { reminderType: 'checkin' },
        ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL_ID } : {}),
      },
      trigger: {
        type: SchedulableTriggerInputTypes.DATE,
        date: fireAt,
        ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL_ID } : {}),
      },
    });
  } catch (err) {
    console.warn('[notifications] scheduleStreakAtRiskAlert failed', err);
  }
}

export async function cancelStreakAtRiskAlert(): Promise<void> {
  if (!canSchedule()) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(ID_STREAK_AT_RISK);
  } catch (err) {
    console.warn('[notifications] cancelStreakAtRiskAlert failed', err);
  }
}

// ─── Bulk helpers ─────────────────────────────────────────────────────────────

export async function cancelAllNotifications(): Promise<void> {
  if (!canSchedule()) return;
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch (err) {
    console.warn('[notifications] cancelAllNotifications failed', err);
  }
}

export async function getScheduledCount(): Promise<number> {
  if (!canSchedule()) return 0;
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    return scheduled.length;
  } catch (err) {
    console.warn('[notifications] getScheduledCount failed', err);
    return 0;
  }
}

// ─── Legacy / compatibility exports ──────────────────────────────────────────
// These preserve backward compatibility for the reminders screen and syncReminders.

/**
 * Request notification permissions (iOS requires explicit permission).
 * @deprecated Use requestPermissions() instead.
 */
export async function requestNotificationPermissions(): Promise<boolean> {
  return requestPermissions();
}

const REMINDER_COPY: Record<
  'checkin' | 'food' | 'symptom',
  { title: string; body: string }
> = {
  checkin: {
    title: 'Time for your check-in',
    body: 'Log how your gut feels today to keep your insights sharp.',
  },
  food: {
    title: 'Log your meal',
    body: "Add what you ate so we can connect food to how you feel.",
  },
  symptom: {
    title: 'How are your symptoms?',
    body: 'Track any symptoms now to spot patterns over time.',
  },
};

/**
 * Schedule a daily local notification at a specific time.
 */
export async function scheduleDailyReminder(
  type: 'checkin' | 'food' | 'symptom',
  hour: number,
  minute: number,
): Promise<string> {
  const fallbackId = `local-${type}-${hour}-${minute}`;
  if (!canSchedule()) return fallbackId;
  try {
    if (!(await hasPermission())) {
      const granted = await requestPermissions();
      if (!granted) return fallbackId;
    }
    await ensureAndroidChannel();
    const copy = REMINDER_COPY[type];
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: copy.title,
        body: copy.body,
        sound: true,
        data: { reminderType: type },
        ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL_ID } : {}),
      },
      trigger: {
        type: SchedulableTriggerInputTypes.DAILY,
        hour,
        minute,
        ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL_ID } : {}),
      },
    });
    return id;
  } catch (err) {
    console.warn('[notifications] scheduleDailyReminder failed', err);
    return fallbackId;
  }
}

/**
 * Cancel all scheduled notifications.
 */
export async function cancelAllReminders() {
  await cancelAllNotifications();
}

/**
 * Cancel a specific scheduled notification.
 */
export async function cancelReminder(notificationId: string) {
  if (!canSchedule()) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  } catch (err) {
    console.warn('[notifications] cancelReminder failed', err);
  }
}

/**
 * Sync reminders from the database — cancel all and reschedule from DB state.
 *
 * The `reminders` table stores `time` (HH:MM[:SS]), `enabled`, and `days`
 * (1=Mon..7=Sun). We map each enabled reminder to a repeating weekly trigger
 * per selected day, or a single daily trigger when all 7 days are selected.
 */
export async function syncReminders(userId: string) {
  if (!canSchedule()) return;
  try {
    if (!(await hasPermission())) return;
    await ensureAndroidChannel();

    // Clear only the reminders we own (identifier-prefixed), preserving the
    // dedicated daily-checkin / weekly-digest / streak notifications which are
    // managed independently by Settings.
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled
        .filter((n) => typeof n.identifier === 'string' && n.identifier.startsWith(ID_REMINDER_PREFIX))
        .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => {})),
    );

    const { data, error } = await supabase
      .from('reminders')
      .select('id, reminder_type, time, enabled, days')
      .eq('user_id', userId);
    if (error || !data) return;

    for (const r of data as Array<{
      id: number;
      reminder_type: 'checkin' | 'food' | 'symptom';
      time: string;
      enabled: boolean;
      days: number[] | null;
    }>) {
      if (!r.enabled) continue;
      const [hStr, mStr] = (r.time ?? '00:00').split(':');
      const hour = Number(hStr);
      const minute = Number(mStr);
      if (Number.isNaN(hour) || Number.isNaN(minute)) continue;

      const copy = REMINDER_COPY[r.reminder_type] ?? REMINDER_COPY.checkin;
      const days = Array.isArray(r.days) && r.days.length > 0 ? r.days : [1, 2, 3, 4, 5, 6, 7];

      const baseContent = {
        title: copy.title,
        body: copy.body,
        sound: true as const,
        data: { reminderType: r.reminder_type, reminderId: r.id },
        ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL_ID } : {}),
      };

      if (days.length === 7) {
        // Every day → a single daily trigger.
        await Notifications.scheduleNotificationAsync({
          identifier: `${ID_REMINDER_PREFIX}-${r.id}-daily`,
          content: baseContent,
          trigger: {
            type: SchedulableTriggerInputTypes.DAILY,
            hour,
            minute,
            ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL_ID } : {}),
          },
        });
      } else {
        // Specific days → one weekly trigger each.
        // DB days: 1=Mon..7=Sun. Expo weekday: 1=Sun..7=Sat. Map Sun(7)->1, Mon(1)->2, ...
        for (const dbDay of days) {
          const expoWeekday = dbDay === 7 ? 1 : dbDay + 1;
          await Notifications.scheduleNotificationAsync({
            identifier: `${ID_REMINDER_PREFIX}-${r.id}-w${dbDay}`,
            content: baseContent,
            trigger: {
              type: SchedulableTriggerInputTypes.WEEKLY,
              weekday: expoWeekday,
              hour,
              minute,
              ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL_ID } : {}),
            },
          });
        }
      }
    }
  } catch (err) {
    console.warn('[notifications] syncReminders failed', err);
  }
}
