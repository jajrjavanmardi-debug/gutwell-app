/**
 * lib/__tests__/legal-consistency.test.ts
 *
 * The in-app legal screens are the documents users actually accept — the
 * signup checkbox links to them, not to the website. Build 6 shipped legal
 * copy that named Singapore as the governing law for a German operator,
 * claimed a minimum age of 13, identified no legal person, described two
 * analytics processors that are disabled in production, called the CSV export
 * JSON, and asserted as fact that Google does not train on submitted data.
 *
 * These tests pin the corrected facts. They read the shipped source rather
 * than re-stating copy, so a regression in either language fails here.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { translations } from '../i18n';

const root = join(__dirname, '..', '..');
const read = (...p: string[]) => readFileSync(join(root, ...p), 'utf8');

const PRIVACY_SCREEN = read('app', 'privacy-policy.tsx');
const TERMS_SCREEN = read('app', 'terms-of-service.tsx');
const SIGNUP = read('app', '(auth)', 'signup.tsx');
const PAYWALL = read('app', 'paywall.tsx');
const PROFILE = read('app', '(tabs)', 'profile.tsx');
const SETTINGS = read('app', 'settings.tsx');
const WELCOME = read('app', '(onboarding)', 'welcome.tsx');

const LANGS = ['en', 'de'] as const;

/** Every legal string that ships, per language. */
function legalStrings(lang: (typeof LANGS)[number]): string[] {
  const legal = translations[lang].legalScreens as Record<string, unknown>;
  const out: string[] = [];
  for (const value of Object.values(legal)) {
    if (typeof value === 'string') out.push(value);
    if (Array.isArray(value)) {
      for (const section of value as Array<{ title: string; body: string }>) {
        out.push(section.title, section.body);
      }
    }
  }
  return out;
}

// ─── The confirmed operator facts ────────────────────────────────────────────

describe('operator identity', () => {
  test('both languages name the legal operator', () => {
    for (const lang of LANGS) {
      expect(translations[lang].legalScreens.operatorName).toBe('Jafar Rusban Javanmardi');
    }
  });

  test('both languages carry the German service address', () => {
    for (const lang of LANGS) {
      const address = translations[lang].legalScreens.operatorAddress;
      expect(address).toContain('Sedanstraße 13');
      expect(address).toContain('65183 Wiesbaden');
    }
    // The country name is the one part that is genuinely translated.
    expect(translations.en.legalScreens.operatorAddress).toContain('Germany');
    expect(translations.de.legalScreens.operatorAddress).toContain('Deutschland');
  });

  test('both languages publish the monitored support address', () => {
    for (const lang of LANGS) {
      expect(translations[lang].legalScreens.contactEmail).toBe('support@getgutwell.app');
    }
  });

  test('the operator is named inside the privacy text itself, not only in the footer', () => {
    for (const lang of LANGS) {
      const joined = legalStrings(lang).join('\n');
      expect(joined).toContain('Jafar Rusban Javanmardi');
      expect(joined).toContain('Sedanstraße 13');
      expect(joined).toContain('65183 Wiesbaden');
    }
  });

  test('no screen still claims the app is operated by an unnamed entity', () => {
    for (const lang of LANGS) {
      expect(legalStrings(lang).join('\n')).not.toContain('operated by GutWell AI');
    }
  });
});

// ─── The Singapore regression ────────────────────────────────────────────────

describe('governing law', () => {
  test('the word Singapore appears nowhere in the shipped client', () => {
    for (const source of [PRIVACY_SCREEN, TERMS_SCREEN, SIGNUP, PAYWALL, PROFILE, SETTINGS, WELCOME]) {
      expect(source).not.toMatch(/singapore/i);
    }
    for (const lang of LANGS) {
      for (const value of legalStrings(lang)) {
        expect(value).not.toMatch(/singapore/i);
      }
    }
  });

  test('both languages state German law', () => {
    expect(translations.en.legalScreens.termsSections[8].body).toContain('Federal Republic of Germany');
    expect(translations.de.legalScreens.termsSections[8].body).toContain('Bundesrepublik Deutschland');
  });

  test('the consumer forum is preserved rather than excluded', () => {
    // A blanket "exclusive jurisdiction" clause is exactly what was removed.
    for (const lang of LANGS) {
      expect(legalStrings(lang).join('\n')).not.toMatch(/exclusive jurisdiction|ausschließliche[rn]? Gerichtsstand/i);
    }
    expect(translations.en.legalScreens.termsSections[8].body).toMatch(/mandatory provisions/i);
    expect(translations.de.legalScreens.termsSections[8].body).toMatch(/zwingender Vorschriften/i);
  });
});

// ─── Minimum age ─────────────────────────────────────────────────────────────

