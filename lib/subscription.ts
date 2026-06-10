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

export type PremiumFeature =
  | 'correlations'
  | 'weekly_digest'
  | 'advanced_insights'
  | 'export'
  | 'unlimited_achievements';

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

/** True only once Purchases.configure has successfully run. */
let configured = false;

/** Most recent CustomerInfo, cached so isPremium()/isPremiumFeature() are fast. */
let cachedCustomerInfo: CustomerInfo | null = null;

/** Guard so initSubscription only configures the SDK once. */
let initPromise: Promise<void> | null = null;

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
      if (__DEV__) {
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
    } catch {
      // Never let payment setup break app startup.
      configured = false;
    }
  })();

  await initPromise;

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
  if (!isReady()) return null;
  try {
    const offerings = await Purchases.getOfferings();
    return offerings.current ?? null;
  } catch {
    return null;
  }
}

/**
 * Pick the package matching the requested plan from an offering. Prefers the
 * RevenueCat well-known accessors (annual/monthly), then falls back to scanning
 * availablePackages by packageType / subscription period.
 */
function selectPackage(
  offering: PurchasesOffering,
  plan: PlanKey,
): PurchasesPackage | null {
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

/**
 * Purchase the package for the requested plan. Distinguishes a user-cancelled
 * flow (cancelled: true, no error UI) from a real failure (message set).
 * Returns a non-success no-op result when monetization is unconfigured.
 */
export async function purchasePlan(selectedPlan: PlanKey): Promise<PurchaseResult> {
  if (!isReady()) {
    return { success: false, message: 'Purchases are not available right now.' };
  }

  try {
    const offering = await getPaywallOffering();
    if (!offering) {
      return { success: false, message: 'No subscription options are available.' };
    }

    const pkg = selectPackage(offering, selectedPlan);
    if (!pkg) {
      return { success: false, message: 'That plan is not available right now.' };
    }

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
