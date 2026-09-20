/**
 * lib/__tests__/text-only-switch-confirm.test.ts
 *
 * Step 1 offers two things at once: analyse the photo you just picked, and
 * abandon it for the text path. Only one of them was labelled honestly.
 *
 * The permanent text-only button sat directly above Next, and its subtitle
 * read "Tell us what you ate, ingredients, and how you feel." — which is what
 * you would write if you wanted the user to add context to their photo.
 * Tapping it ran startTextOnlyFlow(), which discards the image and switches
 * mode. Build 10 QA walked into exactly that: the photo vanished, the run went
 * out as meal_text_only, the text-only scope guard refused a question that was
 * never a meal description, and the whole thing was reported as a photo-mode
 * failure. The header still said "Photo Analysis", so nothing on screen
 * contradicted that reading.
 *
 * Build 11 fixed the header. These pin the trap itself shut: with a photo on
 * screen the button says what it costs, and the image is not cleared until the
 * user has agreed to lose it. The quota and entitlement fallbacks are
 * deliberately left alone — they call startTextOnlyFlow directly, because a
 * photo that cannot be analysed is not a photo worth confirming the loss of.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { translations } from '../i18n';

const root = join(__dirname, '..', '..');
const read = (...p: string[]) => readFileSync(join(root, ...p), 'utf8');

/** Comments stripped — assertions about absent code must not match prose. */
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const SCREEN = read('app', 'photo-analysis.tsx');
const SCREEN_CODE = strip(SCREEN);

const LANGS = ['en', 'de'] as const;

const slice = (src: string, from: string, to: string) => {
  const a = src.indexOf(from);
  const b = src.indexOf(to);
  expect(a).toBeGreaterThan(-1);
  expect(b).toBeGreaterThan(a);
  return src.slice(a, b);
};

/** The wrapper only — startTextOnlyFlow itself is deliberately excluded. */
const WRAPPER = strip(
  slice(SCREEN, 'const handleStartTextOnlyFromStep1', 'const submitChatCorrection'),
);
/** The real flow, which still owns every piece of state this touches. */
const FLOW = strip(
  slice(SCREEN, 'const startTextOnlyFlow = () => {', 'const handleStartTextOnlyFromStep1'),
);
const STEP1 = strip(
  slice(SCREEN, '{wizardStep === 1 ? (', '{wizardStep === 3 && isOnboarding ? ('),
);
/** The text-only button on Step 1 — its own Pressable, not an earlier one. */
const BUTTON = (() => {
  const a = STEP1.indexOf('onPress={handleStartTextOnlyFromStep1}');
  expect(a).toBeGreaterThan(-1);
  const b = STEP1.indexOf('</Pressable>', a);
  expect(b).toBeGreaterThan(a);
  return STEP1.slice(a, b);
})();
/** The visible title and subtitle, separately from the accessibility props. */
const TITLE = slice(BUTTON, 'styles.describeMealTitle', 'styles.describeMealSubtitle');
const SUBTITLE = BUTTON.slice(BUTTON.indexOf('styles.describeMealSubtitle'));
const A11Y = slice(BUTTON, 'accessibilityLabel', 'style={({ pressed })');

// ─── 1. No photo selected: nothing changes ───────────────────────────────────

describe('with no photo selected the text path is still one tap', () => {
  test('the wrapper calls startTextOnlyFlow directly', () => {
    expect(WRAPPER).toContain('if (!hasSelectedPhoto) {');
    expect(WRAPPER).toContain('startTextOnlyFlow();');
  });

  test('the direct call is reached before any dialog', () => {
    const direct = WRAPPER.indexOf('startTextOnlyFlow();');
    const dialog = WRAPPER.indexOf('Alert.alert');
    expect(direct).toBeGreaterThan(-1);
    expect(dialog).toBeGreaterThan(-1);
    // An early return above the dialog is the whole point: a user with no
    // photo has nothing to lose and must not be asked to confirm losing it.
    expect(direct).toBeLessThan(dialog);
    expect(WRAPPER.slice(direct, dialog)).toContain('return;');
  });

  test('the button still shows the original describe copy', () => {
    expect(BUTTON).toContain('t.photoAnalysis.describeMealCta');
    expect(BUTTON).toContain('t.photoAnalysis.describeMealHint');
    expect(translations.en.photoAnalysis.describeMealCta).toBe('Describe your meal instead');
  });

  test('the quota fallback subtitle survives in the no-photo branch', () => {
    expect(SUBTITLE).toContain('t.photoAnalysis.dailyLimitFallbackMessage');
  });

  test('the accessibility label and hint branch too', () => {
    // A sighted user and a VoiceOver user must be told the same thing.
    expect(A11Y).toContain('t.photoAnalysis.switchToTextCta');
    expect(A11Y).toContain('t.photoAnalysis.switchToTextHint');
    expect(A11Y).toContain('t.photoAnalysis.describeMealCta');
    expect(A11Y).toContain('t.photoAnalysis.describeMealHint');
  });
});

