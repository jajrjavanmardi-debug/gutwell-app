/**
 * lib/__tests__/image-first-analysis.test.ts
 *
 * Photo analysis is image-first.
 *
 * It was not before. The client made a description mandatory, and the server
 * then told the model that whatever the person typed was authoritative and the
 * photograph existed only to fill gaps. Someone photographing a dish precisely
 * because they could not name it still had to name it, and their guess then
 * outranked the picture — so the feature marketed as image recognition was, in
 * the normal flow, text recognition with a photo attached.
 *
 * Three properties are pinned here:
 *   - photo mode needs a photo and nothing else;
 *   - text-only mode still needs words, because it has no image;
 *   - the prompt treats notes as context, not as identity — while an explicit
 *     naming of a different food, and the whole meal_revise correction path,
 *     still override the image.
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
const EDGE = read('supabase', 'functions', 'analyze-food', 'index.ts');
const EDGE_CODE = strip(EDGE);

const LANGS = ['en', 'de'] as const;

/** The analyzeDisabled declaration, comments removed so its own `;` bounds it. */
function gate(): string {
  const start = SCREEN_CODE.indexOf('const analyzeDisabled =');
  expect(start).toBeGreaterThan(-1);
  const g = SCREEN_CODE.slice(start, SCREEN_CODE.indexOf(';', start));
  expect(g.length).toBeGreaterThan(80);
  return g;
}

/** The normal photo-analysis mealLine assignment. */
function mealLine(): string {
  const start = EDGE_CODE.indexOf('const mealLine = narrative');
  expect(start).toBeGreaterThan(-1);
  const block = EDGE_CODE.slice(start, EDGE_CODE.indexOf('\n\n', start));
  expect(block.length).toBeGreaterThan(200);
  return block;
}

// ─── Client gate ─────────────────────────────────────────────────────────────

describe('a photograph is sufficient on its own', () => {
  test('the gate asks photo mode for an image and text mode for words', () => {
    expect(gate()).toContain('textOnlyMode ? !mealDescription.trim() : !lastImageBase64.trim()');
  });

  test('photo mode has no description requirement left anywhere in the gate', () => {
    const g = gate();
    // The old clause, and the flag that used to exempt onboarding from it.
    expect(g).not.toContain('!isOnboarding && !mealDescription.trim()');
    expect(g).not.toContain('isOnboarding');
    // A bare description test outside the textOnlyMode ternary would re-impose
    // the requirement on both modes.
    expect(g.match(/mealDescription\.trim\(\)/g) ?? []).toHaveLength(1);
  });

  test('text-only mode still requires words', () => {
    expect(gate()).toContain('!mealDescription.trim()');
    const fn = strip(
      SCREEN.slice(
        SCREEN.indexOf('const handleGenerateAnalysis = () => {'),
        SCREEN.indexOf('const runTextAnalysis'),
      ),
    );
    // The text branch still alerts and returns before analysing.
    expect(fn).toContain('if (!narrative) {');
    expect(fn).toContain('Alert.alert');
    expect(fn.indexOf('Alert.alert')).toBeLessThan(fn.indexOf('runTextAnalysis(narrative)'));
  });

  test('the photo branch analyses without any description guard', () => {
    const fn = strip(
      SCREEN.slice(
        SCREEN.indexOf('const handleGenerateAnalysis = () => {'),
        SCREEN.indexOf('const runTextAnalysis'),
      ),
    );
    const photoTail = fn.slice(fn.indexOf('if (!lastImageBase64.trim()'));
    expect(photoTail).toContain('runPhotoAnalysis(lastImageBase64, photoUri, narrative)');
    expect(photoTail).not.toContain('Alert.alert');
    expect(photoTail).not.toContain('isOnboarding');
  });

  test('the description-required hint is shown only in text-only mode', () => {
    expect(SCREEN_CODE).toContain(
      'textOnlyMode && analyzeDisabled && !isAnalyzing && !mealDescription.trim() ?',
    );
    expect(SCREEN_CODE).not.toContain(
      'analyzeDisabled && !isAnalyzing && !isOnboarding && !mealDescription.trim() ?',
    );
  });

  test('voice stays optional and still blocks a mid-recording submit', () => {
    expect(gate()).toContain('isListening');
    expect(SCREEN_CODE).toContain('t.photoAnalysis.generateNeedsRecordingStopped');
  });
});

