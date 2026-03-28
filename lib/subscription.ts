// Subscription state management (placeholder until RevenueCat)
// In a real app this would check receipt validation

export type PremiumFeature =
  | 'correlations'
  | 'weekly_digest'
  | 'advanced_insights'
  | 'export'
  | 'unlimited_achievements';

// For now everyone gets full access (pre-launch)
// After launch, check AsyncStorage for purchase receipt
export async function isPremium(): Promise<boolean> {
  return true; // TODO: replace with RevenueCat check
}

export function isPremiumFeature(feature: PremiumFeature): boolean {
  return true; // TODO: gate after RevenueCat integration
}
