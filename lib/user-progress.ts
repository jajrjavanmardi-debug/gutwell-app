import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Trigger-feedback memory for the AI meal flow ("this didn't work for my
 * body"). Recent feedback is replayed into analysis prompts so the AI stops
 * recommending foods the user already flagged.
 *
 * The XP/rank system that used to live here was removed: the app's single
 * progress system is lib/levels.ts (profiles.total_points), shown on Profile
 * and Home. Existing stored XP is simply ignored; triggers are preserved
 * under the same storage key.
 */

export type TriggerFeedbackItem = {
  id: string;
  mealName: string;
  adviceSummary: string;
  symptoms?: string[];
  createdAt: string;
};

const USER_PROGRESS_KEY = 'gutwell_user_progress_profile';

async function readTriggers(): Promise<TriggerFeedbackItem[]> {
  const raw = await AsyncStorage.getItem(USER_PROGRESS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as { triggers?: unknown };
    return Array.isArray(parsed.triggers) ? (parsed.triggers as TriggerFeedbackItem[]) : [];
  } catch {
    return [];
  }
}

export async function getTriggerMemories(): Promise<TriggerFeedbackItem[]> {
  return readTriggers();
}

export async function recordTriggerFeedback(
  item: Omit<TriggerFeedbackItem, 'id' | 'createdAt'>,
): Promise<TriggerFeedbackItem[]> {
  const existing = await readTriggers();
  const nextTrigger: TriggerFeedbackItem = {
    ...item,
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    createdAt: new Date().toISOString(),
  };
  const triggers = [nextTrigger, ...existing].slice(0, 30);
  await AsyncStorage.setItem(USER_PROGRESS_KEY, JSON.stringify({ triggers }));
  return triggers;
}
