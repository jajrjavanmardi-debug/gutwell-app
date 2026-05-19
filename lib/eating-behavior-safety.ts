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
    title: 'A tracking pause may help',
    body:
      'You have run several analyses recently. If tracking starts to feel stressful, pause for a while and come back when it feels useful.',
  },
  de: {
    title: 'Eine Tracking-Pause kann guttun',
    body:
      'Du hast zuletzt mehrere Analysen gestartet. Wenn Tracking stressig wird, pausiere eine Weile und komm zurück, wenn es sich hilfreich anfühlt.',
  },
  fa: {
    title: 'یک وقفه از پیگیری می‌تواند کمک کند',
    body:
      'اخیراً چندین تحلیل انجام داده‌اید. اگر پیگیری برایتان استرس‌زا شد، مدتی مکث کنید و وقتی مفید بود برگردید.',
  },
};

const LOW_VARIETY_COPY: Record<AppLanguage, EatingBehaviorSafetyCopy> = {
  en: {
    title: 'Variety can stay flexible',
    body:
      'The same meal appears often in recent logs. That can be completely okay; try not to let tracking make meals feel scary or restricted.',
  },
  de: {
    title: 'Abwechslung darf flexibel bleiben',
    body:
      'Eine ähnliche Mahlzeit taucht in letzter Zeit öfter auf. Das kann völlig okay sein; versuche, Tracking nicht zu Angst oder starren Regeln werden zu lassen.',
  },
  fa: {
    title: 'تنوع می‌تواند انعطاف‌پذیر بماند',
    body:
      'در ثبت‌های اخیر، یک وعده مشابه چند بار دیده می‌شود. این می‌تواند کاملاً طبیعی باشد؛ مراقب باشید پیگیری غذا باعث ترس یا محدودیت سخت‌گیرانه نشود.',
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
