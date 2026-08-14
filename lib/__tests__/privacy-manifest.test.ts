/**
 * lib/__tests__/privacy-manifest.test.ts
 *
 * The App Store privacy manifest must survive `expo prebuild` from a clean
 * checkout.
 *
 * ── The failure this guards ─────────────────────────────────────────────────
 * `ios/` is gitignored (.gitignore:48), so `ios/GutWell/PrivacyInfo.xcprivacy`
 * exists only on a machine that has already prebuilt. EAS Build prebuilds from
 * a fresh clone, where that file does not exist. Anything declared ONLY in the
 * generated file is therefore invisible to the build that Apple actually
 * receives — and the failure is silent: the upload succeeds and is rejected
 * later with ITMS-91053 for undeclared required-reason API usage.
 *
 * The declarations must live in `app.json` under `ios.privacyManifests`, which
 * Expo's own `withPrivacyInfo` mod writes into the generated manifest during
 * prebuild. No custom config plugin: SDK 54 ships this, and a hand-rolled
 * plugin would be a second thing to keep in sync with Apple's key names.
 *
 * These tests pin the exact approved declarations. They are deliberately
 * literal rather than derived from app.json — a test that reads its
 * expectations from the file it is checking cannot detect a deletion.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..', '..');
const appJson = JSON.parse(readFileSync(join(root, 'app.json'), 'utf8'));
const privacy = appJson.expo?.ios?.privacyManifests;

/** Category -> reason codes. Required-reason APIs; Apple rejects on omission. */
const APPROVED_API_TYPES: Record<string, string[]> = {
  NSPrivacyAccessedAPICategoryFileTimestamp: ['C617.1', '0A2A.1', '3B52.1'],
  NSPrivacyAccessedAPICategoryUserDefaults: ['CA92.1'],
  NSPrivacyAccessedAPICategoryDiskSpace: ['E174.1', '85F4.1'],
  NSPrivacyAccessedAPICategorySystemBootTime: ['35F9.1'],
};

/**
 * Data type -> [linked, tracking, purposes]. Must match the App Store label.
 *
 * v1.0 removed four analytics/diagnostics declarations that the shipped app
 * does not fulfil: Product Interaction, Crash Data, Performance Data, and the
 * Analytics purpose on User ID. PostHog is gated on EXPO_PUBLIC_POSTHOG_KEY
 * (lib/analytics.ts) and Sentry on EXPO_PUBLIC_SENTRY_DSN (app/_layout.tsx);
 * neither key is set in any EAS environment, so both are no-ops in the build
 * Apple receives. Declaring collection that never happens contradicts the App
 * Store privacy label, which Apple cross-checks against this manifest.
 *
 * Re-add them in the same commit that sets the corresponding key — not before.
 */
const APPROVED_DATA_TYPES: Record<string, [boolean, boolean, string[]]> = {
  NSPrivacyCollectedDataTypeHealth: [true, false, ['NSPrivacyCollectedDataTypePurposeAppFunctionality']],
  NSPrivacyCollectedDataTypePhotosorVideos: [true, false, ['NSPrivacyCollectedDataTypePurposeAppFunctionality']],
  NSPrivacyCollectedDataTypeOtherUserContent: [true, false, ['NSPrivacyCollectedDataTypePurposeAppFunctionality']],
  NSPrivacyCollectedDataTypeEmailAddress: [true, false, ['NSPrivacyCollectedDataTypePurposeAppFunctionality']],
  NSPrivacyCollectedDataTypeName: [true, false, ['NSPrivacyCollectedDataTypePurposeAppFunctionality']],
  NSPrivacyCollectedDataTypeUserID: [true, false, ['NSPrivacyCollectedDataTypePurposeAppFunctionality']],
  NSPrivacyCollectedDataTypeCoarseLocation: [true, false, ['NSPrivacyCollectedDataTypePurposeAppFunctionality']],
  NSPrivacyCollectedDataTypePurchaseHistory: [true, false, ['NSPrivacyCollectedDataTypePurposeAppFunctionality']],
};

describe('privacy manifest survives prebuild', () => {
  test('the declarations live in app.json, not only in generated ios/', () => {
    // If this is ever moved back into ios/, a clean EAS build silently drops it.
    expect(privacy).toBeDefined();
    expect(privacy.NSPrivacyTracking).toBe(false);
  });

  test('every approved required-reason API category and code is declared', () => {
    const declared: Record<string, string[]> = {};
    for (const entry of privacy.NSPrivacyAccessedAPITypes ?? []) {
      declared[entry.NSPrivacyAccessedAPIType] = entry.NSPrivacyAccessedAPITypeReasons;
    }
    expect(Object.keys(declared).sort()).toEqual(Object.keys(APPROVED_API_TYPES).sort());
    for (const [category, reasons] of Object.entries(APPROVED_API_TYPES)) {
      expect(`${category}: ${declared[category]?.join(',')}`).toBe(`${category}: ${reasons.join(',')}`);
    }
  });

  test('every approved collected data type is declared, with its exact flags', () => {
    const declared = new Map(
      (privacy.NSPrivacyCollectedDataTypes ?? []).map((e: Record<string, unknown>) => [
        e.NSPrivacyCollectedDataType as string,
        e,
      ]),
    );
    expect([...declared.keys()].sort()).toEqual(Object.keys(APPROVED_DATA_TYPES).sort());
    for (const [type, [linked, tracking, purposes]] of Object.entries(APPROVED_DATA_TYPES)) {
      const e = declared.get(type) as Record<string, unknown>;
      // Linked/tracking are the fields Apple cross-checks against the App Store
      // label, so they are pinned individually rather than by object equality.
      // Interpolating the type name makes a failure name the offending entry.
      expect(`${type} linked=${e.NSPrivacyCollectedDataTypeLinked}`).toBe(`${type} linked=${linked}`);
      expect(e.NSPrivacyCollectedDataTypeTracking).toBe(tracking);
      expect(e.NSPrivacyCollectedDataTypePurposes).toEqual(purposes);
    }
  });

  test('nothing was added beyond the approved set', () => {
    expect(privacy.NSPrivacyAccessedAPITypes).toHaveLength(Object.keys(APPROVED_API_TYPES).length);
    expect(privacy.NSPrivacyCollectedDataTypes).toHaveLength(Object.keys(APPROVED_DATA_TYPES).length);
    // Tracking domains would require NSPrivacyTracking: true.
    expect(privacy.NSPrivacyTrackingDomains ?? []).toEqual([]);
  });
});