// ─── 2. Photo selected: the label tells the truth ────────────────────────────

describe('with a photo selected the button names what the tap costs', () => {
  test('hasSelectedPhoto covers both halves of the photo state', () => {
    // History restore sets photoUri with no base64. That image is on screen
    // and just as losable, so either half must arm the confirmation.
    expect(SCREEN_CODE).toContain(
      'const hasSelectedPhoto = Boolean(photoUri || lastImageBase64);',
    );
  });

  test('the title switches away from "Describe your meal instead"', () => {
    // Asserted on the title element itself. Against the whole button this
    // passes on an accessibilityLabel that branches while the visible title
    // stays frozen on the old copy — a half-fix that looks correct in source
    // and reads identically on screen to the bug.
    expect(TITLE).toContain('hasSelectedPhoto');
    expect(TITLE).toContain('t.photoAnalysis.switchToTextCta');
    expect(TITLE).toContain('t.photoAnalysis.describeMealCta');
    expect(translations.en.photoAnalysis.switchToTextCta).toBe('Use text instead');
  });

  test('the subtitle says the photo will be removed', () => {
    // Same reasoning as the title: the subtitle element, not the button.
    expect(SUBTITLE).toContain('hasSelectedPhoto');
    expect(SUBTITLE).toContain('t.photoAnalysis.switchToTextHint');
    expect(translations.en.photoAnalysis.switchToTextHint).toMatch(/remove this photo/i);
    // Both halves of the meaning, not just one.
    expect(translations.en.photoAnalysis.switchToTextHint).toMatch(/text-only/i);
  });

  test('the tap does NOT go straight to startTextOnlyFlow', () => {
    // The defect: onPress={startTextOnlyFlow} on Step 1, which discarded the
    // image with no warning at all.
    expect(STEP1).not.toContain('onPress={startTextOnlyFlow}');
    expect(STEP1).toContain('onPress={handleStartTextOnlyFromStep1}');
  });

  test('a confirmation dialog stands in the way', () => {
    expect(WRAPPER).toContain('Alert.alert');
    expect(WRAPPER).toContain('t.photoAnalysis.switchToTextConfirmTitle');
    expect(WRAPPER).toContain('t.photoAnalysis.switchToTextConfirmMessage');
    expect(translations.en.photoAnalysis.switchToTextConfirmMessage).toMatch(
      /remove your selected photo/i,
    );
  });
});

// ─── 3. Cancel is inert ──────────────────────────────────────────────────────

describe('cancelling leaves the screen exactly as it was', () => {
  const BUTTONS = WRAPPER.slice(WRAPPER.indexOf('Alert.alert'));

  test('the cancel button carries no handler at all', () => {
    // No onPress means there is nothing for Cancel to do but dismiss. This is
    // stronger than asserting it calls the right thing.
    expect(BUTTONS).toContain(
      "{ text: t.photoAnalysis.switchToTextCancel, style: 'cancel' }",
    );
  });

  test('the wrapper mutates no state whatsoever', () => {
    // The decisive guarantee behind every Cancel requirement: photo state,
    // mode, step and request id are untouchable from here, because the only
    // thing this function can do is call startTextOnlyFlow.
    for (const setter of [
      'setPhotoUri',
      'setLastImageBase64',
      'setTextOnlyMode',
      'setWizardStep',
      'setAnalysis',
      'setPlanBMessage',
      'setUserFeedback',
      'newAnalysisRequestId',
      'analysisRequestIdRef',
    ]) {
      expect(`${setter} in wrapper: ${WRAPPER.includes(setter)}`).toBe(
        `${setter} in wrapper: false`,
      );
    }
  });

  test('cancelling cannot navigate', () => {
    for (const nav of ['router.push', 'router.back', 'router.replace']) {
      expect(`${nav} in wrapper: ${WRAPPER.includes(nav)}`).toBe(`${nav} in wrapper: false`);
    }
  });

  test('cancelling cannot spend quota', () => {
    for (const call of ['analyzeMealPhoto', 'analyzeMealText', 'reviseMealAnalysis']) {
      expect(`${call} in wrapper: ${WRAPPER.includes(call)}`).toBe(`${call} in wrapper: false`);
    }
  });
});

// ─── 4. Confirm delegates, never duplicates ─────────────────────────────────

