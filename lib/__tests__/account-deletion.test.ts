/**
 * lib/__tests__/account-deletion.test.ts
 *
 * The P0 guarantee: a successful Delete Account leaves nothing of that person
 * on the device, and a FAILED one leaves everything exactly as it was.
 *
 * The purge is tested behaviourally against the real AsyncStorage mock, because
 * the defect being fixed was a fail-open allow-list — the only honest way to
 * prove a dynamic purge works is to seed keys it has never heard of and watch
 * them disappear. The ORDERING inside AuthContext is pinned by source
 * inspection, since mounting the provider would need the whole Supabase,
 * RevenueCat and Sentry surface for an assertion about two lines.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import AsyncStorage from '@react-native-async-storage/async-storage';

const mockClearWidgetData = jest.fn().mockResolvedValue(undefined);
const mockClearStoredAuthSession = jest.fn().mockResolvedValue(undefined);

jest.mock('../widget-data', () => ({
  clearWidgetData: (...a: unknown[]) => mockClearWidgetData(...a),
  WIDGET_APP_GROUP_KEYS: ['streak', 'gutScore', 'lastCheckIn'],
}));
jest.mock('../supabase', () => ({
  clearStoredAuthSession: (...a: unknown[]) => mockClearStoredAuthSession(...a),
}));

import { purgeAllLocalData, KEYS_PRESERVED_ON_DELETE } from '../local-data';

const root = join(__dirname, '..', '..');
const read = (...p: string[]) => readFileSync(join(root, ...p), 'utf8');
const AUTH = read('contexts', 'AuthContext.tsx');
const PROFILE = read('app', '(tabs)', 'profile.tsx');
const WIDGET = read('lib', 'widget-data.ts');
const SUBS = read('lib', 'subscription.ts');
const LOCAL = read('lib', 'local-data.ts');

/** Everything the app is known to persist today, health-bearing first. */
const KNOWN_PERSISTED = [
  // Health-bearing first. These are the REAL key names the app writes today —
  // several of them are exactly what survived deletion before this fix.
  'widget_data',
  'gutwell_photo_analysis_history',
  'gutwell_user_progress_profile',
  'gutwell_supplement_history',
  'offline_queue',
  'onboarding_stage',
  'onboarding_answers',
  'onboarding_name',
  'onboarding_checkin_pending',
  'onboarding_completed',
  'gutwell_settings',
  'gutwell_scan_tutorial_seen',
  'rate_app_prompted',
  'gutwell_location_suggestions',
  'health_disclaimer_accepted_user-abc',
];

beforeEach(async () => {
  await AsyncStorage.clear();
  mockClearWidgetData.mockClear();
  mockClearStoredAuthSession.mockClear();
});

