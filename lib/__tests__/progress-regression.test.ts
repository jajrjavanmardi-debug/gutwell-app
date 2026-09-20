/**
 * Progress screen regression tests.
 *
 * Progress was the largest screen in the app (1144 lines, 7 queries, 8 child
 * components) with ZERO test coverage. That is how `streak={checkInCount}`
 * survived into a share message users send to other people.
 *
 * Source inspection, matching the convention used by the other screen suites.
 * Most of what matters here is ABSENCE — the wrong prop, the duplicate index
 * card, the risk badge, the hardcoded English — and absence is what source
 * inspection is good at.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

import { translations } from '../i18n';
import { GUT_LEVELS, calculateLevel } from '../levels';
import { BANNED_CLAIMS } from './banned-claims';

const root = join(__dirname, '..', '..');
const PROGRESS = readFileSync(join(root, 'app', '(tabs)', 'progress.tsx'), 'utf8');
const SHARE = readFileSync(join(root, 'components', 'ShareCard.tsx'), 'utf8');
const TRIGGERS = readFileSync(join(root, 'components', 'TriggerFoodsBox.tsx'), 'utf8');

/** Comments stripped — the screen documents what it removed. */
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const CODE = strip(PROGRESS);
const SHARE_CODE = strip(SHARE);
const TRIGGER_CODE = strip(TRIGGERS);

const en = translations.en.progress;
const de = translations.de.progress;

// ── 1–3. Share-card wiring ──────────────────────────────────────────────────

describe('share card receives the correct values', () => {
  /** The <ShareCard .../> element only. */
  const shareEl = CODE.slice(CODE.indexOf('<ShareCard'), CODE.indexOf('onClose={() => setShowShare(false)}'));

  test('streak is the real consecutive-day streak', () => {
    expect(shareEl).toContain('streak={currentStreak}');
  });

  test('checkInCount is never wired into the streak prop', () => {
    // The bug: checkInCount is check-ins within the selected period (90 days
    // by default), not consecutive days.
    expect(shareEl).not.toContain('streak={checkInCount}');
    expect(CODE).not.toContain('streak={checkInCount}');
  });

  test('level is the computed level, not a hardcoded literal', () => {
    expect(shareEl).not.toContain('"Tracker"');
    expect(shareEl).toContain('level={levelDisplayName(level.key)}');
  });

  test('the level shown is derived from the real point total', () => {
    // Guards the mapping, not the thresholds: calculateLevel is untouched.
    expect(calculateLevel(0).key).toBe('beginner');
    expect(calculateLevel(1000).key).toBe('guru');
    for (const lvl of GUT_LEVELS) {
      expect((en.levelNames as Record<string, string>)[lvl.key]).toBeTruthy();
      expect((de.levelNames as Record<string, string>)[lvl.key]).toBeTruthy();
    }
  });

  test('the outbound share text substitutes that same streak value', () => {
    // ShareCard puts {streak} into Share.share({message}) — this is text the
    // user publishes to other people, which is what made the bug serious.
    expect(SHARE_CODE).toContain(".replace('{streak}', String(streak))");
    for (const lang of ['en', 'de'] as const) {
      expect(translations[lang].shareCard.shareMessage).toContain('{streak}');
      expect(translations[lang].shareCard.shareMessage).toContain('{score}');
    }
  });
});

// ── 4. Share privacy ────────────────────────────────────────────────────────

describe('share card exposes nothing beyond score, streak and level', () => {
  test('the component receives no symptom, meal, photo or identity data', () => {
    const props = SHARE_CODE.slice(SHARE_CODE.indexOf('export interface ShareCardProps'), SHARE_CODE.indexOf('}', SHARE_CODE.indexOf('export interface ShareCardProps')));
    expect(props).not.toMatch(/symptom|meal|food|photo|image|email|name|user/i);
  });

  test('the share message references no personal content', () => {
    for (const lang of ['en', 'de'] as const) {
      const msg = translations[lang].shareCard.shareMessage;
      expect(msg).not.toMatch(/symptom|meal|Mahlzeit|photo|Foto|email|@/i);
    }
  });

  test('the message qualifies the number as coming from check-ins', () => {
    expect(translations.en.shareCard.shareMessage).toMatch(/check-ins/i);
    expect(translations.de.shareCard.shareMessage).toMatch(/Check-ins/i);
  });

  test('sharing stays user-initiated plain text with no image generation', () => {
    expect(SHARE_CODE).toContain('Share.share(');
    expect(SHARE_CODE).not.toMatch(/captureRef|ViewShot|react-native-view-shot/);
  });
});

