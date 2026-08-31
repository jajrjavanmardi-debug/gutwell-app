import Purchases, {
  LOG_LEVEL,
  type CustomerInfo,
  type PurchasesOffering,
  type PurchasesPackage,
} from 'react-native-purchases';

/**
 * Subscription / premium access via RevenueCat (react-native-purchases).
 *
 * Monetization is entirely OPTIONAL at the code level: if
 * EXPO_PUBLIC_REVENUECAT_IOS_KEY is not set (or configuration fails for any
 * reason) every export below becomes a safe no-op and the user is treated as
 * NON-premium. Nothing here should ever throw or crash the app — this mirrors
 * the analytics wrapper in lib/analytics.ts.
 *
 * Going live requires real products in App Store Connect, a RevenueCat project
 * with a "premium" entitlement + a "current" offering, and the iOS API key set
 * as EXPO_PUBLIC_REVENUECAT_IOS_KEY. react-native-purchases is a NATIVE module,
 * so a dev-client / EAS rebuild is required before it will run (it is not
 * available in Expo Go).
 */

export type SubscriptionPlan = 'monthly' | 'annual';

export type PremiumFeature =
  | 'photo_analysis'
  | 'correlations'
  | 'weekly_digest'
  | 'advanced_insights'
  | 'export'
  | 'all_achievements';

type PlanKey = 'monthly' | 'annual';

type PurchaseResult = {
  success: boolean;
  cancelled?: boolean;
  message?: string;
};

/** RevenueCat entitlement identifier — must match the RevenueCat dashboard. */
const ENTITLEMENT_ID = 'premium';

/** iOS RevenueCat public API key. Empty string => monetization disabled. */
const RC_IOS_KEY = (process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? '').trim();

/**
 * Opt-in RevenueCat WARN logging for preview/TestFlight builds. Off unless the
 * flag is explicitly set, so production stays quiet. Never enables verbose or
 * debug levels — those print request bodies.
 */
const RC_DEBUG = (process.env.EXPO_PUBLIC_RC_DEBUG ?? '').trim() === 'true';

/** True only once Purchases.configure has successfully run. */
let configured = false;

/** Most recent CustomerInfo, cached so isPremium()/isPremiumFeature() are fast. */
let cachedCustomerInfo: CustomerInfo | null = null;

/** Guard so initSubscription only configures the SDK once. */
let initPromise: Promise<void> | null = null;

/**
 * Why the paywall could not present a purchasable offering.
 *
 * These used to be one undifferentiated `null`, which meant a wrong API key and
 * an App-Store product that has not propagated yet were indistinguishable both
 * on device and in this module. The UI still shows one calm message; the
 * distinction exists so a failure can actually be diagnosed.
 */
export type OfferingFailureReason =
  /** A — Purchases.configure never succeeded (missing key, or configure threw). */
  | 'not_configured'
  /** B — getOfferings() threw. */
  | 'fetch_failed'
  /** C — the fetch worked but RevenueCat has no current offering. */
  | 'no_current_offering'
  /** D — a current offering exists but carries no package we can sell. */
  | 'no_usable_packages'
  /** E — packages exist but StoreKit returned no localized price for them. */
  | 'price_missing';

/**
 * The result of an offering load, plus the storefront the prices came from.
 *
 * `storefrontCountry` is the App Store country whose catalogue produced these
 * prices, captured at load time so the paywall can tell later whether the
 * prices on screen still belong to the store Apple will actually bill against.
 * Null means "unknown", never "changed" — see purchaseSelectedPackage.
 */
export type OfferingLoadResult =
  | { ok: true; offering: PurchasesOffering; storefrontCountry: string | null }
  | {
      ok: false;
      reason: OfferingFailureReason;
      offering: PurchasesOffering | null;
      storefrontCountry: string | null;
    };

/**
 * Snapshot of the last offering load, for support and preview QA.
 *
 * Deliberately carries NO secrets, NO receipts, NO purchase tokens and NO user
 * identifiers. Product and package identifiers are public catalogue names that
 * already ship inside the App Store listing, so they are safe to surface.
 */
