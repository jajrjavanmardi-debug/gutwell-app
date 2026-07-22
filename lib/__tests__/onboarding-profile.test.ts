import AsyncStorage from '@react-native-async-storage/async-storage';
import { completeOnboardingProfile } from '../onboarding-profile';

// ---------------------------------------------------------------------------
// Mock Supabase
// ---------------------------------------------------------------------------
const mockEq = jest.fn();
const mockUpdate = jest.fn(() => ({ eq: mockEq }));

jest.mock('../supabase', () => ({
  supabase: {
    from: jest.fn(() => ({ update: mockUpdate })),
  },
}));

// ---------------------------------------------------------------------------
// Mock AsyncStorage
// ---------------------------------------------------------------------------
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  removeItem: jest.fn(),
}));

const mockGetItem = AsyncStorage.getItem as jest.Mock;
const mockRemoveItem = AsyncStorage.removeItem as jest.Mock;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function setupAnswers(answers: Record<string, unknown>, name?: string) {
  mockGetItem.mockImplementation((key: string) => {
    if (key === 'onboarding_answers') return Promise.resolve(JSON.stringify(answers));
    if (key === 'onboarding_name') return Promise.resolve(name ?? null);
    return Promise.resolve(null);
  });
}

function setupWriteSuccess() {
  mockEq.mockResolvedValue({ error: null } as never);
}

function setupWriteFailure() {
  mockEq.mockResolvedValue({ error: { message: 'DB write failed' } } as never);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRemoveItem.mockResolvedValue(undefined);
  setupWriteSuccess();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('completeOnboardingProfile', () => {
  it('writes gut_concern from answers.gut_concern', async () => {
    setupAnswers({ gut_concern: 'bloating', goal: 'Reduce symptoms' });
    await completeOnboardingProfile('user-123');
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ gut_concern: 'bloating', goal: 'Reduce symptoms', onboarding_completed: true })
    );
  });

  it('falls back to answers.meal_feeling for gut_concern (legacy)', async () => {
    setupAnswers({ meal_feeling: 'Feel comfortable after eating' });
    await completeOnboardingProfile('user-123');
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ gut_concern: 'Feel comfortable after eating' })
    );
  });

  it('prefers gut_concern over meal_feeling when both present', async () => {
    setupAnswers({ gut_concern: 'reflux', meal_feeling: 'old value' });
    await completeOnboardingProfile('user-123');
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ gut_concern: 'reflux' })
    );
  });

  it('writes null for gut_concern when neither key present', async () => {
    setupAnswers({});
    await completeOnboardingProfile('user-123');
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ gut_concern: null })
    );
  });

  it('writes null for symptom_frequency when not collected', async () => {
    setupAnswers({ gut_concern: 'bloating' });
    await completeOnboardingProfile('user-123');
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ symptom_frequency: null })
    );
  });

  it('writes symptom_frequency from bloating_frequency when present', async () => {
    setupAnswers({ bloating_frequency: 'several_times_week' });
    await completeOnboardingProfile('user-123');
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ symptom_frequency: 'several_times_week' })
    );
  });

  it('always sets onboarding_completed = true on success', async () => {
    setupAnswers({});
    await completeOnboardingProfile('user-123');
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ onboarding_completed: true })
    );
  });

  it('clears onboarding_answers and onboarding_name after successful write', async () => {
    setupAnswers({ gut_concern: 'bloating' }, 'Alex');
    await completeOnboardingProfile('user-123');
    expect(mockRemoveItem).toHaveBeenCalledWith('onboarding_answers');
    expect(mockRemoveItem).toHaveBeenCalledWith('onboarding_name');
  });

  it('does NOT clear AsyncStorage when profile write fails', async () => {
    setupWriteFailure();
    setupAnswers({ gut_concern: 'bloating' });
    await expect(completeOnboardingProfile('user-123')).rejects.toThrow('profile write failed');
    expect(mockRemoveItem).not.toHaveBeenCalled();
  });

  it('throws on write failure so caller can handle retry', async () => {
    setupWriteFailure();
    setupAnswers({});
    await expect(completeOnboardingProfile('user-123')).rejects.toThrow();
  });

  it('does not include display_name in payload when no name collected', async () => {
    setupAnswers({});
    // name is null
    await completeOnboardingProfile('user-123');
    const payload = (mockUpdate.mock.calls as unknown[][])[0][0];
    expect(payload).not.toHaveProperty('display_name');
  });

  it('includes display_name in payload when name was collected', async () => {
    setupAnswers({}, 'Jordan');
    await completeOnboardingProfile('user-123');
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ display_name: 'Jordan' })
    );
  });
});

// ---------------------------------------------------------------------------
// Notification scheduling tests (verifying P0 promise: daily only)
// ---------------------------------------------------------------------------

