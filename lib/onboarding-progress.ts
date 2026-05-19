import AsyncStorage from '@react-native-async-storage/async-storage';

import { GUEST_ONBOARDING_STORAGE_KEY, isGuestModeActive } from './guest-mode';
import { supabase } from './supabase';

export const ESSENTIAL_ONBOARDING_QUESTION_IDS = ['goal', 'symptoms'] as const;
export const DETAILED_ONBOARDING_QUESTION_IDS = [
  'bowelFrequency',
  'stoolConsistency',
  'diet',
  'fiber',
  'stress',
  'sleep',
  'triggers',
] as const;
export const FULL_ONBOARDING_QUESTION_IDS = [
  'bowelFrequency',
  'stoolConsistency',
  'symptoms',
  'diet',
  'fiber',
  'stress',
  'sleep',
  'triggers',
  'goal',
] as const;

const ONBOARDING_ANSWERS_CACHE_KEY = 'gutwell_onboarding_answers';

export type OnboardingQuestionId = (typeof FULL_ONBOARDING_QUESTION_IDS)[number];

type StoredGuestOnboarding = {
  answers?: unknown;
};

function getOnboardingAnswersStorageKey(userId?: string): string {
  return userId ? `${ONBOARDING_ANSWERS_CACHE_KEY}:${userId}` : ONBOARDING_ANSWERS_CACHE_KEY;
}

export function normalizeOnboardingAnswers(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  return Object.entries(value as Record<string, unknown>).reduce<Record<string, string>>((answers, [key, rawValue]) => {
    if (typeof rawValue === 'string' && rawValue.trim()) {
      answers[key] = rawValue;
    }
    return answers;
  }, {});
}

export function getMissingDetailedProfileQuestionIds(answers: Record<string, string>): string[] {
  return DETAILED_ONBOARDING_QUESTION_IDS.filter((questionId) => !answers[questionId]);
}

export function isFullOnboardingProfileComplete(answers: Record<string, string>): boolean {
  return FULL_ONBOARDING_QUESTION_IDS.every((questionId) => Boolean(answers[questionId]));
}

export async function cacheOnboardingAnswers(answers: Record<string, string>, userId?: string): Promise<void> {
  await AsyncStorage.setItem(getOnboardingAnswersStorageKey(userId), JSON.stringify(answers));
}

async function readCachedOnboardingAnswers(userId?: string): Promise<Record<string, string>> {
  const raw = await AsyncStorage.getItem(getOnboardingAnswersStorageKey(userId))
    ?? await AsyncStorage.getItem(ONBOARDING_ANSWERS_CACHE_KEY);
  if (!raw) return {};

  try {
    return normalizeOnboardingAnswers(JSON.parse(raw));
  } catch {
    return {};
  }
}

async function readGuestOnboardingAnswers(): Promise<Record<string, string>> {
  const raw = await AsyncStorage.getItem(GUEST_ONBOARDING_STORAGE_KEY);
  if (!raw) return readCachedOnboardingAnswers();

  try {
    const parsed = JSON.parse(raw) as StoredGuestOnboarding;
    return normalizeOnboardingAnswers(parsed.answers);
  } catch {
    return readCachedOnboardingAnswers();
  }
}

export async function getStoredOnboardingAnswers(userId?: string): Promise<Record<string, string>> {
  if (await isGuestModeActive()) {
    return readGuestOnboardingAnswers();
  }

  if (!userId) {
    return readCachedOnboardingAnswers();
  }

  const { data, error } = await supabase
    .from('user_profiles')
    .select('onboarding_answers')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.warn('Onboarding answers load failed:', error.message);
    return readCachedOnboardingAnswers(userId);
  }

  const answers = normalizeOnboardingAnswers(data?.onboarding_answers);
  await cacheOnboardingAnswers(answers, userId);
  return answers;
}
