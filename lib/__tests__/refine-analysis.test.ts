/**
 * Refine Analysis regression tests.
 *
 * Refine used to send `symptoms: [...currentSymptoms, correction]`, so the
 * server rendered the user's follow-up text into the prompt line
 * "Current symptoms: …". A timing question, a portion note or a food
 * correction all arrived at the model as reported symptoms.
 *
 * This is the SAME defect class the initial-analysis path fixed in c8a92fa,
 * where `userEnteredSymptoms` stopped being a split of the free-text box. The
 * revision path was missed, and nothing tested the revision payload — which is
 * why it survived. These tests cover that payload directly.
 *
 * Source inspection, matching the convention of the other analysis suites:
 * the screen is 3700 lines with no injectable seam around submitChatCorrection,
 * so the payload shape is asserted at the call site.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..', '..');
const SCREEN = readFileSync(join(root, 'app', 'photo-analysis.tsx'), 'utf8');
const ENGINE = readFileSync(join(root, 'lib', 'RecommendationEngine.ts'), 'utf8');
const EDGE = readFileSync(
  join(root, 'supabase', 'functions', 'analyze-food', 'index.ts'),
  'utf8',
);

/**
 * Comments stripped.
 *
 * The fix documents the old broken expression verbatim so the next reader
 * knows what changed — assertions about its absence must read code only, or
 * they fail on the note explaining the fix.
 */
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const CODE = strip(SCREEN);

/** The reviseMealAnalysis(...) call inside submitChatCorrection. */
const REVISE_CALL = CODE.slice(
  CODE.indexOf('const revisedAnalysis = await reviseMealAnalysis('),
  CODE.indexOf('const correctedAnalysis = ensurePainApology('),
);

/**
 * The recordTriggerFeedback({...}) argument object inside submitChatCorrection.
 *
 * Sliced to the closing `})` rather than a fixed character count: a fixed
 * window ran past the call into the surrounding handler, which legitimately
 * mentions `correction`, and the absence assertion below would have passed or
 * failed on unrelated code.
 */
const REFINE_TRIGGER_CALL = (() => {
  const submit = CODE.slice(CODE.indexOf('const submitChatCorrection'));
  const at = submit.indexOf('recordTriggerFeedback({');
  const end = submit.indexOf('});', at);
  return submit.slice(at, end + 3);
})();

// ── 1–3. The correction is not a symptom ────────────────────────────────────

describe('the correction is never sent as a symptom', () => {
  test('the revision payload passes actual symptoms only', () => {
    expect(REVISE_CALL).toContain('symptoms: currentSymptoms,');
  });

  test('the broken spread is gone from the whole screen', () => {
    expect(CODE).not.toContain('[...currentSymptoms, correction]');
    expect(CODE).not.toMatch(/symptoms:\s*\[\s*\.\.\.currentSymptoms\s*,\s*correction\s*\]/);
  });

  test.each([
    'It was actually chicken, not tofu.',
    'How about eating this two hours before sleeping?',
    'The portion was much smaller.',
    'It also had avocado.',
  ])('a correction like "%s" cannot reach the symptoms array', (correction) => {
    // The payload is built from `currentSymptoms` alone, which is derived from
    // profile conditions plus the symptom chips — never from free text. Any
    // correction string therefore cannot appear in it, whatever it says.
    const symptomsLine = REVISE_CALL.match(/symptoms:\s*([^,\n]+)/)?.[1] ?? '';
    expect(symptomsLine.trim()).toBe('currentSymptoms');
    expect(symptomsLine).not.toContain('correction');
    // Guard the example itself is the shape we mean: free-form prose, not a
    // symptom token.
    expect(correction.split(' ').length).toBeGreaterThan(2);
  });
});

// ── 4. Real symptom chips survive ───────────────────────────────────────────

describe('actual symptoms are preserved', () => {
  test('currentSymptoms is still profile conditions plus selected chips', () => {
    expect(CODE).toContain('const currentSymptoms = [');
    const arr = CODE.slice(
      CODE.indexOf('const currentSymptoms = ['),
      CODE.indexOf('];', CODE.indexOf('const currentSymptoms = [')),
    );
    expect(arr).toContain('...gutProfileContext.conditions');
    expect(arr).toContain('...selectedStateSymptoms');
    // Exactly two sources — no free text may be spread in alongside them.
    expect((arr.match(/\.\.\./g) ?? []).length).toBe(2);
  });

  test('chips are the only symptom input, via symptomsForRequest', () => {
    expect(CODE).toContain('const selectedStateSymptoms = symptomsForRequest(');
    expect(CODE).toContain('const userEnteredSymptoms = selectedStateSymptoms;');
  });

  test('the refine payload sends the same conditions the initial path does', () => {
    expect(REVISE_CALL).toContain('conditions: gutProfileContext.conditions,');
  });
});

// ── 5. The correction still reaches the model ───────────────────────────────

