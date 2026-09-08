/**
 * Analysis-prompt claim safety (App Store Guideline 1.4.1).
 *
 * The prompt used to branch on a DIAGNOSIS LABEL: if "IBS" appeared in the
 * user's stored conditions, the model was told to flag high-FODMAP foods,
 * to stop suggesting whole grains, and to prefer a fixed list of substitutes.
 * That is a clinical elimination protocol, delivered unsupervised, triggered
 * by a condition the app never verified.
 *
 * The replacement keeps the guidance useful but re-keys it: it triggers on
 * what the person actually REPORTED (symptoms, notes, current state), offers
 * one alternative to compare against their own response, and states that a
 * condition label is context for tone only.
 *
 * These tests guard the unsafe BEHAVIOUR, not vocabulary. The safety wording
 * legitimately has to name the things it forbids — "it never licenses an
 * elimination diet" must stay legal — so every assertion below distinguishes
 * a prohibition placed on the model from an instruction given to the user.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..', '..');
const EDGE = readFileSync(
  join(root, 'supabase', 'functions', 'analyze-food', 'index.ts'),
  'utf8',
);

/**
 * Every instruction bullet in every prompt builder.
 *
 * Matched as string LITERALS, not as lines: the rejected instruction lived
 * inside a ternary (`? "- If IBS, ..."`), so a line-prefix filter walked
 * straight past the one bullet these tests exist to catch.
 */
const BULLETS = EDGE.match(/"- (?:[^"\\]|\\.)*"/g) ?? [];

/** A bullet that fires BECAUSE a diagnosis label is present. */
const DIAGNOSIS_TRIGGERED =
  /\b(if|when)\b[^"]{0,60}\bIBS\b|\bIBS\b[^"]{0,80}\b(is listed|listed in|are listed)\b/i;

/** The framing that makes a mention of a condition label legitimate. */
const CONTEXT_ONLY = /is context for relevance and tone only/;

/** A directive that would narrow what the user may eat. */
const RESTRICTION =
  /\b(do not suggest|do not eat|avoid|remove|eliminate|cut out|should not eat|must not eat|prefer)\b/i;

/**
 * Marks a bullet as a rule imposed on the MODEL rather than advice for the
 * user. This is the distinction the whole suite turns on: "never as a list of
 * foods to avoid" and "avoid gluten" both contain "avoid".
 */
const NEGATED =
  /\b(never licenses?|does not license|never as|not as a|it never|must not|do not present|do not claim|do not infer|do not assume|do not default|rather than)\b/i;

