/**
 * Shared pre-signup language switcher.
 *
 * The component is presentational and the screens are too entangled to render
 * in jest, so these assert the properties structurally. They are chosen for the
 * failure modes that would actually hurt:
 *
 *   - a second source of language truth appearing in the component
 *   - the switcher navigating, which would lose the user's place
 *   - something keyed on language, which would remount and wipe answers
 *   - it leaking onto post-signup screens where language belongs in Settings
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { translations } from '../i18n';

const root = join(__dirname, '..', '..');
const read = (...p: string[]) => readFileSync(join(root, ...p), 'utf8');

/** Comments stripped — assertions about absent code must not match prose. */
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const SWITCHER = read('components', 'LanguageSwitcher.tsx');
const SWITCHER_CODE = strip(SWITCHER);

const CONSUMERS = {
  welcome: read('app', '(onboarding)', 'welcome.tsx'),
  questions: read('app', '(onboarding)', 'questions.tsx'),
  example: read('app', '(onboarding)', 'example.tsx'),
};

const EXCLUDED = {
  signup: read('app', '(auth)', 'signup.tsx'),
  login: read('app', '(auth)', 'login.tsx'),
  photoAnalysis: read('app', 'photo-analysis.tsx'),
  notifications: read('app', '(onboarding)', 'notifications.tsx'),
};