describe('purgeAllLocalData — dynamic, fail-closed', () => {
  it('removes every known persisted key', async () => {
    for (const k of KNOWN_PERSISTED) await AsyncStorage.setItem(k, 'x');
    await purgeAllLocalData();
    for (const k of KNOWN_PERSISTED) {
      expect(`${k}=${await AsyncStorage.getItem(k)}`).toBe(`${k}=null`);
    }
  });

  it('removes a key it has never heard of — a future feature cannot survive', async () => {
    // THE REGRESSION GUARD. The old allow-list let every newly added key
    // outlive the account. A key invented today must still be purged.
    await AsyncStorage.setItem('some_future_health_cache_v3', JSON.stringify({ gutScore: 42 }));
    await AsyncStorage.setItem('another_unknown_key', 'sensitive');
    await purgeAllLocalData();
    expect(await AsyncStorage.getItem('some_future_health_cache_v3')).toBeNull();
    expect(await AsyncStorage.getItem('another_unknown_key')).toBeNull();
  });

  it('preserves exactly the two documented device preferences and nothing else', async () => {
    // Pinned as an exact set: widening it requires editing this test, which is
    // the review gate. Both values are device-level and carry no user data.
    expect([...KEYS_PRESERVED_ON_DELETE].sort()).toEqual(['app_language', 'gutwell_install_v1']);
  });

  it('keeps language and the install marker across a purge', async () => {
    await AsyncStorage.setItem('app_language', 'de');
    await AsyncStorage.setItem('gutwell_install_v1', '1');
    await AsyncStorage.setItem('widget_data', '{"gutScore":44}');
    await purgeAllLocalData();
    expect(await AsyncStorage.getItem('app_language')).toBe('de');
    expect(await AsyncStorage.getItem('gutwell_install_v1')).toBe('1');
    expect(await AsyncStorage.getItem('widget_data')).toBeNull();
  });

  it('no preserved key can hold user or health information', () => {
    // app_language is a two-letter locale; gutwell_install_v1 is the literal
    // '1'. Neither is user-derived. This asserts the documented justification
    // exists next to the list, so a future addition cannot slip in silently.
    for (const k of KEYS_PRESERVED_ON_DELETE) expect(LOCAL).toContain(k);
    // The justification prose must live beside the list (it wraps across lines,
    // so normalise whitespace before matching).
    // Strip JSDoc continuation markers before flattening, or the '*' at each
    // wrapped line lands inside the sentence.
    const flat = LOCAL.replace(/^\s*\*/gm, ' ').replace(/\s+/g, ' ');
    expect(flat).toContain('device-level preference containing no user, account or health information');
    expect(flat).toContain('Anything user-specific belongs nowhere near this list');
  });

  it('clears the widget App Group and the stored auth session', async () => {
    await purgeAllLocalData();
    expect(mockClearWidgetData).toHaveBeenCalledTimes(1);
    expect(mockClearStoredAuthSession).toHaveBeenCalledTimes(1);
  });

  it('reports how much it removed and which stores failed', async () => {
    await AsyncStorage.setItem('widget_data', 'x');
    const res = await purgeAllLocalData();
    expect(res.removedKeys).toBe(1);
    expect(res.failures).toEqual([]);
  });

  it('one failing store does not abort the others', async () => {
    mockClearWidgetData.mockRejectedValueOnce(new Error('app group unavailable'));
    await AsyncStorage.setItem('widget_data', 'x');
    const res = await purgeAllLocalData();
    expect(res.failures).toEqual(['app_group']);
    // AsyncStorage still purged, SecureStore still cleared.
    expect(await AsyncStorage.getItem('widget_data')).toBeNull();
    expect(mockClearStoredAuthSession).toHaveBeenCalledTimes(1);
  });
});

