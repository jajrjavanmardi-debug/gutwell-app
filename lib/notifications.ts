export async function requestPermissions(): Promise<boolean> {
  return true;
}

export async function getPermissionStatus(): Promise<'granted' | 'denied' | 'undetermined'> {
  return 'granted';
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
  return `local-reminder-${hour}-${minute}`;
}

// Schedule a weekly digest notification for Sunday mornings
export async function scheduleWeeklyDigestNotification(
  hour = 9,
  minute = 0,
): Promise<string | null> {
  return `weekly-digest-${hour}-${minute}`;
}

export async function cancelWeeklyDigestNotification(): Promise<void> {
  return undefined;
}

export async function cancelDailyCheckInReminder(): Promise<void> {
  return undefined;
}

// Schedule a one-time streak-at-risk alert at a specific hour today
export async function scheduleStreakAtRiskAlert(streakDays: number): Promise<void> {
  void streakDays;
}

export async function cancelStreakAtRiskAlert(): Promise<void> {
  return undefined;
}

export async function cancelAllNotifications(): Promise<void> {
  return undefined;
}

export async function getScheduledCount(): Promise<number> {
  return 0;
}

// ─── Legacy / compatibility exports ──────────────────────────────────────────
// These preserve backward compatibility for the reminders screen and syncReminders.

/**
 * Request notification permissions (iOS requires explicit permission).
 * @deprecated Use requestPermissions() instead.
 */
export async function requestNotificationPermissions(): Promise<boolean> {
  return true;
}

/**
 * Schedule a daily local notification at a specific time.
 */
export async function scheduleDailyReminder(
  type: 'checkin' | 'food' | 'symptom',
  hour: number,
  minute: number,
): Promise<string> {
  return `local-${type}-${hour}-${minute}`;
}

/**
 * Cancel all scheduled notifications.
 */
export async function cancelAllReminders() {
  return undefined;
}

/**
 * Cancel a specific scheduled notification.
 */
export async function cancelReminder(notificationId: string) {
  void notificationId;
}

/**
 * Sync reminders from the database — cancel all and reschedule from DB state.
 */
export async function syncReminders(userId: string) {
  void userId;
}