export type SubscriptionDiagnostics = {
  hasKey: boolean;
  configured: boolean;
  /** null until an offerings fetch has been attempted. */
  offeringsFetched: boolean | null;
  offeringsCount: number | null;
  currentOfferingId: string | null;
  hasCurrentOffering: boolean;
  packageIdentifiers: string[];
  hasMonthlyPackage: boolean;
  hasAnnualPackage: boolean;
  productIdentifiers: string[];
  monthlyPriceStringPresent: boolean;
  annualPriceStringPresent: boolean;
  lastFailureReason: OfferingFailureReason | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  lastCheckedAt: string | null;
};

const EMPTY_DIAGNOSTICS: SubscriptionDiagnostics = {
  hasKey: false,
  configured: false,
  offeringsFetched: null,
  offeringsCount: null,
  currentOfferingId: null,
  hasCurrentOffering: false,
  packageIdentifiers: [],
  hasMonthlyPackage: false,
  hasAnnualPackage: false,
  productIdentifiers: [],
  monthlyPriceStringPresent: false,
  annualPriceStringPresent: false,
  lastFailureReason: null,
  lastErrorCode: null,
  lastErrorMessage: null,
  lastCheckedAt: null,
};

let diagnostics: SubscriptionDiagnostics = { ...EMPTY_DIAGNOSTICS };

/**
 * Reduce an unknown SDK rejection to a short, safe code + message.
 *
 * Truncated, stripped of anything token-shaped, and scrubbed of the API key, so
 * a diagnostics dump can never become a credential leak.
 */
function sanitizeError(err: unknown): { code: string | null; message: string | null } {
  if (err == null) return { code: null, message: null };
  const source = err as { code?: unknown; message?: unknown };
  const code =
    typeof source.code === 'string' || typeof source.code === 'number'
      ? String(source.code)
      : null;
  let message = typeof source.message === 'string' ? source.message : null;
  if (message) {
    if (RC_IOS_KEY) message = message.split(RC_IOS_KEY).join('[redacted]');
    // Anything long and opaque is a token/receipt shape, not a human message.
    message = message.replace(/[A-Za-z0-9_\-+/=]{32,}/g, '[redacted]').slice(0, 200);
  }
  return { code, message };
}

/** True when the SDK key is present AND configure() has run. */
function isReady(): boolean {
  return Boolean(RC_IOS_KEY) && configured;
}

/**
 * Whether the app is being sold with a premium tier at all. False = "free
 * launch" mode: every feature is unlocked, no upsell UI, and the paywall is
 * unreachable — shipping a reachable paywall that cannot transact is an App
 * Review (Guideline 2.1) rejection. Flipping on monetization for v1.1 is just
 * setting EXPO_PUBLIC_REVENUECAT_IOS_KEY in the build env.
 */
export function isMonetizationEnabled(): boolean {
  return Boolean(RC_IOS_KEY);
}

/** Derive premium status from a CustomerInfo via the "premium" entitlement. */
function entitlementActive(info: CustomerInfo | null): boolean {
  return Boolean(info?.entitlements.active[ENTITLEMENT_ID]?.isActive);
}

/**
 * Configure RevenueCat exactly once. No-op (and leaves the user non-premium)
 * when EXPO_PUBLIC_REVENUECAT_IOS_KEY is unset or configuration throws.
 *
 * @param userId Optional Supabase user id; when present we identify the user
 *   with RevenueCat so entitlements follow the account across devices.
 */
