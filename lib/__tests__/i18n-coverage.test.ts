/**
 * Translation coverage tests.
 *
 * Guards the v1.0 language scope (English + German), key parity between the
 * two resources, and the claim-safety rules that apply to user-facing copy.
 */

import { translations, getTranslation, SUPPORTED_LANGUAGES } from '../i18n';

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
  const EXPECTED_EN = [
    'Track your gut health.',
    'Understand your gut.',
    'Notice possible patterns.',
    'Find your triggers.',
    'Build healthier habits.',
    'Feel your best.',
    'Enjoy your meals.',
  ];

  const EXPECTED_DE = [
    'Behalte deine Darmgesundheit im Blick.',
    'Verstehe deinen Darm besser.',
    'Erkenne mögliche Zusammenhänge.',
    'Finde deine persönlichen Auslöser.',
    'Entwickle gesündere Gewohnheiten.',
    'Fühl dich rundum wohl.',
    'Genieße deine Mahlzeiten.',
  ];

  test('English taglines match the approved sequence, in order', () => {
    expect(translations.en.welcome.taglines).toEqual(EXPECTED_EN);
  });

  test('German taglines match the approved sequence, in order', () => {
    expect(translations.de.welcome.taglines).toEqual(EXPECTED_DE);
  });

  test('both languages have the same number of taglines', () => {
    expect(translations.de.welcome.taglines.length).toBe(
      translations.en.welcome.taglines.length
    );
  });
});

describe('claim safety', () => {
  // Banned phrasings from the product's standing claim-safety decision.
  // These target AFFIRMATIVE claims only — the required medical disclaimers
  // legitimately contain words like "diagnosis" and "treatment" in a negated
  // form ("does not provide medical advice, diagnosis, or treatment").
  const BANNED = [
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

  test('no user-facing string makes a banned health or marketing claim', () => {
    for (const [lang, resource] of Object.entries(translations)) {
      for (const value of leafStrings(resource)) {
        for (const pattern of BANNED) {
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
});
