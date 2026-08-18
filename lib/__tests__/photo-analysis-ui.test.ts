/**
 * lib/__tests__/photo-analysis-ui.test.ts
 *
 * Presentation guards for the flagship Photo Analysis flow, covering the three
 * problems found on a physical device in Build 1.0.0 (3):
 *
 *  1. The Generate CTA read as broken. Its enabled style was never the issue —
 *     Colors.secondary is a bright mint — but the DISABLED state is what a
 *     first-time user meets first (a description is required and nothing said
 *     so), and it was painted #2a3d34 at 0.55 opacity on a black background.
 *     A running analysis looked identical, because isAnalyzing also disables.
 *  2. Revision was reachable only through a FontSize.sm "+ Add more" text link
 *     that did not read as interactive.
 *  3. Covered in photo-analysis-history.test.ts.
 *
 * Source-text assertions: this screen is ~3k lines with native modules
 * throughout (camera, voice, StoreKit), and rendering it in jsdom would test
 * the mocks. What is pinned here is what the reviewer would look at in a diff.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { translations } from '../i18n';

const root = join(__dirname, '..', '..');
const SCREEN = readFileSync(join(root, 'app', 'photo-analysis.tsx'), 'utf8');
const THEME = readFileSync(join(root, 'constants', 'theme.ts'), 'utf8');

/** Comments name the very things these tests ban, so strip them first. */
const code = SCREEN.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const styles = code.slice(code.indexOf('StyleSheet.create('));
const block = (name: string) => {
  const start = styles.indexOf(`  ${name}: {`);
  return start === -1 ? '' : styles.slice(start, styles.indexOf('  },', start));
};

describe('the Generate Analysis CTA reads as the primary action', () => {
  test('the enabled style is the bright brand green, unchanged', () => {
    expect(block('analyzeCombinedButton')).toContain('backgroundColor: Colors.secondary');
    // The token itself must stay bright — a dark value here would reintroduce
    // the reported symptom without touching this screen at all.
    expect(THEME).toContain("secondary: '#52B788'");
    expect(block('analyzeCombinedButtonText')).toContain("color: '#000000'");
  });

  test('the disabled style is tokenised, readable, and clearly distinct', () => {
    const disabled = block('analyzeCombinedButtonDisabled');
    expect(disabled).toContain('backgroundColor: Colors.disabled');
    // The old values, by name: an untokenised near-black at 0.55.
    expect(disabled).not.toContain('#2a3d34');
    expect(disabled).not.toContain('opacity: 0.55');
    const opacity = Number(/opacity:\s*([\d.]+)/.exec(disabled)?.[1]);
    expect(opacity).toBeGreaterThanOrEqual(0.65);
    expect(opacity).toBeLessThan(1);
    // Distinct from enabled, or the state would be invisible.
    expect(block('analyzeCombinedButton')).not.toContain('Colors.disabled');
  });

  test('loading is its own presentation, not the disabled one', () => {
    expect(code).toContain('{isAnalyzing ? (');
    const branch = code.slice(code.indexOf('{isAnalyzing ? ('), code.indexOf('</Pressable>', code.indexOf('{isAnalyzing ? (')));
    expect(branch).toContain('<ActivityIndicator');
    expect(branch).toContain('t.photoAnalysis.analysing');
  });

  test('the enable/disable logic itself is unchanged', () => {
    // The audit found a presentation bug, not a logic bug. isAnalyzing must
    // still disable the button — that is the double-submission guard.
    expect(code).toContain('const analyzeDisabled =\n    isAnalyzing ||');
    expect(code).toContain('disabled={analyzeDisabled}');
    expect(code).toContain('accessibilityState={{ disabled: analyzeDisabled }}');
  });

  test('a disabled CTA says why, and only for the recoverable reason', () => {
    expect(code).toContain('t.photoAnalysis.generateNeedsDescription');
    // Not shown while working, and not during onboarding, where a photo alone
    // is a legitimate submission.
    expect(code).toContain('{analyzeDisabled && !isAnalyzing && !isOnboarding && !mealDescription.trim() ?');
  });

  test('no new hardcoded colour was introduced by these states', () => {
    for (const name of ['analyzeCombinedButtonDisabled', 'analyzeHint']) {
      expect(`${name}: ${/#[0-9a-f]{6}/i.test(block(name))}`).toBe(`${name}: false`);
    }
  });
});