describe('minimum age', () => {
  test('both languages require 16, and 13 is gone', () => {
    expect(translations.en.legalScreens.termsSections[0].body).toContain('at least 16 years old');
    expect(translations.de.legalScreens.termsSections[0].body).toContain('mindestens 16 Jahre');
    for (const lang of LANGS) {
      expect(legalStrings(lang).join('\n')).not.toMatch(/at least 13|13 Jahre/);
    }
  });
});

// ─── Processors that are disabled in production ──────────────────────────────

describe('processor disclosure matches the production configuration', () => {
  test('neither PostHog nor Sentry is described as receiving data', () => {
    for (const lang of LANGS) {
      for (const value of legalStrings(lang)) {
        expect(value).not.toMatch(/posthog/i);
        expect(value).not.toMatch(/sentry/i);
      }
    }
  });

  test('both languages state positively that this version uses no analytics', () => {
    expect(translations.en.legalScreens.privacySections[2].body).toMatch(/does not use analytics or crash-reporting/i);
    expect(translations.de.legalScreens.privacySections[2].body).toMatch(/keine Analyse- oder Absturzberichtsdienste/i);
  });

  test('the processors that ARE active are still disclosed', () => {
    for (const lang of LANGS) {
      const providers = legalStrings(lang).join('\n');
      expect(providers).toMatch(/Supabase/);
      expect(providers).toMatch(/Gemini/);
      expect(providers).toMatch(/RevenueCat/);
      expect(providers).toMatch(/Apple/);
    }
  });
});

// ─── The unverified Gemini claim ─────────────────────────────────────────────

describe('AI provider claims are limited to what is verified', () => {
  test('no assertion about whether Google trains on submitted data', () => {
    for (const lang of LANGS) {
      for (const value of legalStrings(lang)) {
        expect(value).not.toMatch(/train (its )?models?/i);
        expect(value).not.toMatch(/does not use this data to train/i);
        expect(value).not.toMatch(/trainier/i); // trainiert / trainieren
        expect(value).not.toMatch(/Modelle zu trainieren/i);
      }
    }
  });

  test('the verified fact — transmission for processing — is still stated', () => {
    expect(translations.en.legalScreens.privacySections[2].body).toMatch(/transmitted to Google’s Gemini API/i);
    expect(translations.de.legalScreens.privacySections[2].body).toMatch(/an die Gemini-API von Google übermittelt/i);
  });
});

// ─── Export format ───────────────────────────────────────────────────────────

describe('data export is described as it is implemented', () => {
  test('both languages say CSV', () => {
    expect(translations.en.legalScreens.privacySections[4].body).toContain('CSV');
    expect(translations.de.legalScreens.privacySections[4].body).toContain('CSV');
  });

  test('neither language calls the export JSON', () => {
    for (const lang of LANGS) {
      expect(legalStrings(lang).join('\n')).not.toMatch(/\bJSON\b/);
    }
  });

  test('the implementation really does produce CSV', () => {
    // Pins the copy to the code it describes.
    expect(read('lib', 'export.ts')).toMatch(/csv/i);
  });
});

// ─── Voice / speech ──────────────────────────────────────────────────────────

describe('voice input disclosure', () => {
  test('both languages disclose speech-to-text and that no audio is kept', () => {
    expect(translations.en.legalScreens.privacySections[0].body).toMatch(/speech is converted to text/i);
    expect(translations.en.legalScreens.privacySections[0].body).toMatch(/do not keep an audio recording/i);
    expect(translations.de.legalScreens.privacySections[0].body).toMatch(/Spracherkennung/i);
    expect(translations.de.legalScreens.privacySections[0].body).toMatch(/Audioaufnahme/i);
  });
});

// ─── Structure and parity ────────────────────────────────────────────────────

