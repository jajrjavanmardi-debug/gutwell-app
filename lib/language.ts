/**
 * lib/language.ts
 *
 * Single source of truth for the app's language preference.
 *
 * v1.0 launch scope: English (primary, default and permanent fallback) and
 * German. English is always the fallback for anything unrecognised.
 *
 * Both supported languages are left-to-right, so the app contains no RTL
 * handling. Any future RTL language needs a fresh implementation rather than
 * a revived helper.
 *
 * The preference is persisted to AsyncStorage under LANGUAGE_KEY. It is read
 * once by LanguageProvider on mount; every screen then reads it from context,
 * so a change propagates across the whole app immediately.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { I18nManager } from 'react-native';

export type AppLanguage = 'en' | 'de';

export const LANGUAGE_KEY = 'app_language';

/** The only languages the app accepts, in selector order. */
export const SUPPORTED_LANGUAGES: AppLanguage[] = ['en', 'de'];

export const LANGUAGE_LABELS: Record<AppLanguage, string> = {
  en: 'English',
  de: 'Deutsch',
};

/** Narrow an arbitrary value to a supported language, or null if unsupported. */
export function asSupportedLanguage(value: unknown): AppLanguage | null {
  return value === 'en' || value === 'de' ? value : null;
}

/** Resolve the device locale to a supported language, or fall back to 'en'. */
export function deviceLanguage(): AppLanguage {
  try {
    const locale =
      (I18nManager as { locale?: string }).locale ??
      Intl.DateTimeFormat().resolvedOptions().locale ??
      'en';
    return locale.toLowerCase().startsWith('de') ? 'de' : 'en';
  } catch {
    return 'en';
  }
}

/**
 * Load the persisted language.
 *
 * Legacy installs may hold an unsupported value — most notably 'fa', which was
 * selectable before the v1.0 EN/DE decision. Any such value is migrated to 'en'
 * once, written back, and never honoured again.
 */
export async function loadLanguage(): Promise<AppLanguage> {
  try {
    const stored = await AsyncStorage.getItem(LANGUAGE_KEY);
    if (stored === null) return deviceLanguage();

    const supported = asSupportedLanguage(stored);
    if (supported) return supported;

    // One-way migration of a legacy or corrupt value.
    await saveLanguage('en');
    return 'en';
  } catch {
    return deviceLanguage();
  }
}

/** Persist language choice. Unsupported values are coerced to English. */
export async function saveLanguage(lang: AppLanguage): Promise<void> {
  await AsyncStorage.setItem(LANGUAGE_KEY, asSupportedLanguage(lang) ?? 'en');
}
