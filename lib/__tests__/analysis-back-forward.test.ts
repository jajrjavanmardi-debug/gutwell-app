/**
 * lib/__tests__/analysis-back-forward.test.ts
 *
 * Two Build 8 device findings, both longstanding rather than new:
 *
 *   1. Back from the result preserved every input AND the analysis, but nothing
 *      led forward again. Step 3 was reachable only by FINISHING an analysis,
 *      so the only route back to a finished result was to run it a second time
 *      — real provider spend for a navigation action, returning a different
 *      answer because generation is not deterministic. The analysis was still
 *      in memory the whole time; it was simply unreachable.
 *
 *   2. Profile's row to /settings was labelled "Preferences" in English, so
 *      anyone hunting for Settings could not find it. German already read
 *      "Einstellungen". Post-sign-up language switching lives behind that row.
 *
 * The screen has no render harness in this repo, so wiring is asserted against
 * the shipped source the way ai-cost-control.test.ts does.
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
const PROFILE = read('app', '(tabs)', 'profile.tsx');
const PROFILE_CODE = strip(PROFILE);

const LANGS = ['en', 'de'] as const;

/** The JSX of the forward control, comments removed. */
function viewAnalysisBlock(): string {
  const anchor = SCREEN_CODE.indexOf('{analysis.trim() ? (');
  expect(anchor).toBeGreaterThan(-1);
  const end = SCREEN_CODE.indexOf(') : null}', anchor);
  expect(end).toBeGreaterThan(anchor);
  const block = SCREEN_CODE.slice(anchor, end);
  // A slice that collapsed to nothing would pass every assertion below.
  expect(block.length).toBeGreaterThan(200);
  return block;
}

// ─── Back still preserves state ──────────────────────────────────────────────

describe('Back from the result preserves the session', () => {
  const handleBack = SCREEN.slice(
    SCREEN.indexOf('const handleBack = () => {'),
    SCREEN.indexOf('const handleBack = () => {') + 700,
  );

  test('step 3 → step 2 only moves the step and clears the accuracy prompt', () => {
    const branch = handleBack.slice(
      handleBack.indexOf('} else if (wizardStep === 3) {'),
      handleBack.indexOf('} else if (wizardStep === 2) {'),
    );
    expect(branch).toContain('setWizardStep(2)');
    expect(branch).toContain('setAccuracyAnswer(null)');
  });

  test('it clears none of the analysis session', () => {
    const branch = strip(
      handleBack.slice(
        handleBack.indexOf('} else if (wizardStep === 3) {'),
        handleBack.indexOf('} else if (wizardStep === 2) {'),
      ),
    );
    // The state that made the meal reachable must survive the transition.
    for (const cleared of [
      'setAnalysis(',
      'setPhotoUri(',
      'setLastImageBase64(',
      'setMealDescription(',
      'setMealIdentity(',
      'setUserFeedback(',
    ]) {
      expect(`step3→2 must not call ${cleared}`).toBeTruthy();
      expect(branch).not.toContain(cleared);
    }
  });

  test('step 2 → step 1 still preserves the image', () => {
    const branch = strip(
      handleBack.slice(handleBack.indexOf('} else if (wizardStep === 2) {')),
    );
    expect(branch).toContain('setWizardStep(1)');
    expect(branch).not.toContain('setPhotoUri(');
    expect(branch).not.toContain('setLastImageBase64(');
  });

  test('Back never mints or resets the analysis request id', () => {
    expect(strip(handleBack)).not.toContain('analysisRequestIdRef');
  });
});

// ─── The forward control ─────────────────────────────────────────────────────