describe('the correction still travels, as a correction', () => {
  test('it is passed in its own first-class field', () => {
    expect(REVISE_CALL).toContain('correction,');
  });

  test('the transport forwards that field to the edge function', () => {
    expect(ENGINE).toContain("mode: 'meal_revise'");
    expect(ENGINE).toContain('correction: correctionContext.correction,');
    expect(ENGINE).toContain('priorUserCorrections: correctionContext.priorUserCorrections ?? []');
  });

  test('the edge function gives the correction highest priority in the prompt', () => {
    // Removing it from `symptoms` loses nothing: this block is where the model
    // is told to act on it, and it outranks everything else.
    expect(EDGE).toContain('Latest user correction or new detail (highest priority—what they mean now):');
    expect(EDGE).toContain('ABSOLUTE PRIORITY: Everything the user typed or spoke in the correction fields overrides');
  });

  test('prior corrections still accumulate for later revisions', () => {
    expect(CODE).toContain('priorUserCorrections: userFeedback,');
    expect(CODE).toContain('setUserFeedback((prior) => [...prior, correction]);');
  });

  test('the previous analysis is still passed as context', () => {
    expect(REVISE_CALL).toContain('previousAnalysis:');
  });
});

// ── 6–7. Trigger memory ─────────────────────────────────────────────────────

describe('trigger memory records symptoms, not corrections', () => {
  test('the refine path stores actual symptoms only', () => {
    expect(REFINE_TRIGGER_CALL).toContain('symptoms: currentSymptoms,');
    expect(REFINE_TRIGGER_CALL).not.toContain('correction');
  });

  test('it now matches the initial-analysis call, which was already correct', () => {
    // Both call sites pass the same expression; the two paths had drifted.
    expect((CODE.match(/symptoms: currentSymptoms,/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  test('no free-form text is written into the local trigger store', () => {
    const store = readFileSync(join(root, 'lib', 'user-progress.ts'), 'utf8');
    // The store is a dumb writer — the caller decides what a "symptom" is,
    // which is exactly why the caller had to be fixed.
    expect(store).toContain('export async function recordTriggerFeedback');
    expect(store).not.toContain('correction');
  });
});

// ── 8–9. Idempotency unchanged ──────────────────────────────────────────────

describe('request-id and retry semantics are unchanged', () => {
  test('an identical correction reuses the same request id', () => {
    expect(CODE).toContain('if (revisionRequestRef.current?.correction !== correction) {');
    expect(CODE).toContain('revisionRequestRef.current = { correction, id: newAnalysisRequestId() };');
  });

  test('a different correction mints a new id', () => {
    // Same conditional: the ref is keyed on the correction text, so changing
    // the text fails the equality check and a new id is minted.
    const block = CODE.slice(
      CODE.indexOf('if (revisionRequestRef.current?.correction !== correction)'),
      CODE.indexOf('setIsCorrecting(true);'),
    );
    expect(block).toContain('newAnalysisRequestId()');
  });

  test('the minted id is what the request carries', () => {
    expect(REVISE_CALL).toContain('revisionRequestRef.current?.id');
  });

  test('the ref is cleared after a successful revision', () => {
    expect(CODE).toContain('revisionRequestRef.current = null;');
  });
});

// ── 10. Quota untouched ─────────────────────────────────────────────────────

describe('quota semantics are unchanged', () => {
  test('the revision limit error is still handled', () => {
    expect(CODE).toContain('isDailyRevisionLimitError(error)');
  });

  test('the correction length cap is unchanged', () => {
    const quota = readFileSync(join(root, 'lib', 'ai-quota.ts'), 'utf8');
    expect(quota).toContain('export const MAX_CORRECTION_LENGTH = 2000;');
    expect(CODE).toContain('maxLength={MAX_CORRECTION_LENGTH}');
  });

  test('the server quota values are untouched', () => {
    const sql = readFileSync(
      join(root, 'supabase', 'migrations', '20260808120000_ai_cost_control.sql'),
      'utf8',
    );
    expect(sql).toContain("when 'meal_revision'  then 5");
    expect(sql).toContain("when 'photo_analysis' then 5");
    expect(sql).toContain("when 'text_analysis'  then 5");
  });
});

// ── 11. Different-food behaviour unchanged ──────────────────────────────────

describe('different-food correction behaviour is unchanged', () => {
  test('the context-clearing sentinel still fires on a different food', () => {
    expect(CODE).toContain('const correctionIsDifferentFood = isDifferentFoodCorrection(correction);');
    expect(REVISE_CALL).toContain('correctionIsDifferentFood');
    expect(SCREEN).toContain('Previous meal context intentionally cleared because the user described a different food.');
  });

  test('meal identity is still re-derived only for a different food', () => {
    expect(CODE).toContain('if (correctionIsDifferentFood) {');
    expect(CODE).toContain('setMealIdentity(resolveMealIdentity(correctedAnalysis, correction));');
  });
});

// ── 12. Initial-analysis semantics unchanged ────────────────────────────────

describe('the initial analysis path is untouched', () => {
  test('userEnteredSymptoms is still chips-only', () => {
    expect(CODE).toContain('const userEnteredSymptoms = selectedStateSymptoms;');
    expect(CODE).not.toContain('mealDescription.split');
  });

  test('pain detection still reads the free text directly', () => {
    // Deliberate and unchanged: noticing a pain word in a sentence is a local
    // safety heuristic, not a reason to file that sentence as a symptom.
    expect(CODE).toContain('hasPainText(mealDescription)');
    expect(CODE).toContain('hasPainText(correction)');
  });

  test('the pain apology on a refine does not depend on the symptoms array', () => {
    // It reads `hasPainText(correction)` directly, so removing the correction
    // from `symptoms` cannot suppress the safety path.
    expect(CODE).toContain('hasPainSymptom || hasPainText(correction)');
  });

  test('the initial photo and text payloads are unchanged', () => {
    expect(CODE).toContain('userEnteredSymptoms,');
    expect(CODE).toContain('symptoms: currentSymptoms,');
  });
});