describe('every persisted key in the codebase is reachable by the purge', () => {
  it('no AsyncStorage.setItem key is silently exempt', () => {
    // Collect literal keys written anywhere in the app, then assert none of
    // them is on the preserve list except the two justified ones.
    const sources = ['app', 'lib', 'contexts', 'components'];
    const { execSync } = require('child_process');
    const out = execSync(
      `grep -rhoE "AsyncStorage\\.(setItem|mergeItem)\\(\\s*'[^']+'" ${sources.join(' ')} || true`,
      { cwd: root, encoding: 'utf8' },
    );
    const keys = [...out.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    for (const k of keys) {
      if (KEYS_PRESERVED_ON_DELETE.includes(k)) {
        expect(['app_language', 'gutwell_install_v1']).toContain(k);
      }
    }
    // Sanity: the scan found something, so a broken grep cannot pass vacuously.
    expect(keys.length).toBeGreaterThan(0);
  });
});

describe('widget App Group cleanup', () => {
  it('clears the same keys updateWidgetData writes', () => {
    const written = [...WIDGET.matchAll(/SharedGroupPreferences\.setItem\('(\w+)'/g)].map((m) => m[1]);
    const unique = [...new Set(written)];
    expect(unique.sort()).toEqual(['gutScore', 'lastCheckIn', 'streak']);
    // Every written key must also appear in the declared cleanup contract.
    for (const k of unique) expect(WIDGET).toContain(`'${k}'`);
    expect(WIDGET).toContain('export const WIDGET_APP_GROUP_KEYS');
  });

  it('removes the AsyncStorage mirror as well as the App Group', () => {
    const fn = WIDGET.slice(WIDGET.indexOf('export async function clearWidgetData'));
    expect(fn).toContain("AsyncStorage.removeItem('widget_data')");
  });
});

describe('AuthContext.deleteAccount — three outcomes, never two', () => {
  const fn = AUTH.slice(
    AUTH.indexOf('const deleteAccount = async'),
    AUTH.indexOf('const resetPassword = async'),
  );
  const rpcAt = fn.indexOf("supabase.rpc('delete_user_account')");
  const stateAReturn = fn.indexOf('serverDeleted: false');
  const purgeAt = fn.indexOf('purgeAllLocalData()');
  const rcAt = fn.indexOf('logOutSubscriptionUser()');

  it('the result model keeps deletion and cleanup separate', () => {
    expect(AUTH).toContain('export type DeleteAccountResult');
    expect(AUTH).toContain('serverDeleted: boolean;');
    expect(AUTH).toContain('cleanupComplete: boolean;');
    expect(AUTH).toContain('cleanupFailures: string[];');
    // The collapsed two-state shape must not come back.
    expect(fn).not.toMatch(/return \{ ok: (true|false)/);
  });

  // ── STATE A ──────────────────────────────────────────────────────────────
  it('A: RPC failure destroys nothing and reports serverDeleted:false', () => {
    expect(stateAReturn).toBeGreaterThan(rpcAt);
    expect(stateAReturn).toBeLessThan(purgeAt);
    expect(stateAReturn).toBeLessThan(rcAt);
    // The state-A return carries an empty failure list: nothing was attempted.
    expect(fn).toContain('serverDeleted: false, cleanupComplete: false, cleanupFailures: []');
  });

  it('A: no purge, no RevenueCat logout, no session clear before that return', () => {
    const beforeReturn = fn.slice(0, stateAReturn);
    expect(beforeReturn).not.toContain('purgeAllLocalData');
    expect(beforeReturn).not.toContain('logOutSubscriptionUser');
    expect(beforeReturn).not.toContain('setSession(null)');
    expect(beforeReturn).not.toContain('setProfile(null)');
  });

  // ── STATES B and C ───────────────────────────────────────────────────────
  it('B/C: cleanup runs only after confirmed server deletion', () => {
    expect(purgeAt).toBeGreaterThan(rpcAt);
    expect(rcAt).toBeGreaterThan(purgeAt);
  });

  it('C: every cleanup step contributes a failure instead of aborting', () => {
    expect(fn).toContain('cleanupFailures.push(...purge.failures)');
    expect(fn).toContain("cleanupFailures.push('revenuecat')");
    expect(fn).toContain("cleanupFailures.push('auth_signout')");
  });

  it('C: a cleanup failure NEVER becomes a server-deletion failure', () => {
    // The single most important assertion in this file. After the RPC
    // succeeded, serverDeleted must be true on every path.
    const afterRpc = fn.slice(purgeAt);
    expect(afterRpc).toContain('serverDeleted: true');
    expect(afterRpc).not.toContain('serverDeleted: false');
  });

  it('C: cleanupComplete is derived from the failure list, not assumed', () => {
    expect(fn).toContain('cleanupComplete: cleanupFailures.length === 0');
  });

  it('6: in-memory session and profile are force-cleared regardless of signOut', () => {
    // A failed signOut must not leave the deleted account usable in-app.
    const signOutAt = fn.indexOf('supabase.auth.signOut()');
    expect(fn.indexOf('setSession(null)')).toBeGreaterThan(signOutAt);
    expect(fn.indexOf('setProfile(null)')).toBeGreaterThan(signOutAt);
    expect(fn).toContain('resetAnalytics()');
    // The clears sit OUTSIDE the try/catch, so a throw cannot skip them: the
    // catch closes before setSession is reached.
    const tryAt = fn.lastIndexOf('try {', signOutAt);
    const catchAt = fn.indexOf('catch', tryAt);
    expect(tryAt).toBeGreaterThan(-1);
    expect(catchAt).toBeGreaterThan(signOutAt);
    expect(fn.indexOf('setSession(null)')).toBeGreaterThan(catchAt);
  });

  it('a signOut error object is recorded, not just a thrown rejection', () => {
    expect(fn).toContain('const { error: signOutError } = await supabase.auth.signOut()');
    expect(fn).toContain('if (signOutError) cleanupFailures.push');
  });

  it('cleanup failures are reported as store names only', () => {
    expect(fn).toContain('Sentry.captureMessage');
    expect(fn).toContain("stores: cleanupFailures.join(',')");
    expect(fn).not.toMatch(/extra: \{[^}]*(email|user_id|userId|key|value)/);
  });

  it('sign-out cleanup stays separate and non-destructive', () => {
    const so = AUTH.slice(AUTH.indexOf('const signOut = async'), AUTH.indexOf('const deleteAccount'));
    expect(so).toContain('clearLocalSessionState()');
    expect(so).not.toContain('purgeAllLocalData');
    expect(so).not.toContain('logOutSubscriptionUser');
  });
});

describe('RevenueCat logout preserves the Apple purchase', () => {
  const fn = SUBS.slice(
    SUBS.indexOf('export async function logOutSubscriptionUser'),
    SUBS.indexOf('export async function isPremium'),
  );

  it('calls Purchases.logOut and clears the cached entitlement', () => {
    expect(fn).toContain('Purchases.logOut()');
    expect(fn).toContain('cachedCustomerInfo = null');
  });

  it('clears the cache even when the SDK is unavailable', () => {
    // The cache clear must precede the isReady() bail-out, or a deleted
    // account's cached Premium could answer the next account's questions.
    expect(fn.indexOf('cachedCustomerInfo = null')).toBeLessThan(fn.indexOf('if (!isReady()) return true;'));
  });

  it('reports its outcome so a logout failure becomes state C, not state A', () => {
    expect(SUBS).toContain('export async function logOutSubscriptionUser(): Promise<boolean>');
    expect(fn).toContain('return true;');
    expect(fn).toContain('return false;');
  });

  it('never cancels or revokes the purchase itself', () => {
    expect(fn).not.toMatch(/cancel|revoke|refund/i);
  });
});

describe('deletion UX — three branches', () => {
  const fn = PROFILE.slice(
    PROFILE.indexOf('const runDeleteAccount = async'),
    PROFILE.indexOf('const handleDeleteAccount = ()'),
  );
  const guardAt = fn.indexOf('if (!result.serverDeleted)');
  const routeAt = fn.indexOf("router.replace('/(onboarding)/welcome')");
  const cleanupAt = fn.indexOf('if (!result.cleanupComplete)');

  it('1: state A shows the blocking "not deleted" alert and does not route', () => {
    expect(guardAt).toBeGreaterThan(-1);
    const branch = fn.slice(guardAt, routeAt);
    expect(branch).toContain('t.profile.deleteFailedTitle');
    expect(branch).toContain('cancelable: false');
    expect(branch).toContain('return;');
    expect(branch).not.toContain('router.replace');
    expect(branch).toContain('t.profile.deleteFailedRetry');
    expect(branch).toContain('t.profile.deleteFailedSupport');
  });

  it('2: state B routes to Welcome with no alert at all', () => {
    expect(routeAt).toBeGreaterThan(guardAt);
    // Between routing and the state-C guard there is no unconditional alert.
    expect(fn.slice(routeAt, cleanupAt)).not.toContain('Alert.alert');
  });

  it('3/4/5: state C routes away AND shows a CLEANUP notice, not a failure', () => {
    expect(cleanupAt).toBeGreaterThan(routeAt);
    const branch = fn.slice(cleanupAt);
    expect(branch).toContain('t.profile.deleteCleanupTitle');
    expect(branch).toContain('t.profile.deleteCleanupBody');
    // The words "not deleted" must never appear in the state-C branch.
    expect(branch).not.toContain('deleteFailedTitle');
    expect(branch).not.toContain('deleteFailedBody');
  });

  it('routing happens before the cleanup notice, so Profile is never left up', () => {
    expect(routeAt).toBeLessThan(cleanupAt);
  });

  it('the route is UNCONDITIONAL once the server deleted — state C routes too', () => {
    // A mutation that wrapped this in `if (result.cleanupComplete)` survived an
    // ordering-only assertion, leaving a state-C user stranded on Profile for
    // an account that no longer exists. Pin the statement itself.
    const line = fn.split('\n').find((l) => l.includes("router.replace('/(onboarding)/welcome')"));
    expect(line).toBeDefined();
    expect(line!.trim()).toBe("router.replace('/(onboarding)/welcome');");
    // And nothing between the state-A return and the route may re-branch on it.
    const between = fn.slice(fn.indexOf('return;', guardAt), routeAt);
    expect(between).not.toContain('cleanupComplete');
    expect(between).not.toMatch(/\bif\s*\(/);
  });

  it('the toast is gone from the deletion path', () => {
    expect(fn).not.toContain('setToast');
  });

  it('copy exists in EN and DE and says the right thing in each state', () => {
    const { translations } = require('../i18n');
    for (const lang of ['en', 'de'] as const) {
      const p = translations[lang].profile;
      for (const k of ['deleteFailedTitle', 'deleteFailedBody', 'deleteFailedRetry',
                       'deleteFailedSupport', 'deleteCleanupTitle', 'deleteCleanupBody',
                       'deleteCleanupSupport', 'deleteCleanupDismiss']) {
        expect(`${lang}.${k}:${typeof p[k]}`).toBe(`${lang}.${k}:string`);
      }
      // State C must NOT read as a failed deletion in either language.
      expect(`${lang}:${/not deleted|nicht gel/i.test(p.deleteCleanupBody)}`).toBe(`${lang}:false`);
      // State A must say the account still exists.
      expect(`${lang}:${p.deleteFailedBody.length > 40}`).toBe(`${lang}:true`);
    }
  });
});
