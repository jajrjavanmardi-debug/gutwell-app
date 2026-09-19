/**
 * Home greeting, hero state, and the Stage 3B presentation contract.
 *
 * The greeting helpers are pure and live in lib/date.ts, so the boundaries and
 * the name sanitizer are tested directly. Everything about the screen itself is
 * tested by source inspection, the convention the other screen suites use —
 * and here that is mostly ABSENCE: the fake pagination dots, the inert date
 * strip, the hardcoded English, and the large "--" must all be gone, and
 * absence is what source inspection is good at.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

import { getDayPart, usableDisplayName } from '../date';
import { translations } from '../i18n';

const HOME = readFileSync(join(__dirname, '..', '..', 'app', '(tabs)', 'index.tsx'), 'utf8');

/**
 * Source with comments stripped.
 *
 * The screen documents what it removed ("pagination dots ... were removed"),
 * so absence assertions have to read code only or they fail on the note
 * explaining the fix.
 */
const CODE = HOME.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const en = translations.en.home;
const de = translations.de.home;

/** Local Date at a given hour — the helpers read getHours(), which is local. */
const at = (hour: number, minute = 0) => new Date(2026, 7, 28, hour, minute, 0, 0);

// ── 1. Greeting boundaries ──────────────────────────────────────────────────

describe('getDayPart boundaries', () => {
  test.each([
    [4, 59, 'evening'],
    [5, 0, 'morning'],
    [11, 59, 'morning'],
    [12, 0, 'afternoon'],
    [17, 59, 'afternoon'],
    [18, 0, 'evening'],
  ])('%s:%s is %s', (h, m, expected) => {
    expect(getDayPart(at(h as number, m as number))).toBe(expected);
  });

  test('evening wraps past midnight rather than becoming morning', () => {
    // 01:00 is still "evening" to the person awake at 01:00. "Good morning"
    // at that hour reads as a bug.
    for (const h of [0, 1, 2, 3, 4]) {
      expect(getDayPart(at(h))).toBe('evening');
    }
  });

  test('every hour of the day maps to exactly one part', () => {
    const parts = Array.from({ length: 24 }, (_, h) => getDayPart(at(h)));
    expect(parts).toHaveLength(24);
    expect(new Set(parts)).toEqual(new Set(['morning', 'afternoon', 'evening']));
  });

  test('it reads local time, never UTC', () => {
    // getHours() is local by definition; getUTCHours() is not used anywhere in
    // the helper. This pins the choice rather than assuming it.
    const dateSrc = readFileSync(join(__dirname, '..', 'date.ts'), 'utf8');
    const helper = dateSrc.slice(dateSrc.indexOf('export function getDayPart'));
    expect(helper).toContain('getHours()');
    expect(helper).not.toContain('getUTCHours');
  });
});

// ── 2. Display-name sanitizer ───────────────────────────────────────────────

describe('usableDisplayName', () => {
  test.each([
    ['Jafar', 'Jafar'],
    ['  Jafar  ', 'Jafar'],
    ['Anna-Lena', 'Anna-Lena'],
    ['Zoë', 'Zoë'],
  ])('accepts %s', (input, expected) => {
    expect(usableDisplayName(input)).toBe(expected);
  });

  test.each([
    ['null', null],
    ['undefined', undefined],
    ['empty', ''],
    ['whitespace', '   '],
    ['number', 42],
    ['object', { name: 'x' }],
    ['array', ['x']],
    ['placeholder User', 'User'],
    ['placeholder lowercase user', 'user'],
    ['placeholder Nutzer', 'Nutzer'],
    ['placeholder Test', 'Test'],
    ['placeholder demo', 'demo'],
    ['literal null text', 'null'],
    ['literal undefined text', 'undefined'],
    ['digits only', '12345'],
    ['punctuation only', '---'],
  ])('rejects %s', (_label, input) => {
    expect(usableDisplayName(input)).toBeNull();
  });

  test('never derives a name from an email address', () => {
    // The whole address and the local part both rejected: showing someone
    // their own email handle as a first name is the malformed-placeholder case.
    expect(usableDisplayName('jafar@example.com')).toBeNull();
    expect(usableDisplayName('  hello@world.dev ')).toBeNull();
  });

  test('rejects a pasted sentence', () => {
    expect(usableDisplayName('x'.repeat(41))).toBeNull();
  });
});

