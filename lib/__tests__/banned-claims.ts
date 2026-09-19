/**
 * lib/__tests__/banned-claims.ts
 *
 * The single claim-safety word list, shared by every suite that scans
 * user-facing copy.
 *
 * ── Why this file exists ────────────────────────────────────────────────────
 *
 * The list started inside i18n-coverage.test.ts and scanned only the i18n
 * resources. Copy that lives elsewhere — onboarding step definitions, then the
 * wellness tips — each grew its OWN narrower list, and each of those lists was
 * weaker than this one. That is how "flare-up days dropping" survived in
 * lib/onboarding-config.ts while a pattern matching that exact phrase was
 * already banned three files away.
 *
 * One list, imported everywhere, is the fix. A new copy surface adds a scan
 * here rather than a private list of its own.
 *
 * ── Why it is a test file, not production code ──────────────────────────────
 *
 * Nothing at runtime needs these patterns; they are a build-time guard on
 * strings that humans write. Putting them in lib/ would ship a regex table
 * into the bundle and invite production code to depend on a lint rule.
 *
 * jest.config's testMatch only collects files ending in `.test.ts`, so this
 * module sits inside __tests__ without being run as a suite of its own.
 */

/**
 * Banned phrasings from the product's standing claim-safety decision.
 *
 * These target AFFIRMATIVE claims only — the required medical disclaimers
 * legitimately contain words like "diagnosis" and "treatment" in a negated
 * form ("does not provide medical advice, diagnosis, or treatment"), so every
 * pattern here must be written so a negated disclaimer cannot match it.
 *
 * Hoisted to module scope so the i18n scan and the onboarding-config scan
 * below share ONE list. Two copies would drift, and the drift would show up
 * as copy that is safe in one file and unchecked in the other — which is
 * exactly the gap that let the config strings go unguarded until now.
 */
/** The pre-existing list. Frozen — not modified by the config-scan work. */
export const ORIGINAL_BANNED_CLAIMS: RegExp[] = [
  /reduce symptoms/i,
  /flare-?up days dropping/i,
  /join thousands/i,
  /rate us highly/i,
  /\bcures? your\b/i,
  /\bwe (diagnose|treat|cure)\b/i,
  /guaranteed/i,
  /garantiert/i,
  /\bheilt\b/i,
  /Beschwerden reduzier/i,
  /proven to (reduce|improve|prevent)/i,
];

/**
 * Words that turn a neutral sentence into an outcome claim.
 *
 * A timeline on its own says nothing — "renews in 4 weeks" is billing, not
 * medicine. It is the pairing of a period with a promised improvement that
 * makes a claim, so the timeline patterns below require BOTH.
 */
const OUTCOME_EN = String.raw`better|improv\w*|relief|reduc\w*|calmer|fewer|symptom-free|flare-?ups?`;
const OUTCOME_DE = String.raw`besser|Linderung|Verbesserung|beschwerdefrei|weniger`;

/** Matches `period` only when an outcome word appears somewhere in the string. */
function outcomeGated(outcome: string, period: string): RegExp {
  // [\s\S] rather than . so multi-line bodies are still scanned whole.
  return new RegExp(String.raw`(?=[\s\S]*\b(?:${outcome}))[\s\S]*${period}`, 'i');
}

/**
 * Patterns added when the scan was extended to lib/onboarding-config.ts.
 *
 * Each one is deliberately narrower than "mentions a period" or "mentions
 * treatment": the first drafts banned "Your subscription renews in 4 weeks"
 * and "We treat your data confidentially", which is how a claim-safety test
 * stops being run and starts being worked around.
 */
export const ADDED_BANNED_CLAIMS: RegExp[] = [
  // Improvement tied to a number of days/weeks/months, EN and DE.
  outcomeGated(OUTCOME_EN, String.raw`\bin \d+\s*(?:days?|weeks?|months?)\b`),
  outcomeGated(OUTCOME_DE, String.raw`\bin \d+\s*(?:Tagen?|Wochen?|Monaten?)\b`),
  // Improvement tied to a vague near-term period. "Look back over the first
  // few weeks of tracking" is neutral and passes: no outcome word, and "over"
  // is not "in"/"within".
  outcomeGated(OUTCOME_EN, String.raw`\b(?:with)?in (?:the )?(?:first|next) few (?:days|weeks|months)\b`),
  // Symptom-trajectory promises that avoid a number but still promise a
  // direction of travel.
  /symptoms? (can|will) (trend down|drop|improve|decrease)/i,
  /(flare-?ups?|symptoms?) (dropping|decreasing|going down)/i,
  /Symptome (nehmen ab|gehen zurück|werden weniger)/i,
  // Affirmative diagnosis / treatment / cure / prevention, restricted to
  // MEDICAL objects — and to grammar a disclaimer does not use.
  //
  // The required disclaimer reads "...is not intended to diagnose, treat,
  // cure, or prevent any disease", which is a bare infinitive list under a
  // negation. A claim is either INFLECTED ("GutWell treats your symptoms") or
  // takes a POSSESSIVE object ("helps prevent your flare-ups"). Splitting on
  // that distinction lets both shapes fail while the disclaimer passes,
  // without trying to parse the negation itself.
  //
  // 1. Inflected verb + medical object.
  /\b(?:diagnoses|treats|cures|prevents)\s+(?:your\s+|the\s+|any\s+)?(?:symptoms?|conditions?|illness(?:es)?|diseases?|ibs|bloating|flare-?ups?|digestion)\b/i,
  // 2. Any form + "your" + medical object. "your data" is not medical and is
  //    deliberately not covered.
  /\b(?:diagnose|treat|cure|prevent)s?\s+your\s+(?:symptoms?|conditions?|illness(?:es)?|diseases?|ibs|bloating|flare-?ups?|digestion|gut)\b/i,
  /\bhelps? (cure|prevent|treat)\b/i,
  /\bheilt|behandelt deine|diagnostiziert deine\b/i,
];

/**
 * Banned phrasings from the product's standing claim-safety decision.
 *
 * These target AFFIRMATIVE claims only — the required medical disclaimers
 * legitimately contain words like "diagnosis" and "treatment" in a negated
 * form ("does not provide medical advice, diagnosis, or treatment"), so every
 * pattern here must be written so a negated disclaimer cannot match it.
 *
 * Hoisted to module scope so the i18n scan and the onboarding-config scan
 * below share ONE list. Two copies would drift, and the drift would show up
 * as copy that is safe in one file and unchecked in the other — which is
 * exactly the gap that let the config strings go unguarded until now.
 */
export const BANNED_CLAIMS: RegExp[] = [...ORIGINAL_BANNED_CLAIMS, ...ADDED_BANNED_CLAIMS];