// ─── The diet-prefix defect ──────────────────────────────────────────────────

describe('the diet prefix cannot become the description', () => {
  test('both payload sites require real user words before prefixing', () => {
    const matches = SCREEN_CODE.match(/gutProfileContext\.dietType && \w+\.trim\(\)/g) ?? [];
    expect(matches).toHaveLength(2);
  });

  test('neither site prefixes on dietType alone', () => {
    // `dietType ? ...` with no companion check produced "(My diet is vegan.) "
    // for an empty description — non-empty, so the server read it as the
    // person having named the meal.
    expect(SCREEN_CODE).not.toMatch(/userFeelingsNarrative:\s*gutProfileContext\.dietType\s*\n?\s*\?/);
  });

  test('the prefix still travels with a real description', () => {
    expect(SCREEN_CODE).toContain('`(My diet is ${gutProfileContext.dietType}.) ${feelingsNarrative}`');
    expect(SCREEN_CODE).toContain('`(My diet is ${gutProfileContext.dietType}.) ${description}`');
  });
});

// ─── Server prompt precedence ────────────────────────────────────────────────

describe('the photo prompt identifies the meal from the image', () => {
  test('both branches lead with identifying what is visible', () => {
    const m = mealLine();
    expect(m.match(/Identify the most likely meal, dish, or drink visible in the photo/g) ?? [])
      .toHaveLength(2);
  });

  test('the old authoritative-description wording is gone', () => {
    const m = mealLine();
    expect(m).not.toContain('as authoritative');
    expect(m).not.toContain('use the photo only to fill gaps');
    expect(m).not.toContain('If their words conflict with the photo, follow their words');
    // And nowhere else in the normal photo prompt either.
    const photoPrompt = EDGE_CODE.slice(
      EDGE_CODE.indexOf('Analyze this meal photo for gut health'),
      EDGE_CODE.indexOf('// --- meal_revise'),
    );
    expect(photoPrompt).not.toContain('as authoritative');
  });

  test('notes are named as supplementary context, not identity', () => {
    const m = mealLine();
    expect(m).toContain('SUPPLEMENTARY');
    expect(m).toContain('not to replace what is clearly in the image');
  });

  test('an explicit different-food naming may still override the image', () => {
    expect(mealLine()).toContain('explicitly name a different food');
  });

  test('ambiguity produces cautious identification, not invented certainty', () => {
    const m = mealLine();
    expect(m.match(/If the photo is ambiguous/g) ?? []).toHaveLength(2);
    expect(m).toContain('rather than inventing certainty');
  });

  test('the no-notes branch never claims the person said anything', () => {
    const m = mealLine();
    const noNotes = m.slice(m.indexOf(': `'));
    expect(noNotes).toContain('Identify the most likely meal');
    expect(noNotes).not.toContain('notes');
    expect(noNotes).not.toContain('${narrative}');
  });
});

// ─── Untouched neighbours ────────────────────────────────────────────────────

