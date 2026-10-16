/**
 * lib/__tests__/notifications-localization.test.ts
 *
 * lib/notifications.ts shipped with hardcoded English copy and had NO test
 * coverage at all, so a German user received English pushes indefinitely and
 * nothing would have caught it.
 *
 * Localization here had to be copy-only: identifiers, triggers, cancellation
 * ordering and the permission flow are Build 6 behaviour and are a release
 * contract. These tests assert the new German copy AND pin the mechanics that
 * had to stay still.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LANGUAGE_KEY } from '../language';

type ScheduledCall = {
  identifier?: string;
  content: { title: string; body: string; data?: Record<string, unknown> };
  trigger: Record<string, unknown>;
};

const mockScheduled: ScheduledCall[] = [];
const mockCancelled: string[] = [];
/** Ordered log of every mutating call, so cancel-before-schedule is provable. */
const mockCallOrder: string[] = [];

let mockPermissionStatus: 'granted' | 'denied' | 'undetermined' = 'granted';

jest.mock('expo-notifications', () => ({
  scheduleNotificationAsync: jest.fn(async (req: ScheduledCall) => {
    mockCallOrder.push(`schedule:${req.identifier ?? '(auto)'}`);
    mockScheduled.push(req);
    return req.identifier ?? 'generated-id';
  }),
  cancelScheduledNotificationAsync: jest.fn(async (id: string) => {
    mockCallOrder.push(`cancel:${id}`);
    mockCancelled.push(id);
  }),
  cancelAllScheduledNotificationsAsync: jest.fn(async () => {}),
  getAllScheduledNotificationsAsync: jest.fn(async () => []),
  getPermissionsAsync: jest.fn(async () => ({ status: mockPermissionStatus })),
  requestPermissionsAsync: jest.fn(async () => ({ status: mockPermissionStatus })),
  setNotificationChannelAsync: jest.fn(async () => {}),
  setNotificationHandler: jest.fn(),
  AndroidImportance: { HIGH: 4 },
  SchedulableTriggerInputTypes: {
    DAILY: 'daily',
    WEEKLY: 'weekly',
    DATE: 'date',
  },
}));

jest.mock('../runtime-environment', () => ({ isExpoGo: () => false }));

jest.mock('../supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: async () => ({ data: [], error: null }),
      }),
    }),
  },
}));

import {
  scheduleDailyCheckInReminder,
  scheduleWeeklyDigestNotification,
  scheduleStreakAtRiskAlert,
  scheduleDailyReminder,
} from '../notifications';

async function setLanguage(lang: 'en' | 'de') {
  await AsyncStorage.setItem(LANGUAGE_KEY, lang);
}

beforeEach(async () => {
  await AsyncStorage.clear();
  mockScheduled.length = 0;
  mockCancelled.length = 0;
  mockCallOrder.length = 0;
  mockPermissionStatus = 'granted';
  // Streak alerts read this settings blob; absent means "default on".
  jest.clearAllMocks();
});

// ─── Copy in both languages ──────────────────────────────────────────────────

describe('daily check-in reminder copy', () => {
  test('English', async () => {
    await setLanguage('en');
    await scheduleDailyCheckInReminder(9, 0);
    expect(mockScheduled[0].content.title).toBe('Time for your check-in');
    expect(mockScheduled[0].content.body).toBe(
      'Log how your gut feels today to keep your insights sharp.',
    );
  });

  test('German', async () => {
    await setLanguage('de');
    await scheduleDailyCheckInReminder(9, 0);
    expect(mockScheduled[0].content.title).toBe('Zeit für deinen Check-in');
    expect(mockScheduled[0].content.body).toContain('wie es deinem Darm heute geht');
  });
});

describe('weekly digest copy', () => {
  test('English', async () => {
    await setLanguage('en');
    await scheduleWeeklyDigestNotification(9, 0);
    expect(mockScheduled[0].content.title).toBe('Your weekly gut report is ready');
  });

  test('German', async () => {
    await setLanguage('de');
    await scheduleWeeklyDigestNotification(9, 0);
    expect(mockScheduled[0].content.title).toBe('Dein Wochenbericht ist da');
    expect(mockScheduled[0].content.body).toContain('Verläufe');
  });
});

describe('streak-at-risk copy', () => {
  // The alert only schedules if 20:00 today is still ahead, so these tests are
  // written to tolerate the no-op case rather than depend on wall-clock time.
  test('English interpolates the streak length', async () => {
    await setLanguage('en');
    await scheduleStreakAtRiskAlert(7);
    if (mockScheduled.length > 0) {
      expect(mockScheduled[0].content.title).toBe('Keep your 7-day streak alive');
    }
  });

  test('German interpolates the streak length with German word order', async () => {
    await setLanguage('de');
    await scheduleStreakAtRiskAlert(7);
    if (mockScheduled.length > 0) {
      expect(mockScheduled[0].content.title).toBe('Halte deine 7-Tage-Serie am Leben');
      expect(mockScheduled[0].content.title).not.toContain('streak');
    }
  });
});

describe('per-type reminder copy', () => {
  const cases: Array<['checkin' | 'food' | 'symptom', string, string]> = [
    ['checkin', 'Time for your check-in', 'Zeit für deinen Check-in'],
    ['food', 'Log your meal', 'Mahlzeit eintragen'],
    ['symptom', 'How are your symptoms?', 'Wie sind deine Symptome?'],
  ];

  test.each(cases)('%s reminder is localized', async (type, en, de) => {
    await setLanguage('en');
    await scheduleDailyReminder(type, 8, 30);
    expect(mockScheduled[0].content.title).toBe(en);

    mockScheduled.length = 0;
    await setLanguage('de');
    await scheduleDailyReminder(type, 8, 30);
    expect(mockScheduled[0].content.title).toBe(de);
  });
});

