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

type PurchasesOffering = null;

let premiumState = false;

export async function initSubscription(userId?: string): Promise<void> {
  void userId;
}

export async function isPremium(): Promise<boolean> {
  return premiumState;
}

export async function refreshPremiumStatus(): Promise<boolean> {
  return isPremium();
}

export function isPremiumFeature(_feature: PremiumFeature): boolean {
  return premiumState;
}

export async function getPaywallOffering(): Promise<PurchasesOffering | null> {
  return null;
}

export async function purchasePlan(selectedPlan: PlanKey): Promise<PurchaseResult> {
  void selectedPlan;
  return { success: false, message: 'Purchases are disabled for this native debug build.' };
}

export async function restorePurchases(): Promise<PurchaseResult> {
  return { success: false, message: 'Purchases are disabled for this native debug build.' };
}
