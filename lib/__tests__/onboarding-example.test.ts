/**
 * Example-analysis screen tests.
 *
 * The screen itself is presentational, so these lock down the two things that
 * can regress silently and matter most: the copy is claim-safe in both
 * languages, and it never describes a live scan or fake progress. The earlier
 * flow shipped a 2400ms simulated "analysing" bar; this screen replaced it, and
 * these tests exist so it cannot creep back in through copy.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { translations } from '../i18n';

const en = translations.en;
const de = translations.de;

const SCREEN = join(__dirname, '..', '..', 'app', '(onboarding)', 'example.tsx');
const source = readFileSync(SCREEN, 'utf8');

/**
 * Source with comments stripped.
 *
 * The prose in this screen deliberately *mentions* the things it must not do
 * ("no progress bar", "no scan overlay"), so assertions about banned primitives
 * have to look at code only or they fail on their own documentation.
 */
const code = source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

describe('route exists and is typed', () => {
  test('the screen file is present and default-exports a component', () => {
    expect(source).toContain('export default function ExampleScreen');
  });

  test('no temporary Href cast remains anywhere in the app entry or stepper', () => {
    for (const file of [
      join(__dirname, '..', '..', 'app', 'index.tsx'),
      join(__dirname, '..', '..', 'app', '(onboarding)', 'questions.tsx'),
      SCREEN,
    ]) {
      const text = readFileSync(file, 'utf8');
      expect(text).not.toContain('as Href');
      expect(text).not.toContain('PHASE 3');
    }
  });

  test('the example route is referenced with a plain typed path', () => {
    const questions = readFileSync(
      join(__dirname, '..', '..', 'app', '(onboarding)', 'questions.tsx'),
      'utf8',
    );
    expect(questions).toContain("router.push('/(onboarding)/example')");
  });
});

describe('stage transition and navigation', () => {
  test('the CTA advances the stage to signup before routing', () => {
    expect(source).toContain("saveLocalStage('signup')");
    const stageAt = source.indexOf("saveLocalStage('signup')");
    const routeAt = source.indexOf("router.push('/(onboarding)/profile-reveal')");
    expect(stageAt).toBeGreaterThan(-1);
    expect(routeAt).toBeGreaterThan(-1);
    // Order matters: a relaunch after a crash mid-navigation must resume at
    // signup, so the write has to happen first.
    expect(stageAt).toBeLessThan(routeAt);
  });

  /**
   * The example screen used to push straight to signup. The Gut Profile
   * Reveal now sits between them, so this asserts the WHOLE chain rather than
   * just this screen's next hop — a two-file assertion is what catches the
   * reveal being bypassed or orphaned, which a single-file one would not.
   *
   * The stage deliberately stays 'signup' across both screens: it names the
   * leg of the funnel, not the individual screen, and the reveal collects
   * nothing that could need resuming into.
   */
  test('the CTA routes to the Gut Profile Reveal, which routes on to signup', () => {
    expect(source).toContain("router.push('/(onboarding)/profile-reveal')");
    // The example screen no longer reaches signup directly.
    expect(source).not.toContain("router.push('/(auth)/signup')");

    const reveal = readFileSync(
      join(__dirname, '..', '..', 'app', '(onboarding)', 'profile-reveal.tsx'),
      'utf8',
    );
    expect(reveal).toContain("router.push('/(auth)/signup')");
  });

  test('the reveal does not touch the stage model', () => {
    // It is part of the 'signup' leg the example screen already wrote. A stage
    // write here would mean the OnboardingStage union and lib/routing.ts had
    // been widened for a screen that collects nothing.
    const reveal = readFileSync(
      join(__dirname, '..', '..', 'app', '(onboarding)', 'profile-reveal.tsx'),
      'utf8',
    );
    expect(reveal).not.toContain('saveLocalStage');
  });

  test('the existing sign-in path is preserved for returning users', () => {
    expect(source).toContain("router.push('/(auth)/login')");
  });

  test('no Apple or Google authentication was introduced', () => {
    expect(source).not.toMatch(/signInWithOAuth|AppleAuthentication|GoogleSignin/);
  });
});

