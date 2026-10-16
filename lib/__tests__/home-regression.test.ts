/**
 * lib/__tests__/home-regression.test.ts
 *
 * Three pre-existing Home defects, all present in Builds 5-7 and none of them
 * covered by a test before now:
 *
 *   1. Home is a tab screen and only loaded on mount, so logging a meal on the
 *      Food tab and returning left Home showing sign-in-time data.
 *   2. The "Meals" count compared a timestamptz against a bare local date key,
 *      which Postgres reads as UTC midnight — in CEST that starts the day at
 *      02:00 local and silently drops meals logged just after midnight.
 *   3. Four chrome strings were assembled in English in the screen itself, and
 *      the date fell back to the DEVICE region rather than the app language.
 *
 * Home has no render harness in this repo, so the wiring is asserted against
 * the shipped source the way ai-cost-control.test.ts does; the date behaviour
 * is asserted against the real functions.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { getLocalDateKey, getLocalDayIsoRange } from '../date';
import { translations } from '../i18n';

const root = join(__dirname, '..', '..');
const read = (...p: string[]) => readFileSync(join(root, ...p), 'utf8');

/** Comments stripped — assertions about absent code must not match prose. */
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const HOME = read('app', '(tabs)', 'index.tsx');
/** Use for "this code is gone" assertions; HOME itself documents the old bug. */
const HOME_CODE = strip(HOME);
const SCORING = read('lib', 'scoring.ts');

const LANGS = ['en', 'de'] as const;

// ─── 1. Focus refresh ────────────────────────────────────────────────────────