export async function initSubscription(userId?: string): Promise<void> {
  if (!RC_IOS_KEY) {
    // Monetization disabled — silent no-op, treat everyone as non-premium.
    return;
  }

  if (initPromise) {
    await initPromise;
    // Already (or concurrently) initialized — just make sure the right user is
    // identified, then refresh the cache.
    await identifyUser(userId);
    return;
  }

  initPromise = (async () => {
    try {
      if (__DEV__ || RC_DEBUG) {
        await Purchases.setLogLevel(LOG_LEVEL.WARN);
      }
      Purchases.configure({
        apiKey: RC_IOS_KEY,
        appUserID: userId && userId.length > 0 ? userId : null,
      });
      configured = true;

      // Keep the cached entitlement fresh whenever RevenueCat pushes an update
      // (renewals, restores, purchases made elsewhere, etc.).
      Purchases.addCustomerInfoUpdateListener((info) => {
        cachedCustomerInfo = info;
      });

      // Prime the cache so the first isPremium() read is accurate.
      try {
        cachedCustomerInfo = await Purchases.getCustomerInfo();
      } catch {
        cachedCustomerInfo = null;
      }
    } catch (err) {
      // Never let payment setup break app startup.
      configured = false;
      const { code, message } = sanitizeError(err);
      diagnostics.lastFailureReason = 'not_configured';
      diagnostics.lastErrorCode = code;
      diagnostics.lastErrorMessage = message;
    }
  })();

  await initPromise;

  // A failed configure must not poison the whole session. Leaving the guard set
  // would make every later call short-circuit on a promise that already settled
  // as "not configured", so one transient error would disable monetization
  // until the app is killed. Clearing it lets the next screen retry.
  if (!configured) {
    initPromise = null;
  }

  // If a userId arrived and configure used a different (or anonymous) id,
  // reconcile by identifying now.
  await identifyUser(userId);
}

/**
 * Associate the RevenueCat customer with the given Supabase user id. No-op when
 * unconfigured, when no id is provided, or on any error.
 */
async function identifyUser(userId?: string): Promise<void> {
  if (!isReady() || !userId) return;
  try {
    const { customerInfo } = await Purchases.logIn(userId);
    cachedCustomerInfo = customerInfo;
  } catch {
    // ignore — entitlement reads simply fall back to the cached/anonymous info.
  }
}

/**
 * Whether the user currently has access to premium features. Reads the cached
 * CustomerInfo (kept fresh by the update listener + refreshPremiumStatus).
 * Always TRUE in free-launch mode (monetization unconfigured) — features are
 * never locked behind a paywall that cannot transact.
 */
export async function isPremium(): Promise<boolean> {
  if (!isMonetizationEnabled()) return true;
  if (!isReady()) return false;
  return entitlementActive(cachedCustomerInfo);
}

/**
 * Force a fresh CustomerInfo fetch from RevenueCat and return the resulting
 * premium-access status. Falls back to the cached value on error. Always TRUE
 * in free-launch mode.
 */
export async function refreshPremiumStatus(): Promise<boolean> {
  if (!isMonetizationEnabled()) return true;
  if (!isReady()) return false;
  try {
    cachedCustomerInfo = await Purchases.getCustomerInfo();
  } catch {
    // keep whatever we had cached
  }
  return entitlementActive(cachedCustomerInfo);
}

/**
 * Synchronous gate used by UI to decide whether a premium feature is unlocked.
 * Driven entirely by the cached "premium" entitlement, so it is instant and
 * safe to call during render. Always TRUE in free-launch mode; false only when
 * monetization is live and the entitlement is inactive.
 *
 * The app currently sells a single "premium" tier that unlocks every feature,
 * so the specific feature argument is not yet differentiated — it is part of
 * the signature so per-feature entitlements can be added later without churn.
 */
export function isPremiumFeature(_feature: PremiumFeature): boolean {
  if (!isMonetizationEnabled()) return true;
  if (!isReady()) return false;
  return entitlementActive(cachedCustomerInfo);
}

/**
 * Return RevenueCat's current offering (packages + prices) for the paywall.
 * Returns null when unconfigured, when there is no current offering, or on error.
 */
export async function getPaywallOffering(): Promise<PurchasesOffering | null> {
  const result = await loadPaywallOffering();
  // Only a sellable offering is handed back, so existing callers keep their
  // "null means do not attempt a purchase" contract unchanged.
  return result.ok ? result.offering : null;
}

