import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { Colors } from '../constants/theme';

/**
 * Auth gate — the single routing decision point for app entry.
 * - No session: start the onboarding funnel (welcome → quiz → signup).
 * - Session but onboarding incomplete: resume the quiz so the profile,
 *   default reminders, and notification opt-in all get set up.
 * - Otherwise: the main app.
 * If the profile hasn't loaded yet (e.g. offline cold start), we let the
 * user into tabs rather than stranding them — tabs only need the session.
 */
export default function Index() {
  const { session, profile, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background }}>
        <ActivityIndicator color={Colors.secondary} />
      </View>
    );
  }

  if (!session) {
    return <Redirect href="/(onboarding)/welcome" />;
  }

  if (profile && !profile.onboarding_completed) {
    return <Redirect href="/(onboarding)/questions" />;
  }

  return <Redirect href="/(tabs)" />;
}
