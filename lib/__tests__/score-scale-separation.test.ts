/**
 * GutWell Score vs Meal Impact Score — scale separation.
 *
 * The analysis screen shows two unrelated numbers. The Meal Impact Score is a
 * 1-10 estimate of one meal. The GutWell Score is a 0-100 summary of the day's
 * check-in. The profile-context line used to render the GutWell Score
 * *rescaled to 1-10*, so a user could see "GutWell Score 4/10" directly above
 * "Meal Impact Score 4/10" — two different metrics, same number, same scale.
 *
 * The rescale itself could not simply be deleted: the edge function's prompt
 * states "Current gut score: N/10" verbatim, so 1-10 is a contract with the
 * server. The fix carries both values instead — `gutScore` for the payload,
 * `gutScoreDisplay` for the UI — and these tests pin that split, because a
 * later edit that "tidies" one into the other would silently change either
 * what the model is told or what the user reads.
 *
 * Source inspection, matching the convention of the other analysis suites:
 * the screen has no injectable seam around this state.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { translations } from '../i18n';

const root = join(__dirname, '..', '..');
const read = (...p: string[]) => readFileSync(join(root, ...p), 'utf8');

/**
 * Comments stripped. The fix documents the old behaviour and both scales in
 * prose, so assertions about absence must read code only.
 */
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const CODE = strip(read('app', 'photo-analysis.tsx'));
const EDGE = read('supabase', 'functions', 'analyze-food', 'index.ts');
const HISTORY = read('lib', 'photo-analysis-history.ts');

describe('the AI payload still sends the 1-10 value', () => {
  test('all three call sites send gutProfileContext.gutScore, unchanged', () => {
    const sites = CODE.match(/gutScore: gutProfileContext\.gutScore \?\? undefined,/g) ?? [];
    expect(sites).toHaveLength(3);
  });

  test('the payload never sends the display value', () => {
    expect(CODE).not.toContain('gutScore: gutProfileContext.gutScoreDisplay');
    expect(CODE).not.toContain('gutScoreDisplay ?? undefined');
  });

  test('the 1-10 rescale that feeds the payload is intact', () => {
    expect(CODE).toContain(
      'gutScore = Math.min(10, Math.max(1, Math.round(data.score / 10)));',
    );
  });

  test("the server's 1-10 prompt contract is unchanged", () => {
    const contract = EDGE.match(/`\$\{gutScore\}\/10`/g) ?? [];
    expect(contract).toHaveLength(3);
  });
});

describe('the UI shows the 0-100 GutWell Score', () => {
  test('the display value is the raw score, not derived from the payload value', () => {
    expect(CODE).toContain('gutScoreDisplay = Math.round(data.score);');
    // Never reconstructed from the rounded 1-10 number, which would be lossy.
    expect(CODE).not.toMatch(/gutScoreDisplay\s*=\s*gutScore\s*\*/);
  });

  test('both profile-context lines render the score out of 100', () => {
    const lines = CODE.match(/gutProfileContext\.gutScoreDisplay != null[\s\S]{0,300}?\/100`/g) ?? [];
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      expect(line).toContain('${gutProfileContext.gutScoreDisplay}/100');
    }
  });

  test('no surface renders the payload value to the user', () => {
    expect(CODE).not.toContain('${gutProfileContext.gutScore}/10');
  });
});

describe('no diagnosed-condition label sits beside the score', () => {
  /**
   * Printing "GutWell Score 42/100 · IBS" reconnects a diagnosis to a number
   * that is not calculated from one. The condition is still stored and still
   * sent to the model for relevance and tone — it just does not label the
   * score. It also still appears under its own "Profile" heading in the
   * context breakdown, which is a labelled row, not this line.
   */
  test('the condition list is not appended to the profile-context line', () => {
    const lines = CODE.match(/gutProfileContext\.gutScoreDisplay != null[\s\S]{0,300}?\/100`/g) ?? [];
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      expect(line).not.toContain('conditions');
    }
  });

  test('the parts-array that used to join score and condition is gone', () => {
    expect(CODE).not.toContain("parts.push(gutProfileContext.conditions.join(', '))");
    expect(CODE).not.toContain('const parts: string[] = [];');
  });

  test('conditions are still sent to the model', () => {
    const sites = CODE.match(/conditions: gutProfileContext\.conditions,/g) ?? [];
    expect(sites.length).toBeGreaterThanOrEqual(3);
  });
});

describe('the two scores read as different metrics', () => {
  test('the Meal Impact Score is still its own 1-10 value', () => {
    expect(HISTORY).toContain('return `${score}/10`;');
    expect(HISTORY).toContain('if (!Number.isFinite(score) || score < 1 || score > 10) return null;');
    expect(EDGE).toContain('State it in the exact form X/10');
  });

  test('the prompt forbids echoing the profile gut score as the meal score', () => {
    /**
     * German v40 returned "Dein Gut Score von 4/10" in the SCORE section — the
     * 1-10 profile value we send as context, echoed back as if it were the
     * meal's score, under the name the app retired. The prompt handed the model
     * a 1-10 number and asked it for a 1-10 number without distinguishing them.
     *
     * Narrow by design: it forbids repeating THE PROFILE SCORE, not naming a
     * score at all — the Meal Impact Score is a legitimate thing to name.
     */
    expect(EDGE).toMatch(/This number is YOUR judgement of THIS meal/);
    expect(EDGE).toMatch(/The profile's gut score is background only/);
    expect(EDGE).toMatch(/never repeat, quote, or name that profile score in the reply/);
    expect(EDGE).toMatch(/never use it as the Meal Impact Score/);
    // Defined once in the shared five-section structure, so text, vision and
    // revise inherit it rather than carrying three copies that can drift.
    expect(EDGE.match(/This number is YOUR judgement of THIS meal/g) ?? []).toHaveLength(1);
  });

  test('the composed line names the GutWell Score and its own scale, in both languages', () => {
    const en = translations.en.photoAnalysis;
    const de = translations.de.photoAnalysis;
    expect(`${en.profileContextPrefix}${en.profileContextScore} 42/100`).toBe(
      'Your recent GutWell Score: 42/100',
    );
    expect(`${de.profileContextPrefix}${de.profileContextScore} 42/100`).toBe(
      'Dein letzter GutWell-Score: 42/100',
    );
  });

  test('neither language calls it a plain "Gut Score" any more', () => {
    for (const lang of ['en', 'de'] as const) {
      expect(translations[lang].photoAnalysis.profileContextScore).toMatch(/GutWell/);
    }
  });
});