/**
 * Load the current offering and say precisely why it is not sellable.
 *
 * The paywall shows one calm message whatever happens here; the reason exists
 * so "the key is wrong" and "StoreKit has not returned the products yet" stop
 * looking identical. Every branch also records a diagnostics snapshot.
 */
export async function loadPaywallOffering(): Promise<OfferingLoadResult> {
  const stamp = new Date().toISOString();

  if (!isReady()) {
    diagnostics = {
      ...diagnostics,
      offeringsFetched: null,
      lastFailureReason: 'not_configured',
      lastCheckedAt: stamp,
    };
    return { ok: false, reason: 'not_configured', offering: null, storefrontCountry: null };
  }

  // Captured before the fetch so it describes the store the catalogue is being
  // read from. Best-effort throughout: an unavailable storefront must never
  // turn a perfectly good offering into a failure.
  const storefrontCountry = await getStorefrontCountry();

  let offerings;
  try {
    offerings = await Purchases.getOfferings();
  } catch (err) {
    const { code, message } = sanitizeError(err);
    diagnostics = {
      ...diagnostics,
      offeringsFetched: false,
      lastFailureReason: 'fetch_failed',
      lastErrorCode: code,
      lastErrorMessage: message,
      lastCheckedAt: stamp,
    };
    return { ok: false, reason: 'fetch_failed', offering: null, storefrontCountry };
  }

  const current = offerings.current ?? null;
  const offeringsCount = Object.keys(offerings.all ?? {}).length;
  const packages = current?.availablePackages ?? [];
  const monthly = selectPackage(current, 'monthly');
  const annual = selectPackage(current, 'annual');

  diagnostics = {
    ...diagnostics,
    offeringsFetched: true,
    offeringsCount,
    currentOfferingId: current?.identifier ?? null,
    hasCurrentOffering: current != null,
    packageIdentifiers: packages.map((p) => p.identifier),
    hasMonthlyPackage: monthly != null,
    hasAnnualPackage: annual != null,
    productIdentifiers: packages.map((p) => p.product.identifier),
    monthlyPriceStringPresent: Boolean(monthly?.product.priceString),
    annualPriceStringPresent: Boolean(annual?.product.priceString),
    lastErrorCode: null,
    lastErrorMessage: null,
    lastCheckedAt: stamp,
  };

  if (!current) {
    diagnostics = { ...diagnostics, lastFailureReason: 'no_current_offering' };
    return { ok: false, reason: 'no_current_offering', offering: null, storefrontCountry };
  }

  // An offering whose packages never hydrated from StoreKit is not sellable:
  // purchasePackage would have nothing to buy and the price would render blank.
  if (!monthly && !annual) {
    diagnostics = { ...diagnostics, lastFailureReason: 'no_usable_packages' };
    return { ok: false, reason: 'no_usable_packages', offering: current, storefrontCountry };
  }

  if (!monthly?.product.priceString && !annual?.product.priceString) {
    diagnostics = { ...diagnostics, lastFailureReason: 'price_missing' };
    return { ok: false, reason: 'price_missing', offering: current, storefrontCountry };
  }

  diagnostics = { ...diagnostics, lastFailureReason: null };
  return { ok: true, offering: current, storefrontCountry };
}

/**
 * The App Store country currently in effect, or null when it cannot be read.
 *
 * `Purchases.getStorefront()` returns the storefront of the signed-in App Store
 * account, which is what decides the currency and amount Apple actually bills —
 * independently of device locale, device region, or the account signed into the
 * app. It is the only field the SDK exposes for this (`countryCode`).
 *
 * Never throws and never rejects: every failure is reported as null, so a
 * storefront that cannot be read leaves the purchase path exactly as it was
 * rather than blocking a paying customer.
 */
export async function getStorefrontCountry(): Promise<string | null> {
  if (!isReady()) return null;
  try {
    const storefront = await Purchases.getStorefront();
    const code = storefront?.countryCode;
    return typeof code === 'string' && code.length > 0 ? code : null;
  } catch {
    return null;
  }
}

