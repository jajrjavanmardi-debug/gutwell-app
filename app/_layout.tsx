import { useEffect, useCallback, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { View, ActivityIndicator, StyleSheet, Text } from 'react-native';
import { Colors, FontFamily } from '../constants/theme';
import { syncReminders, scheduleWeeklyDigestNotification } from '../lib/notifications';
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

// Initialize Sentry for crash reporting
Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.2,
  enabled: !__DEV__,
});

SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  const { session, loading, profile } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const [showDisclaimer, setShowDisclaimer] = useState(false);

  // Check health disclaimer after entering tabs
  useEffect(() => {
    if (session && profile?.onboarding_completed) {
      hasAcceptedDisclaimer().then((accepted) => {
        if (!accepted) setShowDisclaimer(true);
      });
    }
  }, [session, profile?.onboarding_completed]);

  // Sync reminders + identify user for analytics when authenticated
  useEffect(() => {
    if (session?.user?.id) {
      syncReminders(session.user.id).catch(console.warn);
      scheduleWeeklyDigestNotification().catch(console.warn);
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

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inOnboarding = segments[0] === '(onboarding)';

    if (!session) {
      if (!inAuthGroup) {
        router.replace('/(auth)/login');
      }
    } else if (!profile) {
      // Profile still loading or fetch failed — stay put, don't redirect
      return;
    } else if (!profile.onboarding_completed && !inOnboarding) {
      router.replace('/(onboarding)/welcome');
    } else if (inAuthGroup || inOnboarding) {
      router.replace('/(tabs)');
    }
  }, [session, loading, profile]);

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={Colors.secondary} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(onboarding)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="log-symptom" options={{ presentation: 'modal' }} />
        <Stack.Screen name="privacy-policy" options={{ presentation: 'modal' }} />
        <Stack.Screen name="terms-of-service" options={{ presentation: 'modal' }} />
        <Stack.Screen name="reminders" options={{ presentation: 'modal' }} />
        <Stack.Screen name="scan-food" options={{ presentation: 'modal' }} />
        <Stack.Screen name="weekly-digest" options={{ presentation: 'modal' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings', presentation: 'modal' }} />
        <Stack.Screen name="edit-checkin" options={{ title: 'Edit Check-in', presentation: 'modal' }} />
        <Stack.Screen name="paywall" options={{ title: 'GutWell Premium', presentation: 'modal', headerShown: false }} />
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

  const onLayoutRootView = useCallback(async () => {
    if (fontsLoaded || fontError) {
      await SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    onLayoutRootView();
    initAnalytics();
  }, [onLayoutRootView]);

  if (!fontsLoaded && !fontError) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={Colors.secondary} />
      </View>
    );
  }

  return (
    <AuthProvider>
      <RootLayoutNav />
    </AuthProvider>
  );
}

export default Sentry.wrap(RootLayout);

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
  },
});