describe('EN/DE legal parity', () => {
  test('the privacy policy has the same number of sections in both languages', () => {
    expect(translations.de.legalScreens.privacySections).toHaveLength(
      translations.en.legalScreens.privacySections.length,
    );
    expect(translations.en.legalScreens.privacySections).toHaveLength(7);
  });

  test('the terms have the same number of sections in both languages', () => {
    expect(translations.de.legalScreens.termsSections).toHaveLength(
      translations.en.legalScreens.termsSections.length,
    );
    expect(translations.en.legalScreens.termsSections).toHaveLength(9);
  });

  test('section numbering is aligned across languages', () => {
    for (const key of ['privacySections', 'termsSections'] as const) {
      const en = translations.en.legalScreens[key];
      const de = translations.de.legalScreens[key];
      en.forEach((section, i) => {
        const number = section.title.split('.')[0];
        expect(`${key}[${i}] -> ${de[i].title}`).toContain(`${number}.`);
      });
    }
  });

  test('German legal copy is genuinely translated, not copied English', () => {
    for (const key of ['privacySections', 'termsSections'] as const) {
      translations.en.legalScreens[key].forEach((section, i) => {
        expect(translations.de.legalScreens[key][i].body).not.toBe(section.body);
      });
    }
  });

  test('both documents carry the same revision date', () => {
    for (const lang of LANGS) {
      expect(translations[lang].legalScreens.lastUpdated).toMatch(/2026/);
    }
    // One date for one revision — Build 6 shipped "June 2026" and "March 2026".
    expect(translations.en.legalScreens.lastUpdated).toBe('Last updated: August 2026');
    expect(translations.de.legalScreens.lastUpdated).toBe('Zuletzt aktualisiert: August 2026');
  });

  test('no legal string is left in Persian script', () => {
    for (const lang of LANGS) {
      for (const value of legalStrings(lang)) {
        expect(value).not.toMatch(/[؀-ۿ]/);
      }
    }
  });
});

// ─── The screens actually render the localized content ───────────────────────

describe('the screens read their content from the language system', () => {
  test('neither screen still holds a hardcoded SECTIONS array', () => {
    expect(PRIVACY_SCREEN).not.toContain('const SECTIONS');
    expect(TERMS_SCREEN).not.toContain('const SECTIONS');
  });

  test('both screens resolve copy through useTranslation', () => {
    for (const screen of [PRIVACY_SCREEN, TERMS_SCREEN]) {
      expect(screen).toContain('useTranslation');
      expect(screen).toContain('t.legalScreens');
    }
  });

  test('the privacy screen renders the localized section list', () => {
    expect(PRIVACY_SCREEN).toContain('legal.privacySections.map');
    expect(TERMS_SCREEN).toContain('legal.termsSections.map');
  });

  test('there is no second language mechanism', () => {
    // Anything resembling a parallel copy store would defeat key parity.
    for (const screen of [PRIVACY_SCREEN, TERMS_SCREEN]) {
      expect(screen).not.toMatch(/const (DE|GERMAN|EN_|COPY)_/);
    }
  });
});

// ─── Legal navigation is unchanged ───────────────────────────────────────────

describe('legal navigation routes are unchanged', () => {
  test('every legal entry point still targets the same two routes', () => {
    // Build 6 behaviour is a release contract: these routes must not move.
    expect(SIGNUP).toContain("router.push('/terms-of-service')");
    expect(SIGNUP).toContain("router.push('/privacy-policy')");
    expect(PAYWALL).toContain("router.push('/terms-of-service')");
    expect(PAYWALL).toContain("router.push('/privacy-policy')");
    expect(PROFILE).toContain("router.push('/privacy-policy')");
    expect(PROFILE).toContain("router.push('/terms-of-service')");
    expect(SETTINGS).toContain("router.push('/privacy-policy')");
    expect(WELCOME).toContain("router.push('/terms-of-service')");
    expect(WELCOME).toContain("router.push('/privacy-policy')");
  });

  test('no in-app Impressum route was introduced', () => {
    // The operator block lives inside the existing screens by design; a new
    // route would be a navigation-architecture change.
    for (const source of [PRIVACY_SCREEN, TERMS_SCREEN, SIGNUP, PAYWALL, PROFILE, SETTINGS, WELCOME]) {
      expect(source).not.toMatch(/router\.push\(['"]\/impressum/);
    }
  });
});

// ─── Signup consent ──────────────────────────────────────────────────────────

describe('signup consent copy', () => {
  test('the English sentence reads as a complete sentence', () => {
    const s = translations.en.signup;
    expect(`${s.termsAgree} ${s.termsOfService} ${s.termsAnd} ${s.privacyPolicy}`)
      .toBe('I agree to the Terms of Service and Privacy Policy');
  });

  test('the German sentence is grammatically complete', () => {
    // "Ich stimme ... zu" is separable and the assembled sentence has no
    // trailing slot, so the prefix was silently dropped. "akzeptieren" needs
    // none. Guards against a revert to the broken phrasing.
    const s = translations.de.signup;
    const sentence = `${s.termsAgree} ${s.termsOfService} ${s.termsAnd} ${s.privacyPolicy}`;
    expect(sentence).toBe('Ich akzeptiere die Nutzungsbedingungen und die Datenschutzrichtlinie');
    expect(s.termsAgree).not.toContain('Ich stimme');
  });

  test('the auth flow itself is untouched by the copy fix', () => {
    // The consent block still renders from i18n with no new consent state.
    expect(SIGNUP).toContain('t.signup.termsAgree');
    expect(SIGNUP).toContain('termsAccepted');
  });
});
