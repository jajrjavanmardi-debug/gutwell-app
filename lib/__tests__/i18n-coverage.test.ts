/**
 * Translation coverage tests.
 *
 * Guards the v1.0 language scope (English + German), key parity between the
 * two resources, and the claim-safety rules that apply to user-facing copy.
 */

import { translations, getTranslation, SUPPORTED_LANGUAGES, LANGUAGE_LABELS } from '../i18n';
import { ONBOARDING_STEPS, LEGACY_ONBOARDING_STEPS } from '../onboarding-config';

const PERSIAN_SCRIPT = /[؀-ۿ]/;

/** Flatten a translation object into dotted key paths. */
function keyPaths(value: unknown, prefix = ''): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, i) => keyPaths(item, `${prefix}[${i}]`));
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) =>
      keyPaths(v, prefix ? `${prefix}.${k}` : k)
    );
  }
  return [prefix];
}

/** Every leaf string in a translation object. */
function leafStrings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(leafStrings);
  if (value && typeof value === 'object') return Object.values(value).flatMap(leafStrings);
  return [];
}

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
const ORIGINAL_BANNED_CLAIMS: RegExp[] = [
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
const ADDED_BANNED_CLAIMS: RegExp[] = [
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
const BANNED_CLAIMS: RegExp[] = [...ORIGINAL_BANNED_CLAIMS, ...ADDED_BANNED_CLAIMS];

describe('language scope', () => {
  test('exactly two translation resources ship: en and de', () => {
    expect(Object.keys(translations).sort()).toEqual(['de', 'en']);
    expect(SUPPORTED_LANGUAGES).toEqual(['en', 'de']);
  });

  test('there is no Persian resource', () => {
    expect((translations as Record<string, unknown>).fa).toBeUndefined();
  });

  test('no translated string anywhere contains Persian script', () => {
    for (const [lang, resource] of Object.entries(translations)) {
      for (const value of leafStrings(resource)) {
        expect(`${lang}: ${value}`).not.toMatch(PERSIAN_SCRIPT);
      }
    }
  });

  test('getTranslation falls back to English for an unsupported language', () => {
    expect(getTranslation('fa' as never)).toBe(translations.en);
    expect(getTranslation(undefined as never)).toBe(translations.en);
  });

  test('English is the source of truth and is always resolvable', () => {
    expect(getTranslation('en')).toBe(translations.en);
    expect(getTranslation('de')).toBe(translations.de);
  });
});

describe('key parity', () => {
  test('German defines exactly the same keys as English', () => {
    const en = keyPaths(translations.en).sort();
    const de = keyPaths(translations.de).sort();

    const missingInDe = en.filter((k) => !de.includes(k));
    const extraInDe = de.filter((k) => !en.includes(k));

    expect({ missingInDe, extraInDe }).toEqual({ missingInDe: [], extraInDe: [] });
  });

  test('no translated value is empty', () => {
    for (const [lang, resource] of Object.entries(translations)) {
      for (const value of leafStrings(resource)) {
        expect(`${lang}: "${value}"`).not.toMatch(/^\w+: ""$/);
      }
    }
  });
});

describe('welcome hero sequence', () => {
  // The cycling taglines and the three value points were removed when the
  // Story Experience took the centre of Welcome. The tests that pinned their
  // exact strings went with them — they asserted copy that no longer ships.
  // What replaces them is asserted in story-carousel.test.ts.

  test('the retired welcome copy is gone from both languages, not merely unused', () => {
    for (const lang of ['en', 'de'] as const) {
      const welcome = translations[lang].welcome as Record<string, unknown>;
      expect(welcome.taglines).toBeUndefined();
      expect(welcome.valuePoints).toBeUndefined();
      expect(welcome.headline).toBeUndefined();
    }
  });
});

describe('claim safety', () => {
  test('no user-facing string makes a banned health or marketing claim', () => {
    for (const [lang, resource] of Object.entries(translations)) {
      for (const value of leafStrings(resource)) {
        for (const pattern of BANNED_CLAIMS) {
          expect(`${lang}: ${value}`).not.toMatch(pattern);
        }
      }
    }
  });

  test('dairy-free is not mistranslated as lactose-free in German', () => {
    expect(translations.de.settings.dietOptions.dairyFree).toBe('Ohne Milchprodukte');
    expect(translations.de.settings.dietOptions.dairyFree).not.toBe('Laktosefrei');
  });
});

/**
 * Claim safety for onboarding step definitions.
 *
 * The scan above walks `translations` only. Step copy in
 * lib/onboarding-config.ts is hardcoded English that never passes through the
 * i18n resources, so it sat outside every claim-safety guard the project had —
 * which is how "People who track consistently with Gutwell tend to notice
 * their flare-up days dropping within the first few weeks" survived in the
 * repository while a pattern matching that exact phrase was already in the
 * banned list.
 *
 * BOTH arrays are scanned. The legacy sequence is unreachable — nothing
 * imports it and the stepper walks ONBOARDING_STEPS — but "unreachable" is a
 * property of today's wiring, not of the text. Re-pointing the stepper is a
 * one-line change, and the strings should not be waiting to become a claim if
 * anyone ever makes it.
 */
describe('claim safety — onboarding step definitions', () => {
  /** Every string in a step definition: titles, bodies, captions, options. */
  function stepStrings(steps: readonly unknown[]): string[] {
    return steps.flatMap(leafStrings);
  }

  test('the active flow makes no banned claim', () => {
    for (const value of stepStrings(ONBOARDING_STEPS)) {
      for (const pattern of BANNED_CLAIMS) {
        expect(`ONBOARDING_STEPS: ${value}`).not.toMatch(pattern);
      }
    }
  });

  test('the retained legacy flow makes no banned claim either', () => {
    for (const value of stepStrings(LEGACY_ONBOARDING_STEPS)) {
      for (const pattern of BANNED_CLAIMS) {
        expect(`LEGACY_ONBOARDING_STEPS: ${value}`).not.toMatch(pattern);
      }
    }
  });

  test('the specific claim that motivated this guard cannot come back', () => {
    // Belt and braces: an exact-substring check that does not depend on the
    // regex list staying correct.
    const all = [...stepStrings(ONBOARDING_STEPS), ...stepStrings(LEGACY_ONBOARDING_STEPS)];
    for (const value of all) {
      expect(value).not.toMatch(/flare-?up days dropping/i);
      expect(value).not.toMatch(/tend to notice their/i);
    }
  });
});

/**
 * Calibration for the banned-claims list itself.
 *
 * A claim-safety test is only useful while people trust it. One that rejects
 * "Your subscription renews in 4 weeks" gets suppressed, weakened, or worked
 * around the first time someone writes ordinary billing copy — and then it
 * protects nothing. These cases pin BOTH directions so the list can be
 * tightened later without silently becoming unusable.
 */
describe('banned-claims calibration', () => {
  /** True when any pattern in `list` matches. */
  const flagged = (list: RegExp[], s: string) => list.some((r) => r.test(s));

  const MUST_FAIL = [
    // The claim that started this.
    'People who track consistently tend to notice their flare-up days dropping within the first few weeks.',
    // Outcome + numeric timeline, EN.
    'Feel better in 2 weeks',
    'Reduce symptoms in 7 days',
    'Get relief in 3 weeks',
    // Outcome + numeric timeline, DE.
    'Fühl dich besser in 2 Wochen',
    'Spürbare Linderung in 7 Tagen',
    // Outcome + vague near-term period.
    'Your symptoms improve within the first few weeks.',
    // Trajectory without a number.
    'Your symptoms can trend down',
    // Medical objects.
    'GutWell treats your symptoms',
    'GutWell diagnoses your condition',
    'This helps prevent your flare-ups',
  ];

  const MUST_PASS = [
    // Neutral billing / retention / scheduling language. Every one of these
    // was rejected by the first draft of the timeline patterns.
    'Your subscription renews in 4 weeks',
    'Your trial ends in 7 days',
    'Your data is deleted in 30 days',
    'Review your last 7 days',
    'Deine Daten werden in 30 Tagen gelöscht',
    'Dein Abo verlängert sich in 4 Wochen',
    // Neutral use of a near-term period.
    'Look back over the first few weeks of tracking.',
    // The required disclaimers, which name diagnosis and treatment to DENY
    // them. These must never be caught.
    'GutWell does not diagnose or treat medical conditions.',
    'GutWell AI does not provide medical advice, diagnosis, or treatment.',
    'General wellness information, not a diagnosis.',
    // The exact shipped disclaimer. An earlier draft of the medical-object
    // pattern rejected this — the one string in the app that MUST say
    // "diagnose, treat, cure, or prevent" out loud.
    'GutWell AI is a wellness tracking tool and is not intended to diagnose, treat, cure, or prevent any disease. Always consult a qualified medical professional about health concerns.',
  ];

  test.each(MUST_FAIL)('flags the unsupported claim: %s', (phrase) => {
    expect(flagged(BANNED_CLAIMS, phrase)).toBe(true);
  });

  test.each(MUST_PASS)('allows the neutral phrase: %s', (phrase) => {
    expect(flagged(BANNED_CLAIMS, phrase)).toBe(false);
  });

  /**
   * Known limitation, pinned deliberately rather than hidden.
   *
   * "We treat your data confidentially" is a privacy sentence, not a health
   * claim, and none of the ADDED patterns match it — the medical-object
   * narrowing was written precisely so they would not. It is still caught by
   * the pre-existing `/\bwe (diagnose|treat|cure)\b/i`, which this stage was
   * explicitly told to leave alone.
   *
   * So the phrase would fail the guard today. That is a property of the
   * original list, not of the config-scan work, and the fix (narrowing the
   * original pattern) is a separate decision. This test records exactly where
   * the boundary sits so the next person does not rediscover it by accident.
   */
  test('the added patterns do not flag non-medical uses of "treat"', () => {
    expect(flagged(ADDED_BANNED_CLAIMS, 'We treat your data confidentially')).toBe(false);
    expect(flagged(ADDED_BANNED_CLAIMS, 'We treat all data as private')).toBe(false);
    // Documented: the untouched original pattern still catches it.
    expect(flagged(ORIGINAL_BANNED_CLAIMS, 'We treat your data confidentially')).toBe(true);
  });
});

describe('password reset copy', () => {
  test('the success message does not reveal whether an account exists', () => {
    for (const lang of ['en', 'de'] as const) {
      const message = translations[lang].forgotPassword.successMessage;
      // Must be conditional ("if an account exists" / "falls ein Konto ...").
      expect(message).toMatch(lang === 'en' ? /if an account/i : /falls ein konto/i);
    }
  });

  test('both languages define the recovery screen copy', () => {
    for (const lang of ['en', 'de'] as const) {
      expect(translations[lang].resetPassword.title).toBeTruthy();
      expect(translations[lang].resetPassword.invalidLink).toBeTruthy();
      expect(translations[lang].resetPassword.errorMessage).toBeTruthy();
    }
  });

  test('both languages define tappable legal link labels for Welcome', () => {
    for (const lang of ['en', 'de'] as const) {
      expect(translations[lang].welcome.legalTerms).toBeTruthy();
      expect(translations[lang].welcome.legalPrivacy).toBeTruthy();
      expect(translations[lang].welcome.legalPrefix).toBeTruthy();
    }
  });

  test('both languages define the Welcome language selector copy', () => {
    // The selector is reachable before sign-up, so a missing key here would
    // ship an untranslated control on the very first screen.
    for (const lang of ['en', 'de'] as const) {
      const w = translations[lang].welcome;
      expect(w.languageLabel).toBeTruthy();
      expect(w.accessLanguageHint).toBeTruthy();
      expect(w.languageModalTitle).toBeTruthy();
      expect(w.accessLanguageOptionHint).toBeTruthy();
    }
  });

  test('the selector reads its option names from LANGUAGE_LABELS, not translations', () => {
    // English and Deutsch are endonyms: each is shown in its own language and
    // must NOT be translated, so they live in LANGUAGE_LABELS rather than in
    // the per-language resources.
    expect(LANGUAGE_LABELS).toEqual({ en: 'English', de: 'Deutsch' });
  });
});
