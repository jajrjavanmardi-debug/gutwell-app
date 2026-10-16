/**
 * Meal-analysis result presentation tests (Stage 5B.2).
 *
 * The polished result surface existed but only onboarding used it: every
 * analysis after a user's first fell back to a dense inline layout that the
 * team had already diagnosed and replaced once. These tests pin that both
 * surfaces now render through the same component, and that the presentation
 * added around it — the score's identity, the context summary, the revision
 * marker — cannot quietly become a claim.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

import { translations } from '../i18n';
import { BANNED_CLAIMS } from './banned-claims';

const root = join(__dirname, '..', '..');
const SCREEN = readFileSync(join(root, 'app', 'photo-analysis.tsx'), 'utf8');
const RESULT = readFileSync(join(root, 'components', 'AnalysisResult.tsx'), 'utf8');

const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const CODE = strip(SCREEN);
const RESULT_CODE = strip(RESULT);

const en = translations.en.analysisResult;
const de = translations.de.analysisResult;

// ── 1–2. One surface for both audiences ─────────────────────────────────────

describe('both result surfaces use the polished component', () => {
  test('AnalysisResult is rendered twice — onboarding and in-app', () => {
    expect((CODE.match(/<AnalysisResult/g) ?? []).length).toBe(2);
  });

  test('the in-app branch renders it', () => {
    const at = CODE.indexOf('wizardStep === 3 && !isOnboarding ? (');
    expect(at).toBeGreaterThan(-1);
    const inApp = CODE.slice(at, CODE.indexOf('handleNewScan', at));
    expect(inApp).toContain('<AnalysisResult');
    expect(inApp).toContain('showDisclaimer={false}');
  });

  test('the onboarding branch still renders it', () => {
    const at = CODE.indexOf('wizardStep === 3 && isOnboarding ? (');
    expect(at).toBeGreaterThan(-1);
    const onboarding = CODE.slice(at, CODE.indexOf('wizardStep === 3 && !isOnboarding', at));
    expect(onboarding).toContain('<AnalysisResult');
  });

  test('the old dense in-app layout is gone', () => {
    // The bespoke hero/title/badge/chips/insights block it replaced.
    for (const token of [
      'resultHeroImage',
      'resultTitleRow',
      'scoreBadgeValue',
      'infoChipLabel',
      'insightsHeading',
      'shouldShowMealScoreBadge',
    ]) {
      expect(CODE).not.toContain(token);
    }
  });

  test('the analysis is not rendered twice on one screen', () => {
    // `raw` is the fallback inside AnalysisResult; the screen must not also
    // print the whole analysis itself.
    expect(CODE).not.toContain('<Text style={[styles.resultText]}>{sanitizeAnalysisForDisplay(analysis)}</Text>');
  });

  test('the sections are parsed once and shared', () => {
    expect((CODE.match(/parseAnalysisSections\(/g) ?? []).length).toBe(1);
    expect((CODE.match(/sections=\{resultSections\}/g) ?? []).length).toBe(2);
  });
});

// ── 3–4. Score identity ─────────────────────────────────────────────────────

describe('the meal score is not the GutWell Score', () => {
  test('it is labelled Meal Impact Score', () => {
    expect(en.scoreLabel).toBe('Meal Impact Score');
    expect(de.scoreLabel).toBe('Mahlzeiten-Impact-Score');
    expect(CODE).toContain('scoreLabel={t.analysisResult.scoreLabel}');
  });

  test('the label carries no daily-score or medical framing', () => {
    for (const label of [en.scoreLabel, de.scoreLabel]) {
      expect(label).not.toMatch(/gutwell score|gut health|health score|risk|safety|Risiko/i);
    }
  });

  test('a provenance note says what the number is', () => {
    expect(en.scoreNote).toMatch(/AI-generated/i);
    expect(en.scoreNote).toMatch(/context/i);
    expect(de.scoreNote).toBeTruthy();
    expect(de.scoreNote).not.toBe(en.scoreNote);
    expect(CODE).toContain('scoreNote={t.analysisResult.scoreNote}');
  });

  test('the numeric scale is unchanged', () => {
    const history = readFileSync(join(root, 'lib', 'photo-analysis-history.ts'), 'utf8');
    expect(history).toContain('return `${score}/10`;');
    expect(CODE).toContain('score={mealImpactScore}');
  });

  test('the Home and Progress day labels are not reused for a meal', () => {
    expect(CODE).not.toContain('dayLabelSettled');
    expect(CODE).not.toContain('t.home.');
  });
});

// ── 5–7. What GutWell considered ────────────────────────────────────────────

describe('the context summary shows only context already sent', () => {
  const block = CODE.slice(
    CODE.indexOf('const contextRows'),
    CODE.indexOf('const contextSummaryNode'),
  );

  test('every row is built from a field already in the request payload', () => {
    for (const source of [
      'selectedStateSymptoms',
      'afterMealActivity',
      'gutProfileContext.conditions',
      'todaysSupplements',
      'locationContext',
      'mealDescription',
    ]) {
      expect(block).toContain(source);
    }
  });

  test('empty rows are omitted rather than rendered blank', () => {
    expect(block).toContain('.filter((row) => row.value.trim().length > 0)');
    expect(CODE).toContain('contextRows.length > 0 ?');
  });

  test('no coordinates are exposed', () => {
    // locationContext holds coarse place names only — formatLocationContext
    // discards the coordinates it geocodes with.
    expect(block).not.toMatch(/latitude|longitude|coords/i);
    expect(CODE).toContain('void coordinates;');
  });

  test('no internal field names reach the UI', () => {
    for (const label of [
      en.contextSymptoms,
      en.contextAfterMeal,
      en.contextProfile,
      en.contextSupplements,
      en.contextLocation,
      en.contextNotes,
    ]) {
      expect(label).toBeTruthy();
      expect(label).not.toMatch(/_|Context$|gutProfile/);
    }
  });

  test('the title and copy say "considered", not "caused"', () => {
    expect(en.contextTitle).toBe('What GutWell considered');
    expect(de.contextTitle).toBe('Was GutWell berücksichtigt hat');
    for (const s of [en.contextTitle, de.contextTitle]) {
      expect(s).not.toMatch(/caused|determined|verursacht|bestimmt/i);
    }
  });

  test('it sits between the score and the sections', () => {
    const i = RESULT_CODE.indexOf('{contextSummary ?? null}');
    expect(i).toBeGreaterThan(RESULT_CODE.indexOf('styles.scoreBlock'));
    expect(i).toBeLessThan(RESULT_CODE.indexOf('sections.complete ?'));
  });
});

// ── 8. Refine prominence ────────────────────────────────────────────────────

describe('refine is discoverable and normalizes correction', () => {
  test('the prompt leads, then the action', () => {
    expect(CODE).toContain('t.photoAnalysis.refineAnalysisPrompt');
    expect(CODE).toContain('t.photoAnalysis.refineAnalysis}');
    const block = CODE.slice(CODE.indexOf('styles.refineTextBlock'));
    expect(block.indexOf('refineAnalysisPrompt')).toBeLessThan(block.indexOf('refineAnalysisHint'));
  });

  test('the copy names what AI can miss without calling it unreliable', () => {
    expect(translations.en.photoAnalysis.refineAnalysisHint).toMatch(/AI can miss/i);
    for (const lang of ['en', 'de'] as const) {
      const hint = translations[lang].photoAnalysis.refineAnalysisHint;
      expect(hint).not.toMatch(/always wrong|unreliable|never trust/i);
    }
  });

  test('EN and DE both exist and differ', () => {
    for (const k of ['refineAnalysisPrompt', 'refineAnalysisHint'] as const) {
      expect(translations.de.photoAnalysis[k]).toBeTruthy();
      expect(translations.de.photoAnalysis[k]).not.toBe(translations.en.photoAnalysis[k]);
    }
  });

  test('the refine mechanics are untouched', () => {
    expect(CODE).toContain('maxLength={MAX_CORRECTION_LENGTH}');
    expect(CODE).toContain('revisionRequestRef.current = { correction, id: newAnalysisRequestId() };');
    expect(CODE).toContain('isDifferentFoodCorrection(correction)');
    // The Stage 5B.1 fix must survive this stage.
    expect(CODE).not.toContain('[...currentSymptoms, correction]');
  });
});

// ── 9–11. Revised result ────────────────────────────────────────────────────

describe('a revision is visibly a revision', () => {
  test('an Updated analysis marker exists in both languages', () => {
    expect(en.updatedBadge).toBe('Updated analysis');
    expect(de.updatedBadge).toBe('Aktualisierte Analyse');
    expect(CODE).toContain('t.analysisResult.updatedBadge');
  });

  test('the marker is set only after the revision resolves', () => {
    const submit = CODE.slice(CODE.indexOf('const submitChatCorrection'));
    const setAt = submit.indexOf('setRevisionJustApplied(true)');
    const awaitAt = submit.indexOf('await reviseMealAnalysis(');
    expect(awaitAt).toBeGreaterThan(-1);
    expect(setAt).toBeGreaterThan(awaitAt);
  });

  test('a failed revision leaves the previous result on screen', () => {
    // setAnalysis is never called before the await resolves, and no catch
    // branch clears it.
    const submit = CODE.slice(
      CODE.indexOf('const submitChatCorrection'),
      CODE.indexOf('const handleNewScan'),
    );
    const catchBlock = submit.slice(submit.indexOf('} catch'));
    expect(catchBlock).not.toContain("setAnalysis('')");
    expect(catchBlock).not.toContain('setAnalysis(null)');
  });

  test('the marker clears when a new analysis starts', () => {
    expect((CODE.match(/setRevisionJustApplied\(false\)/g) ?? []).length).toBe(2);
  });

  test('no second version is stored and no diff engine was added', () => {
    expect(CODE).not.toMatch(/previousAnalysisVersions|analysisHistoryStack|computeDiff/);
  });
});

// ── 12. Secondary actions still wired ───────────────────────────────────────

describe('every returning-user action survives', () => {
  test.each([
    ['Log meal', 't.photoAnalysis.logMeal'],
    ['Share', 't.photoAnalysis.share'],
    ['Copy', 't.photoAnalysis.copyResult'],
  ])('%s is still rendered', (_label, key) => {
    expect(CODE).toContain(key);
  });

  test('New Scan and the accuracy section are still present', () => {
    expect(CODE).toContain('handleNewScan');
    expect(CODE).toContain('styles.accuracySectionCard');
  });

  test('navigation destinations are unchanged', () => {
    expect(CODE).toContain('handleLogPhotoAnalysis');
  });
});

// ── 13–14. Reduced motion ───────────────────────────────────────────────────

describe('reduced motion', () => {
  test('the screen reads the shared hook', () => {
    expect(CODE).toContain('const reduceMotion = useReducedMotion();');
  });

  test('the looping pulse and glow are skipped, with nothing scheduled', () => {
    const effect = CODE.slice(CODE.indexOf('if (!voiceNativeEnabled) {'), CODE.indexOf('Animated.loop('));
    expect(effect).toContain('if (reduceMotion) {');
    expect(effect).toContain('recordingPulse.setValue(1)');
    expect(effect).toContain('micGlowOpacity.setValue(1)');
  });

  test('recording itself is untouched', () => {
    expect(CODE).toContain('tryStartExpoSpeechRecognition');
    expect(CODE).toContain('setIsListening');
  });
});

// ── 15. No payload change ───────────────────────────────────────────────────

describe('this stage added no backend or payload field', () => {
  test('the engine request shape is unchanged', () => {
    const engine = readFileSync(join(root, 'lib', 'RecommendationEngine.ts'), 'utf8');
    for (const mode of ['meal_text', 'meal_text_only', 'meal_revise']) {
      expect(engine).toContain(`mode: '${mode}'`);
    }
    expect(engine).not.toMatch(/contextSummary|scoreLabel|updatedBadge/);
  });

  test('the edge function was not touched', () => {
    const edge = readFileSync(
      join(root, 'supabase', 'functions', 'analyze-food', 'index.ts'),
      'utf8',
    );
    expect(edge).toContain('const GEMINI_MODEL = "gemini-2.5-flash";');
    // Scoped to the props this stage introduced. The edge function already
    // used the phrase "meal impact score" in its own prompt — untouched.
    expect(edge).not.toMatch(/contextSummary|showDisclaimer|updatedBadge/);
  });

  test('the parser contract is unchanged', () => {
    const parser = readFileSync(join(root, 'lib', 'analysis-sections.ts'), 'utf8');
    expect(parser).toContain("{ key: 'meal', label: /MEAL/ }");
    expect(parser).toContain("{ key: 'nextStep', label: /NEXT\\s+STEP/ }");
  });
});

// ── 16–17. Localization and claim safety ────────────────────────────────────

describe('new copy is localized and claim-safe', () => {
  const KEYS = [
    'scoreLabel', 'scoreNote', 'contextTitle', 'contextSymptoms', 'contextAfterMeal',
    'contextProfile', 'contextSupplements', 'contextLocation', 'contextNotes',
    'personalizedLine', 'updatedBadge',
  ] as const;

  test('every new key exists in both languages and differs', () => {
    for (const k of KEYS) {
      expect(en[k]).toBeTruthy();
      expect(de[k]).toBeTruthy();
      expect(`${k}: ${de[k]}`).not.toBe(`${k}: ${en[k]}`);
    }
  });

  test('no new user-visible English is hardcoded in the screen', () => {
    for (const literal of ['Meal Impact Score', 'What GutWell considered', 'Updated analysis', 'Not quite right?']) {
      expect(CODE).not.toContain(`'${literal}'`);
      expect(CODE).not.toContain(`>${literal}<`);
    }
  });

  test('the new copy passes the shared banned-claims list', () => {
    const strings = [...KEYS.map((k) => en[k]), ...KEYS.map((k) => de[k])];
    for (const s of strings) {
      for (const pattern of BANNED_CLAIMS) {
        expect(s).not.toMatch(pattern);
      }
    }
  });

  test('the new copy avoids verdict vocabulary', () => {
    const strings = [...KEYS.map((k) => en[k]), ...KEYS.map((k) => de[k])];
    for (const s of strings) {
      expect(s).not.toMatch(/\bsafe\b|\bunsafe\b|\brisk\b|Risiko|healthy meal|unhealthy|bad for you/i);
    }
  });
});

// ── 18–19. Accessibility ────────────────────────────────────────────────────

describe('the result surface is accessible', () => {
  test('the photo has a role and a label', () => {
    expect(RESULT_CODE).toContain('accessibilityRole="image"');
    expect(RESULT_CODE).toContain('accessibilityLabel={t.analysisResult.photoAlt}');
  });

  test('the score reads its scale, not a slash', () => {
    expect(RESULT_CODE).toContain("score.replace('/', ' out of ')");
    expect(RESULT_CODE).toContain('scoreLabel,');
  });

  test('section titles and the meal name are headers', () => {
    expect((RESULT_CODE.match(/accessibilityRole="header"/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  test('the context card is exposed as a summary', () => {
    expect(CODE).toContain('accessibilityRole="summary"');
  });

  test('no Dynamic Type caps were introduced', () => {
    expect(RESULT_CODE).not.toContain('maxFontSizeMultiplier');
    const added = CODE.match(/maxFontSizeMultiplier/g) ?? [];
    expect(added).toHaveLength(0);
  });

  test('no numberOfLines constrains the context or score copy', () => {
    const ctx = CODE.slice(CODE.indexOf('const contextSummaryNode'), CODE.indexOf('const contextSummaryNode') + 900);
    expect(ctx).not.toContain('numberOfLines');
    expect(RESULT_CODE).not.toContain('numberOfLines');
  });
});

// ── 6. Onboarding payoff ────────────────────────────────────────────────────

describe('the first analysis reinforces the onboarding promise', () => {
  test('a personalization line is shown when there is context', () => {
    expect(CODE).toContain('t.analysisResult.personalizedLine');
    expect(CODE).toContain('contextRows.length > 0 ?');
  });

  test('it says "using", not "calculated from"', () => {
    expect(en.personalizedLine).toBe('Using the context you shared');
    for (const s of [en.personalizedLine, de.personalizedLine]) {
      expect(s).not.toMatch(/calculated|determined|berechnet|bestimmt/i);
    }
  });

  test('no fake progress or computation is shown', () => {
    expect(CODE).not.toMatch(/analysisProgress|fakeStep|simulateProgress|setTimeout\(\s*\(\)\s*=>\s*setProgress/);
  });
});
