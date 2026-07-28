import { Redirect } from 'expo-router';

/**
 * features.tsx — replaced by onboarding 2.0.
 * Route preserved to avoid 404 on any deep link or resume path.
 * Redirects immediately to the question flow.
 */
export default function FeaturesScreen() {
  return <Redirect href="/(onboarding)/questions" />;
}
