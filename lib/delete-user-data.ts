import AsyncStorage from '@react-native-async-storage/async-storage';

import { APP_LANGUAGE_STORAGE_KEY } from './app-language';
import {
  GUEST_MODE_STORAGE_KEY,
  GUEST_ONBOARDING_STORAGE_KEY,
  GUEST_PROFILE_STORAGE_KEY,
} from './guest-mode';
import { HEALTH_DATA_CONSENT_STORAGE_KEY } from './health-data-consent';
import { supabase } from './supabase';
import { USER_PROFILE_SETTINGS_KEY } from './user-profile-settings';

const LOCAL_DATA_KEYS = [
  GUEST_MODE_STORAGE_KEY,
  GUEST_PROFILE_STORAGE_KEY,
  GUEST_ONBOARDING_STORAGE_KEY,
  HEALTH_DATA_CONSENT_STORAGE_KEY,
  USER_PROFILE_SETTINGS_KEY,
  'gutwell_photo_analysis_history',
  'gutwell_supplement_history',
  'gutwell_user_progress_profile',
  'health_disclaimer_accepted',
  'offline_queue',
  'widget_data',
] as const;

const LOCAL_DATA_PREFIXES = [
  `${USER_PROFILE_SETTINGS_KEY}:`,
] as const;

const REMOTE_USER_TABLES = [
  'check_ins',
  'food_logs',
  'symptoms',
  'health_logs',
  'gut_scores',
  'streaks',
  'water_logs',
  'favorites',
  'reminders',
  'user_profiles',
] as const;

export type DataDeletionFailure = {
  target: string;
  message: string;
};

export type SignedInDataDeletionResult = {
  failures: DataDeletionFailure[];
};

function shouldClearLocalKey(key: string): boolean {
  if (key === APP_LANGUAGE_STORAGE_KEY) return false;
  if ((LOCAL_DATA_KEYS as readonly string[]).includes(key)) return true;
  if (key.startsWith('gutwell_')) return true;
  return LOCAL_DATA_PREFIXES.some((prefix) => key.startsWith(prefix));
}

async function getLocalDataKeysToClear(): Promise<string[]> {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const matchedKeys = allKeys.filter(shouldClearLocalKey);
    return Array.from(new Set([...LOCAL_DATA_KEYS, ...matchedKeys]))
      .filter((key) => key !== APP_LANGUAGE_STORAGE_KEY);
  } catch {
    return [...LOCAL_DATA_KEYS];
  }
}

export async function clearLocalUserData(): Promise<void> {
  const keys = await getLocalDataKeysToClear();
  if (keys.length === 0) return;
  await AsyncStorage.multiRemove(keys);
}

export async function deleteGuestData(): Promise<void> {
  await clearLocalUserData();
}

async function deleteRowsForUser(table: string, userId: string): Promise<DataDeletionFailure | null> {
  const { error } = await supabase
    .from(table)
    .delete()
    .eq('user_id', userId);

  if (!error) return null;
  return { target: table, message: error.message };
}

async function clearProfileRow(userId: string): Promise<DataDeletionFailure | null> {
  const { error } = await supabase
    .from('profiles')
    .update({
      display_name: null,
      avatar_url: null,
      onboarding_completed: false,
      total_points: 0,
      level: 'beginner',
      gut_concern: null,
      symptom_frequency: null,
      goal: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (!error) return null;
  return { target: 'profiles', message: error.message };
}

export async function deleteSignedInUserData(userId: string): Promise<SignedInDataDeletionResult> {
  const failures: DataDeletionFailure[] = [];

  for (const table of REMOTE_USER_TABLES) {
    const failure = await deleteRowsForUser(table, userId);
    if (failure) failures.push(failure);
  }

  const profileFailure = await clearProfileRow(userId);
  if (profileFailure) failures.push(profileFailure);

  await clearLocalUserData();

  return { failures };
}
