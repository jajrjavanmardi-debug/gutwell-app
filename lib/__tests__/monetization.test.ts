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
/** The migration that currently defines apply_entitlement_event. */
const ENT_ORDERING = read('supabase', 'migrations', '20260816210000_entitlement_event_ordering.sql');

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

  // The per-month sub-line and the savings percentage that used to sit on the
  // Annual card were removed when each card gained a normalized headline price:
  // the per-month figure IS the headline now, and no discount is claimed on
  // this screen at all. See the 'normalized price comparison' block below for
  // the arithmetic, which is unit-tested rather than asserted from source.
  test('comparison prices are derived in the subscription layer, not the screen', () => {
    expect(PAYWALL).toContain("normalizedPriceString(monthlyPkg, 'week')");
    expect(PAYWALL).toContain("normalizedPriceString(annualPkg, 'month')");
    // The screen does no currency arithmetic of its own any more.
    expect(PAYWALL).not.toContain('Intl.NumberFormat');
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
    // The purchase body now lives in purchaseSelectedPackage; purchasePlan
    // delegates to it rather than keeping a second copy of this logic.
    const purchase = SUBSCRIPTION.slice(SUBSCRIPTION.indexOf('export async function purchaseSelectedPackage'), SUBSCRIPTION.indexOf('export async function purchasePlan'));
    expect(purchase).toContain('cachedCustomerInfo = customerInfo');
    expect(purchase).toContain('entitlementActive(customerInfo)');
    const byPlan = SUBSCRIPTION.slice(SUBSCRIPTION.indexOf('export async function purchasePlan'), SUBSCRIPTION.indexOf('export async function restorePurchases'));
    expect(byPlan).toContain('return purchaseSelectedPackage(selectPackage(offering, selectedPlan));');
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

describe('the price shown is the price bought', () => {
  /**
   * Guards the storefront/currency divergence found in TestFlight on
   * 2026-08-17: the paywall displayed US$44.99 for the annual plan while
   * Apple's sheet charged €49.99, and RevenueCat's INITIAL_PURCHASE confirmed
   * DE/EUR/49.99.
   *
   * Two separate holes, fixed together:
   *
   *  1. purchasePlan() re-fetched offerings and re-derived a package at tap
   *     time, so the object rendered and the object bought were never the same
   *     one. RevenueCat caches offerings for five minutes, so that second fetch
   *     can legitimately return different StoreProduct metadata.
   *  2. Nothing noticed when the App Store region changed underneath the
   *     displayed prices.
   *
   * Neither fix can make the displayed price authoritative — Apple prices at
   * purchase time from the live storefront whatever object is passed — so these
   * tests pin consistency and refusal-to-guess, not price equality.
   */
  const purchaseFn = SUBSCRIPTION.slice(
    SUBSCRIPTION.indexOf('export async function purchaseSelectedPackage'),
    SUBSCRIPTION.indexOf('export async function purchasePlan'),
  );
  const cta = PAYWALL.slice(PAYWALL.indexOf('const handleCTA'), PAYWALL.indexOf('const handleRestore'));

  test('the paywall buys the exact package it displayed', () => {
    // selectedPkg is what the price, the normalized figure and the trial copy
    // are all rendered from, so it must also be what is purchased.
    expect(PAYWALL).toContain('const selectedPkg = selectedPlan === \'annual\' ? annualPkg : monthlyPkg;');
    expect(cta).toContain('purchaseSelectedPackage(selectedPkg)');
  });

  test('the package purchase path never re-fetches offerings', () => {
    // Comments stripped first: this function's doc block names the very calls
    // it must not make, and matching that prose would prove nothing.
    const code = purchaseFn.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const banned of ['getOfferings', 'getPaywallOffering', 'loadPaywallOffering', 'selectPackage']) {
      expect(`${banned}: ${code.includes(banned)}`).toBe(`${banned}: false`);
    }
    expect(code).toContain('Purchases.purchasePackage(pkg)');
  });

  test('an unchanged storefront purchases without reloading', () => {
    // The reload is inside the mismatch branch, so the ordinary path falls
    // straight through to the purchase.
    const branch = cta.slice(cta.indexOf('const currentStorefront'), cta.indexOf('purchaseSelectedPackage'));
    expect(branch).toContain('loadPaywallOffering()');
    expect(cta.indexOf('loadPaywallOffering()')).toBeLessThan(cta.indexOf('purchaseSelectedPackage'));
    expect(cta).toContain('return;');
  });

  test('a changed storefront does not purchase', () => {
    const branch = cta.slice(cta.indexOf('if (offeringStorefront &&'), cta.indexOf('// Unchanged storefront'));
    expect(branch).not.toContain('purchaseSelectedPackage');
    // Ends the tap; the purchase below is unreachable for this branch.
    expect(branch.trimEnd().endsWith('}')).toBe(true);
    expect(branch).toContain('return;');
  });

  test('a changed storefront reloads the offering and its storefront', () => {
    expect(cta).toContain('const refreshed = await loadPaywallOffering();');
    expect(cta).toContain('setOffering(refreshed.ok ? refreshed.offering : null);');
    expect(cta).toContain('setOfferingStorefront(refreshed.storefrontCountry);');
  });

  test('the user must tap Continue again after a refresh', () => {
    // No auto-retry: the alert is terminal for this tap, and the CTA is
    // re-enabled so the refreshed price can be read before committing.
    expect(cta).toContain('t.paywall.pricingRefreshedTitle');
    const branch = cta.slice(cta.indexOf('const refreshed'), cta.indexOf('// Unchanged storefront'));
    expect(branch).toContain('setPurchasing(false);');
    expect(branch).not.toMatch(/handleCTA\(|purchaseSelectedPackage/);
  });

  test('an unreadable storefront never blocks a purchase', () => {
    // Both sides must be known before a mismatch is declared; null is "no
    // evidence", not "changed".
    expect(cta).toContain('if (offeringStorefront && currentStorefront && currentStorefront !== offeringStorefront)');
    const fn = SUBSCRIPTION.slice(
      SUBSCRIPTION.indexOf('export async function getStorefrontCountry'),
      SUBSCRIPTION.indexOf('export function getSubscriptionDiagnostics'),
    );
    // Every failure mode resolves to null rather than throwing.
    expect(fn).toContain('if (!isReady()) return null;');
    expect(fn).toContain('return null;');
    expect(fn).toContain("typeof code === 'string' && code.length > 0 ? code : null");
  });

  test('the CTA is disabled for the whole operation, so no double purchase', () => {
    // setPurchasing(true) precedes the storefront round-trip, not just the
    // purchase, and the guard above it rejects a re-entrant tap.
    expect(cta.indexOf('if (purchasing) return;')).toBeLessThan(cta.indexOf('setPurchasing(true)'));
    expect(cta.indexOf('setPurchasing(true)')).toBeLessThan(cta.indexOf('await getStorefrontCountry()'));
  });

  test('the storefront travels with the offering it priced', () => {
    const load = SUBSCRIPTION.slice(
      SUBSCRIPTION.indexOf('export async function loadPaywallOffering'),
      SUBSCRIPTION.indexOf('export async function getStorefrontCountry'),
    );
    // Captured before the catalogue is read, and returned on every branch —
    // including the failures, so a retry can still compare against it.
    expect(load.indexOf('await getStorefrontCountry()')).toBeLessThan(load.indexOf('Purchases.getOfferings()'));
    const returns = [...load.matchAll(/return \{[^}]*\}/g)].map((m) => m[0]);
    expect(returns.length).toBeGreaterThanOrEqual(6);
    for (const r of returns) {
      expect(`${r.slice(0, 40)}… carries storefront: ${r.includes('storefrontCountry')}`)
        .toBe(`${r.slice(0, 40)}… carries storefront: true`);
    }
  });

  test('normalized pricing still reads the displayed package', () => {
    expect(PAYWALL).toContain("normalizedPriceString(monthlyPkg, 'week')");
    expect(PAYWALL).toContain("normalizedPriceString(annualPkg, 'month')");
    // The formulas are untouched by this change.
    expect(SUBSCRIPTION).toContain('const amount = cadence === \'week\' ? (price * 12) / 52 : price / 12;');
    expect(SUBSCRIPTION).toContain("new Intl.NumberFormat(undefined, { style: 'currency', currency })");
  });

  test('no currency or amount was hardcoded by this change', () => {
    const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const [name, src] of [['paywall', PAYWALL], ['subscription', SUBSCRIPTION]] as const) {
      const code = strip(src);
      expect(`${name}: ${/[$€£¥]\s?\d/.test(code)}`).toBe(`${name}: false`);
      expect(`${name}: ${/\b(USD|EUR|GBP)\b/.test(code)}`).toBe(`${name}: false`);
    }
  });

  test('both languages carry the refresh message, and it names no price', () => {
    for (const [lang, p] of Object.entries(translations).map(([l, r]) => [l, r.paywall] as const)) {
      expect(`${lang} title`).toBe(`${lang} title`);
      expect(p.pricingRefreshedTitle.length).toBeGreaterThan(0);
      expect(p.pricingRefreshedBody.length).toBeGreaterThan(0);
      // A message about prices must not itself quote one.
      expect(`${lang}: ${/[$€£¥]|\d+[.,]\d{2}/.test(`${p.pricingRefreshedTitle} ${p.pricingRefreshedBody}`)}`)
        .toBe(`${lang}: false`);
    }
    expect(translations.de.paywall.pricingRefreshedTitle)
      .not.toBe(translations.en.paywall.pricingRefreshedTitle);
    expect(translations.de.paywall.pricingRefreshedBody)
      .not.toBe(translations.en.paywall.pricingRefreshedBody);
  });

  test('restore and plan selection are untouched', () => {
    expect(PAYWALL).toContain('restorePurchases()');
    expect(PAYWALL).toContain("useState<'monthly' | 'annual'>('annual')");
    // Restore does not consult the storefront: it re-reads entitlements, not prices.
    const restore = PAYWALL.slice(PAYWALL.indexOf('const handleRestore'));
    expect(restore).not.toContain('getStorefrontCountry');
  });
});

