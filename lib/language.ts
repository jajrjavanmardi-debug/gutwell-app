/**
 * lib/language.ts
 *
 * Single source of truth for the app's language preference.
 * Designed to be expanded to all screens in a later phase.
 *
 * Supported languages: English, German, Persian.
 * Persian is RTL. English and German are LTR.
 *
 * The preference is persisted to AsyncStorage under LANGUAGE_KEY.
 * Screens read it on mount and re-render when it changes via the
 * event emitter below.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { I18nManager } from 'react-native';

export type AppLanguage = 'en' | 'de' | 'fa';

export const LANGUAGE_KEY = 'app_language';

export const LANGUAGE_LABELS: Record<AppLanguage, string> = {
  en: 'English',
  de: 'Deutsch',
  fa: 'فارسی',
};

export const RTL_LANGUAGES: AppLanguage[] = ['fa'];

export function isRTL(lang: AppLanguage): boolean {
  return RTL_LANGUAGES.includes(lang);
}

/** Resolve the device locale to a supported language, or fall back to 'en'. */
export function deviceLanguage(): AppLanguage {
  try {
    const locale =
      (I18nManager as { locale?: string }).locale ??
      Intl.DateTimeFormat().resolvedOptions().locale ??
      'en';
    const tag = locale.toLowerCase();
    if (tag.startsWith('de')) return 'de';
    if (tag.startsWith('fa') || tag.startsWith('per')) return 'fa';
    return 'en';
  } catch {
    return 'en';
  }
}

/** Load persisted language, falling back to device locale then English. */
export async function loadLanguage(): Promise<AppLanguage> {
  try {
    const stored = await AsyncStorage.getItem(LANGUAGE_KEY);
    if (stored === 'en' || stored === 'de' || stored === 'fa') return stored;
  } catch {
    // ignore
  }
  return deviceLanguage();
}

/** Persist language choice. */
export async function saveLanguage(lang: AppLanguage): Promise<void> {
  await AsyncStorage.setItem(LANGUAGE_KEY, lang);
}