// ── 5–6. Score semantics ────────────────────────────────────────────────────

describe('score presentation matches Home', () => {
  test('Progress uses the same day labels as Home, by reference', () => {
    // Referenced rather than duplicated so the two screens cannot drift into
    // describing the same number differently.
    expect(CODE).toContain('t.home.dayLabelSettled');
    expect(CODE).toContain('t.home.dayLabelMixed');
    expect(CODE).toContain('t.home.dayLabelTougher');
  });

  test('the retired organ-state labels are gone from the screen', () => {
    for (const token of ['statusThriving', 'statusBuilding', 'statusNeedsCare']) {
      expect(CODE).not.toContain(token);
    }
  });

  test('thresholds are unchanged at 70 and 40', () => {
    expect(CODE).toContain('currentScore >= 70');
    expect(CODE).toContain('currentScore >= 40');
  });

  test('a stale score is not called today’s score', () => {
    expect(CODE).toContain("const scoreIsToday = currentScoreDate === getLocalDateKey();");
    expect(CODE).toContain('scoreIsToday ? t.progress.scoreTitleToday : t.progress.scoreTitleLatest');
    expect(en.scoreTitleLatest).toBe('Latest GutWell Score');
    expect(en.scoreProvenanceOlder).toContain('{date}');
  });

  test('the old undated "Current Gut Score" title is no longer rendered', () => {
    expect(CODE).not.toContain('t.progress.currentGutScore');
  });

  test('no score renders an intentional empty state, not a large dash', () => {
    expect(CODE).toContain('t.progress.scoreEmptyTitle');
    expect(CODE).toContain('t.progress.scoreEmptyBody');
    expect(CODE).not.toContain("currentScore != null ? currentScore : '--'");
  });
});

// ── 7. Gut Health Index removed ─────────────────────────────────────────────

describe('the duplicate Gut Health Index is gone', () => {
  test('the section no longer renders', () => {
    expect(CODE).not.toContain('gutHealthIndex');
    for (const token of ['indexCard', 'indexBands', 'indexLegend', 'indexTag', 'indexValue', 'indexMeta']) {
      expect(CODE).not.toContain(token);
    }
  });

  test('no replacement pseudo-index was introduced', () => {
    expect(CODE).not.toMatch(/\bIndex\b/);
    expect(en).not.toHaveProperty('healthIndex');
  });

  test('best streak survived into Milestones', () => {
    expect(CODE).toContain('t.progress.bestStreakLabel');
    expect(CODE).toContain('t.progress.bestStreakValue');
  });
});

// ── 8. Hierarchy ────────────────────────────────────────────────────────────

describe('sections appear in the approved order', () => {
  test('summary → learning → trends → patterns → milestones', () => {
    const order = [
      CODE.indexOf('scoreTitle'),
      CODE.indexOf('t.progress.learningTitle'),
      CODE.indexOf('t.progress.trendsTitle'),
      CODE.indexOf('<TriggerFoodsBox'),
      CODE.indexOf('t.progress.milestonesTitle'),
    ];
    for (const i of order) expect(i).toBeGreaterThan(-1);
    const sorted = [...order].sort((a, b) => a - b);
    expect(order).toEqual(sorted);
  });

  test('gamification no longer opens the screen', () => {
    // Streak and badges used to render above the score.
    expect(CODE.indexOf('t.progress.milestonesTitle')).toBeGreaterThan(CODE.indexOf('scoreTitle'));
  });
});

// ── 9–11. Low-data handling ─────────────────────────────────────────────────