describe('copy is present in both languages', () => {
  const keys = [
    'label',
    'intro',
    'mealName',
    'mealImageAlt',
    'gutImpactTitle',
    'gutImpactValue',
    'sensitivityTitle',
    'sensitivityValue',
    'betterOptionTitle',
    'betterOptionValue',
    'nextStepTitle',
    'nextStepValue',
    'disclaimer',
    'cta',
    'accessCta',
    'signIn',
    'accessSignIn',
  ] as const;

  test('every key exists in EN and DE', () => {
    for (const key of keys) {
      expect(en.example[key]).toBeTruthy();
      expect(de.example[key]).toBeTruthy();
    }
  });

  test('the required labels match the approved wording exactly', () => {
    expect(en.example.label).toBe('Example analysis');
    expect(de.example.label).toBe('Beispielanalyse');
    expect(en.example.cta).toBe('Create account');
    expect(de.example.cta).toBe('Konto erstellen');
  });

  test('the disclaimer matches the approved wording exactly', () => {
    expect(en.example.disclaimer).toBe('General wellness information, not a diagnosis.');
    expect(de.example.disclaimer).toBe(
      'Allgemeine Informationen zum Wohlbefinden, keine Diagnose.',
    );
  });

  test('German is genuinely translated, not copied English', () => {
    for (const key of ['label', 'intro', 'gutImpactValue', 'nextStepValue'] as const) {
      expect(de.example[key]).not.toBe(en.example[key]);
    }
  });
});

describe('copy safety', () => {
  const allCopy = [
    ...Object.values(en.example),
    ...Object.values(de.example),
  ]
    .join(' ')
    .toLowerCase();

  test('makes no diagnosis or treatment claim', () => {
    // "keine Diagnose" is the disclaimer denying diagnosis, so `diagnos` is
    // checked as a claim verb rather than a bare substring.
    for (const banned of [
      'diagnose your',
      'we diagnose',
      'treat ',
      'treatment for',
      'cure',
      'heilt',
      'behandelt',
      'therapie',
    ]) {
      expect(allCopy).not.toContain(banned);
    }
  });

  test('promises no measurable outcome', () => {
    expect(allCopy).not.toMatch(/\d+\s?%/);
    for (const banned of ['guarantee', 'garantiert', 'proven to', 'will reduce', 'wird reduzieren']) {
      expect(allCopy).not.toContain(banned);
    }
  });

  test('uses hedged language for the sensitivity section', () => {
    expect(en.example.sensitivityValue.toLowerCase()).toContain('may');
    expect(en.example.sensitivityValue.toLowerCase()).toContain('some people');
    expect(de.example.sensitivityValue.toLowerCase()).toContain('kann');
    expect(de.example.sensitivityValue.toLowerCase()).toContain('manche');
  });

  test('states plainly that the example is not the user\'s own data', () => {
    expect(en.example.intro.toLowerCase()).toContain('not your data');
    expect(de.example.intro.toLowerCase()).toContain('nicht deine daten');
  });

  test('never claims the example is personalised', () => {
    for (const banned of ['personalised', 'personalized', 'based on you', 'für dich berechnet']) {
      expect(allCopy).not.toContain(banned);
    }
  });
});

describe('no simulated scanning or loading', () => {
  test('copy contains no scanning or progress language', () => {
    const allCopy = [...Object.values(en.example), ...Object.values(de.example)]
      .join(' ')
      .toLowerCase();
    for (const banned of ['analysing…', 'analyzing…', 'scanning', 'wird gescannt', 'loading', 'lädt']) {
      expect(allCopy).not.toContain(banned);
    }
  });

  test('the screen has no timer, animation or progress primitives', () => {
    for (const banned of ['setTimeout', 'setInterval', 'Animated', 'ActivityIndicator', 'progress']) {
      expect(code).not.toContain(banned);
    }
  });

  test('the screen invents no Gut Score', () => {
    expect(code).not.toMatch(/gutScore|Gut Score|\/100/);
  });

  test('the screen opens no camera', () => {
    expect(code).not.toMatch(/ImagePicker|Camera|launchCamera/);
  });
});

describe('accessibility and small screens', () => {
  test('content scrolls rather than clipping', () => {
    expect(source).toContain('ScrollView');
    expect(source).toContain('contentContainerStyle');
  });

  test('the meal illustration carries an accessibility label', () => {
    expect(source).toContain('accessibilityLabel={t.example.mealImageAlt}');
    expect(source).toContain('accessibilityRole="image"');
  });

  test('the CTA exposes a descriptive accessibility label', () => {
    expect(source).toContain('accessibilityLabel={t.example.accessCta}');
    expect(source).toContain('accessibilityRole="button"');
  });

  test('headings are marked as headings', () => {
    expect(source).toContain('accessibilityRole="header"');
  });

  test('long strings can wrap instead of clipping', () => {
    // flexShrink on the wrapping text nodes — German meal name, section titles,
    // disclaimer — is what keeps larger Dynamic Type from truncating.
    expect(source.match(/flexShrink: 1/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });
});
