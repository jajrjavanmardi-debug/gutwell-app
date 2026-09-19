/**
 * Gut Profile Reveal tests.
 *
 * Two halves, deliberately:
 *
 *   1. The MAPPING (lib/gut-profile.ts) is pure, so it is tested directly —
 *      every fallback path, every legacy shape, every unknown value.
 *   2. The SCREEN is tested by source inspection, the convention used by the
 *      other onboarding screens in this repo. What matters about this screen
 *      is what it must NOT do: no writes, no network, no derived score. Those
 *      are absence assertions, and absence is what source inspection is good
 *      at.
 *
 * The screen is presentation over two answers the user already gave. The risk
 * it carries is not a crash — it is quietly becoming a health claim.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

import {
  FALLBACK_KEY,
  FEELING_FIELD,
  GOAL_FIELD,
  buildGutProfile,
  knownFeelingValues,
  knownGoalValues,
  parseAnswers,
} from '../gut-profile';
import { ONBOARDING_STEPS } from '../onboarding-config';
import { translations } from '../i18n';

const en = translations.en;
const de = translations.de;

const SCREEN = join(__dirname, '..', '..', 'app', '(onboarding)', 'profile-reveal.tsx');
const source = readFileSync(SCREEN, 'utf8');

/**
 * Source with comments stripped.
 *
 * The screen's own prose names the things it must never do ("no score", "no
 * Supabase call"), so absence assertions have to read code only or they fail
 * on the documentation that exists to prevent the problem.
 */
const code = source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

// ── 1. Route exists and is wired ────────────────────────────────────────────

