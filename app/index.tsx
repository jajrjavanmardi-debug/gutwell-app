import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { Colors } from '../constants/theme';
import { indexDecision } from '../lib/routing';
import { loadLocalStage, resolveStage, type OnboardingStage } from '../lib/onboarding-stage';

/**
 * Auth gate — the single routing decision point for app entry.
 *
 * - Password recovery in progress: the New Password screen, never the app.
 * - No session: start the onboarding funnel, resuming at the furthest screen
 *   reached if there is one.
 * - Session but onboarding incomplete: resume where they stopped. A user who
 *   signed up and quit before their first analysis comes back to the camera,
 *   not to the questionnaire.
 * - Otherwise: the main app.
 *
 * The local stage is read once per launch. A completed user never waits on it:
 * indexDecision returns tabs before the stage is consulted, so the extra
 * AsyncStorage read costs finished users nothing.
 */
export default function Index() {
  const { session, profile, loading, passwordRecovery } = useAuth();

  const [localStage, setLocalStage] = useState<OnboardingStage | null>(null);
  const [stageReady, setStageReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadLocalStage()
      .then((stage) => {
        if (cancelled) return;
        setLocalStage(stage);
        setStageReady(true);
      })
      .catch(() => {
        // loadLocalStage already swallows failures; this is belt-and-braces so
        // a rejected promise can never leave the gate stuck on the spinner.
        if (!cancelled) setStageReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const authenticated = Boolean(session);

  // Decision logic lives in lib/routing.ts so the unit tests exercise the same
  // code this component runs, rather than a copy of it.
  const decision = indexDecision({
    session: authenticated,
    loading,
    onboardingCompleted: profile ? profile.onboarding_completed : null,
    stage: resolveStage({
      authenticated,
      serverStage: profile?.onboarding_stage ?? null,
      localStage,
    }),
    stageReady,
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
    case '(onboarding)/example':
      return <Redirect href="/(onboarding)/example" />;
    case '(onboarding)/notifications':
      return <Redirect href="/(onboarding)/notifications" />;
    case 'photo-analysis-onboarding':
      return <Redirect href="/photo-analysis?onboarding=1" />;
    default:
      return <Redirect href="/(tabs)" />;
  }
}
