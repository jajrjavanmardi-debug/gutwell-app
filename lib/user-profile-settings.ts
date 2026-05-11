import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  APP_LANGUAGE_STORAGE_KEY,
  parseStoredLanguage,
  type AppLanguage,
} from './app-language';
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

function isMedicalCondition(value: unknown): value is MedicalCondition {
  return typeof value === 'string' && MEDICAL_CONDITION_OPTIONS.includes(value as MedicalCondition);
}

export async function getUserProfileSettings(): Promise<UserProfileSettings> {
  const { data: { user } } = await supabase.auth.getUser();

  if (user?.id) {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('medical_conditions, preferred_language')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) throw error;

    if (data) {
      const settings = {
        conditions: Array.isArray(data.medical_conditions)
          ? data.medical_conditions.filter(isMedicalCondition)
          : [],
        preferredLanguage: parseStoredLanguage(data.preferred_language),
      };
      await AsyncStorage.setItem(getProfileSettingsStorageKey(user.id), JSON.stringify(settings));
      await AsyncStorage.setItem(USER_PROFILE_SETTINGS_KEY, JSON.stringify(settings));
      await AsyncStorage.setItem(APP_LANGUAGE_STORAGE_KEY, settings.preferredLanguage);
      return settings;
    }
  }

  const raw = await AsyncStorage.getItem(
    user?.id ? getProfileSettingsStorageKey(user.id) : USER_PROFILE_SETTINGS_KEY
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

export async function saveUserProfileSettings(settings: UserProfileSettings): Promise<void> {
  const uniqueConditions = Array.from(new Set(settings.conditions)).filter(isMedicalCondition);
  const preferredLanguage = parseStoredLanguage(settings.preferredLanguage ?? null);
  const payload = { conditions: uniqueConditions, preferredLanguage };
  const { data: { user } } = await supabase.auth.getUser();

  await AsyncStorage.setItem(USER_PROFILE_SETTINGS_KEY, JSON.stringify(payload));
  await AsyncStorage.setItem(APP_LANGUAGE_STORAGE_KEY, preferredLanguage);
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
    if (error) throw error;
  }
}

export function getPromptConditions(conditions: MedicalCondition[]): string[] {
  return conditions.length > 0 ? conditions : ['General Gut Health'];
}

function getProfileSettingsStorageKey(userId: string): string {
  return `${USER_PROFILE_SETTINGS_KEY}:${userId}`;
}