describe('no diagnosis-triggered dietary branch', () => {
  test('no prompt line is selected by the presence of a condition label', () => {
    expect(EDGE).not.toMatch(/conditionSummary\s*!==\s*"no known conditions"/);
    expect(EDGE).not.toMatch(/conditions\.length\s*>\s*0\s*\n?\s*\?[\s\S]{0,80}"- /);
  });

  test('no bullet fires because a diagnosis label is present', () => {
    for (const bullet of BULLETS) {
      expect(bullet).not.toMatch(DIAGNOSIS_TRIGGERED);
    }
  });

  test('a bullet may only mention a condition label to demote it', () => {
    // Naming IBS is legal exactly once: to say the label is context, not a
    // licence. Any other mention is the old diagnosis-keyed behaviour.
    for (const bullet of BULLETS) {
      if (/\bIBS\b/.test(bullet)) expect(bullet).toMatch(CONTEXT_ONLY);
    }
  });
});

describe('no named clinical protocol reaches the user as an instruction', () => {
  test('any bullet naming a diet protocol is forbidding it, not prescribing it', () => {
    const PROTOCOL = /\b(fodmap|elimination diet|clinical programme|clinical program)\b/i;
    const naming = BULLETS.filter((b) => PROTOCOL.test(b));
    expect(naming.length).toBeGreaterThan(0);
    for (const bullet of naming) {
      // Not merely "contains some negation somewhere" — the rejected bullet
      // said "Do not default to peppermint" and would have passed that.
      expect(bullet).toMatch(/never licenses|does not license/);
    }
  });

  test('the specific rejected prescriptions are gone', () => {
    expect(EDGE).not.toMatch(/flag likely gas-forming or high-FODMAP foods/i);
    expect(EDGE).not.toMatch(/do not suggest brown rice, barley/i);
    expect(EDGE).not.toMatch(/prefer white rice, boiled potatoes/i);
    expect(EDGE).not.toMatch(/low-FODMAP soup/i);
  });

  test('no bullet restricts food for a named condition', () => {
    for (const bullet of BULLETS) {
      if (/\bIBS\b/.test(bullet) && RESTRICTION.test(bullet)) {
        // Legal only while demoting the label, never while acting on it.
        expect(bullet).toMatch(CONTEXT_ONLY);
      }
    }
  });

  test('no bullet tells the model to withhold a food group', () => {
    for (const bullet of BULLETS) {
      expect(bullet).not.toMatch(
        /\bdo not suggest\b[^"]{0,80}\b(rice|grains|barley|bread|wheat|dairy|fruit)\b/i,
      );
      expect(bullet).not.toMatch(/\bprefer\b[^"]{0,40}\b(white rice|boiled potatoes)\b/i);
    }
  });
});

describe('condition labels are explicitly context only', () => {
  test('both prompt paths say so', () => {
    const framing = EDGE.match(/is context for relevance and tone only/g) ?? [];
    expect(framing).toHaveLength(2);
  });

  test('the framing names what it refuses to license', () => {
    const bullet = BULLETS.find((b) => /is context for relevance and tone only/.test(b));
    expect(bullet).toBeDefined();
    expect(bullet).toMatch(/never licenses/);
    expect(bullet).toMatch(/elimination diet/);
    expect(bullet).toMatch(/remove a food group/);
    // Points at a clinician instead of taking the decision itself.
    expect(bullet).toMatch(/doctor or registered dietitian/);
  });
});

describe('guidance is symptom-triggered and still specific', () => {
  test('the trigger is what the person reported, in both paths', () => {
    const trigger =
      EDGE.match(/has reported bloating, gas or abdominal discomfort/g) ?? [];
    expect(trigger).toHaveLength(2);
    const source = EDGE.match(/in their symptoms, their notes, or their current state/g) ?? [];
    expect(source).toHaveLength(2);
  });

  test('ingredient wording is symptom-specific and hedged, not "heavy"', () => {
    const hedged =
      EDGE.match(
        /may contribute to bloating, gas or digestive discomfort for some people/g,
      ) ?? [];
    expect(hedged).toHaveLength(2);
  });

  test('the alternative is a personal experiment, not a prescription', () => {
    const experiment =
      EDGE.match(/offer one simple alternative they could try and compare against their own response next time/g) ?? [];
    expect(experiment).toHaveLength(2);
    for (const bullet of BULLETS.filter((b) => /compare against their own response/.test(b))) {
      expect(bullet).toMatch(/never as a rule/);
      expect(bullet).toMatch(/never as a list of foods to avoid/);
      expect(bullet).toMatch(/never as a diet plan/);
      // No substitute is presented as universally better.
      expect(bullet).not.toMatch(/instead of (brown rice|whole grains)/i);
    }
  });

  test('guidance did not collapse into boilerplate — it still names this meal', () => {
    const specific = EDGE.match(/specific ingredients in THIS meal/g) ?? [];
    expect(specific).toHaveLength(2);
  });
});

describe('the surrounding contract is untouched', () => {
  test('the five-section output contract still applies to every path', () => {
    const spreads = EDGE.match(/\.\.\.FIVE_SECTION_FORMAT_RULES,/g) ?? [];
    expect(spreads).toHaveLength(3);
    expect(EDGE).toContain('Do not add, remove, or rename sections.');
    for (const label of ['🍽️ MEAL', '📊 SCORE', '⚠️ POSSIBLE SENSITIVITY', '✅ BETTER OPTION', '➡️ NEXT STEP']) {
      expect(EDGE).toContain(label);
    }
  });

  test('the existing no-treatment-claim rule is still present in both analysis paths', () => {
    const rule =
      EDGE.match(/Do not claim a food will treat, cure, prevent, diagnose, or reliably stop symptoms/g) ?? [];
    expect(rule).toHaveLength(2);
  });

  test('the pain Plan B and its escalation advice survive', () => {
    expect(EDGE).toMatch(/seek medical care promptly for severe, worsening, or unusual pain/);
  });

  test('the model is never asked to produce citations', () => {
    expect(EDGE).not.toMatch(/\b(cite|citation|citations)\b/i);
    expect(EDGE).not.toMatch(/\b(according to|reference) (a|the) (study|paper|guideline)\b/i);
  });
});
