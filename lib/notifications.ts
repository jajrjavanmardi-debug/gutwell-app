import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from './supabase';

// Configure notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function requestPermissions(): Promise<boolean> {
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function getPermissionStatus(): Promise<'granted' | 'denied' | 'undetermined'> {
  const { status } = await Notifications.getPermissionsAsync();
  return status;
}

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

// Schedule a daily check-in reminder
export async function scheduleDailyCheckInReminder(
  hour: number,
  minute: number,
  quietStart = '22:00',
  quietEnd = '08:00',
): Promise<string | null> {
  const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
  if (isInQuietHours(timeStr, quietStart, quietEnd)) return null;

  await cancelDailyCheckInReminder();

  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: "Time for your gut check-in 🌿",
      body: "Log how you're feeling and track your progress.",
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
    },
  });
  return id;
}

const CHECKIN_REMINDER_ID_KEY = 'gut-checkin-reminder';
const STREAK_ALERT_ID_KEY = 'gut-streak-alert';

export async function cancelDailyCheckInReminder(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of scheduled) {
    if (n.identifier.startsWith(CHECKIN_REMINDER_ID_KEY)) {
      await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }
  }
}

// Schedule a one-time streak-at-risk alert at a specific hour today
export async function scheduleStreakAtRiskAlert(streakDays: number): Promise<void> {
  // Cancel any existing streak alert first
  await cancelStreakAtRiskAlert();

  const now = new Date();
  const alertHour = 21; // 9 PM
  const target = new Date(now);
  target.setHours(alertHour, 0, 0, 0);

  // If 9 PM has already passed today, don't schedule
  if (target <= now) return;

  const secondsUntil = Math.floor((target.getTime() - now.getTime()) / 1000);

  await Notifications.scheduleNotificationAsync({
    identifier: STREAK_ALERT_ID_KEY,
    content: {
      title: `Don't break your ${streakDays}-day streak! 🔥`,
      body: "Complete your daily check-in before midnight to keep it alive.",
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: secondsUntil,
      repeats: false,
    },
  });
}

export async function cancelStreakAtRiskAlert(): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(STREAK_ALERT_ID_KEY);
  } catch {
    // ignore if not found
  }
}

export async function cancelAllNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

export async function getScheduledCount(): Promise<number> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  return scheduled.length;
}

// ─── Legacy / compatibility exports ──────────────────────────────────────────
// These preserve backward compatibility for the reminders screen and syncReminders.

/**
 * Request notification permissions (iOS requires explicit permission).
 * @deprecated Use requestPermissions() instead.
 */
export async function requestNotificationPermissions(): Promise<boolean> {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  return finalStatus === 'granted';
}

/**
 * Schedule a daily local notification at a specific time.
 */
export async function scheduleDailyReminder(
  type: 'checkin' | 'food' | 'symptom',
  hour: number,
  minute: number,
): Promise<string> {
  const messages = {
    checkin: { title: 'Time for a check-in', body: "How's your gut feeling today?" },
    food: { title: 'Log your meal', body: 'Record what you ate to track patterns.' },
    symptom: { title: 'Symptom check', body: 'Experiencing any symptoms? Log them now.' },
  };

  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: messages[type].title,
      body: messages[type].body,
      data: {
        type,
        screen:
          type === 'checkin'
            ? '/(tabs)/checkin'
            : type === 'food'
              ? '/(tabs)/food'
              : '/log-symptom',
      },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
    },
  });
  return id;
}

/**
 * Cancel all scheduled notifications.
 */
export async function cancelAllReminders() {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

/**
 * Cancel a specific scheduled notification.
 */
export async function cancelReminder(notificationId: string) {
  await Notifications.cancelScheduledNotificationAsync(notificationId);
}

/**
 * Sync reminders from the database — cancel all and reschedule from DB state.
 */
export async function syncReminders(userId: string) {
  await cancelAllReminders();

  const { data: reminders } = await supabase
    .from('reminders')
    .select('*')
    .eq('user_id', userId)
    .eq('enabled', true);

  if (!reminders) return;

  for (const reminder of reminders) {
    const [hourStr, minuteStr] = (reminder.time as string).split(':');
    const hour = parseInt(hourStr, 10);
    const minute = parseInt(minuteStr, 10);
    await scheduleDailyReminder(reminder.reminder_type, hour, minute);
  }
}