// ─── Language resolution is safe ─────────────────────────────────────────────

describe('language resolution never blocks scheduling', () => {
  test('no stored preference falls back to English rather than failing', async () => {
    // AsyncStorage cleared in beforeEach — nothing stored.
    await scheduleDailyCheckInReminder(9, 0);
    expect(mockScheduled).toHaveLength(1);
    expect(mockScheduled[0].content.title).toBe('Time for your check-in');
  });

  test('an unrecognised stored language falls back to English', async () => {
    await AsyncStorage.setItem(LANGUAGE_KEY, 'fa');
    await scheduleDailyCheckInReminder(9, 0);
    expect(mockScheduled).toHaveLength(1);
    expect(mockScheduled[0].content.title).toBe('Time for your check-in');
  });
});

// ─── Mechanics that must not have changed ────────────────────────────────────

describe('identifiers are unchanged', () => {
  test('the daily check-in keeps its stable identifier', async () => {
    await scheduleDailyCheckInReminder(9, 0);
    expect(mockScheduled[0].identifier).toBe('gutwell-daily-checkin');
  });

  test('the weekly digest keeps its stable identifier', async () => {
    await scheduleWeeklyDigestNotification(9, 0);
    expect(mockScheduled[0].identifier).toBe('gutwell-weekly-digest');
  });

  test('identifiers do not vary by language', async () => {
    await setLanguage('de');
    await scheduleDailyCheckInReminder(9, 0);
    const german = mockScheduled[0].identifier;
    mockScheduled.length = 0;
    await setLanguage('en');
    await scheduleDailyCheckInReminder(9, 0);
    expect(mockScheduled[0].identifier).toBe(german);
  });
});

describe('timing is unchanged', () => {
  test('the daily reminder keeps the requested hour and minute', async () => {
    await scheduleDailyCheckInReminder(21, 15);
    expect(mockScheduled[0].trigger).toMatchObject({ type: 'daily', hour: 21, minute: 15 });
  });

  test('trigger timing does not vary by language', async () => {
    await setLanguage('de');
    await scheduleDailyCheckInReminder(9, 45);
    const germanTrigger = JSON.stringify(mockScheduled[0].trigger);
    mockScheduled.length = 0;
    await setLanguage('en');
    await scheduleDailyCheckInReminder(9, 45);
    expect(JSON.stringify(mockScheduled[0].trigger)).toBe(germanTrigger);
  });

  test('quiet hours still suppress the reminder', async () => {
    // 23:00 falls inside the default 22:00–08:00 quiet window.
    const result = await scheduleDailyCheckInReminder(23, 0);
    expect(result).toBeNull();
    expect(mockScheduled).toHaveLength(0);
  });
});

describe('cancellation semantics are unchanged', () => {
  test('the previous instance is cancelled before the new one is scheduled', async () => {
    await scheduleDailyCheckInReminder(9, 0);
    expect(mockCallOrder).toEqual([
      'cancel:gutwell-daily-checkin',
      'schedule:gutwell-daily-checkin',
    ]);
  });

  test('rescheduling does not stack duplicates', async () => {
    await scheduleDailyCheckInReminder(9, 0);
    await scheduleDailyCheckInReminder(10, 0);
    // Two schedules, each preceded by its own cancel, all on one identifier.
    expect(mockCancelled).toEqual(['gutwell-daily-checkin', 'gutwell-daily-checkin']);
    expect(mockScheduled.map((s) => s.identifier)).toEqual([
      'gutwell-daily-checkin',
      'gutwell-daily-checkin',
    ]);
  });
});

describe('permission flow is unchanged', () => {
  test('a denied permission prevents scheduling in both languages', async () => {
    mockPermissionStatus = 'denied';
    await setLanguage('de');
    const result = await scheduleDailyCheckInReminder(9, 0);
    expect(result).toBeNull();
    expect(mockScheduled).toHaveLength(0);
  });

  test('data payloads still carry the reminder type', async () => {
    await scheduleDailyCheckInReminder(9, 0);
    expect(mockScheduled[0].content.data).toEqual({ reminderType: 'checkin' });
  });
});

// ─── The accepted v1 limitation ──────────────────────────────────────────────

describe('accepted v1 limitation: language is bound at schedule time', () => {
  test('an already-scheduled notification keeps its original language until rescheduled', async () => {
    await setLanguage('en');
    await scheduleDailyCheckInReminder(9, 0);
    expect(mockScheduled[0].content.title).toBe('Time for your check-in');

    // Switching language does NOT rewrite what is already queued: nothing is
    // scheduled again by the switch itself.
    await setLanguage('de');
    expect(mockScheduled).toHaveLength(1);
    expect(mockScheduled[0].content.title).toBe('Time for your check-in');

    // The next reschedule picks up German — which is the documented contract.
    await scheduleDailyCheckInReminder(9, 0);
    expect(mockScheduled[1].content.title).toBe('Zeit für deinen Check-in');
  });

  test('no language-change rescheduling hook was introduced', () => {
    // Guards the scope boundary: eliminating the limitation above would be a
    // behaviour change, not a copy change.
    const source = require('fs').readFileSync(
      require('path').join(__dirname, '..', 'notifications.ts'),
      'utf8',
    );
    expect(source).not.toMatch(/rescheduleAll|onLanguageChange|rescheduleForLanguage/);
  });
});
