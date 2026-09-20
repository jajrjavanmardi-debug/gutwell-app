import { Platform, NativeModules } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const GROUP_ID = 'group.com.parallellabs.gutwell';

/**
 * Write widget data to shared App Group UserDefaults (iOS)
 * and to AsyncStorage as a fallback cache.
 */
export async function updateWidgetData(data: {
  streak: number;
  gutScore: number;
  lastCheckIn: string;
}): Promise<void> {
  // Cache in AsyncStorage for the RN side
  await AsyncStorage.setItem('widget_data', JSON.stringify(data));

  if (Platform.OS !== 'ios') return;

  try {
    // react-native-widget-extension provides SharedGroupPreferences
    const { SharedGroupPreferences } = NativeModules;
    if (SharedGroupPreferences) {
      await SharedGroupPreferences.setItem('streak', data.streak, GROUP_ID);
      await SharedGroupPreferences.setItem('gutScore', data.gutScore, GROUP_ID);
      await SharedGroupPreferences.setItem('lastCheckIn', data.lastCheckIn, GROUP_ID);
    }
  } catch {
    // Widget data write is best-effort — don't block the app
  }
}

/**
 * Remove every GutWell value from the widget's stores.
 *
 * Called by purgeAllLocalData() on account deletion. The App Group is a
 * SEPARATE store from AsyncStorage: clearing AsyncStorage leaves the widget
 * still rendering the deleted account's gut score and streak on the home
 * screen, which is precisely the leak this fixes.
 *
 * The keys written by updateWidgetData are the keys cleared here — they are
 * declared in WIDGET_APP_GROUP_KEYS so a test can prove the two stay in step.
 * Values are reset rather than deleted: SharedGroupPreferences exposes no
 * remove, and a zeroed widget reads as "no data" while a stale one reads as
 * somebody's health record.
 */
export const WIDGET_APP_GROUP_KEYS = ['streak', 'gutScore', 'lastCheckIn'] as const;

export async function clearWidgetData(): Promise<void> {
  await AsyncStorage.removeItem('widget_data');

  if (Platform.OS !== 'ios') return;

  try {
    const { SharedGroupPreferences } = NativeModules;
    if (SharedGroupPreferences) {
      await SharedGroupPreferences.setItem('streak', 0, GROUP_ID);
      await SharedGroupPreferences.setItem('gutScore', 0, GROUP_ID);
      await SharedGroupPreferences.setItem('lastCheckIn', '', GROUP_ID);
    }
  } catch {
    // Best-effort, like the write path. purgeAllLocalData records the failure.
  }

  reloadWidget();
}

/**
 * Trigger widget timeline reload after data update.
 */
export function reloadWidget(): void {
  if (Platform.OS !== 'ios') return;
  try {
    const { WidgetExtension } = NativeModules;
    WidgetExtension?.reloadAllTimelines?.();
  } catch {
    // Best-effort
  }
}
