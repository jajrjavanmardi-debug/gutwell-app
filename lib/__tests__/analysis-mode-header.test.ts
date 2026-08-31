/**
 * lib/__tests__/analysis-mode-header.test.ts
 *
 * One screen serves two flows, and the heading has to say which.
 *
 * When the daily photo ceiling is reached the app offers "Describe your meal
 * instead". Accepting it runs startTextOnlyFlow, which clears the photo and
 * switches to the text path — but the header still read "Photo Analysis".
 * Build 10 QA hit the consequence: after switching, a text-quota message
 * ("You've described 5 meals today") appeared on a screen titled Photo
 * Analysis, and was reported as a photo-quota bug. The copy was correct; the
 * heading above it was lying.
 *
 * These pin the heading to the mode, and pin the two transitions that the
 * heading depends on — a header that branches correctly is useless if
 * textOnlyMode itself stops tracking reality.
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

// ─── The heading follows the mode ────────────────────────────────────────────

describe('the header names the flow actually running', () => {
  test('it branches on textOnlyMode', () => {
    expect(SCREEN_CODE).toContain(
      '{textOnlyMode ? t.photoAnalysis.describeTitle : t.photoAnalysis.title}',
    );
  });

  test('the title is never rendered unconditionally', () => {
    // The defect: `<Text style={[styles.title]}>{t.photoAnalysis.title}</Text>`
    // with no mode test, so the describe flow inherited the photo heading.
    expect(SCREEN_CODE).not.toContain('<Text style={[styles.title]}>{t.photoAnalysis.title}</Text>');
  });

  test('both branches point at different keys', () => {
    const header = SCREEN_CODE.slice(
      SCREEN_CODE.indexOf('styles.headerTextBlock'),
      SCREEN_CODE.indexOf('styles.historyButton'),
    );
    expect(header.length).toBeGreaterThan(100);
    expect(header).toContain('t.photoAnalysis.describeTitle');
    expect(header).toContain('t.photoAnalysis.title');
    // A ternary whose arms are the same key would branch and still mislabel.
    expect(header).not.toContain('t.photoAnalysis.title : t.photoAnalysis.title');
    expect(header).not.toContain('t.photoAnalysis.describeTitle : t.photoAnalysis.describeTitle');
  });

  test('both languages define a distinct describe title', () => {
    expect(translations.en.photoAnalysis.describeTitle).toBe('Describe Your Meal');
    expect(translations.de.photoAnalysis.describeTitle).toBe('Mahlzeit beschreiben');
    for (const lang of LANGS) {
      const p = translations[lang].photoAnalysis;
      expect(p.describeTitle).not.toBe(p.title);
      expect(p.describeTitle.trim().length).toBeGreaterThan(0);
    }
  });

  test('the photo title is unchanged in both languages', () => {
    expect(translations.en.photoAnalysis.title).toBe('Photo Analysis');
    expect(translations.de.photoAnalysis.title).toBe('Fotoanalyse');
  });

  test('German is genuinely translated, not the English string', () => {
    expect(translations.de.photoAnalysis.describeTitle).not.toBe(
      translations.en.photoAnalysis.describeTitle,
    );
  });
});

// ─── The transitions the heading depends on ──────────────────────────────────

describe('textOnlyMode still tracks reality', () => {
  const startTextOnlyFlow = SCREEN.slice(
    SCREEN.indexOf('const startTextOnlyFlow = () => {'),
    SCREEN.indexOf('const submitChatCorrection'),
  );

  test('startTextOnlyFlow clears the photo when it switches mode', () => {
    // Without this the header would be right and the state wrong: a stale image
    // sent with a typed description.
    expect(startTextOnlyFlow.length).toBeGreaterThan(100);
    expect(startTextOnlyFlow).toContain('setTextOnlyMode(true)');
    expect(startTextOnlyFlow).toContain('setPhotoUri(null)');
    expect(startTextOnlyFlow).toContain("setLastImageBase64('')");
  });

  test('storeCapturedPhoto switches back when a photo arrives', () => {
    const store = SCREEN.slice(
      SCREEN.indexOf('const storeCapturedPhoto ='),
      SCREEN.indexOf('const handleBack = () => {'),
    );
    expect(store.length).toBeGreaterThan(100);
    expect(store).toContain('setTextOnlyMode(false)');
    expect(store).toContain('setPhotoUri(asset.uri)');
    expect(store).toContain('setLastImageBase64(asset.base64)');
  });

  test('the flag has exactly one setter per direction', () => {
    expect(SCREEN_CODE.match(/setTextOnlyMode\(true\)/g) ?? []).toHaveLength(1);
    expect(SCREEN_CODE.match(/setTextOnlyMode\(false\)/g) ?? []).toHaveLength(1);
  });
});

// ─── Quota copy mapping is untouched ─────────────────────────────────────────

describe('quota messages still belong to their own modes', () => {
  test('the text-limit alert stays inside the text path', () => {
    const runText = SCREEN.slice(
      SCREEN.indexOf('const runTextAnalysis = async'),
      SCREEN.indexOf('const runPhotoAnalysis'),
    );
    expect(runText.length).toBeGreaterThan(200);
    expect(runText).toContain('t.photoAnalysis.textLimitTitle');
    expect(runText).toContain('t.photoAnalysis.textLimitMessage');
    // And it is not what a photo run shows.
    expect(runText).not.toContain('t.photoAnalysis.dailyLimitFallbackMessage');
  });

  test('the photo ceiling still offers the describe path rather than dead-ending', () => {
    expect(SCREEN_CODE).toContain('t.photoAnalysis.dailyLimitFallbackMessage');
    expect(SCREEN_CODE).toContain('onPress: startTextOnlyFlow');
  });

  test('the quota copy itself is unchanged', () => {
    expect(translations.en.photoAnalysis.textLimitMessage).toBe(
      "You've described 5 meals today, which is the daily maximum.",
    );
    expect(translations.en.photoAnalysis.dailyLimitFallbackMessage).toBe(
      "You've used today's 5 photo analyses. You can still describe your meal.",
    );
  });
});

// ─── Scope ───────────────────────────────────────────────────────────────────

describe('scope', () => {
  test('mode selection and request identity are untouched', () => {
    const engine = read('lib', 'RecommendationEngine.ts');
    for (const mode of ['meal_text', 'meal_text_only', 'meal_revise']) {
      expect(engine).toContain(`mode: '${mode}'`);
    }
    const guarded = SCREEN_CODE.match(
      /if \(!analysisRequestIdRef\.current\) analysisRequestIdRef\.current = newAnalysisRequestId\(\);/g,
    ) ?? [];
    expect(guarded).toHaveLength(2);
    expect(SCREEN_CODE.match(/analysisRequestIdRef\.current = newAnalysisRequestId\(\)/g) ?? [])
      .toHaveLength(4);
  });

  test('the image-first gate and forward control are unchanged', () => {
    expect(SCREEN_CODE).toContain(
      'textOnlyMode ? !mealDescription.trim() : !lastImageBase64.trim()',
    );
    expect(SCREEN_CODE).toContain('onPress={() => setWizardStep(3)}');
  });
});
