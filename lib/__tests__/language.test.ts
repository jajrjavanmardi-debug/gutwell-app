/**
 * Language preference tests — v1.0 supports English and German only.
 *
 * These exercise the real lib/language.ts used by LanguageProvider, including
 * the one-way migration of legacy values such as the Persian 'fa' that older
 * development installs may still hold.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { I18nManager } from 'react-native';
import {
  LANGUAGE_KEY,
  LANGUAGE_LABELS,
  SUPPORTED_LANGUAGES,
  asSupportedLanguage,
  deviceLanguage,
  loadLanguage,
  saveLanguage,
} from '../language';

function setDeviceLocale(locale: string) {
  (I18nManager as unknown as { locale?: string }).locale = locale;
}

beforeEach(async () => {
  await AsyncStorage.clear();
  setDeviceLocale('en-US');
});

describe('supported languages', () => {
  test('exposes exactly English and German, in that order', () => {
    expect(SUPPORTED_LANGUAGES).toEqual(['en', 'de']);
  });

  test('the selector labels contain only English and Deutsch', () => {
    expect(Object.keys(LANGUAGE_LABELS).sort()).toEqual(['de', 'en']);
    expect(Object.values(LANGUAGE_LABELS).sort()).toEqual(['Deutsch', 'English']);
  });

  test('no label contains Persian script', () => {
    for (const label of Object.values(LANGUAGE_LABELS)) {
      expect(label).not.toMatch(/[؀-ۿ]/);
    }
  });

  test('asSupportedLanguage rejects fa and any other unsupported value', () => {
    expect(asSupportedLanguage('en')).toBe('en');
    expect(asSupportedLanguage('de')).toBe('de');
    expect(asSupportedLanguage('fa')).toBeNull();
    expect(asSupportedLanguage('fa-IR')).toBeNull();
    expect(asSupportedLanguage('fr')).toBeNull();
    expect(asSupportedLanguage(undefined)).toBeNull();
    expect(asSupportedLanguage(null)).toBeNull();
    expect(asSupportedLanguage(42)).toBeNull();
  });
});

describe('deviceLanguage — first-launch default', () => {
  test('a German device defaults to German', () => {
    setDeviceLocale('de-DE');
    expect(deviceLanguage()).toBe('de');
  });

  test('Austrian and Swiss German also default to German', () => {
    setDeviceLocale('de-AT');
    expect(deviceLanguage()).toBe('de');
    setDeviceLocale('de-CH');
    expect(deviceLanguage()).toBe('de');
  });

  test('a Persian device now defaults to English, not Persian', () => {
    setDeviceLocale('fa-IR');
    expect(deviceLanguage()).toBe('en');
  });

  test('any other device language defaults to English', () => {
    for (const locale of ['en-GB', 'fr-FR', 'es-ES', 'ja-JP', 'tr-TR']) {
      setDeviceLocale(locale);
      expect(deviceLanguage()).toBe('en');
    }
  });
});

describe('loadLanguage / saveLanguage', () => {
  test('with nothing stored, falls back to the device language', async () => {
    setDeviceLocale('de-DE');
    await expect(loadLanguage()).resolves.toBe('de');
  });

  test('with nothing stored on a non-German device, falls back to English', async () => {
    setDeviceLocale('fr-FR');
    await expect(loadLanguage()).resolves.toBe('en');
  });

  test('a stored preference wins over the device language', async () => {
    setDeviceLocale('de-DE');
    await saveLanguage('en');
    await expect(loadLanguage()).resolves.toBe('en');
  });

  test('the choice persists — a reload returns the same value', async () => {
    await saveLanguage('de');
    await expect(loadLanguage()).resolves.toBe('de');
    await expect(loadLanguage()).resolves.toBe('de');
    expect(await AsyncStorage.getItem(LANGUAGE_KEY)).toBe('de');
  });

  test('a legacy "fa" preference migrates to English', async () => {
    await AsyncStorage.setItem(LANGUAGE_KEY, 'fa');
    await expect(loadLanguage()).resolves.toBe('en');
  });

  test('the "fa" migration is written back, so it happens only once', async () => {
    await AsyncStorage.setItem(LANGUAGE_KEY, 'fa');
    await loadLanguage();
    expect(await AsyncStorage.getItem(LANGUAGE_KEY)).toBe('en');
  });

  test('a legacy "fa" preference does not resurrect German on a German device', async () => {
    // The migration target is English specifically, not the device language:
    // the stored value was an explicit choice, and English is the fallback.
    setDeviceLocale('de-DE');
    await AsyncStorage.setItem(LANGUAGE_KEY, 'fa');
    await expect(loadLanguage()).resolves.toBe('en');
  });

  test('any other unsupported stored value falls back to English', async () => {
    for (const bad of ['fr', 'fa-IR', 'EN', '', 'null', '{}']) {
      await AsyncStorage.setItem(LANGUAGE_KEY, bad);
      await expect(loadLanguage()).resolves.toBe('en');
    }
  });

  test('saveLanguage coerces an unsupported value to English rather than storing it', async () => {
    await saveLanguage('fa' as never);
    expect(await AsyncStorage.getItem(LANGUAGE_KEY)).toBe('en');
  });
});
