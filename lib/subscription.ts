import { Platform } from 'react-native';
import Purchases, {
  CustomerInfo,
  PurchasesOffering,
  PurchasesPackage,
} from 'react-native-purchases';

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

const ENTITLEMENT_ID = process.env.EXPO_PUBLIC_RC_ENTITLEMENT_ID || 'premium';
const IOS_API_KEY = process.env.EXPO_PUBLIC_RC_APPLE_API_KEY;
const ANDROID_API_KEY = process.env.EXPO_PUBLIC_RC_GOOGLE_API_KEY;
const MONTHLY_PACKAGE_ID = process.env.EXPO_PUBLIC_RC_PACKAGE_MONTHLY;
const ANNUAL_PACKAGE_ID = process.env.EXPO_PUBLIC_RC_PACKAGE_ANNUAL;

let initialized = false;
let premiumState = false;

function getApiKey(): string | undefined {
  if (Platform.OS === 'ios') return IOS_API_KEY;
  if (Platform.OS === 'android') return ANDROID_API_KEY;
  return IOS_API_KEY || ANDROID_API_KEY;
}

export async function initSubscription(userId?: string): Promise<void> {
  const apiKey = getApiKey();
  if (!apiKey || initialized) return;

  await Purchases.configure({ apiKey, appUserID: userId });
  try {
    const info = await Purchases.getCustomerInfo();
    premiumState = Boolean(info.entitlements.active[ENTITLEMENT_ID]);
  } catch {
    premiumState = false;
  }
  initialized = true;
}

async function syncPremiumState(): Promise<boolean> {
  if (!initialized) await initSubscription();
  if (!initialized) return false;

  const info = await Purchases.getCustomerInfo();
  premiumState = Boolean(info.entitlements.active[ENTITLEMENT_ID]);
  return premiumState;
}

export async function isPremium(): Promise<boolean> {
  try {
    return await syncPremiumState();
  } catch {
    return premiumState;
  }
}

export function isPremiumFeature(_feature: PremiumFeature): boolean {
  return premiumState;
}

export async function getPaywallOffering(): Promise<PurchasesOffering | null> {
  if (!initialized) await initSubscription();
  if (!initialized) return null;

  const offerings = await Purchases.getOfferings();
  return offerings.current ?? null;
}

function pickPackage(
  offering: PurchasesOffering,
  selectedPlan: PlanKey
): PurchasesPackage | null {
  const envPackageId = selectedPlan === 'annual' ? ANNUAL_PACKAGE_ID : MONTHLY_PACKAGE_ID;
  if (envPackageId) {
    const byId = offering.availablePackages.find((pkg) => pkg.identifier === envPackageId);
    if (byId) return byId;
  }

  if (selectedPlan === 'annual') return offering.annual ?? null;
  return offering.monthly ?? null;
}

export async function purchasePlan(selectedPlan: PlanKey): Promise<PurchaseResult> {
  if (!initialized) await initSubscription();
  if (!initialized) {
    return { success: false, message: 'Purchases are not configured for this build.' };
  }

  try {
    const offering = await getPaywallOffering();
    if (!offering) return { success: false, message: 'No active subscription offering found.' };

    const pkg = pickPackage(offering, selectedPlan);
    if (!pkg) return { success: false, message: `No ${selectedPlan} package found.` };

    const { customerInfo } = await Purchases.purchasePackage(pkg);
    premiumState = Boolean(customerInfo.entitlements.active[ENTITLEMENT_ID]);
    return premiumState
      ? { success: true }
      : { success: false, message: 'Purchase completed but premium entitlement is not active.' };
  } catch (error: any) {
    if (error?.userCancelled === true) {
      return { success: false, cancelled: true, message: 'Purchase cancelled.' };
    }
    return { success: false, message: error?.message || 'Purchase failed. Please try again.' };
  }
}

export async function restorePurchases(): Promise<PurchaseResult> {
  if (!initialized) await initSubscription();
  if (!initialized) {
    return { success: false, message: 'Purchases are not configured for this build.' };
  }

  try {
    const customerInfo: CustomerInfo = await Purchases.restorePurchases();
    premiumState = Boolean(customerInfo.entitlements.active[ENTITLEMENT_ID]);
    return premiumState
      ? { success: true }
      : { success: false, message: 'No active purchases were found to restore.' };
  } catch (error: any) {
    return { success: false, message: error?.message || 'Failed to restore purchases.' };
  }
}