/**
 * Safe snapshot of the last offering load, for support and preview QA.
 * Contains no key, no receipt, no purchase token and no user identifier.
 */
export function getSubscriptionDiagnostics(): SubscriptionDiagnostics {
  return {
    ...diagnostics,
    hasKey: Boolean(RC_IOS_KEY),
    configured,
  };
}

/**
 * Whether the preview-only diagnostics affordance may be offered.
 *
 * Driven solely by EXPO_PUBLIC_RC_DEBUG=true. Production builds never set it,
 * so the UI that calls formatSubscriptionDiagnostics() is unreachable there.
 */
export function isSubscriptionDebugEnabled(): boolean {
  return RC_DEBUG;
}

/**
 * Copy-pasteable summary for preview QA on a physical device.
 *
 * Built from an EXPLICIT allow-list rather than by serialising the diagnostics
 * object, so a field added here later cannot silently start leaking. It carries
 * no App User ID, Supabase UUID, API key, receipt, transaction id, purchase
 * token or email — none of those are ever recorded in the first place.
 */
export function formatSubscriptionDiagnostics(): string {
  const d = getSubscriptionDiagnostics();
  const lines = [
    `configured=${d.configured}`,
    `offeringsFetched=${d.offeringsFetched}`,
    `offeringsCount=${d.offeringsCount}`,
    `currentOfferingId=${d.currentOfferingId ?? '-'}`,
    `hasCurrentOffering=${d.hasCurrentOffering}`,
    `packageIdentifiers=[${d.packageIdentifiers.join(', ')}]`,
    `hasMonthlyPackage=${d.hasMonthlyPackage}`,
    `hasAnnualPackage=${d.hasAnnualPackage}`,
    `productIdentifiers=[${d.productIdentifiers.join(', ')}]`,
    `monthlyPriceStringPresent=${d.monthlyPriceStringPresent}`,
    `annualPriceStringPresent=${d.annualPriceStringPresent}`,
    `lastFailureReason=${d.lastFailureReason ?? '-'}`,
    `lastErrorCode=${d.lastErrorCode ?? '-'}`,
    `lastErrorMessage=${d.lastErrorMessage ?? '-'}`,
    `lastCheckedAt=${d.lastCheckedAt ?? '-'}`,
  ];
  return `GutWell subscription diagnostics\n${lines.join('\n')}`;
}

/**
 * Pick the package matching the requested plan from an offering. Prefers the
 * RevenueCat well-known accessors (annual/monthly), then falls back to scanning
 * availablePackages by packageType / subscription period.
 */
export function selectPackage(
  offering: PurchasesOffering | null,
  plan: PlanKey,
): PurchasesPackage | null {
  if (!offering) return null;
  if (plan === 'annual') {
    if (offering.annual) return offering.annual;
    return (
      offering.availablePackages.find(
        (p) =>
          p.packageType === 'ANNUAL' ||
          p.product.subscriptionPeriod === 'P1Y',
      ) ?? null
    );
  }
  if (offering.monthly) return offering.monthly;
  return (
    offering.availablePackages.find(
      (p) =>
        p.packageType === 'MONTHLY' ||
        p.product.subscriptionPeriod === 'P1M',
    ) ?? null
  );
}

/** The cadence a price is restated in, purely to make two plans comparable. */
export type PriceCadence = 'week' | 'month';

/**
 * Restate a package's price per week or per month, formatted for the store's
 * currency. Comparison aid only — the real charge and its real interval are
 * shown alongside it, because this figure is not what Apple bills.
 *
 * Derived from the numeric `price` and `currencyCode`, never by parsing
 * `priceString`: that string is already localized (grouping marks, symbol
 * position, decimal separator) and parsing it back into a number breaks the
 * moment a storefront formats differently.
 *
 * Deliberately NOT RevenueCat's own `pricePerWeek`/`pricePerWeekString`. Those
 * divide a monthly price by 4, which overstates the weekly figure by ~8% — a
 * month averages 52/12 ≈ 4.35 weeks, not 4.
 *
 * Returns null — never a guess, an empty string or NaN — whenever the figure
 * cannot be produced honestly, so callers fall back to the real price.
 */