describe('refinement is discoverable after a result', () => {
  test('the subtle "+ Add more" link is gone', () => {
    expect(code).not.toContain('addMoreLink');
    expect(code).not.toContain('t.photoAnalysis.addMore');
    expect(styles).not.toContain('addMoreLinkText');
  });

  test('a single labelled CTA replaces it', () => {
    expect(code).toContain('t.photoAnalysis.refineAnalysis');
    expect(code).toContain('t.photoAnalysis.refineAnalysisHint');
    // One entry point, not two competing ones.
    expect(code.match(/t\.photoAnalysis\.refineAnalysis\b/g)?.length).toBe(2);
  });

  test('it sits beneath the analysis body, where the reader forms an opinion', () => {
    expect(code.indexOf('sanitizeAnalysisForDisplay(analysis)')).toBeLessThan(
      code.indexOf('styles.refineButton'),
    );
  });

  test('it routes into the EXISTING revision flow, not a new one', () => {
    const cta = code.slice(code.indexOf('styles.refineButton') - 900, code.indexOf('styles.refineButton'));
    expect(cta).toContain("setAccuracyAnswer((prev) => (prev === 'no' ? null : 'no'))");
    // No new screen, route or chat surface.
    expect(cta).not.toMatch(/router\.(push|navigate)/);
  });

  test('it is unmistakably interactive but secondary to the result', () => {
    const b = block('refineButton');
    expect(b).toContain('borderColor: Colors.secondary');
    expect(b).toContain('borderWidth: 1');
    // Outlined, never filled with the primary CTA colour.
    expect(b).not.toContain('backgroundColor: Colors.secondary');
    expect(Number(/minHeight:\s*(\d+)/.exec(b)?.[1])).toBeGreaterThanOrEqual(44);
    expect(code).toContain('accessibilityRole="button"');
    expect(code).toContain('accessibilityHint={t.photoAnalysis.refineAnalysisHint}');
  });

  test('it stays available after a revision, so corrections can be repeated', () => {
    // submitChatCorrection clears accuracyAnswer rather than latching a
    // terminal state, and the CTA is not conditioned on revision count.
    expect(code).toContain('setAccuracyAnswer(null);');
    const cta = code.slice(code.indexOf('styles.refineButton') - 900, code.indexOf('styles.refineButton'));
    expect(cta).not.toMatch(/userFeedback\.length|hasRevised|revisionCount/);
  });

  test('revision still goes through meal_revise with prior context', () => {
    expect(code).toContain('reviseMealAnalysis({');
    expect(code).toContain('previousAnalysis:');
    expect(code).toContain('priorUserCorrections: userFeedback');
    expect(code).toContain('setUserFeedback((prior) => [...prior, correction]);');
  });
});

describe('the flow that already worked still works', () => {
  test('every preserved capability is still wired', () => {
    for (const anchor of [
      'launchCameraAsync',
      'launchImageLibraryAsync',
      'ensurePhotoEntitlement',
      'setTextOnlyMode(false)',
      'analyzeMealPhoto(imageBase64',
      'analyzeMealText(',
      'reviseMealAnalysis({',
      'locationContext',
      'afterMealActivity',
      'analysisRequestIdRef',
    ]) {
      expect(`${anchor}: ${code.includes(anchor)}`).toBe(`${anchor}: true`);
    }
  });
});

describe('new copy is localized and makes no medical claim', () => {
  const KEYS = [
    'refineAnalysis',
    'refineAnalysisHint',
    'analysing',
    'generateNeedsDescription',
    'mealTitleFallback',
  ] as const;

  test('every new key exists in EN and DE', () => {
    for (const lang of ['en', 'de'] as const) {
      for (const key of KEYS) {
        const value = translations[lang].photoAnalysis[key];
        expect(`${lang}.${key}: ${typeof value === 'string' && value.length > 0}`)
          .toBe(`${lang}.${key}: true`);
      }
    }
  });

  test('German is translated, not copied from English', () => {
    for (const key of KEYS) {
      expect(`${key}`).toBe(`${key}`);
      expect(translations.de.photoAnalysis[key]).not.toBe(translations.en.photoAnalysis[key]);
    }
  });

  test('the approved wording is what ships', () => {
    const en = translations.en.photoAnalysis;
    const de = translations.de.photoAnalysis;
    expect(en.refineAnalysis).toBe('Refine analysis');
    expect(en.refineAnalysisHint).toBe('Correct the meal, add details, or ask a follow-up');
    expect(de.refineAnalysis).toBe('Analyse verfeinern');
    expect(de.refineAnalysisHint).toBe('Mahlzeit korrigieren, Details ergänzen oder nachfragen');
  });

  test('no diagnosis or treatment language is introduced', () => {
    for (const lang of ['en', 'de'] as const) {
      for (const key of KEYS) {
        expect(`${lang}.${key}`).toBe(`${lang}.${key}`);
        expect(translations[lang].photoAnalysis[key]).not.toMatch(
          /diagnos|treat(ment|s)?\b|cure|prevent|disease|symptom of|medical advice|heilen|behandl|diagnos/i,
        );
      }
    }
  });
});
