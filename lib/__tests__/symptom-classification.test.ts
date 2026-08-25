/**
 * lib/__tests__/symptom-classification.test.ts
 *
 * The Step 2 box stopped being a symptom field and nobody told the wiring.
 *
 * `userEnteredSymptoms` was `mealDescription.split(/[,\n]+/)`. That was
 * arguable in 76e67d5, where the placeholder read "Example: This is lentil
 * soup — I feel bloated and sluggish." — a mixed meal-and-feelings field, so
 * splitting it on commas produced something symptom-shaped. Then 8508604
 * reframed the box as meal context — "Portion size, ingredients, preparation,
 * timing, or how you felt afterward" — and made it optional. The derivation
 * was not updated with it.
 *
 * From that build on, every sentence typed there was filed as a symptom
 * TWICE: once as `userEnteredSymptoms`, which the prompt prints as
 * "User-entered symptoms from the UI" under a rule granting those priority
 * over profile symptoms, and again inside `currentSymptoms` as "All current
 * symptoms combined". "How about eating this two hours before sleeping"
 * reached the model as a reported symptom.
 *
 * The chips are the only symptom input this screen has, so they are now the
 * only thing in that field. Pain DETECTION still reads the free text on
 * purpose — see the last describe. Noticing a word is not the same as
 * labelling the sentence.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { FEELING_FINE, symptomsForRequest, serializeCurrentState } from '../symptom-selection';

const root = join(__dirname, '..', '..');
const read = (...p: string[]) => readFileSync(join(root, ...p), 'utf8');

/** Comments stripped — assertions about absent code must not match prose. */
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const SCREEN = read('app', 'photo-analysis.tsx');
const CODE = strip(SCREEN);

/**
 * The screen's derivation, mirrored — and pinned to the source below, so this
 * model cannot drift away from the code it stands in for.
 */
const derive = (chips: string[], conditions: string[], mealDescription: string) => {
  const selectedStateSymptoms = symptomsForRequest(chips.filter((k) => k !== FEELING_FINE));
  const userEnteredSymptoms = selectedStateSymptoms;
  const currentSymptoms = [...conditions, ...selectedStateSymptoms];
  return { userEnteredSymptoms, currentSymptoms, mealDescription };
};

const QUESTION = 'How about eating this food two hours before sleeping';
const DESCRIPTIVE = 'Large portion, extra cheese, grilled onions';

// ─── The defect itself ──────────────────────────────────────────────────────