export function normalizedPriceString(
  pkg: PurchasesPackage | null,
  cadence: PriceCadence,
): string | null {
  const product = pkg?.product;
  if (!product) return null;

  const price = product.price;
  if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) return null;

  const currency = product.currencyCode;
  if (typeof currency !== 'string' || currency.length === 0) return null;

  // A monthly plan spans 12 months across 52 weeks; an annual plan, 12 months.
  const amount = cadence === 'week' ? (price * 12) / 52 : price / 12;
  if (!Number.isFinite(amount) || amount <= 0) return null;

  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount);
  } catch {
    // An unknown currency code makes Intl throw. Better no figure than a wrong one.
    return null;
  }
}

/**
 * Purchase the package for the requested plan. Distinguishes a user-cancelled
 * flow (cancelled: true, no error UI) from a real failure (message set).
 * Returns a non-success no-op result when monetization is unconfigured.
 */
export async function purchaseSelectedPackage(
  pkg: PurchasesPackage | null,
): Promise<PurchaseResult> {
  if (!isReady()) {
    return { success: false, message: 'Purchases are not available right now.' };
  }
  if (!pkg) {
    return { success: false, message: 'That plan is not available right now.' };
  }

  try {
    // Deliberately NO getOfferings() here. The package handed in is the object
    // whose price the user just read, and re-deriving it from a fresh fetch is
    // how the screen and the charge can drift apart: RevenueCat caches
    // offerings for five minutes, so a re-fetch at this exact moment can return
    // different StoreProduct metadata than the paywall rendered.
    //
    // This does not, and cannot, make the displayed price authoritative —
    // Apple prices at transaction time from the live storefront regardless of
    // which product object is passed. It removes one way for the two to
    // diverge; the storefront re-check at the call site covers the other.
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    cachedCustomerInfo = customerInfo;

    if (entitlementActive(customerInfo)) {
      return { success: true };
    }
    // Purchase went through but the entitlement isn't active yet (e.g. pending /
    // deferred). Treat as not-yet-premium without showing a hard error.
    return { success: false, message: 'Your purchase is being processed.' };
  } catch (err: unknown) {
    if (
      err != null &&
      typeof err === 'object' &&
      'userCancelled' in err &&
      (err as { userCancelled?: boolean }).userCancelled
    ) {
      return { success: false, cancelled: true };
    }
    return { success: false, message: 'Purchase failed. Please try again.' };
  }
}

/**
 * Purchase by plan key, resolving the package itself.
 *
 * Retained for callers that hold no package. The paywall does hold one and uses
 * purchaseSelectedPackage instead, because the object it renders and the object
 * it buys must be the same one. Every result, error and cancellation path is
 * shared with that function rather than duplicated.
 */
export async function purchasePlan(selectedPlan: PlanKey): Promise<PurchaseResult> {
  if (!isReady()) {
    return { success: false, message: 'Purchases are not available right now.' };
  }

  const offering = await getPaywallOffering();
  if (!offering) {
    return { success: false, message: 'No subscription options are available.' };
  }

  return purchaseSelectedPackage(selectPackage(offering, selectedPlan));
}

/**
 * Restore previous purchases and re-evaluate the "premium" entitlement.
 * Returns a non-success no-op result when monetization is unconfigured.
 */
export async function restorePurchases(): Promise<PurchaseResult> {
  if (!isReady()) {
    return { success: false, message: 'Purchases are not available right now.' };
  }

  try {
    cachedCustomerInfo = await Purchases.restorePurchases();
    if (entitlementActive(cachedCustomerInfo)) {
      return { success: true };
    }
    return { success: false, message: 'No previous purchases found.' };
  } catch {
    return { success: false, message: 'Restore failed. Please try again.' };
  }
}