describe('small samples are not presented as established figures', () => {
  test('the low-data floor is three samples', () => {
    expect(CODE).toContain('const LOW_DATA_MIN = 3;');
  });

  test('the stool average is withheld below three samples', () => {
    expect(CODE).toContain('const showStoolAverage = stoolSampleCount >= LOW_DATA_MIN && avgStoolType != null;');
    expect(CODE).toContain('showStoolAverage ? t.progress.labelAvgStool : t.progress.lowDataMore');
  });

  test('the mood average is withheld below three samples', () => {
    expect(CODE).toContain('const showMoodAverage = moodSampleCount >= LOW_DATA_MIN && avgMood != null;');
    expect(CODE).toContain('{showMoodAverage && avgMood !== null');
  });

  test('single-point charts are suppressed with an explanation', () => {
    expect(CODE).toContain('t.progress.lowDataTrend');
    expect(CODE).toContain('const showMoodChart = moodSampleCount >= 2;');
    expect(CODE).toContain('const showStoolChart = stoolSampleCount >= 2;');
  });

  test('the averages themselves are still computed unchanged', () => {
    // Presentation only — the arithmetic is untouched.
    expect(CODE).toContain('setAvgStoolType(Math.round(avg * 10) / 10)');
    expect(CODE).toContain('setAvgMood(Math.round(moodAvg * 10) / 10)');
  });

  test('the insight threshold is still three scores', () => {
    expect(CODE).toContain('scores.length >= 3');
    expect(CODE).toContain('const LEARNING_SCORES_MIN = 3;');
  });

  test('the learning meter uses the existing correlation minimum', () => {
    expect(CODE).toContain('const LEARNING_MEALS_MIN = 5;');
    const corr = readFileSync(join(root, 'lib', 'correlations.ts'), 'utf8');
    expect(corr).toContain('mealsWithFoods.length < 5');
  });
});

// ── 12–14. Trigger-food claim safety ────────────────────────────────────────

describe('trigger foods are described as patterns, never risks', () => {
  test('HIGH / MEDIUM / LOW is no longer rendered', () => {
    expect(TRIGGER_CODE).not.toContain('riskLevel.toUpperCase()');
    expect(TRIGGER_CODE).not.toMatch(/toUpperCase\(\)/);
  });

  test('the badge shows hedged pattern wording instead', () => {
    expect(TRIGGER_CODE).toContain('patternStronger');
    expect(TRIGGER_CODE).toContain('patternPossible');
    expect(TRIGGER_CODE).toContain('patternEarly');
  });

  test('the percentage states what was counted', () => {
    expect(TRIGGER_CODE).not.toContain('% correlation');
    expect(TRIGGER_CODE).toContain('t.progress.patternCoOccurrence');
    expect(en.patternCoOccurrence).toMatch(/logged cases/i);
  });

  test('no alarm red remains on a food', () => {
    expect(TRIGGER_CODE).not.toContain('#E07070');
  });

  test('the correlation thresholds are untouched', () => {
    const corr = readFileSync(join(root, 'lib', 'correlations.ts'), 'utf8');
    expect(corr).toContain('data.total >= 4 && data.withSymptom >= 2 && pct >= 55');
    expect(corr).toContain("pct >= 70 ? 'high' : pct >= 50 ? 'medium' : 'low'");
  });

  test('no Progress copy uses risk or causal language', () => {
    const strings = [
      ...Object.values(en).flatMap((v) => (typeof v === 'string' ? [v] : Object.values(v as object))),
      ...Object.values(de).flatMap((v) => (typeof v === 'string' ? [v] : Object.values(v as object))),
    ].filter((v): v is string => typeof v === 'string');
    expect(strings.length).toBeGreaterThan(40);
    for (const s of strings) {
      expect(s).not.toMatch(/\brisk\b|\bRisiko\b|danger|unsafe|causes|is your trigger|dein Auslöser/i);
    }
  });

  test('Progress copy passes the shared banned-claims list', () => {
    const strings = [
      ...Object.values(en).flatMap((v) => (typeof v === 'string' ? [v] : Object.values(v as object))),
      ...Object.values(de).flatMap((v) => (typeof v === 'string' ? [v] : Object.values(v as object))),
    ].filter((v): v is string => typeof v === 'string');
    for (const s of strings) {
      for (const pattern of BANNED_CLAIMS) {
        expect(s).not.toMatch(pattern);
      }
    }
  });
});

// ── 15–17. Localization ─────────────────────────────────────────────────────

