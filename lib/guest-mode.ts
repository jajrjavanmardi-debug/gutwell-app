import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AppLanguage } from './app-language';

export const GUEST_MODE_STORAGE_KEY = 'gutwell_guest_mode_enabled';
export const GUEST_PROFILE_STORAGE_KEY = 'gutwell_guest_profile';
export const GUEST_ONBOARDING_STORAGE_KEY = 'gutwell_guest_onboarding';

export type GuestProfile = {
  id: 'guest-local';
  display_name: string;
  onboarding_completed: boolean;
  gut_concern: string | null;
  symptom_frequency: string | null;
  goal: string | null;
  created_at: string;
  updated_at: string;
};

export type GuestOnboardingData = {
  answers: Record<string, string>;
  language: AppLanguage;
  focusAreas: string[];
  habits: string[];
  completedAt: string;
};

const DEFAULT_GUEST_PROFILE: GuestProfile = {
  id: 'guest-local',
  display_name: 'Guest',
  onboarding_completed: false,
  gut_concern: null,
  symptom_frequency: null,
  goal: null,
  created_at: '',
  updated_at: '',
};

function createDefaultGuestProfile(): GuestProfile {
  const now = new Date().toISOString();
  return {
    ...DEFAULT_GUEST_PROFILE,
    created_at: now,
    updated_at: now,
  };
}

function normalizeGuestProfile(value: unknown): GuestProfile {
  const fallback = createDefaultGuestProfile();
  if (!value || typeof value !== 'object') return fallback;

  const profile = value as Partial<GuestProfile>;
  return {
    id: 'guest-local',
    display_name: typeof profile.display_name === 'string' ? profile.display_name : fallback.display_name,
    onboarding_completed: Boolean(profile.onboarding_completed),
    gut_concern: typeof profile.gut_concern === 'string' ? profile.gut_concern : null,
    symptom_frequency: typeof profile.symptom_frequency === 'string' ? profile.symptom_frequency : null,
    goal: typeof profile.goal === 'string' ? profile.goal : null,
    created_at: typeof profile.created_at === 'string' ? profile.created_at : fallback.created_at,
    updated_at: typeof profile.updated_at === 'string' ? profile.updated_at : fallback.updated_at,
  };
}

export async function isGuestModeActive(): Promise<boolean> {
  return (await AsyncStorage.getItem(GUEST_MODE_STORAGE_KEY)) === 'true';
}

export async function getGuestProfile(): Promise<GuestProfile | null> {
  if (!(await isGuestModeActive())) return null;

  const raw = await AsyncStorage.getItem(GUEST_PROFILE_STORAGE_KEY);
  if (!raw) {
    const profile = createDefaultGuestProfile();
    await AsyncStorage.setItem(GUEST_PROFILE_STORAGE_KEY, JSON.stringify(profile));
    return profile;
  }

  try {
    return normalizeGuestProfile(JSON.parse(raw));
  } catch {
    const profile = createDefaultGuestProfile();
    await AsyncStorage.setItem(GUEST_PROFILE_STORAGE_KEY, JSON.stringify(profile));
    return profile;
  }
}

export async function enableGuestMode(): Promise<GuestProfile> {
  await AsyncStorage.setItem(GUEST_MODE_STORAGE_KEY, 'true');
  const existingProfile = await getGuestProfile();
  const profile = existingProfile ?? createDefaultGuestProfile();
  await AsyncStorage.setItem(GUEST_PROFILE_STORAGE_KEY, JSON.stringify(profile));
  return profile;
}

export async function disableGuestMode(): Promise<void> {
  await AsyncStorage.setItem(GUEST_MODE_STORAGE_KEY, 'false');
}

export async function saveGuestOnboarding(data: GuestOnboardingData): Promise<GuestProfile> {
  const now = data.completedAt;
  const existingProfile = (await getGuestProfile()) ?? createDefaultGuestProfile();
  const profile: GuestProfile = {
    ...existingProfile,
    onboarding_completed: true,
    gut_concern: data.answers.symptoms ?? null,
    symptom_frequency: data.answers.bowelFrequency ?? null,
    goal: data.answers.goal ?? 'general_health',
    updated_at: now,
  };

  await AsyncStorage.multiSet([
    [GUEST_MODE_STORAGE_KEY, 'true'],
    [GUEST_PROFILE_STORAGE_KEY, JSON.stringify(profile)],
    [GUEST_ONBOARDING_STORAGE_KEY, JSON.stringify(data)],
  ]);

  return profile;
}
