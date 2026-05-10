import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type AppLanguage = 'en' | 'de' | 'fa';

export const APP_LANGUAGE_STORAGE_KEY = 'gutwell_app_language';

export const LANGUAGE_OPTIONS: Array<{
  code: AppLanguage;
  shortLabel: string;
  nativeLabel: string;
}> = [
  { code: 'en', shortLabel: 'EN', nativeLabel: 'English' },
  { code: 'de', shortLabel: 'DE', nativeLabel: 'Deutsch' },
  { code: 'fa', shortLabel: 'فا', nativeLabel: 'فارسی' },
];

type LanguageContextValue = {
  language: AppLanguage;
  isRtl: boolean;
  setLanguage: (nextLanguage: AppLanguage) => void;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function isAppLanguage(value: string | null): value is AppLanguage {
  return value === 'en' || value === 'de' || value === 'fa';
}

export function isLanguageRtl(language: AppLanguage): boolean {
  return language === 'fa';
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguage>('en');

  useEffect(() => {
    AsyncStorage.getItem(APP_LANGUAGE_STORAGE_KEY)
      .then((storedLanguage) => {
        if (isAppLanguage(storedLanguage)) {
          setLanguageState(storedLanguage);
        }
      })
      .catch(console.warn);
  }, []);

  const setLanguage = useCallback((nextLanguage: AppLanguage) => {
    setLanguageState(nextLanguage);
    AsyncStorage.setItem(APP_LANGUAGE_STORAGE_KEY, nextLanguage).catch(console.warn);
  }, []);

  const value = useMemo(
    () => ({
      language,
      isRtl: isLanguageRtl(language),
      setLanguage,
    }),
    [language, setLanguage]
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const value = useContext(LanguageContext);
  if (!value) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return value;
}
