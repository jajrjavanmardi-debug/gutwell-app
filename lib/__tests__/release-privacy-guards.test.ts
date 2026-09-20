/**
 * lib/__tests__/release-privacy-guards.test.ts
 *
 * Two 1.0 privacy guarantees that were true only by accident.
 *
 * CRASH REPORTING. app/_layout.tsx called Sentry.init() unconditionally with
 * `enabled: !__DEV__` — TRUE in a release build. Every shipped binary started
 * an initialized crash-reporting SDK, and the only reason nothing was ever
 * transmitted is that no DSN existed to transmit to. Meanwhile the Privacy
 * Policy says in both languages that this version uses no crash-reporting
 * service, and app.json's privacy manifest omits CrashData to match. A DSN
 * arriving from any environment would have falsified all three at once, with
 * no code change for anyone to notice in review. init() is now gated on the
 * DSN, the same shape lib/analytics.ts already used for PostHog.
 *
 * EXPORT COPY. The Privacy Policy told users to use "Export My Data", which is
 * the label on the SETTINGS row — and that row produces JSON via Share.share.
 * The CSV export lives under Profile, labelled "Export Data". The CSV claim was
 * true; the route named was wrong, so anyone following the sentence literally
 * got the other format. The wording now names the Profile screen and the format
 * without leaning on a UI label that can drift.
 *
 * Neither export implementation is touched here. Both are pinned below so a
 * copy fix cannot quietly become a behaviour change.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { translations } from '../i18n';

const root = join(__dirname, '..', '..');
const read = (...p: string[]) => readFileSync(join(root, ...p), 'utf8');

/** Comments stripped — assertions about absent code must not match prose. */
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const LAYOUT = read('app', '_layout.tsx');
const LAYOUT_CODE = strip(LAYOUT);
const ANALYTICS = strip(read('lib', 'analytics.ts'));
const APP_JSON = JSON.parse(read('app.json'));

const LANGS = ['en', 'de'] as const;

// ─── 1–6. Crash reporting cannot switch itself on ───────────────────────────