describe('only a real event may order events', () => {
  /**
   * Guards the 2026-08-16 production failure. The behavioural proof is section
   * 11 of scripts/verify-entitlements.sh, which runs the real SQL on a real
   * PostgreSQL and fails 12 assertions without the fix. CI cannot run that —
   * it has no database — so these pin the three lines the fix turns on.
   *
   * The failure: the REST fallback passes p_event_at => null, and the function
   * turned that into now() and stored it as last_event_at. The genuine
   * INITIAL_PURCHASE webhook that followed carried the REAL purchase time,
   * which is necessarily earlier, so it was refused as stale_event and the row
   * kept null product_id, store and last_event_id — no provenance, and no
   * event id to deduplicate a redelivery against.
   */
  const fn = ENT_ORDERING.slice(ENT_ORDERING.indexOf('create or replace function'));

  test('a caller without an event timestamp is not given one', () => {
    // The whole bug in one line.
    expect(fn).not.toContain('coalesce(p_event_at, now())');
    expect(fn).toContain('v_event_at timestamptz := p_event_at;');
  });

  test('the stale guard only compares two real events', () => {
    const guard = fn.slice(fn.indexOf('-- Strictly older event'), fn.indexOf('insert into public.user_entitlements'));
    expect(guard).toContain('v_event_at is not null');
    expect(guard).toContain('existing.last_event_at is not null');
    expect(guard).toContain('v_event_at < existing.last_event_at');
  });

  test('last_event_at is preserved, like every other provenance field', () => {
    const upsert = fn.slice(fn.indexOf('on conflict (user_id) do update'));
    for (const col of ['product_id', 'store', 'last_event_id', 'last_event_at']) {
      expect(`${col}: ${upsert.includes(`coalesce(excluded.${col}, ue.${col})`)}`).toBe(`${col}: true`);
    }
    // State the fallback genuinely verified must still overwrite.
    expect(upsert).toContain('is_active     = excluded.is_active');
    expect(upsert).toContain('expires_at    = excluded.expires_at');
  });

  test('idempotency by event id is untouched', () => {
    expect(fn).toContain("existing.last_event_id = p_event_id");
    expect(fn).toContain("'reason', 'duplicate_event'");
  });

  test('the write path stays service_role only', () => {
    expect(ENT_ORDERING).toContain('from public, anon, authenticated');
    expect(ENT_ORDERING).toContain('grant execute on function public.apply_entitlement_event');
    expect(ENT_ORDERING).toContain('to service_role');
  });

  test('the original migration was not edited — migrations are forward-only', () => {
    // The applied migration still contains the old behaviour; the fix is a new
    // `create or replace`. Rewriting history here would diverge every
    // environment that already ran it.
    expect(ENT_MIGRATION).toContain('coalesce(p_event_at, now())');
  });

  test('neither edge function had to change', () => {
    // The call sites were already correct; the SQL was not honouring them.
    expect(EDGE).toContain('p_event_at: null');
    expect(WEBHOOK).toContain('p_event_at: eventAtMs ? new Date(eventAtMs).toISOString() : null');
  });

  test('the behavioural suite covers the regression', () => {
    const script = read('scripts', 'verify-entitlements.sh');
    expect(script).toContain('20260816210000_entitlement_event_ordering.sql');
    expect(script).toContain('fallback leaves last_event_at NULL');
    expect(script).toContain('a real purchase after a fallback is APPLIED, not stale');
    expect(script).toContain('ordering still refuses an older real event');
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

describe('offering failure states are distinguishable', () => {
  test('every failure mode has its own reason rather than one shared null', () => {
    for (const reason of [
      'not_configured',
      'fetch_failed',
      'no_current_offering',
      'no_usable_packages',
      'price_missing',
    ]) {
      expect(`${reason}: ${SUBSCRIPTION.includes(`'${reason}'`)}`).toBe(`${reason}: true`);
    }
  });

  test('a failed configure does not poison the session', () => {
    // initPromise used to stay set after a throw, so every later call
    // short-circuited on a promise that had already settled as "not configured"
    // and monetization stayed dead until the app was killed.
    expect(SUBSCRIPTION).toContain('initPromise = null');
  });

  test('diagnostics carry no key, receipt, token or user id', () => {
    const diag = SUBSCRIPTION.slice(
      SUBSCRIPTION.indexOf('export type SubscriptionDiagnostics'),
      SUBSCRIPTION.indexOf('const EMPTY_DIAGNOSTICS'),
    );
    expect(diag).not.toMatch(/apiKey|appUserID|receipt|token/i);
    expect(SUBSCRIPTION).toContain('export function getSubscriptionDiagnostics');
    // The raw SDK message is scrubbed before it can be surfaced anywhere.
    expect(SUBSCRIPTION).toContain('[redacted]');
  });

  test('verbose RevenueCat logging never ships on by default', () => {
    expect(SUBSCRIPTION).toContain('__DEV__ || RC_DEBUG');
    expect(SUBSCRIPTION).toContain('LOG_LEVEL.WARN');
    expect(SUBSCRIPTION).not.toContain('LOG_LEVEL.VERBOSE');
    expect(SUBSCRIPTION).not.toContain('LOG_LEVEL.DEBUG');
  });

  test('the user-facing message stays non-technical', () => {
    expect(PAYWALL).toContain('t.paywall.unavailableTitle');
    expect(PAYWALL).toContain('t.paywall.unavailableBody');
    // No reason code, SDK error or product id is ever put in front of a user.
    expect(PAYWALL).not.toMatch(/Alert\.alert\([^)]*result\.reason/);
  });
});

describe('no English leaks into the German paywall or tutorial', () => {
  const TUTORIAL = read('components', 'ScanTutorial.tsx');
  const DISCLAIMER = read('components', 'HealthDisclaimerModal.tsx');

  test('paywall renders no hardcoded English copy', () => {
    for (const literal of [
      "'Restore Purchases'",
      "'Restoring",
      'Payment is charged',
      "'/mo'",
      "'/yr'",
      'Just ${',
    ]) {
      expect(`${literal}: ${PAYWALL.includes(literal)}`).toBe(`${literal}: false`);
    }
  });

  test('the tutorial CTA comes from i18n in both states', () => {
    expect(TUTORIAL).not.toContain("'Next'");
    expect(TUTORIAL).not.toContain("'Scan now'");
    expect(TUTORIAL).toContain('t.components.scanTutorial.next');
    expect(TUTORIAL).toContain('t.components.scanTutorial.scanNow');
  });

  test('the disclaimer body is translated, not hardcoded', () => {
    expect(DISCLAIMER).not.toContain('wellness tracking app');
    expect(DISCLAIMER).not.toContain('does not diagnose');
    expect(DISCLAIMER).toContain('t.components.healthDisclaimer.body1');
    expect(DISCLAIMER).toContain('t.components.healthDisclaimer.legalNote');
  });

  test('German defines real copy for every string this batch added', () => {
    const { de, en } = translations;
    const pairs: [string, string][] = [
      [en.paywall.finePrint, de.paywall.finePrint],
      [en.paywall.restoring, de.paywall.restoring],
      [en.paywall.unavailableBody, de.paywall.unavailableBody],
      [en.paywall.periodMonthShort, de.paywall.periodMonthShort],
      [en.components.scanTutorial.next, de.components.scanTutorial.next],
      [en.components.healthDisclaimer.body1, de.components.healthDisclaimer.body1],
      [en.components.healthDisclaimer.legalNote, de.components.healthDisclaimer.legalNote],
    ];
    for (const [english, german] of pairs) {
      expect(german.length).toBeGreaterThan(0);
      expect(german).not.toBe(english);
    }
  });

  test('the German disclaimer keeps the negated, non-device meaning', () => {
    const note = translations.de.components.healthDisclaimer.legalNote;
    expect(note).toContain('nicht');
    expect(translations.de.components.healthDisclaimer.body1).toContain('kein Medizinprodukt');
  });
});

describe('preview-only diagnostics affordance', () => {
  test('the copy action is gated on the debug flag, not on __DEV__ or a build type', () => {
    expect(SUBSCRIPTION).toContain('export function isSubscriptionDebugEnabled');
    expect(SUBSCRIPTION).toMatch(/EXPO_PUBLIC_RC_DEBUG[^\n]*\)\.trim\(\) === 'true'/);
    expect(PAYWALL).toContain('isSubscriptionDebugEnabled()');
    // The affordance must be behind the flag AND behind "nothing to sell".
    expect(PAYWALL).toMatch(/isSubscriptionDebugEnabled\(\)\s*&&\s*!loadingOffering\s*&&\s*!canPurchase/);
    expect(PAYWALL).toContain('{showDiagnostics ?');
  });

  test('the summary is an explicit allow-list, not a serialised object', () => {
    const fmt = SUBSCRIPTION.slice(SUBSCRIPTION.indexOf('export function formatSubscriptionDiagnostics'));
    // Serialising would leak any field added later; each line is named instead.
    expect(fmt).not.toContain('JSON.stringify');
    for (const field of [
      'configured=',
      'offeringsFetched=',
      'offeringsCount=',
      'currentOfferingId=',
      'hasCurrentOffering=',
      'packageIdentifiers=',
      'hasMonthlyPackage=',
      'hasAnnualPackage=',
      'productIdentifiers=',
      'monthlyPriceStringPresent=',
      'annualPriceStringPresent=',
      'lastFailureReason=',
      'lastErrorCode=',
      'lastErrorMessage=',
      'lastCheckedAt=',
    ]) {
      expect(`${field}: ${fmt.includes(field)}`).toBe(`${field}: true`);
    }
  });

  test('no identifier, credential or receipt can reach the clipboard', () => {
    // Bounded to the function itself. This used to run to end-of-file, so any
    // later function's prose could trip it — which says nothing about what the
    // clipboard actually receives. The subject of this guard is the string
    // formatSubscriptionDiagnostics builds, and now that is what it reads.
    const fmt = SUBSCRIPTION.slice(
      SUBSCRIPTION.indexOf('export function formatSubscriptionDiagnostics'),
      SUBSCRIPTION.indexOf('export function selectPackage'),
    );
    expect(fmt).toContain('const lines = [');
    for (const banned of ['appUserID', 'userId', 'apiKey', 'RC_IOS_KEY', 'receipt', 'transaction', 'email']) {
      expect(`${banned}: ${new RegExp(`\\b${banned}\\b`, 'i').test(fmt)}`).toBe(`${banned}: false`);
    }
    // hasKey is a boolean about the key's presence and is deliberately left out
    // of the copied summary entirely.
    expect(fmt).not.toContain('hasKey');
  });

  test('both languages label the QA affordance', () => {
    const { en, de } = translations;
    expect(en.paywall.copyDebugInfo.length).toBeGreaterThan(0);
    expect(de.paywall.copyDebugInfo.length).toBeGreaterThan(0);
    expect(de.paywall.copyDebugInfo).not.toBe(en.paywall.copyDebugInfo);
  });

  test('clipboard comes from the already-installed expo-clipboard', () => {
    const pkg = JSON.parse(read('package.json'));
    expect(pkg.dependencies['expo-clipboard']).toBeDefined();
    expect(PAYWALL).toContain("from 'expo-clipboard'");
  });
});

describe('normalized price comparison', () => {
  // The function is pure, so the arithmetic is tested directly rather than
  // asserted from source text. lib/subscription.ts imports the RevenueCat
  // native module at its top level, which Jest cannot transform, so the SDK is
  // stubbed — nothing under test touches it.
  jest.mock('react-native-purchases', () => ({
    __esModule: true,
    default: {},
    LOG_LEVEL: { WARN: 'WARN' },
  }));
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { normalizedPriceString } = require('../subscription');

  const pkg = (price: unknown, currencyCode: unknown = 'EUR') =>
    ({ product: { price, currencyCode } }) as never;

  /** Strip formatting so assertions do not depend on the CI locale. */
  const digits = (s: string | null) => (s ?? '').replace(/[^0-9.,]/g, '').replace(',', '.');

  test('a monthly price is restated per week as price * 12 / 52', () => {
    // 9.99 * 12 / 52 = 2.3053…  — NOT 9.99 / 4 = 2.4975, which is what
    // RevenueCat's own pricePerWeek would give. A month is ~4.35 weeks.
    expect(digits(normalizedPriceString(pkg(9.99), 'week'))).toBe('2.31');
    expect(digits(normalizedPriceString(pkg(9.99), 'week'))).not.toBe('2.50');
    expect(digits(normalizedPriceString(pkg(12), 'week'))).toBe('2.77');
  });

  test('an annual price is restated per month as price / 12', () => {
    expect(digits(normalizedPriceString(pkg(49.99), 'month'))).toBe('4.17');
    expect(digits(normalizedPriceString(pkg(120), 'month'))).toBe('10.00');
  });

  test('the currency comes from the product, never from a default', () => {
    const usd = normalizedPriceString(pkg(9.99, 'USD'), 'week');
    const jpy = normalizedPriceString(pkg(1200, 'JPY'), 'month');
    expect(usd).not.toBeNull();
    expect(jpy).not.toBeNull();
    // Different currencies must not format identically.
    expect(normalizedPriceString(pkg(9.99, 'USD'), 'week')).not.toBe(
      normalizedPriceString(pkg(9.99, 'EUR'), 'week'),
    );
  });

  test('nothing is fabricated when the figure cannot be derived', () => {
    for (const bad of [
      null,
      pkg(undefined),
      pkg(0),
      pkg(-5),
      pkg(Number.NaN),
      pkg(Number.POSITIVE_INFINITY),
      pkg('9.99'),
      pkg(9.99, ''),
      { product: { price: 9.99 } },
      pkg(9.99, 'NOT_A_CURRENCY'),
    ]) {
      expect(normalizedPriceString(bad as never, 'week')).toBeNull();
      expect(normalizedPriceString(bad as never, 'month')).toBeNull();
    }
  });

  test('the derivation never parses the localized priceString', () => {
    const fn = SUBSCRIPTION.slice(SUBSCRIPTION.indexOf('export function normalizedPriceString'));
    const body = fn.slice(0, fn.indexOf('\n}\n') + 1);
    expect(body).not.toContain('priceString');
    expect(body).not.toContain('parseFloat');
    expect(body).not.toContain('parseInt');
    expect(body).toContain('product.price');
    expect(body).toContain('currencyCode');
  });

  test("RevenueCat's divide-by-4 weekly field is deliberately unused", () => {
    for (const field of ['pricePerWeek', 'pricePerWeekString', 'pricePerMonthString']) {
      expect(`${field} used: ${PAYWALL.includes(field) || SUBSCRIPTION.includes(`.${field}`)}`).toBe(
        `${field} used: false`,
      );
    }
  });
});

describe('the real charge stays visible next to the comparison figure', () => {
  test('each card renders the live StoreKit price for its own billing period', () => {
    expect(PAYWALL).toContain("t.paywall.billedMonthlyAt.replace('{price}', monthlyPrice)");
    expect(PAYWALL).toContain("t.paywall.billedAnnuallyAt.replace('{price}', annualPrice)");
  });

  test('the normalized figure falls back to the real price, never to a blank', () => {
    expect(PAYWALL).toContain('monthlyPerWeek ?? monthlyPrice ?? t.paywall.priceUnavailable');
    expect(PAYWALL).toContain('annualPerMonth ?? annualPrice ?? t.paywall.priceUnavailable');
  });

  test('the period label follows whichever figure is actually shown', () => {
    expect(PAYWALL).toContain(
      'monthlyPerWeek ? t.paywall.periodWeekShort : t.paywall.periodMonthShort',
    );
    expect(PAYWALL).toContain(
      'annualPerMonth ? t.paywall.periodMonthShort : t.paywall.periodYearShort',
    );
  });

  test('billing cadence wording is not swapped between the two plans', () => {
    const { en, de } = translations;
    expect(en.paywall.billedMonthlyAt.toLowerCase()).toContain('monthly');
    expect(en.paywall.billedAnnuallyAt.toLowerCase()).toContain('annually');
    expect(de.paywall.billedMonthlyAt.toLowerCase()).toContain('monatlich');
    expect(de.paywall.billedAnnuallyAt.toLowerCase()).toContain('jährlich');
  });

  test('no savings percentage is displayed by this screen', () => {
    expect(PAYWALL).not.toContain('savingsLabel');
    expect(PAYWALL).not.toContain('billedAnnuallySave');
  });

  test('both languages define every new pricing string, with the {price} slot', () => {
    for (const lang of ['en', 'de'] as const) {
      const p = translations[lang].paywall;
      expect(`${lang} periodWeekShort`).toBe(`${lang} ${p.periodWeekShort ? 'periodWeekShort' : 'MISSING'}`);
      expect(p.billedMonthlyAt).toContain('{price}');
      expect(p.billedAnnuallyAt).toContain('{price}');
    }
  });

  test('no monetary amount is hardcoded by the new presentation', () => {
    // Comments are stripped first: paywall.tsx documents the invented prices it
    // used to show, and that history is worth keeping.
    const code = (s: string) =>
      s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const src of [PAYWALL, SUBSCRIPTION]) {
      expect(code(src)).not.toMatch(/[€$£¥]\s?\d/);
      expect(code(src)).not.toMatch(/\b2\.49\b|\b5\.99\b/);
    }
  });
});

describe('purchase, restore and plan selection are untouched by the pricing change', () => {
  test('Annual remains the default selection', () => {
    expect(PAYWALL).toContain("useState<'monthly' | 'annual'>('annual')");
  });

  test('the CTA still gates on canPurchase and the offering', () => {
    expect(PAYWALL).toContain('const canPurchase = offering != null');
    expect(PAYWALL).toContain('if (!canPurchase)');
    // Buys the package it rendered, not one re-derived at tap time.
    expect(PAYWALL).toContain('purchaseSelectedPackage(selectedPkg)');
  });

  test('restore still routes through the subscription layer', () => {
    expect(PAYWALL).toContain('restorePurchases()');
  });

  test('the normalized figure is display-only and never reaches a purchase call', () => {
    const cta = PAYWALL.slice(PAYWALL.indexOf('const handleCTA'), PAYWALL.indexOf('const handleRestore'));
    for (const v of ['monthlyPerWeek', 'annualPerMonth', 'normalizedPriceString']) {
      expect(`${v} in handleCTA: ${cta.includes(v)}`).toBe(`${v} in handleCTA: false`);
    }
  });
});