describe('View analysis reopens the existing result', () => {
  test('it renders only when a non-empty analysis exists', () => {
    // The gate is the analysis itself — not the photo, so the text-only path
    // gets the same route back to its result.
    expect(SCREEN_CODE).toContain('{analysis.trim() ? (');
    const block = viewAnalysisBlock();
    expect(block).not.toContain('photoUri &&');
    expect(block).not.toContain('lastImageBase64 &&');
    expect(block).not.toContain('textOnlyMode');
  });

  test('pressing it only changes the step', () => {
    const block = viewAnalysisBlock();
    expect(block).toContain('onPress={() => setWizardStep(3)}');
  });

  test('it never triggers an analysis', () => {
    const block = viewAnalysisBlock();
    for (const forbidden of [
      'handleGenerateAnalysis',
      'runPhotoAnalysis',
      'runTextAnalysis',
      'analyzeMeal',
      'analyzeMealText',
      'newAnalysisRequestId',
      'analysisRequestIdRef',
    ]) {
      expect(`View analysis must not reference ${forbidden}`).toBeTruthy();
      expect(block).not.toContain(forbidden);
    }
  });

  test('it neither mutates the result nor persists anything', () => {
    const block = viewAnalysisBlock();
    for (const forbidden of [
      'setAnalysis(',
      'setMealIdentity(',
      'savePhotoAnalysisHistoryItem',
      'saveMealLog',
      'supabase',
    ]) {
      expect(block).not.toContain(forbidden);
    }
  });

  test('it is labelled through the language system, in both languages', () => {
    const block = viewAnalysisBlock();
    expect(block).toContain('t.photoAnalysis.viewAnalysis');
    // No English literal baked into the screen.
    expect(block).not.toContain("'View analysis'");
    expect(translations.en.photoAnalysis.viewAnalysis).toBe('View analysis');
    expect(translations.de.photoAnalysis.viewAnalysis).toBe('Analyse anzeigen');
  });

  test('the two actions read differently, so neither is mistaken for the other', () => {
    for (const lang of LANGS) {
      const p = translations[lang].photoAnalysis;
      expect(p.viewAnalysis).not.toBe(p.generateAnalysis);
    }
    // "View"/"anzeigen" must not imply generating.
    expect(translations.en.photoAnalysis.viewAnalysis.toLowerCase()).not.toContain('generate');
    expect(translations.de.photoAnalysis.viewAnalysis.toLowerCase()).not.toContain('erstellen');
  });
});

// ─── Generate is untouched ───────────────────────────────────────────────────

describe('Generate Analysis is unchanged', () => {
  test('it is still present and still wired to its own handler', () => {
    expect(SCREEN_CODE).toContain('onPress={handleGenerateAnalysis}');
    expect(SCREEN_CODE).toContain('disabled={analyzeDisabled}');
    expect(SCREEN_CODE).toContain('t.photoAnalysis.generateAnalysis');
  });

  test('it still runs an analysis rather than reopening one', () => {
    const fn = strip(
      SCREEN.slice(
        SCREEN.indexOf('const handleGenerateAnalysis = () => {'),
        SCREEN.indexOf('const runTextAnalysis'),
      ),
    );
    expect(fn).toContain('runTextAnalysis(narrative)');
    expect(fn).toContain('runPhotoAnalysis(lastImageBase64, photoUri, narrative)');
    // It must NOT have gained a short-circuit; reopening is the other button's
    // job, and a silent skip here would make Generate stop regenerating.
    expect(fn).not.toContain('setWizardStep(3)');
  });

  test('the request id is still minted only for a genuinely new analysis', () => {
    // Four assignments in total, and the split is what keeps a retry free:
    //   2 GUARDED (`if (!current)`) at request time — so retrying the same
    //     meal reuses the id and reserves no second quota slot;
    //   2 UNCONDITIONAL resets — a new photo, and entering text-only mode,
    //     both of which really are a new logical analysis.
    // Navigation is in neither group, which is the property under test.
    const guarded = SCREEN_CODE.match(
      /if \(!analysisRequestIdRef\.current\) analysisRequestIdRef\.current = newAnalysisRequestId\(\);/g,
    ) ?? [];
    const all = SCREEN_CODE.match(/analysisRequestIdRef\.current = newAnalysisRequestId\(\)/g) ?? [];
    expect(guarded).toHaveLength(2);
    expect(all).toHaveLength(4);
    // Unconditional resets = all minus guarded.
    expect(all.length - guarded.length).toBe(2);
  });
});

// ─── Profile → Settings ──────────────────────────────────────────────────────

describe('Settings is discoverable from Profile', () => {
  test('the row still routes to /settings', () => {
    expect(PROFILE_CODE).toContain("router.push('/settings')");
  });

  test('the row uses the shared label key, not a literal', () => {
    const row = PROFILE_CODE.slice(
      PROFILE_CODE.indexOf('t.profile.preferences'),
      PROFILE_CODE.indexOf("router.push('/settings')") + 30,
    );
    expect(row).toContain('t.profile.preferences');
    expect(row).toContain("router.push('/settings')");
  });

  test('English says Settings, German says Einstellungen', () => {
    expect(translations.en.profile.preferences).toBe('Settings');
    expect(translations.de.profile.preferences).toBe('Einstellungen');
  });

  test('the English label is no longer the unfindable one', () => {
    expect(translations.en.profile.preferences).not.toBe('Preferences');
  });

  test('no second language-switching surface was added', () => {
    // Language switching stays in Settings; Profile must not grow its own.
    expect(PROFILE_CODE).not.toContain('LanguageSwitcher');
    expect(PROFILE_CODE).not.toContain('setLanguage(');
  });
});
