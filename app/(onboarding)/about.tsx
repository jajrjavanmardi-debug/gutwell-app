import { Redirect } from 'expo-router';

/**
 * about.tsx — name-collection screen replaced by onboarding 2.0.
 * Route preserved to avoid 404 on any resume path.
 * Redirects immediately to the question flow.
 */
export default function AboutScreen() {
  return <Redirect href="/(onboarding)/questions" />;
}