describe('route', () => {
  test('the screen exists and default-exports a component', () => {
    expect(source).toContain('export default function ProfileRevealScreen');
  });

  test('it routes onward to the existing signup screen', () => {
    expect(source).toContain("router.push('/(auth)/signup')");
  });

  test('it does not reimplement signup or auth', () => {
    expect(code).not.toMatch(/signUp\(|signInWithPassword|supabase\.auth/);
  });
});

// ── 2. It reads only the two live answers ───────────────────────────────────

describe('data source', () => {
  test('it reads the existing onboarding_answers blob and no other key', () => {
    expect(source).toContain("'onboarding_answers'");
    const keys = code.match(/AsyncStorage\.getItem\(([^)]*)\)/g) ?? [];
    expect(keys).toHaveLength(1);
    expect(keys[0]).toContain('ANSWERS_KEY');
  });

  test('the mapping reads only goal and meal_feeling', () => {
    expect(GOAL_FIELD).toBe('goal');
    expect(FEELING_FIELD).toBe('meal_feeling');
    // Anything else in the blob is ignored — proven by feeding it extras.
    const withNoise = buildGutProfile({
      [GOAL_FIELD]: 'Reduce bloating',
      [FEELING_FIELD]: ['Bloated'],
      avoid: ['Lactose', 'Gluten'],
      bloating_frequency: '6+',
      sex: 'Female',
      height_cm: 180,
    });
    expect(withNoise.focusKey).toBe('Reduce bloating');
    expect(withNoise.feelingKeys).toEqual(['Bloated']);
  });

  test('the screen never writes anything', () => {
    // No local write, no stage write, no profile write. This screen is a
    // read; the account does not exist yet and nothing here may pretend
    // otherwise.
    expect(code).not.toContain('AsyncStorage.setItem');
    expect(code).not.toContain('saveLocalStage');
    expect(code).not.toMatch(/\.from\(|\.upsert\(|\.insert\(|\.update\(/);
  });

  test('the screen makes no backend or AI call', () => {
    expect(code).not.toMatch(/supabase|analyze-food|functions\.invoke|fetch\(/i);
  });
});

// ── 3. Missing, partial and corrupt data ────────────────────────────────────

describe('missing and malformed answers', () => {
  const cases: Array<[string, unknown]> = [
    ['null', null],
    ['undefined', undefined],
    ['empty object', {}],
    ['an array', ['Bloated']],
    ['a string', 'Bloated'],
    ['a number', 42],
    ['goal only', { [GOAL_FIELD]: 'Reduce bloating' }],
    ['feeling only', { [FEELING_FIELD]: ['Bloated'] }],
    ['null values', { [GOAL_FIELD]: null, [FEELING_FIELD]: null }],
    ['wrong types', { [GOAL_FIELD]: 7, [FEELING_FIELD]: { a: 1 } }],
    ['unknown goal', { [GOAL_FIELD]: 'Lose weight' }],
    ['unknown feelings', { [FEELING_FIELD]: ['Nauseous', 'Dizzy'] }],
    ['empty feeling array', { [FEELING_FIELD]: [] }],
    ['non-string members', { [FEELING_FIELD]: [1, null, 'Bloated'] }],
  ];

  test.each(cases)('renders a usable profile for %s', (_label, input) => {
    const profile = buildGutProfile(input);
    // Never empty, never undefined — the screen maps these straight to copy.
    expect(typeof profile.focusKey).toBe('string');
    expect(profile.focusKey.length).toBeGreaterThan(0);
    expect(Array.isArray(profile.feelingKeys)).toBe(true);
    expect(profile.feelingKeys.length).toBeGreaterThan(0);
    for (const key of profile.feelingKeys) {
      expect(typeof key).toBe('string');
      expect(key.length).toBeGreaterThan(0);
    }
  });

  test.each(cases)('every resolved key has EN and DE copy for %s', (_label, input) => {
    const profile = buildGutProfile(input);
    const enFocus = en.profileReveal.focus as Record<string, string>;
    const deFocus = de.profileReveal.focus as Record<string, string>;
    const enFeel = en.profileReveal.feeling as Record<string, string>;
    const deFeel = de.profileReveal.feeling as Record<string, string>;
    // The exact failure this prevents: a key with no copy renders "undefined".
    expect(enFocus[profile.focusKey]).toBeTruthy();
    expect(deFocus[profile.focusKey]).toBeTruthy();
    for (const key of profile.feelingKeys) {
      expect(enFeel[key]).toBeTruthy();
      expect(deFeel[key]).toBeTruthy();
    }
  });

  test('corrupt JSON parses to null rather than throwing', () => {
    expect(parseAnswers('{"goal":')).toBeNull();
    expect(parseAnswers('not json at all')).toBeNull();
    expect(parseAnswers('')).toBeNull();
    expect(parseAnswers(null)).toBeNull();
    // …and null still yields a renderable profile.
    expect(buildGutProfile(parseAnswers('{"goal":')).focusKey).toBe(FALLBACK_KEY);
  });

  test('a fully generic profile is flagged as such', () => {
    expect(buildGutProfile(null).isGeneric).toBe(true);
    expect(
      buildGutProfile({ [GOAL_FIELD]: 'Reduce bloating', [FEELING_FIELD]: ['Bloated'] }).isGeneric,
    ).toBe(false);
  });
});

// ── 4. Goal mappings ────────────────────────────────────────────────────────

describe('goal mapping', () => {
  test('every goal the questionnaire offers maps to distinct copy', () => {
    const goals = knownGoalValues();
    expect(goals.length).toBeGreaterThan(0);
    const enFocus = en.profileReveal.focus as Record<string, string>;
    const rendered = goals.map((g) => enFocus[buildGutProfile({ [GOAL_FIELD]: g }).focusKey]);
    for (const line of rendered) expect(line).toBeTruthy();
    // Distinct: a shared line would mean the "personalised" card is not.
    expect(new Set(rendered).size).toBe(goals.length);
  });

  test('the mapping is derived from the live config, not a private copy', () => {
    const configGoals = (ONBOARDING_STEPS.find((s) => s.id === 'main_goal') as any).options.map(
      (o: { value: string }) => o.value,
    );
    expect(knownGoalValues()).toEqual(configGoals);
  });

  test('an unknown goal falls back instead of echoing the raw value', () => {
    // Guards the "undefined" and the raw-identifier-on-screen failures at once.
    const profile = buildGutProfile({ [GOAL_FIELD]: 'Cure my IBS' });
    expect(profile.focusKey).toBe(FALLBACK_KEY);
  });
});

// ── 5. Multi-select behaviour ───────────────────────────────────────────────

describe('after-meal pattern', () => {
  test('every feeling the questionnaire offers maps to copy', () => {
    const feelings = knownFeelingValues();
    expect(feelings.length).toBeGreaterThan(0);
    const enFeel = en.profileReveal.feeling as Record<string, string>;
    for (const f of feelings) {
      const profile = buildGutProfile({ [FEELING_FIELD]: [f] });
      expect(profile.feelingKeys).toEqual([f]);
      expect(enFeel[f]).toBeTruthy();
    }
  });

  test('several selections are all shown', () => {
    const profile = buildGutProfile({ [FEELING_FIELD]: ['Bloated', 'Heavy', 'Pain'] });
    expect(profile.feelingKeys).toEqual(['Bloated', 'Heavy', 'Pain']);
  });

  test('order is config order, not selection order', () => {
    // The reveal must read the same every time it is opened. Selection order
    // is not something the user chose to communicate.
    const a = buildGutProfile({ [FEELING_FIELD]: ['Pain', 'Bloated'] });
    const b = buildGutProfile({ [FEELING_FIELD]: ['Bloated', 'Pain'] });
    expect(a.feelingKeys).toEqual(b.feelingKeys);
    expect(a.feelingKeys).toEqual(['Bloated', 'Pain']);
  });

  test('duplicates collapse', () => {
    expect(buildGutProfile({ [FEELING_FIELD]: ['Bloated', 'Bloated'] }).feelingKeys).toEqual([
      'Bloated',
    ]);
  });

  test('a legacy single string still resolves', () => {
    // Blobs written before the step became multi-select hold a bare string.
    expect(buildGutProfile({ [FEELING_FIELD]: 'Heavy' }).feelingKeys).toEqual(['Heavy']);
  });

  test('selections are never ranked, scored or reduced to one conclusion', () => {
    // Every selected value survives to the screen. Nothing picks a "primary"
    // symptom or collapses several into a single finding.
    const all = knownFeelingValues();
    expect(buildGutProfile({ [FEELING_FIELD]: all }).feelingKeys).toEqual(all);
    expect(code).not.toMatch(/\.sort\(|severity|primary|worst|rank|score/i);
  });
});

// ── 6. Localization ─────────────────────────────────────────────────────────

describe('localization', () => {
  test('EN and DE expose the same profileReveal keys', () => {
    const flatten = (o: unknown, p = ''): string[] =>
      o && typeof o === 'object'
        ? Object.entries(o).flatMap(([k, v]) => flatten(v, p ? `${p}.${k}` : k))
        : [p];
    expect(flatten(de.profileReveal).sort()).toEqual(flatten(en.profileReveal).sort());
  });

  test('the German copy is genuinely translated', () => {
    expect(de.profileReveal.title).not.toBe(en.profileReveal.title);
    expect(de.profileReveal.intro).not.toBe(en.profileReveal.intro);
    expect(de.profileReveal.disclaimer).not.toBe(en.profileReveal.disclaimer);
    const enFocus = en.profileReveal.focus as Record<string, string>;
    const deFocus = de.profileReveal.focus as Record<string, string>;
    for (const key of Object.keys(enFocus)) {
      expect(deFocus[key]).not.toBe(enFocus[key]);
    }
  });

  test('no copy is rendered straight from the config or the raw answer', () => {
    // Everything on screen resolves through t.profileReveal, so a German user
    // cannot be shown an English fallback or a stored identifier like
    // "Improve everyday wellbeing".
    expect(code).toContain('t.profileReveal');
    expect(code).not.toMatch(/profile\.focusKey\s*\}/);
  });
});

// ── 7. Claim safety ─────────────────────────────────────────────────────────

describe('claim safety', () => {
  const revealStrings = [
    ...Object.values(en.profileReveal).flatMap((v) =>
      typeof v === 'string' ? [v] : Object.values(v as Record<string, string>),
    ),
    ...Object.values(de.profileReveal).flatMap((v) =>
      typeof v === 'string' ? [v] : Object.values(v as Record<string, string>),
    ),
  ];

  test('the copy set is non-trivial', () => {
    // Guards the assertions below from silently passing on an empty list.
    expect(revealStrings.length).toBeGreaterThan(20);
  });

  test('no diagnosis, treatment, cure or prevention language', () => {
    for (const s of revealStrings) {
      expect(s).not.toMatch(/\b(diagnos|treat|cure|heil|behandel)/i);
    }
  });

  test('no certainty or causation language', () => {
    for (const s of revealStrings) {
      expect(s).not.toMatch(/will cause|is your trigger|you have\b|verursacht|dein Auslöser/i);
    }
  });

  test('no score, number, percentage or risk', () => {
    for (const s of revealStrings) {
      expect(s).not.toMatch(/\d/); // no figure of any kind, including a score
      expect(s).not.toMatch(/\b(score|risk|level|rating|percent|Risiko|Punktzahl)\b/i);
    }
  });

  test('no outcome timeline or promised improvement', () => {
    for (const s of revealStrings) {
      // A WINDOW, not the bare word: "day to day" and "everyday" are ordinary
      // English and say nothing about when anything will happen. What must
      // never appear is a period a result could be pinned to.
      expect(s).not.toMatch(/\b\d+\s*(weeks?|days?|months?|Wochen|Tagen|Monaten)\b/i);
      expect(s).not.toMatch(/\b(first|next|few)\s+(weeks?|days?|months?|Wochen|Tagen)\b/i);
      expect(s).not.toMatch(/\b(improve|reduce|better|fewer|relief|besser|Linderung)\b/i);
    }
  });

  test('it does not claim an analysis has already run', () => {
    for (const s of revealStrings) {
      expect(s).not.toMatch(/analysed|analyzed|we found|results show|analysiert|ergeben/i);
    }
  });

  test('the hedging language the copy depends on is actually present', () => {
    // The inverse of the bans: this screen is safe partly because it hedges,
    // so the hedges are pinned rather than assumed.
    expect(en.profileReveal.focus['Reduce bloating']).toMatch(/may be associated/i);
    expect(en.profileReveal.focus['Find food triggers']).toMatch(/possible/i);
    expect(en.profileReveal.expectation).toMatch(/\bcan\b/i);
    expect(en.profileReveal.expectation).toMatch(/over time/i);
    expect(de.profileReveal.expectation).toMatch(/kann/i);
  });

  test('the disclaimer is present in both languages', () => {
    expect(en.profileReveal.disclaimer).toMatch(/not a medical assessment/i);
    expect(de.profileReveal.disclaimer).toMatch(/keine medizinische Beurteilung/i);
  });

  test('the CTA does not claim to save anything', () => {
    // No account exists at this point and the screen writes nothing, so a
    // "Save my Gut Profile" label would describe something that never happens.
    expect(en.profileReveal.cta).toBe('Continue');
    expect(en.profileReveal.cta).not.toMatch(/save/i);
    expect(de.profileReveal.cta).not.toMatch(/speicher/i);
  });
});

// ── 8. Motion and accessibility ─────────────────────────────────────────────

describe('motion and accessibility', () => {
  test('it honours the shared reduced-motion hook', () => {
    expect(source).toContain('useReducedMotion');
    expect(code).toMatch(/if \(reduceMotion\)/);
  });

  test('the entrance resolves immediately under reduced motion', () => {
    // Value starts at 1 and is re-asserted; nothing is scheduled.
    expect(code).toMatch(/reduceMotion \? 1 : 0/);
    expect(code).toContain('value.setValue(1)');
  });

  test('the reveal haptic never fires under reduced motion', () => {
    expect(code).toMatch(/if \(!profile \|\| greeted\.current \|\| reduceMotion\) return;/);
  });

  test('every animation is cleaned up on unmount', () => {
    expect(code).toContain('animation.stop()');
  });

  test('no dependency was added for motion', () => {
    // Word-bounded: an unanchored /rive/ matches `useNativeDriver`, which is
    // the RN core API this screen is supposed to be using.
    expect(code).not.toMatch(/\blottie\b|\brive\b|react-native-video|LottieView/i);
    expect(code).not.toMatch(/from ['"](lottie|rive|react-native-video)/i);
  });

  test('content scrolls and text is never capped or truncated', () => {
    expect(code).toContain('ScrollView');
    // flexGrow, not flex: flex:1 on a contentContainer pins it to the viewport
    // and clips instead of scrolling at large Dynamic Type sizes.
    expect(code).toMatch(/flexGrow:\s*1/);
    expect(code).not.toContain('maxFontSizeMultiplier');
    expect(code).not.toContain('numberOfLines');
  });

  test('safe areas and interactive labels are present', () => {
    expect(code).toContain('SafeAreaView');
    expect(code).toContain('accessibilityRole="button"');
    expect(code).toContain('accessibilityLabel');
  });
});

// ── 9. The live config is unchanged ─────────────────────────────────────────

describe('the questionnaire is untouched by this screen', () => {
  test('the live flow is still the approved three steps', () => {
    expect(ONBOARDING_STEPS.map((s) => s.id)).toEqual([
      'main_goal',
      'after_meal_feeling',
      'context_interlude',
    ]);
  });

  test('the reveal is a screen, not a config step', () => {
    // It collects nothing, so it has no place in a list whose contract is
    // "every entry stores an answer with a downstream consumer".
    expect(ONBOARDING_STEPS.map((s) => s.id)).not.toContain('profile_reveal');
  });

  test('no new storage key was introduced', () => {
    expect(code).not.toMatch(/gut_profile|profile_reveal_/);
  });
});
