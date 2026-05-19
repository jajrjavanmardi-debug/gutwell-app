import type { AppLanguage } from './app-language';
import type { PhotoAnalysisHistoryItem } from './photo-analysis-history';

export type EatingBehaviorSafetyCopy = {
  title: string;
  body: string;
};

const FREQUENT_ANALYSIS_THRESHOLD = 6;
const REPEATED_MEAL_THRESHOLD = 3;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const VARIETY_WINDOW_MS = 7 * ONE_DAY_MS;

const BASE_COPY: Record<AppLanguage, EatingBehaviorSafetyCopy> = {
  en: {
    title: 'Keep tracking gentle',
    body:
      'Symptoms have many causes, and not every symptom is caused by food. Food tracking should not create fear; taking breaks from tracking is okay.',
  },
  de: {
    title: 'Tracking darf sanft bleiben',
    body:
      'Symptome können viele Ursachen haben, und nicht jedes Symptom kommt vom Essen. Essens-Tracking soll keine Angst machen; Pausen vom Tracken sind okay.',
  },
  fa: {
    title: 'پیگیری را ملایم نگه دارید',
    body:
      'علائم می‌توانند علت‌های زیادی داشته باشند و هر علامتی از غذا نیست. پیگیری غذا نباید باعث ترس شود؛ فاصله گرفتن از ثبت و پیگیری کاملاً اشکالی ندارد.',
  },
};

const FREQUENT_COPY: Record<AppLanguage, EatingBehaviorSafetyCopy> = {
  en: {
    title: 'A gentle tracking reminder',
    body:
      'You seem to be tracking a lot. NutriFlow is here to support awareness, not control. Taking breaks is okay.',
  },
  de: {
    title: 'Sanfte Erinnerung zum Tracking',
    body:
      'Du scheinst gerade viel zu tracken. NutriFlow ist dafür da, Bewusstsein zu unterstützen, nicht Kontrolle. Pausen sind okay.',
  },
  fa: {
    title: 'یادآوری ملایم برای پیگیری',
    body:
      'به نظر می‌رسد این روزها زیاد پیگیری می‌کنید. NutriFlow برای حمایت از آگاهی است، نه کنترل. فاصله گرفتن اشکالی ندارد.',
  },
};

const LOW_VARIETY_COPY: Record<AppLanguage, EatingBehaviorSafetyCopy> = {
  en: {
    title: 'Variety can stay flexible',
    body:
      'Similar meals appear often in recent logs. NutriFlow is here to support awareness, not control. Taking breaks is okay, and variety can stay flexible.',
  },
  de: {
    title: 'Abwechslung darf flexibel bleiben',
    body:
      'Ähnliche Mahlzeiten tauchen zuletzt öfter auf. NutriFlow unterstützt Bewusstsein, nicht Kontrolle. Pausen sind okay, und Abwechslung darf flexibel bleiben.',
  },
  fa: {
    title: 'تنوع می‌تواند انعطاف‌پذیر بماند',
    body:
      'در ثبت‌های اخیر، وعده‌های مشابه چند بار دیده می‌شود. NutriFlow برای حمایت از آگاهی است، نه کنترل. فاصله گرفتن اشکالی ندارد و تنوع می‌تواند انعطاف‌پذیر بماند.',
  },
};

function normalizeMealName(value: string): string {
  return value
    .toLocaleLowerCase()
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getTimestamp(item: PhotoAnalysisHistoryItem): number {
  const timestamp = Date.parse(item.createdAt);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function getEatingBehaviorSafetyCopy(language: AppLanguage): EatingBehaviorSafetyCopy {
  return BASE_COPY[language] ?? BASE_COPY.en;
}

export function getTrackingSafetyReminder(
  history: readonly PhotoAnalysisHistoryItem[],
  language: AppLanguage,
): EatingBehaviorSafetyCopy | null {
  const now = Date.now();
  const recentDayCount = history.filter((item) => now - getTimestamp(item) <= ONE_DAY_MS).length;
  if (recentDayCount >= FREQUENT_ANALYSIS_THRESHOLD) {
    return FREQUENT_COPY[language] ?? FREQUENT_COPY.en;
  }

  const recentMealNames = history
    .filter((item) => now - getTimestamp(item) <= VARIETY_WINDOW_MS)
    .map((item) => normalizeMealName(item.mealName))
    .filter((mealName) => mealName.length > 0 && !/^(meal photo|photo meal|mahlzeit|غذای عکس)$/i.test(mealName));

  if (recentMealNames.length < 4) return null;

  const counts = new Map<string, number>();
  recentMealNames.forEach((mealName) => counts.set(mealName, (counts.get(mealName) ?? 0) + 1));
  const maxRepeatCount = Math.max(0, ...counts.values());
  if (maxRepeatCount >= REPEATED_MEAL_THRESHOLD && counts.size <= 2) {
    return LOW_VARIETY_COPY[language] ?? LOW_VARIETY_COPY.en;
  }

  return null;
}