describe('nothing else about analysis changed', () => {
  test('meal_revise still gives the user absolute priority', () => {
    expect(EDGE).toContain(
      '- ABSOLUTE PRIORITY: Everything the user typed or spoke in the correction fields overrides any meal identity from the image or from the previous analysis. Rebuild the meal description from user words first.',
    );
    expect(EDGE).toContain('The correction from the user is more reliable than the first visual guess.');
  });

  test('the non-food guard is unchanged', () => {
    expect(EDGE).toContain('- Non-food guard (HIGHEST PRIORITY):');
    expect(EDGE).toContain('you MUST NOT produce the 5-section output');
  });

  test('model, decoding and deadline are untouched', () => {
    expect(EDGE_CODE).toContain('const GEMINI_MODEL = "gemini-2.5-flash"');
    expect(EDGE_CODE).toContain('const GEMINI_TIMEOUT_MS = 42_000');
    expect((EDGE_CODE.match(/maxOutputTokens: 4096/g) ?? []).length).toBe(3);
    expect(EDGE_CODE).toContain('temperature: 0.25');
  });

  test('the three quota kinds stay separate and mode-selected', () => {
    for (const kind of ['photo_analysis', 'text_analysis', 'meal_revision']) {
      expect(EDGE_CODE).toContain(`${kind}: {`);
    }
    const engine = read('lib', 'RecommendationEngine.ts');
    expect(engine).toContain("mode: 'meal_text'");
    expect(engine).toContain("mode: 'meal_text_only'");
    expect(engine).toContain("mode: 'meal_revise'");
  });

  test('one Generate press is still one provider operation', () => {
    const fn = strip(
      SCREEN.slice(
        SCREEN.indexOf('const handleGenerateAnalysis = () => {'),
        SCREEN.indexOf('const runTextAnalysis'),
      ),
    );
    expect(fn.match(/void run(Text|Photo)Analysis\(/g) ?? []).toHaveLength(2); // one per branch
    expect(fn).toContain('return;'); // the text branch returns before the photo call
  });

  test('request-id behaviour is unchanged', () => {
    const guarded = SCREEN_CODE.match(
      /if \(!analysisRequestIdRef\.current\) analysisRequestIdRef\.current = newAnalysisRequestId\(\);/g,
    ) ?? [];
    const all = SCREEN_CODE.match(/analysisRequestIdRef\.current = newAnalysisRequestId\(\)/g) ?? [];
    expect(guarded).toHaveLength(2);
    expect(all).toHaveLength(4);
  });

  test('Back and View analysis are unchanged', () => {
    expect(SCREEN_CODE).toContain('onPress={() => setWizardStep(3)}');
    expect(SCREEN_CODE).toContain('{analysis.trim() ? (');
    const handleBack = SCREEN.slice(
      SCREEN.indexOf('const handleBack = () => {'),
      SCREEN.indexOf('const handleBack = () => {') + 700,
    );
    expect(handleBack).toContain('setWizardStep(2)');
    expect(strip(handleBack)).not.toContain('setAnalysis(');
  });
});

// ─── Copy ────────────────────────────────────────────────────────────────────

describe('the photo field reads as optional context', () => {
  test('both languages present it as optional', () => {
    expect(translations.en.photoAnalysis.step2Prompt).toBe(
      'Optional: Add context the photo can’t show',
    );
    expect(translations.de.photoAnalysis.step2Prompt).toBe(
      'Optional: Ergänze Kontext, den das Foto nicht zeigen kann',
    );
    for (const lang of LANGS) {
      expect(translations[lang].photoAnalysis.step2Prompt.toLowerCase()).toContain('optional');
    }
  });

  test('no photo-mode copy asks the user to name the meal', () => {
    // The old prompt asked "What is this food?" and the placeholder modelled
    // "This is lentil soup" — both taught the habit this change removes.
    expect(translations.en.photoAnalysis.step2Prompt).not.toContain('What is this food');
    expect(translations.de.photoAnalysis.step2Prompt).not.toContain('Was ist das für Essen');
    expect(translations.en.photoAnalysis.howYouFeelPlaceholder).not.toContain('This is');
    expect(translations.de.photoAnalysis.howYouFeelPlaceholder).not.toContain('Das ist');
  });

  test('the placeholder suggests context the camera cannot capture', () => {
    expect(translations.en.photoAnalysis.howYouFeelPlaceholder).toBe(
      'Portion size, ingredients, preparation, timing, or how you felt afterward',
    );
    expect(translations.de.photoAnalysis.howYouFeelPlaceholder).toBe(
      'Portionsgröße, Zutaten, Zubereitung, Zeitpunkt oder wie du dich danach gefühlt hast',
    );
  });

  test('German is genuinely translated, not the English string', () => {
    for (const key of ['step2Prompt', 'howYouFeelPlaceholder'] as const) {
      expect(translations.de.photoAnalysis[key]).not.toBe(translations.en.photoAnalysis[key]);
    }
  });

  test('the text-only path keeps its own describe copy', () => {
    // Words are the only evidence there, so that field must still teach what
    // to include.
    expect(translations.en.photoAnalysis.describeMealHint).toContain('what you ate');
    expect(translations.en.photoAnalysis.describeRequiredMessage).toBeTruthy();
    expect(translations.de.photoAnalysis.describeRequiredMessage).toBeTruthy();
  });
});
