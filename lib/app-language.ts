export const APP_LANGUAGE_STORAGE_KEY = 'gutwell_app_language';

export type AppLanguage = 'en' | 'de' | 'fa';

export const APP_LANGUAGE_OPTIONS: Array<{ value: AppLanguage; label: string }> = [
  { value: 'en', label: 'English' },
  { value: 'de', label: 'German' },
  { value: 'fa', label: 'فارسی' },
];

export function parseStoredLanguage(value: string | null): AppLanguage {
  if (value === 'de' || value === 'fa') return value;
  return 'en';
}

export function isRtlLanguage(language: AppLanguage): boolean {
  return language === 'fa';
}