describe('no hardcoded English remains on Progress', () => {
  test('the confirmed literals are gone', () => {
    expect(CODE).not.toContain('"Tracker"');
    expect(CODE).not.toContain('Next: {nextLevel.name}');
    expect(CODE).not.toContain('Best streak:');
    expect(CODE).not.toContain("'Needs care'");
    expect(CODE).not.toContain("{ 1: 'Bad', 2: 'Low'");
  });

  test('bestDay uses the app locale, not en-US', () => {
    expect(CODE).not.toContain("toLocaleDateString('en-US'");
    expect(CODE).toContain('toLocaleDateString(dateLocale');
  });

  test('chart month labels are locale-aware', () => {
    // Was a hardcoded ['Jan'…'Dec'] array, so every chart axis was English.
    expect(CODE).not.toMatch(/\['Jan', 'Feb', 'Mar'/);
    expect(CODE).toContain('function formatShortDate(dateStr: string, locale: string)');
    expect(CODE).toContain('formatShortDate(s.date, dateLocale)');
  });

  test('level names are localized without touching thresholds', () => {
    const levels = readFileSync(join(root, 'lib', 'levels.ts'), 'utf8');
    expect(levels).toContain("{ name: 'Beginner', key: 'beginner', minPoints: 0");
    expect(levels).toContain("minPoints: 1000");
    expect(CODE).toContain('t.progress.levelNames');
  });

  test('period-scoped counts say which window they cover', () => {
    expect(CODE).toContain('t.progress.windowSuffix.replace');
    expect(en.windowSuffix).toContain('{period}');
  });

  test('every new Progress key exists in both languages and differs', () => {
    const KEYS = [
      'scoreTitleToday', 'scoreTitleLatest', 'scoreProvenanceToday', 'scoreProvenanceOlder',
      'scoreEmptyTitle', 'scoreEmptyBody', 'learningTitle', 'learningScoresLabel',
      'learningScoresProgress', 'learningScoresReady', 'learningMealsLabel',
      'learningMealsProgress', 'learningMealsReady', 'trendsTitle', 'lowDataMore',
      'lowDataTrend', 'windowSuffix', 'a11yScoreTrend', 'a11yMoodTrend', 'a11yStoolTrend',
      'a11yCalendar', 'patternStronger', 'patternPossible', 'patternEarly',
      'patternCoOccurrence', 'milestonesTitle', 'bestStreakLabel', 'bestStreakValue',
      'nextLevelLabel',
    ] as const;
    for (const k of KEYS) {
      const e = (en as unknown as Record<string, string>)[k];
      const d = (de as unknown as Record<string, string>)[k];
      expect(e).toBeTruthy();
      expect(d).toBeTruthy();
      expect(`${k}: ${d}`).not.toBe(`${k}: ${e}`);
    }
  });
});

// ── 19. Chart accessibility ─────────────────────────────────────────────────

describe('charts carry an accessible summary', () => {
  test('each chart has a labelled container', () => {
    for (const key of ['a11yScoreTrend', 'a11yMoodTrend', 'a11yStoolTrend', 'a11yCalendar']) {
      expect(CODE).toContain(`t.progress.${key}`);
    }
    expect((CODE.match(/accessibilityRole="image"/g) ?? []).length).toBe(4);
  });

  test('the summaries use values already on screen', () => {
    expect(en.a11yScoreTrend).toContain('{n}');
    expect(en.a11yScoreTrend).toContain('{latest}');
    expect(en.a11yMoodTrend).toContain('{n}');
  });
});

// ── 20. Protected algorithms untouched ──────────────────────────────────────

describe('no protected algorithm changed', () => {
  test('scoring formula and thresholds are intact', () => {
    const scoring = readFileSync(join(root, 'lib', 'scoring.ts'), 'utf8');
    expect(scoring).toContain('let score = 50;');
    expect(scoring).toContain('SYMPTOM_PENALTY_PER_SYMPTOM = -3');
    expect(scoring).toContain('REGULARITY_BONUS_MIN_CHECKINS = 5');
  });

  test('streak definition is intact', () => {
    const streaks = readFileSync(join(root, 'lib', 'streaks.ts'), 'utf8');
    expect(streaks).toContain('export function calculateStreakFromDates');
    expect(streaks).toContain('lastDate === today || lastDate === yesterday');
  });

  test('badge rules and point formula are unchanged', () => {
    expect(CODE).toContain('ci >= 1,');
    expect(CODE).toContain('points >= 50,');
    expect(CODE).toContain('fl >= 10,');
    expect(CODE).toContain('points >= 100,');
  });

  test('the weekly-insight calculation was not touched', () => {
    // Including the known n=3 overlapping-halves behaviour, deliberately left.
    expect(CODE).toContain('const firstHalf = last7.slice(0, 3)');
    expect(CODE).toContain('const secondHalf = last7.slice(-3)');
    expect(CODE).toContain("secondHalf > firstHalf + 3 ? 'up'");
  });

  test('the Progress queries are unchanged in number and target', () => {
    const load = CODE.slice(CODE.indexOf('const loadData'), CODE.indexOf('useEffect(() => { loadData'));
    expect((load.match(/\.from\('/g) ?? []).length).toBe(7);
    expect(load).toContain("from('check_ins')");
    expect(load).toContain("from('gut_scores')");
    expect(load).toContain("from('symptoms')");
    expect(load).toContain("from('food_logs')");
  });
});