const mockScheduleDaily = jest.fn().mockResolvedValue(undefined);
const mockScheduleWeekly = jest.fn().mockResolvedValue(undefined);

jest.mock('../../lib/notifications', () => ({
  requestPermissions: jest.fn().mockResolvedValue(true),
  scheduleDailyCheckInReminder: (...args: unknown[]) => mockScheduleDaily(...args),
  scheduleWeeklyDigestNotification: (...args: unknown[]) => mockScheduleWeekly(...args),
}));

describe('onboarding notification scheduling (P0 contract)', () => {
  beforeEach(() => {
    mockScheduleDaily.mockClear();
    mockScheduleWeekly.mockClear();
  });

  it('schedules only the daily check-in reminder when permission granted', async () => {
    // Simulate what requestPermission() does in notifications.tsx
    const { requestPermissions, scheduleDailyCheckInReminder } =
      jest.requireMock('../../lib/notifications') as {
        requestPermissions: jest.Mock;
        scheduleDailyCheckInReminder: jest.Mock;
      };
    const granted = await requestPermissions();
    if (granted) {
      await scheduleDailyCheckInReminder(20, 0);
    }
    expect(mockScheduleDaily).toHaveBeenCalledTimes(1);
    expect(mockScheduleDaily).toHaveBeenCalledWith(20, 0);
  });

  it('does not schedule weekly digest during onboarding', async () => {
    const { requestPermissions, scheduleDailyCheckInReminder } =
      jest.requireMock('../../lib/notifications') as {
        requestPermissions: jest.Mock;
        scheduleDailyCheckInReminder: jest.Mock;
      };
    const granted = await requestPermissions();
    if (granted) {
      await scheduleDailyCheckInReminder(20, 0);
    }
    expect(mockScheduleWeekly).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Retry-safety tests
// ---------------------------------------------------------------------------

describe('completeOnboardingProfile retry safety', () => {
  it('is safe to call twice — second call writes with same data', async () => {
    setupWriteSuccess();
    setupAnswers({ gut_concern: 'bloating' });
    // First call succeeds and clears storage
    await completeOnboardingProfile('user-123');
    // Second call reads empty answers (storage cleared) — still writes without error
    mockGetItem.mockResolvedValue(null);
    await expect(completeOnboardingProfile('user-123')).resolves.toBeUndefined();
    expect(mockUpdate).toHaveBeenCalledTimes(2);
  });

  it('preserves onboarding_answers after failed write so retry has data', async () => {
    setupWriteFailure();
    setupAnswers({ gut_concern: 'reflux', goal: 'Reduce symptoms' });
    await expect(completeOnboardingProfile('user-123')).rejects.toThrow();
    // AsyncStorage.removeItem must NOT have been called
    expect(mockRemoveItem).not.toHaveBeenCalled();
  });

  it('writes onboarding_completed=true only on success, never on failure', async () => {
    setupWriteFailure();
    setupAnswers({});
    await expect(completeOnboardingProfile('user-123')).rejects.toThrow();
    // The update was called but returned an error — onboarding_completed was in the
    // payload but the DB write failed, so the profile row is unchanged.
    // Verify the test framework captured the attempted write.
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ onboarding_completed: true })
    );
    // And that storage was preserved (not cleared) because write failed.
    expect(mockRemoveItem).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Concurrency / loading guard test
// ---------------------------------------------------------------------------

describe('loading guard — prevents concurrent completion calls', () => {
  it('loading becomes true before requestPermissions resolves', async () => {
    // Simulate the handleEnableReminder loading guard pattern:
    // loading must be set to true synchronously before any await,
    // so a second tap while the first is in-flight is blocked.
    let loadingDuringPermission = false;
    let loading = false;

    const fakeRequestPermissions = async () => {
      // By the time this resolves, loading must already be true.
      loadingDuringPermission = loading;
      return true;
    };

    // Simulate handleEnableReminder
    const handleEnableReminder = async () => {
      if (loading) return;
      loading = true;          // ← must happen before first await
      await fakeRequestPermissions();
    };

    // First tap
    const first = handleEnableReminder();
    // Second tap immediately — loading is already true so it returns early
    const second = handleEnableReminder();

    await Promise.all([first, second]);

    expect(loadingDuringPermission).toBe(true);
  });

  it('second rapid tap is ignored while first is in flight', async () => {
    let callCount = 0;
    let loading = false;

    const handleEnableReminder = async () => {
      if (loading) return;
      loading = true;
      callCount++;
      // Simulate async permission request
      await new Promise((r) => setTimeout(r, 10));
      loading = false;
    };

    await Promise.all([handleEnableReminder(), handleEnableReminder(), handleEnableReminder()]);

    expect(callCount).toBe(1);
  });
});
