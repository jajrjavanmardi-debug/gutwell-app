/**
 * Stage 6E release-polish regression tests.
 *
 * Eight low-risk fixes to surfaces the redesign stages did not touch:
 * StreakPopup and Check-in motion/accessibility, the paywall's accessibility
 * and copy, and the Profile brand spelling.
 *
 * Source inspection, matching the other screen suites. The point of most of
 * these is that a control now HAS a label and a decorative animation now has
 * an escape hatch — both are things a static read can prove.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

import { translations } from '../i18n';
import { BANNED_CLAIMS } from './banned-claims';

const root = join(__dirname, '..', '..');
const read = (...p: string[]) => readFileSync(join(root, ...p), 'utf8');

const STREAK = read('components', 'StreakPopup.tsx');
const PAYWALL = read('app', 'paywall.tsx');
const CHECKIN = read('app', '(tabs)', 'checkin.tsx');
const PROFILE = read('app', '(tabs)', 'profile.tsx');

const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const STREAK_CODE = strip(STREAK);
const PAYWALL_CODE = strip(PAYWALL);
const CHECKIN_CODE = strip(CHECKIN);
const PROFILE_CODE = strip(PROFILE);

// ── 1–4. StreakPopup ────────────────────────────────────────────────────────

describe('StreakPopup honours Reduce Motion', () => {
  test('it reads the shared hook', () => {
    expect(STREAK_CODE).toContain("import { useReducedMotion } from '../lib/useReducedMotion';");
    expect(STREAK_CODE).toContain('const reduceMotion = useReducedMotion();');
  });

  test('both animated values start settled under Reduce Motion', () => {
    expect(STREAK_CODE).toContain('new Animated.Value(reduceMotion ? 1 : 0.85)');
    expect(STREAK_CODE).toContain('new Animated.Value(reduceMotion ? 1 : 0)');
  });

  test('the reduced-motion branch schedules nothing', () => {
    const effect = STREAK_CODE.slice(
      STREAK_CODE.indexOf('useEffect(() => {'),
      STREAK_CODE.indexOf('const fireMilestone'),
    );
    expect(effect).toContain('if (reduceMotion) {');
    expect(effect).toContain('scaleAnim.setValue(1)');
    expect(effect).toContain('opacityAnim.setValue(1)');
    // The spring must sit AFTER the early return, never before it.
    expect(effect.indexOf('if (reduceMotion) {')).toBeLessThan(effect.indexOf('Animated.spring'));
  });

  test('the animation is cleaned up and the effect tracks the preference', () => {
    expect(STREAK_CODE).toContain('animation.stop()');
    expect(STREAK_CODE).toContain('}, [visible, reduceMotion, scaleAnim, opacityAnim]);');
  });

  test('the modal still opens and closes normally', () => {
    expect(STREAK_CODE).toContain('onRequestClose={onClose}');
    expect(STREAK_CODE).toContain('visible={visible}');
  });
});

describe('StreakPopup exposes accessibility semantics', () => {
  test('the close button is labelled', () => {
    expect(STREAK_CODE).toContain('accessibilityLabel={t.components.streakPopup.close}');
    expect(translations.en.components.streakPopup.close).toBeTruthy();
    expect(translations.de.components.streakPopup.close).toBeTruthy();
  });

  test('the streak value reads as one phrase', () => {
    expect(STREAK_CODE).toContain('t.components.streakPopup.streakValueA11y');
    expect(translations.en.components.streakPopup.streakValueA11y).toBe('{n} day streak');
    expect(
      translations.en.components.streakPopup.streakValueA11y.replace('{n}', '3'),
    ).toBe('3 day streak');
    expect(translations.de.components.streakPopup.streakValueA11y).toContain('{n}');
  });

  test('decorative icons were not over-labelled', () => {
    // The fire animation and week dots stay unlabelled on purpose.
    expect(STREAK_CODE).not.toContain('accessibilityLabel={t.components.streakPopup.thisWeek}');
  });
});

// ── 5–9. Paywall accessibility ──────────────────────────────────────────────

describe('paywall controls are labelled', () => {
  test.each([
    ['close', 'accessClose'],
    ['monthly plan', 'accessSelectMonthly'],
    ['annual plan', 'accessSelectAnnual'],
    ['continue/purchase', 'accessContinue'],
    ['restore', 'accessRestore'],
    ['terms', 'accessTerms'],
    ['privacy', 'accessPrivacy'],
  ])('%s has a localized label', (_name, key) => {
    expect(PAYWALL_CODE).toContain(`t.paywall.${key}`);
    const en = (translations.en.paywall as Record<string, string>)[key];
    const de = (translations.de.paywall as Record<string, string>)[key];
    expect(en).toBeTruthy();
    expect(de).toBeTruthy();
    expect(`${key}: ${de}`).not.toBe(`${key}: ${en}`);
  });

  test('the plan cards announce their selected state', () => {
    expect(PAYWALL_CODE).toContain("accessibilityState={{ selected: selectedPlan === 'monthly' }}");
    expect(PAYWALL_CODE).toContain("accessibilityState={{ selected: selectedPlan === 'annual' }}");
  });

  test('disabled states are announced, not just styled', () => {
    expect(PAYWALL_CODE).toContain('accessibilityState={{ disabled: purchasing || loadingOffering }}');
    expect(PAYWALL_CODE).toContain('accessibilityState={{ disabled: restoring || purchasing }}');
  });
});

// ── 10–13. Paywall copy ─────────────────────────────────────────────────────

describe('paywall copy matches the rest of the app', () => {
  test('the preview uses Home’s current score label', () => {
    expect(translations.en.paywall.gutScoreToday).toBe('Today’s GutWell Score');
    expect(translations.de.paywall.gutScoreToday).toBe('Heutiger GutWell-Score');
  });

  test('the retired "Gut Score today" wording is gone from paywall copy', () => {
    expect(translations.en.paywall.gutScoreToday).not.toBe('Gut Score today');
    for (const lang of ['en', 'de'] as const) {
      for (const v of Object.values(translations[lang].paywall)) {
        if (typeof v === 'string') expect(v).not.toMatch(/Gut Score today|Darm-Score heute/i);
      }
    }
  });

  test('no paywall copy calls a food safe or unsafe', () => {
    for (const lang of ['en', 'de'] as const) {
      for (const v of Object.values(translations[lang].paywall)) {
        if (typeof v === 'string') {
          expect(v).not.toMatch(/safe[- ]foods?|unsafe|risk foods?|dangerous/i);
        }
      }
    }
  });

  test('the feature list uses the in-app Well-Tolerated Foods name', () => {
    expect(translations.en.paywall.featureSafeFoods).toBe(
      'Your personal Well-Tolerated Foods list',
    );
    // Matches the component's own title, so one feature has one name.
    expect(translations.en.components.safeFoods.title).toBe('Well-Tolerated Foods');
    expect(translations.de.paywall.featureSafeFoods).toBeTruthy();
    expect(translations.de.paywall.featureSafeFoods).not.toMatch(/sicher/i);
  });

  test('paywall copy passes the shared banned-claims list', () => {
    for (const lang of ['en', 'de'] as const) {
      for (const v of Object.values(translations[lang].paywall)) {
        if (typeof v !== 'string') continue;
        for (const pattern of BANNED_CLAIMS) expect(v).not.toMatch(pattern);
      }
    }
  });
});

// ── 14–16. Check-in ─────────────────────────────────────────────────────────

describe('check-in honours Reduce Motion', () => {
  test('it reads the shared hook and starts settled', () => {
    expect(CHECKIN_CODE).toContain('const reduceMotion = useReducedMotion();');
    expect(CHECKIN_CODE).toContain('new Animated.Value(reduceMotion ? 1 : 0)');
  });

  test('the reduced-motion branch schedules nothing and cleans up', () => {
    expect(CHECKIN_CODE).toContain('sectionFade.setValue(1)');
    expect(CHECKIN_CODE).toContain('animation.stop()');
    expect(CHECKIN_CODE).toContain('}, [sectionFade, reduceMotion]);');
  });
});

describe('check-in controls describe themselves', () => {
  test('the sliders announce their own metric, value and scale', () => {
    expect(CHECKIN_CODE).toContain('t.checkin.accessLevel');
    expect(CHECKIN_CODE).toContain(".replace('{field}', field)");
    expect(CHECKIN_CODE).toContain(".replace('{n}', String(v))");
  });

  test('the slider no longer announces stool wording for every metric', () => {
    // The bug: bloating, pain and energy all read stoolLabels and then said
    // "mood level".
    expect(CHECKIN_CODE).not.toContain('t.checkin.stoolLabels[v - 1] ?? labels[v - 1]');
    expect(CHECKIN_CODE).not.toContain('${t.checkin.accessMoodLevel}');
  });

  test('each slider is given its own field name', () => {
    expect(CHECKIN_CODE).toContain('field={t.checkin.bloating}');
    expect(CHECKIN_CODE).toContain('field={t.checkin.abdominalPain}');
    expect(CHECKIN_CODE).toContain('field={t.checkin.energyLevel}');
  });

  test('the label template exists in both languages', () => {
    for (const lang of ['en', 'de'] as const) {
      const s = translations[lang].checkin.accessLevel;
      expect(s).toContain('{field}');
      expect(s).toContain('{label}');
      expect(s).toContain('{n}');
    }
    expect(
      translations.en.checkin.accessLevel
        .replace('{field}', 'Bloating')
        .replace('{label}', 'Moderate')
        .replace('{n}', '3'),
    ).toBe('Bloating, Moderate, level 3 of 5');
  });

  test('the save button is labelled and still wired', () => {
    expect(CHECKIN_CODE).toContain('accessibilityLabel={t.checkin.accessSave}');
    expect(CHECKIN_CODE).toContain('onPress={handleSave}');
    expect(translations.de.checkin.accessSave).not.toBe(translations.en.checkin.accessSave);
  });

  test('field semantics and save logic are untouched', () => {
    expect(CHECKIN_CODE).toContain("const [stoolType, setStoolType] = useState<number | null>(null);");
    expect(CHECKIN_CODE).toContain('const [bloating, setBloating] = useState(1);');
    expect(CHECKIN_CODE).toContain('const [energy, setEnergy] = useState(3);');
    expect(CHECKIN_CODE).toContain('const handleSave = async () => {');
  });
});

// ── 17–19. Protected areas ──────────────────────────────────────────────────

describe('nothing protected was touched', () => {
  test('scoring is unchanged', () => {
    const scoring = read('lib', 'scoring.ts');
    expect(scoring).toContain('let score = 50;');
    expect(scoring).toContain('REGULARITY_BONUS_MIN_CHECKINS = 5');
    expect(scoring).not.toContain('food_logs');
  });

  test('streak logic is unchanged', () => {
    const streaks = read('lib', 'streaks.ts');
    expect(streaks).toContain('export function calculateStreakFromDates');
    expect(streaks).toContain('lastDate === today || lastDate === yesterday');
  });

  test('purchase and restore wiring is unchanged', () => {
    expect(PAYWALL_CODE).toContain('onPress={handleCTA}');
    expect(PAYWALL_CODE).toContain('onPress={handleRestore}');
    const sub = read('lib', 'subscription.ts');
    expect(sub).toContain("const ENTITLEMENT_ID = 'premium';");
    expect(sub).toContain("selectPackage(current, 'monthly')");
    expect(sub).toContain("selectPackage(current, 'annual')");
  });

  test('no price or product identifier was introduced in the UI', () => {
    expect(PAYWALL_CODE).not.toMatch(/\$\d|\d+[.,]\d{2}\s?(EUR|USD)/);
  });
});

// ── 20–22. Profile brand and parity ─────────────────────────────────────────

describe('profile brand spelling', () => {
  test('the old "Gutwell" spelling is gone', () => {
    expect(PROFILE_CODE).not.toContain('>Gutwell<');
    expect(PROFILE_CODE).not.toMatch(/>\s*Gutwell\s*</);
  });

  test('it renders the shared brand string instead of a literal', () => {
    expect(PROFILE_CODE).toContain('{t.home.appName}');
    expect(translations.en.home.appName).toBe('GutWell AI');
    expect(translations.de.home.appName).toBe('GutWell AI');
  });
});

describe('localization integrity', () => {
  test('every key touched this stage exists in both languages', () => {
    const paywallKeys = [
      'accessClose', 'accessSelectMonthly', 'accessSelectAnnual', 'accessContinue',
      'accessRestore', 'accessTerms', 'accessPrivacy', 'gutScoreToday', 'featureSafeFoods',
    ] as const;
    for (const k of paywallKeys) {
      expect((translations.en.paywall as Record<string, string>)[k]).toBeTruthy();
      expect((translations.de.paywall as Record<string, string>)[k]).toBeTruthy();
    }
    for (const k of ['close', 'streakValueA11y'] as const) {
      expect((translations.en.components.streakPopup as unknown as Record<string, string>)[k]).toBeTruthy();
      expect((translations.de.components.streakPopup as unknown as Record<string, string>)[k]).toBeTruthy();
    }
    for (const k of ['accessLevel', 'accessSave'] as const) {
      expect((translations.en.checkin as unknown as Record<string, string>)[k]).toBeTruthy();
      expect((translations.de.checkin as unknown as Record<string, string>)[k]).toBeTruthy();
    }
  });

  test('no new hardcoded user-visible English in the touched surfaces', () => {
    for (const literal of ['Restore previous purchases', 'Save today', 'day streak', 'Gutwell']) {
      expect(PAYWALL_CODE).not.toContain(`'${literal}'`);
      expect(CHECKIN_CODE).not.toContain(`'${literal}'`);
      expect(STREAK_CODE).not.toContain(`'${literal}'`);
      expect(PROFILE_CODE).not.toContain(`'${literal}'`);
    }
  });
});
