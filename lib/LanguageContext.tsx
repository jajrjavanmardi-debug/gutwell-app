/**
 * lib/LanguageContext.tsx
 *
 * React context that provides the current AppLanguage to all screens.
 * Wrap the app root with <LanguageProvider> so useTranslation() works
 * everywhere without prop-drilling.
 *
 * Phase 2B/2C: import useLanguage() in each screen to read/set language.
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import { loadLanguage, saveLanguage } from './language';
import type { AppLanguage } from './i18n';

type LanguageContextType = {
  language: AppLanguage;
  setLanguage: (lang: AppLanguage) => Promise<void>;
};

export const LanguageContext = createContext<LanguageContextType>({
  language: 'en',
  setLanguage: async () => {},
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguage>('en');

  useEffect(() => {
    loadLanguage().then((lang) => setLanguageState(lang as AppLanguage));
  }, []);

  const setLanguage = async (lang: AppLanguage) => {
    await saveLanguage(lang);
    setLanguageState(lang);
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}

/**
 * useLanguage — read and set the current language from any component.
 * Usage:
 *   const { language, setLanguage } = useLanguage();
 */
export function useLanguage(): LanguageContextType {
  return useContext(LanguageContext);
}