describe('confirming reuses the one real implementation', () => {
  test('the confirm button calls the existing startTextOnlyFlow', () => {
    expect(WRAPPER).toContain('onPress: startTextOnlyFlow');
  });

  test('the confirm action is labelled with the same words as the button', () => {
    expect(WRAPPER).toContain('text: t.photoAnalysis.switchToTextCta');
  });

  test('the destructive action is marked as such', () => {
    expect(WRAPPER).toContain("style: 'destructive'");
  });

  test('the photo clearing still lives in exactly one place', () => {
    expect(FLOW).toContain('setPhotoUri(null)');
    expect(FLOW).toContain("setLastImageBase64('')");
    // One owner, screen-wide: startTextOnlyFlow. A second copy would be free to
    // drift, and a wrapper that cleared state itself would make the dialog a
    // formality rather than a gate.
    expect(SCREEN_CODE.match(/setTextOnlyMode\(true\)/g) ?? []).toHaveLength(1);
  });
});

// ─── 5. EN/DE parity ────────────────────────────────────────────────────────

describe('both languages carry the whole change', () => {
  const KEYS = [
    'switchToTextCta',
    'switchToTextHint',
    'switchToTextConfirmTitle',
    'switchToTextConfirmMessage',
    'switchToTextCancel',
  ] as const;

  test('every new key exists and is non-empty in both languages', () => {
    for (const lang of LANGS) {
      for (const key of KEYS) {
        const v = translations[lang].photoAnalysis[key];
        expect(typeof v).toBe('string');
        expect(v.trim().length).toBeGreaterThan(0);
      }
    }
  });

  test('German is genuinely translated, not the English string', () => {
    for (const key of KEYS) {
      expect(translations.de.photoAnalysis[key]).not.toBe(
        translations.en.photoAnalysis[key],
      );
    }
  });

  test('the German wording keeps both halves of the meaning', () => {
    const de = translations.de.photoAnalysis;
    expect(de.switchToTextCta).toBe('Stattdessen Text verwenden');
    // switches mode …
    expect(de.switchToTextHint).toMatch(/Textanalyse/i);
    expect(de.switchToTextConfirmTitle).toMatch(/Textanalyse/i);
    // … and removes the photo.
    expect(de.switchToTextHint).toMatch(/entfern/i);
    expect(de.switchToTextConfirmMessage).toMatch(/entfernt/i);
    expect(de.switchToTextConfirmMessage).toMatch(/Foto/i);
    expect(de.switchToTextCancel).toBe('Abbrechen');
  });

  test('the English wording keeps both halves of the meaning', () => {
    const en = translations.en.photoAnalysis;
    expect(en.switchToTextConfirmTitle).toBe('Switch to text-only analysis?');
    expect(en.switchToTextCancel).toBe('Cancel');
    expect(en.switchToTextConfirmMessage).toMatch(/describe the meal instead/i);
  });
});

// ─── 6. Everything this change must not touch ───────────────────────────────

describe('the surrounding contract is unchanged', () => {
  test('the fallback paths still enter the text flow with no confirmation', () => {
    // Quota and entitlement callers are the reason the dialog lives in the
    // wrapper rather than inside startTextOnlyFlow.
    expect(SCREEN_CODE.match(/onPress: startTextOnlyFlow/g) ?? []).toHaveLength(4);
  });

  test('storeCapturedPhoto still leaves text-only mode', () => {
    const store = slice(SCREEN, 'const storeCapturedPhoto =', 'const handleBack = () => {');
    expect(store).toContain('setTextOnlyMode(false)');
    expect(store).toContain('setLastImageBase64(asset.base64)');
  });

  test('startTextOnlyFlow still clears the photo when it switches mode', () => {
    expect(FLOW).toContain('setTextOnlyMode(true)');
    expect(FLOW).toContain('setPhotoUri(null)');
    expect(FLOW).toContain("setLastImageBase64('')");
    expect(FLOW).toContain('setWizardStep(2)');
  });

  test('the image-first gate is untouched', () => {
    expect(SCREEN_CODE).toContain(
      'textOnlyMode ? !mealDescription.trim() : !lastImageBase64.trim()',
    );
    // Photo mode still requires no description; text mode still requires one.
    expect(SCREEN_CODE).toContain('t.photoAnalysis.describeRequiredMessage');
  });

  test('the Build 11 mode-aware header survives', () => {
    expect(SCREEN_CODE).toContain(
      '{textOnlyMode ? t.photoAnalysis.describeTitle : t.photoAnalysis.title}',
    );
  });

  test('quota mode mapping is unchanged', () => {
    const engine = read('lib', 'RecommendationEngine.ts');
    for (const mode of ['meal_text', 'meal_text_only', 'meal_revise']) {
      expect(engine).toContain(`mode: '${mode}'`);
    }
  });

  test('the backend contract is untouched', () => {
    const fn = read('supabase', 'functions', 'analyze-food', 'index.ts');
    expect(fn).toContain('No image provided');
    expect(fn).toContain('meal_text_only does not accept an image');
    expect(fn).toContain('SCOPE GUARD (HIGHEST PRIORITY)');
  });

  test('Next still advances the photo path directly', () => {
    expect(STEP1).toContain('onPress={() => setWizardStep(2)}');
  });
});