describe('single source of truth', () => {
  test('the switcher holds no language state of its own', () => {
    // A local copy of the language is the one bug that would let the chip and
    // the app disagree. The only state here is whether the menu is open.
    expect(SWITCHER_CODE).not.toMatch(/useState<AppLanguage>/);
    // Exactly one useState CALL SITE (the import also contains the word), and
    // it is the menu-open flag — nothing that mirrors the language.
    expect(SWITCHER_CODE.match(/=\s*useState[<(]/g)).toHaveLength(1);
    expect(SWITCHER_CODE).toContain('const [menuOpen, setMenuOpen] = useState(false)');
  });

  test('it reads and writes only through the existing context', () => {
    expect(SWITCHER_CODE).toContain("useLanguage()");
    expect(SWITCHER_CODE).toContain('await setLanguage(next)');
    // No direct persistence — saveLanguage is context's job, not the chip's.
    expect(SWITCHER_CODE).not.toContain('saveLanguage');
    expect(SWITCHER_CODE).not.toContain('AsyncStorage');
  });

  test('it offers exactly the supported languages, from the shared list', () => {
    expect(SWITCHER_CODE).toContain('SUPPORTED_LANGUAGES.map');
    expect(SWITCHER_CODE).toContain('LANGUAGE_LABELS[lang]');
    // Not a hardcoded pair that could drift from lib/language.ts.
    expect(SWITCHER_CODE).not.toMatch(/\['en',\s*'de'\]/);
  });
});

describe('state preservation', () => {
  test('the switcher never navigates', () => {
    // Any router call here would move the user off the screen they are on,
    // losing their step and their answers.
    expect(SWITCHER_CODE).not.toContain('router.');
    expect(SWITCHER_CODE).not.toContain('expo-router');
  });

  test('the switcher never touches onboarding answers or the stage', () => {
    for (const banned of ['onboarding_answers', 'onboarding_stage', 'saveLocalStage', 'persistStage']) {
      expect(SWITCHER_CODE).not.toContain(banned);
    }
  });

  test('nothing in the tree is keyed on language, so no consumer can remount', () => {
    // A key={language} anywhere above these screens would discard `answers`
    // and `index` on every switch. This is the assertion that guards it.
    const layout = read('app', '_layout.tsx');
    for (const src of [layout, ...Object.values(CONSUMERS)]) {
      expect(strip(src)).not.toMatch(/key=\{\s*language\s*\}/);
    }
  });

  test('selecting the current language is a no-op', () => {
    expect(SWITCHER_CODE).toContain('if (next === language) return;');
  });
});

describe('placement — present on the four pre-signup screens', () => {
  test('all three files render it', () => {
    // Three files, four screens: questions.tsx is the stepper and covers both
    // the goal step and the feeling step.
    for (const [name, src] of Object.entries(CONSUMERS)) {
      expect(`${name}:${src}`).toContain('<LanguageSwitcher />');
      expect(src).toContain("from '../../components/LanguageSwitcher'");
    }
  });

  test('welcome no longer carries its own duplicate implementation', () => {
    const w = strip(CONSUMERS.welcome);
    expect(w).not.toContain('languageChip');
    expect(w).not.toContain('menuBackdrop');
    expect(w).not.toContain('SUPPORTED_LANGUAGES');
    expect(w).not.toContain('setLanguageMenuOpen');
  });

  test('questions renders it outside the scrolling step content', () => {
    const q = CONSUMERS.questions;
    expect(q.indexOf('<LanguageSwitcher />')).toBeLessThan(q.indexOf('<StepContent'));
  });
});

describe('placement — absent from post-signup screens', () => {
  test('signup, login, photo analysis and notifications do not render it', () => {
    for (const [name, src] of Object.entries(EXCLUDED)) {
      expect(`${name} must not import it`).toBeTruthy();
      expect(src).not.toContain('<LanguageSwitcher />');
      expect(src).not.toContain('components/LanguageSwitcher');
    }
  });
});

describe('accessibility', () => {
  test('the chip announces the current language and keeps a 44pt target', () => {
    expect(SWITCHER_CODE).toContain('accessibilityRole="button"');
    expect(SWITCHER_CODE).toContain('${t.welcome.languageLabel}: ${LANGUAGE_LABELS[language]}');
    expect(SWITCHER_CODE).toContain('minHeight: 44');
    expect(SWITCHER_CODE).toContain('minWidth: 44');
  });

  test('the menu keeps VoiceOver focus and marks the selected option', () => {
    expect(SWITCHER_CODE).toContain('accessibilityViewIsModal');
    expect(SWITCHER_CODE).toContain('accessibilityState={{ selected }}');
  });

  test('selection is shown by an icon, not colour alone', () => {
    expect(SWITCHER_CODE).toContain('name="checkmark"');
  });
});

describe('large Dynamic Type', () => {
  test('only the compact code is capped, and the tap target is not', () => {
    expect(SWITCHER_CODE).toContain('maxFontSizeMultiplier={CODE_MAX_FONT_SCALE}');
    // Exactly one capped text node — the two-letter code. Capping anything else
    // would be disabling Dynamic Type by the back door.
    expect(SWITCHER_CODE.match(/maxFontSizeMultiplier/g)).toHaveLength(1);
    // The tap target is set in points, so it cannot shrink with the cap.
    expect(SWITCHER_CODE).toContain('minHeight: 44');
  });

  test('the questions header yields width rather than pushing the chip away', () => {
    const q = CONSUMERS.questions;
    const block = q.slice(q.indexOf('progressWrap: {'), q.indexOf('progressWrap: {') + 220);
    expect(block).toContain('flexShrink: 1');
  });
});

describe('localization', () => {
  test('every key the switcher uses exists in EN and DE', () => {
    for (const lang of [translations.en, translations.de]) {
      expect(lang.welcome.languageLabel).toBeTruthy();
      expect(lang.welcome.languageModalTitle).toBeTruthy();
      expect(lang.welcome.accessLanguageHint).toBeTruthy();
      expect(lang.welcome.accessLanguageOptionHint).toBeTruthy();
      expect(lang.common.close).toBeTruthy();
    }
  });

  test('no Persian and no RTL were reintroduced', () => {
    expect(Object.keys(translations).sort()).toEqual(['de', 'en']);
    expect(SWITCHER_CODE).not.toContain('I18nManager');
    expect(SWITCHER_CODE).not.toMatch(/'fa'/);
  });
});