describe('the generated manifest is deterministic and duplicate-free', () => {
  // Expo's real merge, not a reimplementation of it. Repeated prebuild runs
  // merge into whatever the previous run left behind, so this is the property
  // that matters: applying twice must equal applying once.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { mergePrivacyInfo } = require('@expo/config-plugins/build/ios/PrivacyInfo');

  test('a clean checkout (no existing file) produces every declaration', () => {
    const generated = mergePrivacyInfo({}, privacy);
    expect(generated.NSPrivacyAccessedAPITypes).toHaveLength(4);
    expect(generated.NSPrivacyCollectedDataTypes).toHaveLength(8);
    expect(generated.NSPrivacyTracking).toBe(false);
  });

  test('re-running prebuild over an existing manifest changes nothing', () => {
    const once = mergePrivacyInfo({}, privacy);
    const twice = mergePrivacyInfo(once, privacy);
    expect(twice).toEqual(once);
  });

  test('no category, reason code or purpose is ever duplicated', () => {
    const g = mergePrivacyInfo(mergePrivacyInfo({}, privacy), privacy);

    const apiCategories = g.NSPrivacyAccessedAPITypes.map(
      (e: { NSPrivacyAccessedAPIType: string }) => e.NSPrivacyAccessedAPIType,
    );
    expect(apiCategories).toHaveLength(new Set(apiCategories).size);
    for (const e of g.NSPrivacyAccessedAPITypes) {
      expect(e.NSPrivacyAccessedAPITypeReasons).toHaveLength(
        new Set(e.NSPrivacyAccessedAPITypeReasons).size,
      );
    }

    const dataTypes = g.NSPrivacyCollectedDataTypes.map(
      (e: { NSPrivacyCollectedDataType: string }) => e.NSPrivacyCollectedDataType,
    );
    expect(dataTypes).toHaveLength(new Set(dataTypes).size);
    for (const e of g.NSPrivacyCollectedDataTypes) {
      expect(e.NSPrivacyCollectedDataTypePurposes).toHaveLength(
        new Set(e.NSPrivacyCollectedDataTypePurposes).size,
      );
    }
  });
});

describe('retired analytics declarations stay retired', () => {
  // The removal is the point, so it is asserted by name. The key-set equality
  // above would also catch a re-add, but not say why it is wrong.
  const RETIRED = [
    'NSPrivacyCollectedDataTypeProductInteraction',
    'NSPrivacyCollectedDataTypeCrashData',
    'NSPrivacyCollectedDataTypePerformanceData',
  ];

  test('no declaration exists for a collector that ships disabled', () => {
    const declared = (privacy.NSPrivacyCollectedDataTypes ?? []).map(
      (e: Record<string, unknown>) => e.NSPrivacyCollectedDataType as string,
    );
    for (const type of RETIRED) {
      expect(`${type} declared=${declared.includes(type)}`).toBe(`${type} declared=false`);
    }
  });

  test('User ID no longer claims an Analytics purpose', () => {
    const userId = (privacy.NSPrivacyCollectedDataTypes ?? []).find(
      (e: Record<string, unknown>) =>
        e.NSPrivacyCollectedDataType === 'NSPrivacyCollectedDataTypeUserID',
    ) as Record<string, unknown>;
    expect(userId.NSPrivacyCollectedDataTypePurposes).toEqual([
      'NSPrivacyCollectedDataTypePurposeAppFunctionality',
    ]);
  });

  test('the manifest matches the eight types declared on the App Store label', () => {
    const declared = (privacy.NSPrivacyCollectedDataTypes ?? [])
      .map((e: Record<string, unknown>) => e.NSPrivacyCollectedDataType as string)
      .sort();
    expect(declared).toEqual(
      [
        'NSPrivacyCollectedDataTypeCoarseLocation',
        'NSPrivacyCollectedDataTypeEmailAddress',
        'NSPrivacyCollectedDataTypeHealth',
        'NSPrivacyCollectedDataTypeName',
        'NSPrivacyCollectedDataTypeOtherUserContent',
        'NSPrivacyCollectedDataTypePhotosorVideos',
        'NSPrivacyCollectedDataTypePurchaseHistory',
        'NSPrivacyCollectedDataTypeUserID',
      ].sort(),
    );
  });
});