// ── 3. The inert date strip is gone ─────────────────────────────────────────

describe('the non-functional date strip was removed', () => {
  test('Home no longer imports or renders DaySelector', () => {
    expect(CODE).not.toContain('DaySelector');
  });

  test('the selectedDate state that drove nothing is gone', () => {
    // It was passed to the strip and read by no query — loadData's deps never
    // included it, so every card showed today whatever was highlighted.
    expect(CODE).not.toContain('selectedDate');
    expect(CODE).not.toContain('setSelectedDate');
  });

  test('a non-interactive date line replaces it', () => {
    expect(CODE).toContain('todayLabel');
    expect(CODE).toContain('toLocaleDateString(dateLocale');
  });
});

// ── 4. Fake pagination dots are gone ────────────────────────────────────────

describe('the fake pagination dots were removed', () => {
  test('no dot row, dot style or active-dot style remains', () => {
    for (const token of ['statDotsRow', 'statDotActive', 'statDot']) {
      expect(CODE).not.toContain(token);
    }
  });

  test('no replacement carousel affordance was introduced', () => {
    expect(CODE).not.toMatch(/pagingEnabled|horizontal\s*$|FlatList/m);
  });
});

// ── 5. Contextual hero ──────────────────────────────────────────────────────

describe('the hero is chosen from data Home already has', () => {
  test('it branches on check-in status, then on meals logged', () => {
    const hero = CODE.slice(CODE.indexOf('const hero = useMemo'));
    const block = hero.slice(0, hero.indexOf('}, [checkedInToday'));
    expect(block).toContain('!checkedInToday');
    expect(block).toContain('mealsLoggedToday === 0');
    // Order matters: no check-in wins over no meal, because the check-in is
    // what produces a score, a streak and the 7-day count.
    expect(block.indexOf('!checkedInToday')).toBeLessThan(block.indexOf('mealsLoggedToday === 0'));
  });

  test('each state routes to an existing route', () => {
    const hero = CODE.slice(CODE.indexOf('const hero = useMemo'));
    const block = hero.slice(0, hero.indexOf('}, [checkedInToday'));
    expect(block).toContain("'/(tabs)/checkin'");
    expect(block).toContain("'/photo-analysis'");
    expect(block).toContain("'/(tabs)/progress'");
  });

  test('it depends only on already-loaded state', () => {
    expect(CODE).toContain('}, [checkedInToday, mealsLoggedToday, t]);');
  });

  test('no new query, AI call or entitlement check was added for it', () => {
    const hero = CODE.slice(CODE.indexOf('const hero = useMemo'));
    const block = hero.slice(0, hero.indexOf('}, [checkedInToday'));
    expect(block).not.toMatch(/supabase|isPremium|isPremiumFeature|analyze|fetch\(/i);
  });

  test('meal scan stays reachable when it is not the hero', () => {
    // A user who has checked in and logged a meal must still be able to scan
    // another without going via Progress.
    expect(CODE).toContain("hero.key !== 'meal'");
    expect(CODE).toContain('t.home.scanTitle');
  });

  test('all three hero copies exist in both languages', () => {
    for (const r of [en, de]) {
      for (const k of [
        'heroCheckinTitle',
        'heroCheckinSubtitle',
        'heroMealTitle',
        'heroMealSubtitle',
        'heroProgressTitle',
        'heroProgressSubtitle',
      ] as const) {
        expect((r as Record<string, string>)[k]).toBeTruthy();
      }
    }
  });
});

// ── 6/7/8. Score presentation ───────────────────────────────────────────────

describe('score presentation', () => {
  test('provenance copy is rendered whenever a score is shown', () => {
    expect(CODE).toContain('t.home.scoreProvenance');
    expect(en.scoreProvenance).toMatch(/check-in/i);
    expect(de.scoreProvenance).toMatch(/Check-in/i);
  });

  test('the title names the app, not a clinical measure', () => {
    expect(en.scoreTitle).toBe("Today's GutWell Score");
    expect(de.scoreTitle).toBe('Heutiger GutWell-Score');
  });

  test('labels describe the day, not the organ', () => {
    for (const r of [en, de]) {
      const rec = r as Record<string, string>;
      for (const k of ['dayLabelSettled', 'dayLabelMixed', 'dayLabelTougher']) {
        expect(rec[k]).toBeTruthy();
        // No body part, no care instruction, no health verdict.
        expect(rec[k]).not.toMatch(/gut\b|darm|thriv|needs care|healthy|unhealthy|risk|Risiko/i);
      }
    }
  });

  test('the organ-state labels are gone from the screen', () => {
    for (const token of ['thrivingGut', 'settlingIn', 'needsCare']) {
      expect(CODE).not.toContain(token);
    }
  });

  test('no large "--" placeholder is rendered for a missing score', () => {
    // A big "--" inside a ring reads as a failed load, not as "not yet".
    expect(CODE).not.toContain("'--'");
    expect(CODE).toContain('t.home.scoreEmptyTitle');
    expect(CODE).toContain('t.home.scoreEmptyBody');
  });

  test('the empty state says a check-in is what creates the score', () => {
    // Also the honest answer on a meal-only day: meals do not feed the score.
    expect(en.scoreEmptyBody).toMatch(/check-in/i);
    expect(de.scoreEmptyBody).toMatch(/Check-in/i);
    expect(en.scoreEmptyBody).not.toMatch(/meal|photo/i);
    expect(de.scoreEmptyBody).not.toMatch(/Mahlzeit|Foto/i);
  });

  test('the scoring module and its thresholds are untouched', () => {
    const scoring = readFileSync(join(__dirname, '..', 'scoring.ts'), 'utf8');
    expect(scoring).toContain('let score = 50;');
    expect(scoring).toContain('REGULARITY_BONUS_MIN_CHECKINS = 5');
    expect(scoring).not.toContain('food_logs');
    // The presentation thresholds still read 70 / 40.
    expect(CODE).toContain('gutScore >= 70');
    expect(CODE).toContain('gutScore >= 40');
  });
});

// ── 9. Consistency as a count ───────────────────────────────────────────────

describe('7-day check-ins are shown as a count', () => {
  test('the visible value is never a percentage', () => {
    expect(CODE).not.toContain('Math.round(completionRate * 100)');
    expect(CODE).toContain('consistencyValue');
  });

  test('zero reads as an invitation, not a score', () => {
    expect(en.consistencyStart).toBe('Start today');
    expect(de.consistencyStart).toBeTruthy();
    expect(de.consistencyStart).not.toBe(en.consistencyStart);
  });

  test('one to seven read as "{n} of 7 days"', () => {
    expect(en.consistencyCount.replace('{n}', '1')).toBe('1 of 7 days');
    expect(en.consistencyCount.replace('{n}', '7')).toBe('7 of 7 days');
    expect(de.consistencyCount).toContain('{n}');
  });

  test('the underlying rolling calculation is unchanged', () => {
    // Still checkedCount / 7 over the trailing seven local days, and the rate
    // still drives the progress bar — only the readout changed.
    expect(CODE).toContain('setCompletionRate(checkedCount / 7)');
    expect(CODE).toContain('progress={completionRate}');
  });

  test('the label does not imply meals or symptoms count toward it', () => {
    expect(en.labelCheckins7d).toBe('7-day check-ins');
    for (const label of [en.labelCheckins7d, de.labelCheckins7d]) {
      expect(label).not.toMatch(/meal|Mahlzeit|symptom|Symptom/i);
    }
  });
});

// ── 10. Localization ────────────────────────────────────────────────────────

describe('no Home-visible English is hardcoded', () => {
  test("'Done' and 'vs yesterday' moved into i18n", () => {
    expect(CODE).not.toContain("'Done'");
    expect(CODE).not.toContain('vs yesterday');
    expect(CODE).toContain('t.home.checkinDone');
    expect(CODE).toContain('t.home.vsYesterday');
  });

  test('every new Home key exists in both languages and differs', () => {
    const KEYS = [
      'greetingMorning',
      'greetingAfternoon',
      'greetingEvening',
      'scoreTitle',
      'scoreProvenance',
      'scoreEmptyTitle',
      'scoreEmptyBody',
      'dayLabelSettled',
      'dayLabelMixed',
      'dayLabelTougher',
      'heroCheckinTitle',
      'heroMealTitle',
      'heroProgressTitle',
      'checkinDone',
      'checkinPending',
      'labelCheckins7d',
      'consistencyStart',
      'latestActivity',
      'emptyActivityTitle',
      'vsYesterday',
    ] as const;
    for (const k of KEYS) {
      const e = (en as Record<string, string>)[k];
      const d = (de as Record<string, string>)[k];
      expect(e).toBeTruthy();
      expect(d).toBeTruthy();
      expect(`${k}: ${d}`).not.toBe(`${k}: ${e}`);
    }
  });

  test('the German greetings are the conventional forms', () => {
    expect(de.greetingMorning).toBe('Guten Morgen');
    expect(de.greetingAfternoon).toBe('Guten Tag');
    expect(de.greetingEvening).toBe('Guten Abend');
  });

  test('the name is appended through a template, not concatenated', () => {
    expect(en.greetingWithName).toContain('{greeting}');
    expect(en.greetingWithName).toContain('{name}');
    expect(
      en.greetingWithName.replace('{greeting}', 'Good morning').replace('{name}', 'Jafar'),
    ).toBe('Good morning, Jafar');
  });

  test('the retired activity title is gone from both languages', () => {
    expect((en as Record<string, unknown>).recentlyLogged).toBeUndefined();
    expect((de as Record<string, unknown>).recentlyLogged).toBeUndefined();
  });
});

// ── 11. Reduced motion ──────────────────────────────────────────────────────

describe('reduced motion', () => {
  test('Home reads the shared hook', () => {
    expect(HOME).toContain('useReducedMotion');
  });

  test('the entrance starts settled and schedules nothing', () => {
    expect(CODE).toContain('new Animated.Value(reduceMotion ? 1 : 0)');
    expect(CODE).toContain('new Animated.Value(reduceMotion ? 0 : 20)');
    expect(CODE).toContain('fadeAnim.setValue(1)');
    expect(CODE).toContain('slideAnim.setValue(0)');
  });

  test('the animation is cleaned up on unmount', () => {
    expect(CODE).toContain('animation.stop()');
  });

  test('pull-to-refresh survives', () => {
    expect(CODE).toContain('RefreshControl');
  });
});

// ── 12/13. Nothing else moved ───────────────────────────────────────────────

describe('data and query semantics are unchanged', () => {
  test('loadData still issues exactly the same queries it did before', () => {
    const load = CODE.slice(CODE.indexOf('const loadData'), CODE.indexOf('useEffect(() => { loadData'));
    // Six in the parallel block (2× gut_scores, 2× check_ins, 2× food_logs)
    // plus the conditional check_ins count that gates score recomputation.
    // Removing the date strip removed a control, not a query.
    expect((load.match(/supabase\s*\n?\s*\.from\(/g) ?? []).length).toBe(7);
    expect(load).toContain('getStreakSnapshot(user.id)');
  });

  test('no symptom query was added to the activity list', () => {
    expect(CODE).not.toContain("from('symptoms')\n        .select('id, ");
    const load = CODE.slice(CODE.indexOf('const loadData'), CODE.indexOf('useEffect(() => { loadData'));
    expect(load).not.toContain("from('symptoms')");
  });

  test('the local-day helpers are still the date source', () => {
    expect(CODE).toContain('getLocalDateKey()');
    expect(CODE).toContain('getLocalDayIsoRange(today)');
    expect(CODE).toContain('addDaysToLocalDateKey');
  });

  test('the greeting recomputes on focus', () => {
    // Search from the CALL site, not the import, or this matches line 4.
    const call = CODE.indexOf('useFocusEffect(');
    expect(call).toBeGreaterThan(-1);
    const focus = CODE.slice(call, call + 300);
    expect(focus).toContain('setNow(new Date())');
    expect(focus).toContain('loadData()');
  });
});
