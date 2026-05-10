import { useEffect, useMemo, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { LanguageProvider } from '../contexts/LanguageContext';
import { HealthDisclaimerModal, hasAcceptedDisclaimer } from '../components/HealthDisclaimerModal';
import { useFonts } from 'expo-font';
import {
  EBGaramond_400Regular,
  EBGaramond_500Medium,
  EBGaramond_600SemiBold,
  EBGaramond_700Bold,
} from '@expo-google-fonts/eb-garamond';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
} from '@expo-google-fonts/inter';
import NetInfo from '@react-native-community/netinfo';
import * as Sentry from '@sentry/react-native';
import { initAnalytics, identifyUser } from '../lib/analytics';
import { flush } from '../lib/offline-queue';
import * as SplashScreen from 'expo-splash-screen';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

// Initialize Sentry for crash reporting
Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.2,
  enabled: !__DEV__,
});

SplashScreen.preventAutoHideAsync().catch(() => {
  // The splash may already be hidden during fast refresh.
});

function RootLayoutNav() {
  const { session, profile } = useAuth();
  const [showDisclaimer, setShowDisclaimer] = useState(false);

  useEffect(() => {
    console.log('NutriFlow Core Updated: Focus English/German, Voice Active, Memory Cleared');
  }, []);

  // Check health disclaimer after entering tabs
  useEffect(() => {
    if (session && profile?.onboarding_completed) {
      hasAcceptedDisclaimer().then((accepted) => {
        if (!accepted) setShowDisclaimer(true);
      });
    }
  }, [session, profile?.onboarding_completed]);

  // Identify user for analytics when authenticated
  useEffect(() => {
    if (session?.user?.id) {
      identifyUser(session.user.id);
    }
  }, [session?.user?.id]);

  // Flush offline queue when connectivity is restored
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      if (state.isConnected) {
        flush().catch(console.warn);
      }
    });
    return () => unsubscribe();
  }, []);

  return (
    <>
      <StatusBar style="light" />
      <Stack initialRouteName="(tabs)" screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(onboarding)" />
        <Stack.Screen name="log-symptom" options={{ presentation: 'modal' }} />
        <Stack.Screen name="privacy-policy" options={{ presentation: 'modal' }} />
        <Stack.Screen name="terms-of-service" options={{ presentation: 'modal' }} />
        <Stack.Screen name="reminders" options={{ presentation: 'modal' }} />
        <Stack.Screen name="scan-food" options={{ presentation: 'modal' }} />
        <Stack.Screen name="photo-analysis" options={{ presentation: 'modal' }} />
        <Stack.Screen name="food-history" />
        <Stack.Screen name="weekly-digest" options={{ presentation: 'modal' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings', presentation: 'modal' }} />
        <Stack.Screen name="edit-checkin" options={{ title: 'Edit Check-in', presentation: 'modal' }} />
        <Stack.Screen name="paywall" options={{ title: 'NutriFlow Premium', presentation: 'modal', headerShown: false }} />
      </Stack>
      <HealthDisclaimerModal
        visible={showDisclaimer}
        onAccept={() => setShowDisclaimer(false)}
      />
    </>
  );
}

function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    EBGaramond_400Regular,
    EBGaramond_500Medium,
    EBGaramond_600SemiBold,
    EBGaramond_700Bold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });

  const appIsReady = useMemo(() => fontsLoaded || Boolean(fontError), [fontError, fontsLoaded]);

  useEffect(() => {
    if (!appIsReady) return;

    SplashScreen.hideAsync().catch(() => {
      // Ignore if the native splash has already been dismissed.
    });
  }, [appIsReady]);

  useEffect(() => {
    initAnalytics();
  }, []);

  return (
    <LanguageProvider>
      <AuthProvider>
        <RootLayoutNav />
      </AuthProvider>
    </LanguageProvider>
  );
}

export default Sentry.wrap(RootLayout);
