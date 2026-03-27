import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from './supabase';

// Configure how notifications are shown when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/**
 * Request notification permissions (iOS requires explicit permission).
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
  minute: number
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
      data: { type, screen: type === 'checkin' ? '/(tabs)/checkin' : type === 'food' ? '/(tabs)/food' : '/log-symptom' },
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
