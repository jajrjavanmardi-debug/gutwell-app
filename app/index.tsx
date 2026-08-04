import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { Colors } from '../constants/theme';
import { indexDecision } from '../lib/routing';

/**
 * Auth gate — the single routing decision point for app entry.
 * - Password recovery in progress: the New Password screen, never the app.
 * - No session: start the onboarding funnel (welcome → quiz → signup).
 * - Session but onboarding incomplete: resume the quiz so the profile,
 *   default reminders, and notification opt-in all get set up.
 * - Otherwise: the main app.
 * If the profile hasn't loaded yet (e.g. offline cold start), we let the
 * user into tabs rather than stranding them — tabs only need the session.
 */
export default function Index() {
  const { session, profile, loading, passwordRecovery } = useAuth();

  // Decision logic lives in lib/routing.ts so the unit tests exercise the same
  // code this component runs, rather than a copy of it.
  const decision = indexDecision({
    session: Boolean(session),
    loading,
    onboardingCompleted: profile ? profile.onboarding_completed : null,
    passwordRecovery,
  });

  switch (decision) {
    case 'loading':
      return (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background }}>
          <ActivityIndicator color={Colors.secondary} />
        </View>
      );
    case '(auth)/reset-password':
      return <Redirect href="/(auth)/reset-password" />;
    case '(onboarding)/welcome':
      return <Redirect href="/(onboarding)/welcome" />;
    case '(onboarding)/questions':
      return <Redirect href="/(onboarding)/questions" />;
    default:
      return <Redirect href="/(tabs)" />;
  }
}