describe('a meal description is never filed as a symptom', () => {
  test('a typed question reaches neither symptom field', () => {
    const r = derive(['bloating'], [], QUESTION);
    expect(r.userEnteredSymptoms).not.toContain(QUESTION);
    expect(r.currentSymptoms).not.toContain(QUESTION);
    expect(r.userEnteredSymptoms.join(' ')).not.toMatch(/sleeping/i);
    expect(r.currentSymptoms.join(' ')).not.toMatch(/sleeping/i);
  });

  test('comma-separated meal context does not become several symptoms', () => {
    // The old split turned this one sentence into three "symptoms".
    const r = derive([], [], DESCRIPTIVE);
    expect(r.userEnteredSymptoms).toHaveLength(0);
    expect(r.currentSymptoms).toHaveLength(0);
    for (const fragment of ['Large portion', 'extra cheese', 'grilled onions']) {
      expect(`"${fragment}" filed as symptom: ${r.currentSymptoms.includes(fragment)}`)
        .toBe(`"${fragment}" filed as symptom: false`);
    }
  });

  test('the description still travels in its own field', () => {
    const r = derive(['bloating'], [], QUESTION);
    expect(r.mealDescription).toBe(QUESTION);
    // …and the payload sends it as the narrative, not as symptoms.
    expect(CODE).toContain('userFeelingsNarrative:');
    expect(CODE).toContain('const narrative = mealDescription.trim();');
  });

  test('the old derivation is gone from the source', () => {
    expect(CODE).not.toContain('const userEnteredSymptoms = mealDescription');
    expect(CODE).not.toMatch(/userEnteredSymptoms[\s\S]{0,80}\.split\(/);
    expect(CODE).toContain('const userEnteredSymptoms = selectedStateSymptoms;');
  });

  test('currentSymptoms is pinned to its two real sources', () => {
    // The model above cannot see this: `currentSymptoms` is what the prompt
    // prints as "All current symptoms combined", and the description could be
    // re-added HERE while userEnteredSymptoms stayed clean. Pin the array.
    const block = CODE.slice(
      CODE.indexOf('const currentSymptoms = ['),
      CODE.indexOf('const hasPainSymptom'),
    );
    expect(block.length).toBeGreaterThan(40);
    expect(block).toContain('...gutProfileContext.conditions,');
    expect(block).toContain('...selectedStateSymptoms,');
    for (const banned of ['mealDescription', 'split(', 'narrative']) {
      expect(`${banned} in currentSymptoms: ${block.includes(banned)}`).toBe(
        `${banned} in currentSymptoms: false`,
      );
    }
    // Exactly two spreads — nothing smuggled in as a third.
    expect((block.match(/\.\.\./g) ?? []).length).toBe(2);
  });

  test('the description is split nowhere in the screen', () => {
    // The defect's shape, banned outright rather than only at its old site.
    expect(CODE).not.toMatch(/mealDescription\s*\n?\s*\.split\(/);
  });
});

// ─── No symptom is dropped ──────────────────────────────────────────────────

describe('real symptoms survive exactly', () => {
  test('one selected symptom survives', () => {
    const r = derive(['bloating'], [], '');
    expect(r.userEnteredSymptoms).toEqual(symptomsForRequest(['bloating']));
    expect(r.userEnteredSymptoms).toHaveLength(1);
    expect(r.currentSymptoms).toEqual(r.userEnteredSymptoms);
  });

  test('multiple selected symptoms all survive, in selection order', () => {
    const chips = ['bloating', 'nausea', 'reflux'];
    const r = derive(chips, [], '');
    expect(r.userEnteredSymptoms).toEqual(symptomsForRequest(chips));
    expect(r.userEnteredSymptoms).toHaveLength(3);
    expect(r.currentSymptoms).toHaveLength(3);
  });

  test('profile conditions are still combined, and still distinct from chips', () => {
    const r = derive(['bloating'], ['IBS'], '');
    expect(r.currentSymptoms).toEqual(['IBS', ...symptomsForRequest(['bloating'])]);
    // The server rule "user-entered symptoms take priority over default
    // profile symptoms" only means something if the two stay separable.
    expect(r.userEnteredSymptoms).not.toContain('IBS');
  });

  test('"feeling fine" is still excluded from symptoms', () => {
    const r = derive([FEELING_FINE], [], '');
    expect(r.userEnteredSymptoms).toHaveLength(0);
    const withOther = derive([FEELING_FINE, 'bloating'], [], '');
    expect(withOther.userEnteredSymptoms).toEqual(symptomsForRequest(['bloating']));
  });

  test('chips still reach mealContext.currentState unchanged', () => {
    expect(serializeCurrentState(['bloating', 'nausea'])).toBe(
      symptomsForRequest(['bloating', 'nausea']).join(', '),
    );
    expect(CODE).toContain('currentState: serializeCurrentState(currentStateKeys)');
  });

  test('nothing is dropped: every chip appears in both fields', () => {
    const chips = ['bloating', 'nausea', 'reflux', 'stomach_pain'];
    const r = derive(chips, [], QUESTION);
    for (const s of symptomsForRequest(chips)) {
      expect(`${s} in userEntered: ${r.userEnteredSymptoms.includes(s)}`).toBe(`${s} in userEntered: true`);
      expect(`${s} in current: ${r.currentSymptoms.includes(s)}`).toBe(`${s} in current: true`);
    }
  });

  test('there is no separate free-text symptom input to preserve', () => {
    // If one is ever added, this test fails and forces the field to be wired
    // deliberately rather than by reviving the description split.
    for (const banned of ['symptomText', 'symptomInput', 'customSymptom', 'otherSymptom']) {
      expect(`${banned} exists: ${CODE.includes(banned)}`).toBe(`${banned} exists: false`);
    }
  });
});

// ─── Flows and payloads unchanged ───────────────────────────────────────────

describe('every flow that carries symptoms is otherwise untouched', () => {
  test('the photo payload still sends both fields', () => {
    // setMealIdentity also appears earlier in the file, so the end anchor is
    // searched forward from the call rather than from the start.
    const callAt = CODE.indexOf('await analyzeMealPhoto(');
    const photo = CODE.slice(callAt, CODE.indexOf('setMealIdentity(', callAt));
    expect(photo.length).toBeGreaterThan(100);
    expect(photo).toContain('symptoms: currentSymptoms');
    expect(photo).toContain('userEnteredSymptoms');
    expect(photo).toContain('userFeelingsNarrative:');
  });

  test('the text-only payload still sends both fields', () => {
    const text = CODE.slice(CODE.indexOf('await analyzeMealText('), CODE.indexOf('await analyzeMealPhoto('));
    expect(text.length).toBeGreaterThan(100);
    expect(text).toContain('symptoms: currentSymptoms');
    expect(text).toContain('userEnteredSymptoms');
  });

  test('meal_revise still appends the correction to the symptom context', () => {
    expect((CODE.match(/symptoms: \[\.\.\.currentSymptoms, correction\]/g) ?? []).length).toBe(2);
  });

  test('the request-id and quota contract is unchanged', () => {
    expect((CODE.match(/if \(!analysisRequestIdRef\.current\) analysisRequestIdRef\.current = newAnalysisRequestId\(\);/g) ?? []).length).toBe(2);
    expect((CODE.match(/analysisRequestIdRef\.current = newAnalysisRequestId\(\)/g) ?? []).length).toBe(4);
  });

  test('the engine contract is unchanged', () => {
    const engine = read('lib', 'RecommendationEngine.ts');
    expect(engine).toContain('userEnteredSymptoms?: string[];');
    expect((engine.match(/userEnteredSymptoms: analysisContext\.userEnteredSymptoms \?\? \[\],/g) ?? []).length).toBe(2);
    for (const mode of ['meal_text', 'meal_text_only', 'meal_revise']) {
      expect(engine).toContain(`mode: '${mode}'`);
    }
  });
});

// ─── Pain detection deliberately still reads the free text ──────────────────

describe('the safety path is not collateral damage', () => {
  test('pain detection still scans the description', () => {
    // Someone who types "my stomach really hurts" without touching a chip must
    // still get the apology, the safety notice and the gentler Plan B. This is
    // detection, not classification: nothing is labelled a symptom by it.
    expect(CODE).toContain('hasPainText(mealDescription)');
    const block = CODE.slice(CODE.indexOf('const hasPainSymptom ='), CODE.indexOf('const shouldShowMealScoreBadge'));
    expect(block).toContain('currentSymptoms.some((symptom) => hasPainText(symptom))');
    expect(block).toContain('hasPainText(mealDescription)');
  });

  test('a pain chip still triggers it through the symptom path', () => {
    const r = derive(['stomach_pain'], [], '');
    expect(r.currentSymptoms.join(' ').toLowerCase()).toMatch(/pain|schmerz/);
  });

  test('the pain-aware UI is unchanged', () => {
    expect(CODE).toContain('ensurePainApology');
    expect(CODE).toContain('t.photoAnalysis.instantReliefTitle');
  });
});