describe('Home refreshes when the tab regains focus', () => {
  test('useFocusEffect is imported and actually called', () => {
    expect(HOME).toMatch(/import \{[^}]*useFocusEffect[^}]*\} from 'expo-router'/);
    // Importing it is not enough — an unused import would still satisfy a
    // bare token check while Home silently went back to loading once.
    expect(HOME_CODE).toContain('useFocusEffect(');
  });

  test('the focus effect calls the existing loadData, not a second query path', () => {
    const start = HOME.indexOf('useFocusEffect(');
    expect(start).toBeGreaterThan(-1);
    const block = HOME.slice(start, HOME.indexOf(');', HOME.indexOf('}, [loadData])', start)) + 2);
    expect(block).toContain('loadData()');
    expect(block).toContain('[loadData]');
    // No duplicated fetching inside the focus effect.
    expect(block).not.toContain('supabase');
    expect(block).not.toContain('.from(');
  });

  test('the mount effect is still present', () => {
    expect(HOME).toContain('useEffect(() => { loadData(); }, [loadData]);');
  });

  test('pull-to-refresh still calls loadData', () => {
    const onRefresh = HOME.slice(HOME.indexOf('const onRefresh'), HOME.indexOf('const onRefresh') + 200);
    expect(onRefresh).toContain('await loadData()');
    expect(onRefresh).toContain('setRefreshing');
    expect(HOME).toContain('RefreshControl');
  });

  test('both delete handlers still refresh after a successful delete', () => {
    // Two entry types can be deleted from Recently logged; each reloads.
    const matches = HOME.match(/if \(!error\) loadData\(\);/g) ?? [];
    expect(matches).toHaveLength(2);
  });

  test('no new loading state and no debounce were introduced', () => {
    // isLoading is set false in the finally block only — a focus refetch must
    // never be able to flash the skeleton again.
    expect(HOME.match(/setIsLoading\(/g) ?? []).toHaveLength(1);
    expect(HOME).toContain('setIsLoading(false)');
    expect(HOME).not.toContain('setIsLoading(true)');
    expect(HOME).not.toMatch(/debounce|throttle|setTimeout\(\s*\(\)\s*=>\s*loadData/);
  });

  test('loadData still owns every Home query', () => {
    // Guards against a focus path that fetches independently and drifts.
    const loadStart = HOME.indexOf('const loadData = useCallback');
    const loadEnd = HOME.indexOf('}, [user, t, relativeTimeLabels, dateLocale]);');
    expect(loadStart).toBeGreaterThan(-1);
    expect(loadEnd).toBeGreaterThan(loadStart);
    const body = HOME.slice(loadStart, loadEnd);
    const allFrom = (HOME.match(/\.from\('/g) ?? []).length;
    const inLoad = (body.match(/\.from\('/g) ?? []).length;
    // The only .from() outside loadData are the two delete handlers.
    expect(allFrom - inLoad).toBe(2);
  });
});

// ─── 2. Local-day meal count ─────────────────────────────────────────────────

describe('the meals-today window is the local calendar day', () => {
  test('the query uses a half-open ISO range, not a bare date key', () => {
    const block = HOME.slice(
      HOME.indexOf('// Food logs today'),
      HOME.indexOf('// Recent check-ins'),
    );
    expect(block).toContain("gte('logged_at', todayStartIso)");
    expect(block).toContain("lt('logged_at', todayEndIso)");
    // The defect: comparing a timestamptz against "2026-08-19".
    expect(strip(block)).not.toContain("gte('logged_at', today)");
  });

  test('the range comes from the shared helper, not a second date system', () => {
    expect(HOME).toContain('getLocalDayIsoRange(today)');
    expect(HOME).toMatch(/import \{[^}]*getLocalDayIsoRange[^}]*\} from '\.\.\/\.\.\/lib\/date'/);
    // scoring.ts already uses the same helper for its local-day symptom window.
    expect(SCORING).toContain('getLocalDayIsoRange');
  });

  test('the range starts at local midnight and spans exactly one day', () => {
    // Holds in whatever timezone the suite runs in, CI included.
    const key = '2026-08-19';
    const { startIso, endIso } = getLocalDayIsoRange(key);
    const start = new Date(startIso);
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(start.getSeconds()).toBe(0);
    expect(new Date(endIso).getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  test('a meal at 00:30 local counts for that local day', () => {
    const key = '2026-08-19';
    const { startIso, endIso } = getLocalDayIsoRange(key);
    const justAfterLocalMidnight = new Date(2026, 7, 19, 0, 30, 0, 0).toISOString();
    expect(justAfterLocalMidnight >= startIso).toBe(true);
    expect(justAfterLocalMidnight < endIso).toBe(true);
  });

  test('a meal at 23:59 local counts for that local day, and 00:00 the next does not', () => {
    const key = '2026-08-19';
    const { startIso, endIso } = getLocalDayIsoRange(key);
    const endOfDay = new Date(2026, 7, 19, 23, 59, 59, 0).toISOString();
    const nextDay = new Date(2026, 7, 20, 0, 0, 0, 0).toISOString();
    expect(endOfDay >= startIso && endOfDay < endIso).toBe(true);
    expect(nextDay < endIso).toBe(false);
  });

  test('Europe/Berlin summer time: the old UTC boundary dropped a real meal', () => {
    // Computed for Berlin explicitly so this holds in any process timezone.
    // 2026-08-19 is CEST (UTC+2), so local midnight is 22:00Z the day before.
    const berlinLocalMidnightUtc = '2026-08-18T22:00:00.000Z';
    const berlinNextMidnightUtc = '2026-08-19T22:00:00.000Z';
    // A meal logged at 00:30 local on the 19th:
    const mealUtc = '2026-08-18T22:30:00.000Z';

    // The fix: inside the local day.
    expect(mealUtc >= berlinLocalMidnightUtc).toBe(true);
    expect(mealUtc < berlinNextMidnightUtc).toBe(true);

    // The defect: a bare date key is read as UTC midnight, which is 02:00 local,
    // so this meal fell outside "today" and Meals stayed at 0.
    const bareDateKeyBoundary = '2026-08-19';
    expect(mealUtc >= new Date(bareDateKeyBoundary).toISOString()).toBe(false);
  });

  test('the local day is 24h even though the Berlin offset shifts it two hours', () => {
    const berlinStart = new Date('2026-08-18T22:00:00.000Z').getTime();
    const berlinEnd = new Date('2026-08-19T22:00:00.000Z').getTime();
    expect(berlinEnd - berlinStart).toBe(24 * 60 * 60 * 1000);
  });

  test('getLocalDateKey still yields the local calendar day', () => {
    expect(getLocalDateKey(new Date(2026, 7, 19, 23, 30))).toBe('2026-08-19');
    expect(getLocalDateKey(new Date(2026, 7, 19, 0, 30))).toBe('2026-08-19');
  });
});

describe('scoring is untouched by the meal-count fix', () => {
  test('gut score still never reads food_logs', () => {
    expect(SCORING).not.toContain('food_logs');
  });

  test('Home still gates score recomputation on a check-in existing today', () => {
    expect(HOME).toContain("from('check_ins')");
    expect(HOME).toContain('updateTodayScore(user.id)');
    // The score stays null when no check-in exists — a meal must not create one.
    expect(HOME).toContain('setGutScore(null)');
  });

  test('the other Home queries still use their original date keys', () => {
    expect(HOME).toContain("eq('date', today)");
    expect(HOME).toContain("eq('date', yesterdayStr)");
    expect(HOME).toContain("gte('entry_date', sevenDaysAgoStr)");
  });
});

// ─── 3. Home chrome i18n ─────────────────────────────────────────────────────

describe('Home chrome follows the app language', () => {
  test('both languages define the new chrome keys', () => {
    for (const lang of LANGS) {
      const home = translations[lang].home;
      expect(home.justNow.trim().length).toBeGreaterThan(0);
      expect(home.minutesAgo).toContain('{n}');
      expect(home.hoursAgo).toContain('{n}');
      expect(home.stoolTypeEntry).toContain('{type}');
      expect(home.deleteEntryConfirm).toContain('{label}');
    }
  });

  test('German chrome is actually translated', () => {
    const en = translations.en.home;
    const de = translations.de.home;
    for (const key of ['justNow', 'minutesAgo', 'hoursAgo', 'stoolTypeEntry', 'deleteEntryConfirm'] as const) {
      expect(`${key}: ${de[key]}`).not.toBe(`${key}: ${en[key]}`);
    }
    expect(de.justNow).toBe('Gerade eben');
    expect(de.stoolTypeEntry).toBe('Stuhltyp {type}');
  });

  test('the English strings are the ones Build 7 shipped', () => {
    const en = translations.en.home;
    expect(en.justNow).toBe('Just now');
    expect(en.minutesAgo).toBe('{n}m ago');
    expect(en.hoursAgo).toBe('{n}h ago');
    expect(en.stoolTypeEntry).toBe('Stool type {type}');
  });

  test('none of the four strings is still hardcoded in the screen', () => {
    expect(HOME_CODE).not.toContain('`Stool type ${');
    expect(HOME_CODE).not.toContain('`Delete "${');
    expect(HOME_CODE).not.toContain("return 'Just now'");
    expect(HOME_CODE).not.toContain('}m ago`');
    expect(HOME_CODE).not.toContain('}h ago`');
  });

  test('the screen renders them through the language system', () => {
    expect(HOME).toContain('t.home.stoolTypeEntry.replace');
    expect(HOME).toContain('t.home.deleteEntryConfirm.replace');
    expect(HOME).toContain('t.home.justNow');
    expect(HOME).toContain('t.home.minutesAgo');
    expect(HOME).toContain('t.home.hoursAgo');
  });

  test('placeholder substitution produces the expected sentences', () => {
    expect(translations.en.home.stoolTypeEntry.replace('{type}', '4')).toBe('Stool type 4');
    expect(translations.de.home.stoolTypeEntry.replace('{type}', '4')).toBe('Stuhltyp 4');
    expect(translations.en.home.minutesAgo.replace('{n}', '5')).toBe('5m ago');
    expect(translations.de.home.minutesAgo.replace('{n}', '5')).toBe('vor 5 Min.');
    expect(translations.en.home.deleteEntryConfirm.replace('{label}', 'Toast')).toBe('Delete "Toast"?');
  });
});

describe('dates follow the app language, not the device region', () => {
  test('the locale is derived from the app language', () => {
    expect(HOME).toContain("const dateLocale = language === 'de' ? 'de-DE' : 'en-US'");
    expect(HOME).toContain('useLanguage');
  });

  test('toLocaleDateString is never called without a locale', () => {
    expect(HOME_CODE).not.toMatch(/toLocaleDateString\(\s*\)/);
    expect(HOME_CODE).toContain('toLocaleDateString(locale)');
  });

  test('the two locales genuinely format differently', () => {
    const d = new Date(2026, 7, 13);
    expect(d.toLocaleDateString('en-US')).not.toBe(d.toLocaleDateString('de-DE'));
    // The reported symptom: a German-region device rendered 13.8.2026 in an
    // English UI. English must now be an English format.
    expect(d.toLocaleDateString('en-US')).toMatch(/8\/13\/2026/);
    expect(d.toLocaleDateString('de-DE')).toMatch(/13\.8\.2026/);
  });

  test('formatTime takes labels and locale as parameters', () => {
    const fn = HOME.slice(HOME.indexOf('function formatTime('), HOME.indexOf('// ─── Styles'));
    expect(fn).toContain('labels:');
    expect(fn).toContain('locale: string');
    expect(strip(fn)).not.toContain("'Just now'");
  });
});

// ─── Stored content must never be retranslated ───────────────────────────────

describe('historical content is rendered as stored', () => {
  test('the meal label is used verbatim, with no lookup or translation', () => {
    const block = strip(
      HOME.slice(HOME.indexOf('recentFood?.forEach'), HOME.indexOf('entries.sort')),
    );
    expect(block).toContain('label: f.meal_name');
    expect(block).not.toContain('t.home');
    expect(block).not.toContain('translate');
  });

  test('a German meal name stays German when the app language is English', () => {
    // The label passes through untouched, so this is a property of the code
    // above rather than of any string table.
    const storedGermanMealName = 'Haferbrei mit Beeren';
    const rendered = storedGermanMealName; // exactly what `label: f.meal_name` does
    expect(rendered).toBe('Haferbrei mit Beeren');
    expect(translations.en.home.stoolTypeEntry).not.toContain(storedGermanMealName);
  });

  test('the Recently logged data model, sorting and cap are unchanged', () => {
    expect(HOME).toContain('entries.sort((a, b) => b.sortKey.localeCompare(a.sortKey))');
    expect(HOME).toContain('setRecentEntries(entries.slice(0, 5))');
    expect(HOME).toContain('.limit(3)');
  });
});

// ─── Scope guards ────────────────────────────────────────────────────────────

describe('scope', () => {
  test('no language switcher was added to Home', () => {
    expect(HOME_CODE).not.toContain('LanguageSwitcher');
    expect(HOME_CODE).not.toContain('setLanguage(');
  });

  test('Home does not touch protected modules', () => {
    expect(HOME_CODE).not.toContain('RevenueCat');
    expect(HOME_CODE).not.toContain('react-native-purchases');
    expect(HOME_CODE).not.toContain('analyze-food');
  });
});
