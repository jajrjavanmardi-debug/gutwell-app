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
