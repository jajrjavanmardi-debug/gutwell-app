/**
 * lib/__tests__/monetization.test.ts
 *
 * Free/Premium gating, paywall pricing honesty, and the server-side
 * entitlement trust chain.
 *
 * The database half — activation, revocation, replayed webhooks, out-of-order
 * events, staleness, and the fact that no user can write their own
 * entitlement — runs against a REAL PostgreSQL server in
 * scripts/verify-entitlements.sh. Asserting those from source text would prove
 * nothing.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { PREMIUM_REQUIRED, AnalysisError, isPremiumRequiredError } from '../ai-quota';
import { translations } from '../i18n';

const root = join(__dirname, '..', '..');
const read = (...p: string[]) => readFileSync(join(root, ...p), 'utf8');
const SUBSCRIPTION = read('lib', 'subscription.ts');
const PAYWALL = read('app', 'paywall.tsx');
const SCREEN = read('app', 'photo-analysis.tsx');
const EDGE = read('supabase', 'functions', 'analyze-food', 'index.ts');
const WEBHOOK = read('supabase', 'functions', 'revenuecat-webhook', 'index.ts');
const ENT_MIGRATION = read('supabase', 'migrations', '20260809140000_user_entitlements.sql');

describe('one monetization source of truth', () => {
  test('no screen calls the RevenueCat SDK directly', () => {
    for (const [name, src] of [['paywall', PAYWALL], ['photo-analysis', SCREEN]] as const) {
      // A type-only import is fine; a runtime SDK call is not.
      expect(`${name}: ${/^\s*import Purchases/m.test(src)}`).toBe(`${name}: false`);
      expect(`${name}: ${/Purchases\.\w+\(/.test(src)}`).toBe(`${name}: false`);
    }
  });

  test('the package selector exists once, in the subscription layer', () => {
    expect(SUBSCRIPTION).toContain('export function selectPackage');
    // The paywall used to keep its own copy of the same rule.
    expect(PAYWALL).not.toContain('function packageForPlan');
    expect(PAYWALL).toContain('selectPackage(offering,');
  });

  test('the entitlement identifier is `premium` everywhere', () => {
    expect(SUBSCRIPTION).toContain("const ENTITLEMENT_ID = 'premium'");
    expect(WEBHOOK).toContain('const ENTITLEMENT_ID = "premium"');
    expect(ENT_MIGRATION).toContain("entitlement   text not null default 'premium'");
  });

  test('photo analysis is a first-class premium feature', () => {
    expect(SUBSCRIPTION).toContain("| 'photo_analysis'");
    // The banned word is gone even from internal identifiers.
    expect(SUBSCRIPTION).not.toMatch(/unlimited/i);
  });
});

describe('paywall shows real prices or none at all', () => {
  test('no invented price, per-month figure or discount survives', () => {
    for (const invented of ['$6.99', '$39.99', '$3.33', "'52'", 'save 52%']) {
      expect(`${invented} rendered: ${PAYWALL.includes(invented) && !PAYWALL.includes(`// `)}`)
        .toBe(`${invented} rendered: false`);
    }
    // Specifically: no string literal price is assigned as a fallback.
    expect(PAYWALL).not.toMatch(/priceString\s*\?\?\s*'\$/);
    expect(PAYWALL).not.toMatch(/return 'Just \$/);
  });

  test('a missing price renders a neutral placeholder, not a guess', () => {
    expect(PAYWALL).toContain("priceString ?? null");
    expect(PAYWALL).toContain('t.paywall.priceUnavailable');
    expect(translations.en.paywall.priceUnavailable).toBe('—');
    expect(translations.de.paywall.priceUnavailable).toBe('—');
  });

  test('savings and per-month are derived from live package prices', () => {
    expect(PAYWALL).toContain('annualProduct.price / 12');
    expect(PAYWALL).toContain('1 - annualProduct.price / (monthlyProduct.price * 12)');
    expect(PAYWALL).toContain('currencyCode');
  });

  test('no discount is claimed when it cannot be computed', () => {
    const block = PAYWALL.slice(PAYWALL.indexOf('const savingsLabel'), PAYWALL.indexOf('const selectedPkg'));
    expect(block).toContain('t.paywall.billedAnnually');
    expect(block).not.toMatch(/'\d+'\)/);
  });

  test('the intro offer comes from StoreKit, never from JavaScript', () => {
    expect(PAYWALL).toContain('product.introPrice');
    // No JS-side discount arithmetic inventing a first-year price.
    expect(PAYWALL).not.toMatch(/34\.99|introductory.*=\s*\d/i);
  });

  test('no target price is hardcoded anywhere in the app', () => {
    for (const src of [PAYWALL, SCREEN, SUBSCRIPTION]) {
      expect(src).not.toMatch(/\$9\.99|€9\.99|\$49\.99|€49\.99|\$34\.99|€34\.99/);
    }
  });

  test('legal links and the disclaimer are still present', () => {
    expect(PAYWALL).toContain('/terms-of-service');
    expect(PAYWALL).toContain('/privacy-policy');
    expect(PAYWALL).toContain('restorePurchases');
    expect(translations.en.paywall.disclaimer).toContain('does not provide medical advice');
  });

  test('paywall copy makes no medical promise', () => {
    const p = translations.en.paywall;
    // The disclaimer is excluded on purpose: "does not provide medical advice,
    // diagnosis, or treatment" is the safety statement, not a claim.
    const all = Object.entries(p)
      .filter(([k, v]) => typeof v === 'string' && k !== 'disclaimer')
      .map(([, v]) => v as string)
      .join(' ')
      .toLowerCase();
    for (const banned of ['cure', 'prevent ibs', 'fix your gut', 'guaranteed', 'eliminate symptoms', 'diagnos', 'treat your']) {
      expect(`${banned}: ${all.includes(banned)}`).toBe(`${banned}: false`);
    }
  });
});

describe('client photo gate', () => {
  test('both photo entry points are gated before anything is captured', () => {
    const take = SCREEN.slice(SCREEN.indexOf('const takePhoto'), SCREEN.indexOf('const pickImage'));
    const pickStart = SCREEN.indexOf('const pickImage');
    const pick = SCREEN.slice(pickStart, SCREEN.indexOf('\n  };', pickStart));
    for (const [name, block] of [['takePhoto', take], ['pickImage', pick]] as const) {
      const gate = block.indexOf('ensurePhotoEntitlement()');
      expect(`${name} gated: ${gate > -1}`).toBe(`${name} gated: true`);
      // Before the camera/library is opened, so nothing is ever selected.
      const launch = block.search(/launch(Camera|ImageLibrary)Async/);
      expect(`${name} gate first: ${gate < launch}`).toBe(`${name} gate first: true`);
    }
  });

  test('a blocked Free user uploads nothing and calls nothing', () => {
    const fn = SCREEN.slice(SCREEN.indexOf('const ensurePhotoEntitlement'), SCREEN.indexOf('const takePhoto'));
    for (const banned of ['analyzeMealPhoto', 'storeCapturedPhoto', 'base64', 'launchCamera']) {
      expect(`${banned} in gate: ${fn.includes(banned)}`).toBe(`${banned} in gate: false`);
    }
    expect(fn).toContain('return false');
  });

  test('the paywall is offered — and so is the text path, so it is never a dead end', () => {
    const fn = SCREEN.slice(SCREEN.indexOf('const ensurePhotoEntitlement'), SCREEN.indexOf('const takePhoto'));
    expect(fn).toContain("pathname: '/paywall'");
    expect(fn).toContain('startTextOnlyFlow');
  });

  test('the text path itself is NEVER gated', () => {
    const fn = SCREEN.slice(SCREEN.indexOf('const startTextOnlyFlow'), SCREEN.indexOf('const submitChatCorrection'));
    expect(fn).not.toContain('ensurePhotoEntitlement');
    expect(fn).not.toContain('isPremiumFeature');
    const run = SCREEN.slice(SCREEN.indexOf('const runTextAnalysis'), SCREEN.indexOf('const runPhotoAnalysis'));
    expect(run).not.toContain('isPremiumFeature');
  });

  test('a Premium user who exhausted the daily quota sees NO paywall', () => {
    // "Not Premium" and "Premium but out of scans today" are different states.
    const block = SCREEN.slice(SCREEN.indexOf('if (isDailyPhotoLimitError(error))'), SCREEN.indexOf('ONBOARDING (3/4)'));
    for (const banned of ['paywall', 'premiumRequired', 'seePlans', 'upgrade']) {
      expect(`${banned}: ${block.toLowerCase().includes(banned.toLowerCase())}`).toBe(`${banned}: false`);
    }
    expect(block).toContain('dailyLimitFallbackMessage');
    expect(block).toContain('startTextOnlyFlow');
  });

  test('a server PREMIUM_REQUIRED is handled distinctly from the daily limit', () => {
    expect(isPremiumRequiredError(new AnalysisError('x', PREMIUM_REQUIRED))).toBe(true);
    expect(isPremiumRequiredError(new AnalysisError('x', 'DAILY_PHOTO_LIMIT_REACHED'))).toBe(false);
    expect(SCREEN).toContain('isPremiumRequiredError(error)');
    expect(SCREEN.indexOf('isPremiumRequiredError(error)'))
      .toBeLessThan(SCREEN.indexOf('if (isDailyPhotoLimitError(error))'));
  });

  test('EN and DE premium copy exists and promises nothing medical', () => {
    for (const lang of ['en', 'de'] as const) {
      const p = translations[lang].paywall;
      expect(p.premiumRequiredTitle.length).toBeGreaterThan(0);
      expect(p.premiumRequiredMessage.length).toBeGreaterThan(0);
      expect(p.seePlans.length).toBeGreaterThan(0);
    }
    expect(translations.de.paywall.premiumRequiredTitle)
      .not.toBe(translations.en.paywall.premiumRequiredTitle);
    // The message must point at the free alternative, not just sell.
    expect(translations.en.paywall.premiumRequiredMessage).toMatch(/describe/i);
    expect(translations.de.paywall.premiumRequiredMessage).toMatch(/beschreiben/i);
  });
});

describe('entitlement lifecycle in the client layer', () => {
  test('purchase and restore both refresh CustomerInfo before deciding', () => {
    const purchase = SUBSCRIPTION.slice(SUBSCRIPTION.indexOf('export async function purchasePlan'), SUBSCRIPTION.indexOf('export async function restorePurchases'));
    expect(purchase).toContain('cachedCustomerInfo = customerInfo');
    expect(purchase).toContain('entitlementActive(customerInfo)');
    const restore = SUBSCRIPTION.slice(SUBSCRIPTION.indexOf('export async function restorePurchases'));
    expect(restore).toContain('Purchases.restorePurchases()');
    expect(restore).toContain('entitlementActive(cachedCustomerInfo)');
  });

  test('a cancelled purchase stays Free without an error state', () => {
    expect(SUBSCRIPTION).toContain('userCancelled');
    expect(SUBSCRIPTION).toContain('return { success: false, cancelled: true }');
  });

  test('a pending purchase does NOT grant premium', () => {
    expect(SUBSCRIPTION).toContain('Your purchase is being processed.');
  });

  test('entitlement is derived from RevenueCat, never from a local flag', () => {
    expect(SUBSCRIPTION).toContain("info?.entitlements.active[ENTITLEMENT_ID]?.isActive");
    // No self-granted persistence.
    expect(SUBSCRIPTION).not.toMatch(/AsyncStorage|setItem\(.*premium/i);
  });

  test('logout/login re-identifies with RevenueCat so entitlement cannot leak', () => {
    expect(SUBSCRIPTION).toContain('Purchases.logIn(userId)');
    expect(SUBSCRIPTION).toContain('cachedCustomerInfo = customerInfo');
  });
});

describe('server-side enforcement — the actual security boundary', () => {
  test('the premium check runs BEFORE quota and BEFORE Gemini', () => {
    const block = EDGE.slice(EDGE.indexOf('case "meal_text":'), EDGE.indexOf('case "meal_text_only"'));
    const gate = block.indexOf('hasActivePremium');
    expect(gate).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(block.indexOf('reserveDailyQuota'));
    expect(gate).toBeLessThan(block.indexOf('await callGemini'));
    expect(block).toContain('PREMIUM_REQUIRED');
  });

  test('text-only analysis does NOT require Premium', () => {
    const block = EDGE.slice(EDGE.indexOf('case "meal_text_only"'), EDGE.indexOf('case "meal_revise"'));
    expect(block).not.toContain('hasActivePremium');
    expect(block).not.toContain('PREMIUM_REQUIRED');
  });

  test('nothing from the request body can grant Premium', () => {
    const fn = EDGE.slice(EDGE.indexOf('async function hasActivePremium'), EDGE.indexOf('type QuotaKind'));
    expect(fn).not.toMatch(/\bbody\b/);
    expect(EDGE).not.toMatch(/body\.(isPremium|premium|entitlement)/);
    // The decision comes from the server-owned table.
    expect(fn).toContain('get_premium_state');
  });

  test('RevenueCat REST is NOT called on every request', () => {
    const fn = EDGE.slice(EDGE.indexOf('async function hasActivePremium'), EDGE.indexOf('type QuotaKind'));
    // Fresh local state returns before any network call.
    expect(fn.indexOf('if (!state.needs_refresh)')).toBeLessThan(fn.indexOf('fetchEntitlementFromRevenueCat'));
  });

  test('an unverifiable unknown user fails CLOSED', () => {
    const fn = EDGE.slice(EDGE.indexOf('async function hasActivePremium'), EDGE.indexOf('type QuotaKind'));
    expect(fn).toContain('"stale_unverified" : "unknown_user"');
    expect(fn).toContain('{ active: false, reason: "lookup_failed" }');
  });

  test('a verified subscriber survives a RevenueCat outage until their period ends', () => {
    const fn = EDGE.slice(EDGE.indexOf('async function hasActivePremium'), EDGE.indexOf('type QuotaKind'));
    expect(fn).toContain('stillWithinKnownPeriod');
    expect(fn).toContain('new Date(state.expires_at).getTime() > Date.now()');
    expect(fn).toContain('reason: "grace_known_period"');
  });

  test('a successful lookup hydrates local state, so the race self-heals', () => {
    const fn = EDGE.slice(EDGE.indexOf('async function hasActivePremium'), EDGE.indexOf('type QuotaKind'));
    expect(fn).toContain('admin.rpc("apply_entitlement_event"');
    // Never wins against a real webhook event.
    expect(fn).toContain('p_event_at: null');
  });

  test('the RevenueCat secret key is server-only', () => {
    expect(EDGE).toContain('Deno.env.get("REVENUECAT_SECRET_KEY")');
    expect(EDGE).not.toContain('EXPO_PUBLIC_REVENUECAT');
    for (const src of [PAYWALL, SCREEN, SUBSCRIPTION]) {
      expect(src).not.toMatch(/REVENUECAT_SECRET|sk_[A-Za-z0-9]/);
    }
    // The client uses only the public SDK key.
    expect(SUBSCRIPTION).toContain('EXPO_PUBLIC_REVENUECAT_IOS_KEY');
  });

  test('provider responses are never logged verbatim', () => {
    const fn = EDGE.slice(EDGE.indexOf('async function fetchEntitlementFromRevenueCat'), EDGE.indexOf('async function hasActivePremium'));
    expect(fn).toContain('{ status: res.status }');
    expect(fn).not.toMatch(/console\.\w+\([^)]*body/);
  });
});

describe('webhook receiver', () => {
  test('it authenticates with a shared secret before reading the body', () => {
    const auth = WEBHOOK.indexOf('secretMatches(req.headers.get("authorization")');
    expect(auth).toBeGreaterThan(-1);
    expect(auth).toBeLessThan(WEBHOOK.indexOf('await req.json()'));
    expect(WEBHOOK).toContain('return json({ code: "UNAUTHORIZED" }, 401)');
  });

  test('the secret comparison does not leak length or content by timing', () => {
    const fn = WEBHOOK.slice(WEBHOOK.indexOf('function secretMatches'), WEBHOOK.indexOf('const UUID_RE'));
    expect(fn).toContain('diff |=');
    expect(fn).not.toMatch(/provided === expected/);
  });

  test('missing configuration fails closed', () => {
    expect(WEBHOOK).toContain('if (!WEBHOOK_SECRET || !SERVICE_ROLE_KEY)');
    expect(WEBHOOK).toContain('SERVER_MISCONFIGURED');
  });

  test('cancellation does not revoke — the period is already paid for', () => {
    // Careful: "UNCANCELLATION" contains "CANCELLATION", so match whole tokens.
    const tokens = (name: string) => {
      const start = WEBHOOK.indexOf(`const ${name} = new Set([`);
      return [...WEBHOOK.slice(start, WEBHOOK.indexOf(']', start)).matchAll(/"([A-Z_]+)"/g)].map((m) => m[1]);
    };
    expect(tokens('GRANTING')).not.toContain('CANCELLATION');
    expect(tokens('REVOKING')).not.toContain('CANCELLATION');
    expect(tokens('REVOKING')).not.toContain('BILLING_ISSUE');
    expect(tokens('GRANTING')).toContain('UNCANCELLATION');
    expect(WEBHOOK).toContain('BILLING_ISSUE is likewise not a revocation');
  });

  test('grant and revoke sets cover the events that matter', () => {
    for (const e of ['INITIAL_PURCHASE', 'RENEWAL', 'PRODUCT_CHANGE', 'UNCANCELLATION']) {
      expect(WEBHOOK).toContain(`"${e}"`);
    }
    for (const e of ['EXPIRATION', 'REFUND']) expect(WEBHOOK).toContain(`"${e}"`);
    expect(WEBHOOK).toContain('TRANSFER');
  });

  test('only a real Supabase user id is accepted', () => {
    expect(WEBHOOK).toContain('UUID_RE.test(rawUser)');
    // Anonymous RevenueCat ids are acknowledged, not retried forever.
    expect(WEBHOOK).toContain('ignored: "no_mapped_user"');
  });

  test('the payload is never logged', () => {
    const logs = [...WEBHOOK.matchAll(/console\.\w+\([\s\S]{0,180}?\);/g)].map((m) => m[0]);
    for (const call of logs) {
      for (const banned of ['payload', 'event)', 'body', 'JSON.stringify']) {
        expect(`${banned}: ${call.includes(banned)}`).toBe(`${banned}: false`);
      }
    }
  });

  test('a write failure returns 500 so RevenueCat retries an idempotent write', () => {
    expect(WEBHOOK).toContain('WRITE_FAILED');
    expect(WEBHOOK).toContain('apply_entitlement_event');
  });
});

describe('the AI cost controls are untouched', () => {
  test('all three daily ceilings are still 5', () => {
    const quota = read('supabase', 'migrations', '20260808120000_ai_cost_control.sql');
    expect(quota).toContain("when 'photo_analysis' then 5");
    expect(quota).toContain("when 'text_analysis'  then 5");
    expect(quota).toContain("when 'meal_revision'  then 5");
  });

  test('premium does not bypass the quota — access and cost are separate systems', () => {
    const block = EDGE.slice(EDGE.indexOf('case "meal_text":'), EDGE.indexOf('case "meal_text_only"'));
    // The premium gate is in ADDITION to the reservation, not instead of it.
    expect(block).toContain('hasActivePremium');
    expect(block).toContain('reserveDailyQuota');
  });
});