describe('Sentry stays inert unless a DSN is deliberately configured', () => {
  test('1. init runs only inside a DSN guard', () => {
    expect(LAYOUT_CODE).toContain('const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;');
    expect(LAYOUT_CODE).toContain('if (SENTRY_DSN) {');
    const guardAt = LAYOUT_CODE.indexOf('if (SENTRY_DSN) {');
    const initAt = LAYOUT_CODE.indexOf('Sentry.init(');
    expect(initAt).toBeGreaterThan(guardAt);
  });

  test('1b. there is exactly one init, and it is not at top level', () => {
    expect((LAYOUT_CODE.match(/Sentry\.init\(/g) ?? [])).toHaveLength(1);
    // The defect: `Sentry.init({` starting a line with no indentation.
    expect(LAYOUT_CODE).not.toMatch(/^Sentry\.init\(\{/m);
  });

  test('2. a production build alone cannot enable it', () => {
    // `enabled: !__DEV__` is TRUE in release. It must sit INSIDE the guard, so
    // being in production is never on its own sufficient.
    const guarded = LAYOUT_CODE.slice(LAYOUT_CODE.indexOf('if (SENTRY_DSN) {'));
    expect(guarded).toContain('enabled: !__DEV__');
    const beforeGuard = LAYOUT_CODE.slice(0, LAYOUT_CODE.indexOf('if (SENTRY_DSN) {'));
    expect(beforeGuard).not.toContain('Sentry.init');
    expect(beforeGuard).not.toContain('enabled: !__DEV__');
  });

  test('2b. the DSN is read from the environment, never hardcoded', () => {
    // A literal DSN would bypass the guard entirely.
    expect(LAYOUT_CODE).not.toMatch(/dsn:\s*['"]https?:\/\//);
    expect(LAYOUT_CODE).toContain('dsn: SENTRY_DSN,');
  });

  test('3. the package and plugin may exist without implying collection', () => {
    // Presence in the build is not collection. The plugin is deliberately NOT
    // removed in this release; the guarantee is that nothing initializes.
    const plugins = (APP_JSON.expo.plugins ?? []).map((p: unknown) =>
      Array.isArray(p) ? p[0] : p,
    );
    expect(plugins).toContain('@sentry/react-native');
    // …and the manifest still declares no crash data.
    const types = (APP_JSON.expo.ios.privacyManifests.NSPrivacyCollectedDataTypes ?? []).map(
      (t: { NSPrivacyCollectedDataType: string }) => t.NSPrivacyCollectedDataType,
    );
    for (const banned of [
      'NSPrivacyCollectedDataTypeCrashData',
      'NSPrivacyCollectedDataTypePerformanceData',
      'NSPrivacyCollectedDataTypeProductInteraction',
    ]) {
      expect(`${banned}: ${types.includes(banned)}`).toBe(`${banned}: false`);
    }
  });

  test('4. no analytics purpose is declared on any collected type', () => {
    const purposes = (APP_JSON.expo.ios.privacyManifests.NSPrivacyCollectedDataTypes ?? [])
      .flatMap((t: { NSPrivacyCollectedDataTypePurposes?: string[] }) => t.NSPrivacyCollectedDataTypePurposes ?? []);
    expect(purposes).not.toContain('NSPrivacyCollectedDataTypePurposeAnalytics');
    expect(APP_JSON.expo.ios.privacyManifests.NSPrivacyTracking).toBe(false);
  });

  test('5. PostHog remains inert by the same shape', () => {
    expect(ANALYTICS).toContain('if (!POSTHOG_KEY) return;');
    const init = ANALYTICS.slice(ANALYTICS.indexOf('export function initAnalytics'));
    expect(init.indexOf('if (!POSTHOG_KEY) return;'))
      .toBeLessThan(init.indexOf('new PostHog('));
  });

  test('6. no new analytics environment key was introduced', () => {
    const keys = [...LAYOUT.matchAll(/process\.env\.(EXPO_PUBLIC_[A-Z_]+)/g)].map((m) => m[1]);
    expect(new Set(keys)).toEqual(new Set(['EXPO_PUBLIC_SENTRY_DSN']));
    const aKeys = [...read('lib', 'analytics.ts').matchAll(/process\.env\.(EXPO_PUBLIC_[A-Z_]+)/g)]
      .map((m) => m[1]);
    expect(new Set(aKeys)).toEqual(new Set(['EXPO_PUBLIC_POSTHOG_KEY', 'EXPO_PUBLIC_POSTHOG_HOST']));
  });

  test('the follow-up obligations are written down where the switch is', () => {
    // If someone sets the DSN, the three things that must move with it are
    // named at the exact line they would edit.
    expect(LAYOUT).toContain('EXPO_PUBLIC_SENTRY_DSN, THAT SAME RELEASE MUST ALSO');
    expect(LAYOUT).toContain('Privacy Policy');
    expect(LAYOUT).toContain('App Privacy questionnaire');
    expect(LAYOUT).toContain('NSPrivacyCollectedDataTypeCrashData');
  });

  test('capture sites and wrap are unchanged — they are no-ops without a client', () => {
    expect(LAYOUT_CODE).toContain('export default Sentry.wrap(RootLayout);');
    expect(strip(read('components', 'ErrorBoundary.tsx'))).toContain('Sentry.captureException(error);');
  });
});

// ─── 7–11. The export sentence describes what actually happens ──────────────

describe('the Privacy Policy names the export that exists', () => {
  const retention = (lang: (typeof LANGS)[number]) => {
    const s = translations[lang].legalScreens.privacySections
      .map((x) => x.body)
      .find((b) => /CSV/.test(b));
    expect(s).toBeDefined();
    return s as string;
  };

  test('7. EN describes a CSV export from the Profile', () => {
    const s = retention('en');
    expect(s).toContain('from your Profile as a CSV file');
    expect(s).toContain('share sheet');
  });

  test('8. DE describes a CSV export from the Profile', () => {
    const s = retention('de');
    expect(s).toContain('in deinem Profil als CSV-Datei exportieren');
    expect(s).toContain('Teilen-Men');
  });

  test('9. no legal copy sends the user to the JSON control', () => {
    // "Export My Data" is a real Settings label and stays in the UI strings —
    // it just must not appear in legal copy attached to a CSV claim.
    for (const lang of LANGS) {
      const legal = JSON.stringify(translations[lang].legalScreens);
      for (const banned of ['Export My Data', 'Meine Daten exportieren']) {
        expect(`${lang} legal mentions "${banned}": ${legal.includes(banned)}`).toBe(
          `${lang} legal mentions "${banned}": false`,
        );
      }
    }
    // The UI label itself is untouched.
    expect(translations.en.settings.exportMyData).toBe('Export My Data');
    expect(translations.de.settings.exportMyData).toBe('Meine Daten exportieren');
  });

  test('9b. both languages still make exactly one CSV claim', () => {
    for (const lang of LANGS) {
      const hits = translations[lang].legalScreens.privacySections.filter((s) => /CSV/.test(s.body));
      expect(`${lang} CSV claims: ${hits.length}`).toBe(`${lang} CSV claims: 1`);
    }
  });

  test('10. the CSV export implementation is unchanged', () => {
    const exp = read('lib', 'export.ts');
    expect(exp).toContain("mimeType: 'text/csv'");
    expect(exp).toContain('Sharing.shareAsync');
    // Profile is the screen that reaches it, under its own label.
    const profile = read('app', '(tabs)', 'profile.tsx');
    expect(profile).toContain('t.profile.exportData');
    expect(profile).toContain('onPress={handleExport}');
    expect(translations.en.profile.exportData).toBe('Export Data');
  });

  test('11. the Settings JSON export is unchanged', () => {
    const settings = read('app', 'settings.tsx');
    expect(settings).toContain('JSON.stringify(exportData, null, 2)');
    expect(settings).toContain('t.settings.exportMyData');
    // Still a share-sheet message, not a CSV file — which is why the legal
    // copy must not point here.
    expect(settings).toContain('await Share.share({');
  });
});

// ─── Scope ──────────────────────────────────────────────────────────────────

describe('nothing else in the legal contract moved', () => {
  test('operator, address, contact and age are untouched', () => {
    for (const lang of LANGS) {
      const l = translations[lang].legalScreens;
      expect(l.operatorName).toBe('Jafar Rusban Javanmardi');
      expect(l.contactEmail).toBe('support@getgutwell.app');
      expect(l.operatorAddress).toContain('65183 Wiesbaden');
    }
    expect(JSON.stringify(translations.en.legalScreens)).toContain('at least 16 years old');
    expect(JSON.stringify(translations.de.legalScreens)).toContain('mindestens 16 Jahre');
  });

  test('no Singapore, and German governing law stands', () => {
    for (const lang of LANGS) {
      const legal = JSON.stringify(translations[lang].legalScreens);
      expect(`${lang} Singapore: ${/singapore/i.test(legal)}`).toBe(`${lang} Singapore: false`);
    }
    expect(JSON.stringify(translations.en.legalScreens))
      .toContain('law of the Federal Republic of Germany');
  });

  test('crash-reporting denial is still the stated position in both languages', () => {
    expect(JSON.stringify(translations.en.legalScreens))
      .toContain('does not use analytics or crash-reporting services');
    for (const lang of LANGS) {
      const legal = JSON.stringify(translations[lang].legalScreens);
      expect(`${lang} names PostHog: ${/posthog/i.test(legal)}`).toBe(`${lang} names PostHog: false`);
      expect(`${lang} names Sentry: ${/sentry/i.test(legal)}`).toBe(`${lang} names Sentry: false`);
    }
  });
});
