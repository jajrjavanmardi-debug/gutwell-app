import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  APP_LANGUAGE_STORAGE_KEY,
  parseStoredLanguage,
  type AppLanguage,
} from './app-language';
import { isGuestModeActive } from './guest-mode';
import { supabase } from './supabase';

export const USER_PROFILE_SETTINGS_KEY = 'gutwell_user_profile_settings';

export const MEDICAL_CONDITION_OPTIONS = [
  'IBS',
  'Gastritis',
  'Bloating',
  'Lactose Intolerance',
  'Celiac',
] as const;

export type MedicalCondition = (typeof MEDICAL_CONDITION_OPTIONS)[number];

export type UserProfileSettings = {
  conditions: MedicalCondition[];
  preferredLanguage?: AppLanguage;
};

type ProfileSettingsRow = Record<string, unknown>;

function isMedicalCondition(value: unknown): value is MedicalCondition {
  return typeof value === 'string' && MEDICAL_CONDITION_OPTIONS.includes(value as MedicalCondition);
}

function isProfileSchemaCompatibilityError(error: { code?: string; message?: string }): boolean {
  const message = error.message?.toLowerCase() ?? '';
  return (
    error.code === 'PGRST204'
    || error.code === '42703'
    || message.includes('medical_conditions')
    || message.includes('preferred_language')
  );
}

function readProfileSettingsRow(
  data: ProfileSettingsRow,
  fallbackSettings: UserProfileSettings,
): UserProfileSettings {
  return {
    conditions: Array.isArray(data.medical_conditions)
      ? data.medical_conditions.filter(isMedicalCondition)
      : fallbackSettings.conditions,
    preferredLanguage: parseStoredLanguage(
      typeof data.preferred_language === 'string'
        ? data.preferred_language
        : fallbackSettings.preferredLanguage ?? null
    ),
  };
}

async function readCachedProfileSettings(userId?: string): Promise<UserProfileSettings> {
  const raw = await AsyncStorage.getItem(
    userId ? getProfileSettingsStorageKey(userId) : USER_PROFILE_SETTINGS_KEY
  ) ?? await AsyncStorage.getItem(USER_PROFILE_SETTINGS_KEY);

  if (!raw) {
    const storedLanguage = await AsyncStorage.getItem(APP_LANGUAGE_STORAGE_KEY);
    return { conditions: [], preferredLanguage: parseStoredLanguage(storedLanguage) };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<UserProfileSettings>;
    const storedLanguage = await AsyncStorage.getItem(APP_LANGUAGE_STORAGE_KEY);
    return {
      conditions: Array.isArray(parsed.conditions)
        ? parsed.conditions.filter(isMedicalCondition)
        : [],
      preferredLanguage: parseStoredLanguage(parsed.preferredLanguage ?? storedLanguage),
    };
  } catch {
    const storedLanguage = await AsyncStorage.getItem(APP_LANGUAGE_STORAGE_KEY);
    return { conditions: [], preferredLanguage: parseStoredLanguage(storedLanguage) };
  }
}

export async function getUserProfileSettings(): Promise<UserProfileSettings> {
  if (await isGuestModeActive()) {
    return readCachedProfileSettings();
  }

  const { data: { user } } = await supabase.auth.getUser();

  if (user?.id) {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      if (!isProfileSchemaCompatibilityError(error)) throw error;
      return readCachedProfileSettings(user.id);
    }

    if (data) {
      const cachedSettings = await readCachedProfileSettings(user.id);
      const settings = readProfileSettingsRow(data as ProfileSettingsRow, cachedSettings);
      const preferredLanguage = settings.preferredLanguage ?? 'en';
      await AsyncStorage.setItem(getProfileSettingsStorageKey(user.id), JSON.stringify(settings));
      await AsyncStorage.setItem(USER_PROFILE_SETTINGS_KEY, JSON.stringify(settings));
      await AsyncStorage.setItem(APP_LANGUAGE_STORAGE_KEY, preferredLanguage);
      return settings;
    }
  }

  return readCachedProfileSettings(user?.id);
}

export async function saveUserProfileSettings(settings: UserProfileSettings): Promise<void> {
  const uniqueConditions = Array.from(new Set(settings.conditions)).filter(isMedicalCondition);
  const preferredLanguage = parseStoredLanguage(settings.preferredLanguage ?? null);
  const payload = { conditions: uniqueConditions, preferredLanguage };

  await AsyncStorage.setItem(USER_PROFILE_SETTINGS_KEY, JSON.stringify(payload));
  await AsyncStorage.setItem(APP_LANGUAGE_STORAGE_KEY, preferredLanguage);
  if (await isGuestModeActive()) return;

  const { data: { user } } = await supabase.auth.getUser();

  if (user?.id) {
    await AsyncStorage.setItem(getProfileSettingsStorageKey(user.id), JSON.stringify(payload));
    const { error } = await supabase
      .from('user_profiles')
      .upsert(
        {
          user_id: user.id,
          medical_conditions: uniqueConditions,
          preferred_language: preferredLanguage,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );
    if (error) {
      if (!isProfileSchemaCompatibilityError(error)) throw error;

      const { error: fallbackError } = await supabase
        .from('user_profiles')
        .upsert(
          {
            user_id: user.id,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' }
        );
      if (fallbackError && !isProfileSchemaCompatibilityError(fallbackError)) throw fallbackError;
    }
  }
}

export function getPromptConditions(conditions: MedicalCondition[]): string[] {
  return conditions.length > 0 ? conditions : ['General Gut Wellness'];
}

function getProfileSettingsStorageKey(userId: string): string {
  return `${USER_PROFILE_SETTINGS_KEY}:${userId}`;
}
