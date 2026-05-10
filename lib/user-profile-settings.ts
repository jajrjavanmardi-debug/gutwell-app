import AsyncStorage from '@react-native-async-storage/async-storage';

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
};

function isMedicalCondition(value: unknown): value is MedicalCondition {
  return typeof value === 'string' && MEDICAL_CONDITION_OPTIONS.includes(value as MedicalCondition);
}

export async function getUserProfileSettings(): Promise<UserProfileSettings> {
  const raw = await AsyncStorage.getItem(USER_PROFILE_SETTINGS_KEY);
  if (!raw) return { conditions: [] };

  try {
    const parsed = JSON.parse(raw) as Partial<UserProfileSettings>;
    return {
      conditions: Array.isArray(parsed.conditions)
        ? parsed.conditions.filter(isMedicalCondition)
        : [],
    };
  } catch {
    return { conditions: [] };
  }
}

export async function saveUserProfileSettings(settings: UserProfileSettings): Promise<void> {
  const uniqueConditions = Array.from(new Set(settings.conditions)).filter(isMedicalCondition);
  await AsyncStorage.setItem(
    USER_PROFILE_SETTINGS_KEY,
    JSON.stringify({ conditions: uniqueConditions })
  );
}

export function getPromptConditions(conditions: MedicalCondition[]): string[] {
  return conditions.length > 0 ? conditions : ['General Gut Health'];
}
