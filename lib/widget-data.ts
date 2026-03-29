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
