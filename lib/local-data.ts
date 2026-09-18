/**
 * lib/local-data.ts
 *
 * Device-local data lifecycle, and the difference between SIGNING OUT and
 * DELETING AN ACCOUNT.
 *
 *   sign out  — the account still exists. Keeping cached state is correct and
 *               convenient; contexts/AuthContext.clearLocalSessionState()
 *               removes only the onboarding/session keys that would otherwise
 *               strand the next session mid-flow.
 *
 *   delete    — the account is gone. Every GutWell copy of that person's data
 *               must go with it, including the copies that never lived in
 *               Postgres: the widget's App Group values, the offline queue, the
 *               analysis history cache, and anything a future feature persists.
 *
 * WHY THIS IS A DENY-LIST, NOT AN ALLOW-LIST
 * The previous implementation removed seven named keys. That shape fails open:
 * every key added afterwards silently survived deletion, which is exactly what
 * happened — widget_data (gut score, streak), photo-analysis-history,
 * user progress, supplement history and the offline queue all outlived the
 * account and reappeared after the next signup on the same device.
 *
 * So the purge enumerates AsyncStorage at runtime and removes EVERYTHING except
 * the two device-level preferences listed below. A new persisted key is
 * therefore deleted by default; someone has to make a deliberate, reviewed
 * decision to add an exemption. Failing closed is the whole point.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { clearStoredAuthSession } from './supabase';
import { clearWidgetData } from './widget-data';

/**
 * The ONLY keys that survive account deletion.
 *
 * Each is a device-level preference containing no user, account or health
 * information. Anything user-specific belongs nowhere near this list.
 *
 *   app_language        'en' | 'de'. Which language the app renders in. Keeping
 *                       it means a German user's Welcome screen is still German
 *                       after they delete their account, which is the humane
 *                       behaviour and reveals nothing about them.
 *
 *   gutwell_install_v1  The literal '1'. app/_layout.tsx uses its ABSENCE to
 *                       detect a fresh install and wipe any stale SecureStore
 *                       session. Removing it here would make the next launch
 *                       look like a reinstall — harmless, but it would run a
 *                       cleanup that has already happened. It encodes nothing
 *                       but "this app has been launched before".
 */
export const KEYS_PRESERVED_ON_DELETE: readonly string[] = ['app_language', 'gutwell_install_v1'];

/**
 * Remove every GutWell trace of the deleted account from this device.
 *
 * MUST be called only after the server has confirmed deletion — see
 * AuthContext.deleteAccount(). Purging first would destroy the local data of an
 * account that still exists if the RPC then failed.
 *
 * Every step is independently guarded: a failure in one store must not leave
 * the others intact, because a partial purge is the defect this function
 * exists to prevent. Failures are counted and returned so the caller can
 * report honestly rather than claiming a clean wipe it did not achieve.
 */
export async function purgeAllLocalData(): Promise<{ removedKeys: number; failures: string[] }> {
  const failures: string[] = [];
  let removedKeys = 0;

  // 1. AsyncStorage — dynamic enumeration, deny-list.
  try {
    const all = await AsyncStorage.getAllKeys();
    const doomed = all.filter((k) => !KEYS_PRESERVED_ON_DELETE.includes(k));
    if (doomed.length > 0) await AsyncStorage.multiRemove(doomed);
    removedKeys = doomed.length;
  } catch {
    failures.push('async_storage');
  }

  // 2. The widget's App Group. A separate store the RN side does not enumerate,
  //    holding gut score, streak and last check-in.
  try {
    await clearWidgetData();
  } catch {
    failures.push('app_group');
  }

  // 3. The Supabase session in SecureStore, including the chunked and legacy
  //    layouts. signOut() drops the in-memory session; this removes the bytes.
  try {
    await clearStoredAuthSession();
  } catch {
    failures.push('secure_store');
  }

  return { removedKeys, failures };
}
