import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

const ANSWERS_KEY = 'onboarding_answers';
const NAME_KEY = 'onboarding_name';

/**
 * Single source of truth for completing GutWell onboarding.
 *
 * Reads onboarding answers from AsyncStorage, maps only explicitly collected
 * fields (never invents defaults), writes to the profiles table, sets
 * onboarding_completed = true, then clears temporary storage.
 *
 * Safe to retry: AsyncStorage is NOT cleared until the Supabase write succeeds.
 * Backward compatible: gut_concern falls back to legacy answers.meal_feeling key.
 *
 * Does not call React context hooks or refreshProfile().
 * The calling screen is responsible for any post-completion navigation and
 * profile state refresh via existing auth lifecycle.
 */
export async function completeOnboardingProfile(userId: string): Promise<void> {
  // 1. Read temporary onboarding data
  const [rawAnswers, name] = await Promise.all([
    AsyncStorage.getItem(ANSWERS_KEY),
    AsyncStorage.getItem(NAME_KEY),
  ]);

  const answers: Record<string, unknown> = rawAnswers ? JSON.parse(rawAnswers) : {};

  // 2. Map only explicitly collected values — never invent defaults
  const gutConcern =
    (answers.gut_concern as string | undefined) ??
    (answers.meal_feeling as string | undefined) ??
    null;

  const symptomFrequency =
    (answers.bloating_frequency as string | undefined) ?? null;

  const goal =
    (answers.goal as string | undefined) ?? null;

  // display_name: only write if we have a real collected name.
  // The Supabase trigger already set display_name from email on signup.
  const displayName = name?.trim() || undefined;

  // 3. Build update payload — omit undefined fields to avoid overwriting
  // trigger-set values with null.
  const payload: Record<string, unknown> = {
    onboarding_completed: true,
    gut_concern: gutConcern,
    symptom_frequency: symptomFrequency,
    goal,
  };
  if (displayName !== undefined) {
    payload.display_name = displayName;
  }

  // 4. Write to profiles table
  const { error } = await supabase
    .from('profiles')
    .update(payload)
    .eq('id', userId);

  if (error) {
    // Preserve AsyncStorage on failure so the caller can retry.
    throw new Error(`[onboarding] profile write failed: ${error.message}`);
  }

  // 5. Clear temporary storage only after confirmed success
  await Promise.allSettled([
    AsyncStorage.removeItem(ANSWERS_KEY),
    AsyncStorage.removeItem(NAME_KEY),
  ]);
}
