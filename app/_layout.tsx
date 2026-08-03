import { useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import { router, Stack, useSegments } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { LanguageProvider } from '../lib/LanguageContext';
import { ErrorBoundary } from '../components/ErrorBoundary';
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
import { initSubscription } from '../lib/subscription';
import { flush } from '../lib/offline-queue';
import * as SplashScreen from 'expo-splash-screen';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

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
  const { session, loading } = useAuth();
  const [showDisclaimer, setShowDisclaimer] = useState(false);

  // Show the health disclaimer as soon as an account exists (i.e. before any
  // health data can be synced), once per user per device.
  useEffect(() => {
    if (session?.user?.id) {
      hasAcceptedDisclaimer(session.user.id).then((accepted) => {
        if (!accepted) setShowDisclaimer(true);
      });
    }
  }, [session?.user?.id]);

  // Guard: authenticated users only in (tabs) and protected screens.
  // Unauthenticated users may freely navigate (auth) and (onboarding).
  // index.tsx is the single routing decision point for unauthenticated entry.
  const segments = useSegments();
  useEffect(() => {
    if (loading) return;
    const inTabs = segments[0] === '(tabs)';
    const inProtected = inTabs ||
      ['photo-analysis', 'food-history', 'weekly-digest', 'settings',
       'log-symptom', 'reminders', 'edit-checkin', 'paywall'].includes(segments[0] ?? '');
    // If unauthenticated and trying to access a protected screen, send to welcome.
    if (!session && inProtected) {
      router.replace('/(onboarding)/welcome');
    }
  }, [session, loading, segments]);

  // Identify user for analytics when authenticated
  useEffect(() => {
    if (session?.user?.id) {
      identifyUser(session.user.id);
    }
  }, [session?.user?.id]);

  // Configure RevenueCat (no-op until EXPO_PUBLIC_REVENUECAT_IOS_KEY is set) and
  // identify the Supabase user so premium entitlements follow the account.
  useEffect(() => {
    initSubscription(session?.user?.id).catch(() => {
      // Never let subscription setup break startup.
    });
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

  // Route notification taps to the screen they advertise (a check-in
  // reminder opens Check-in, the digest notification opens the digest).
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const reminderType = response.notification.request.content.data?.reminderType;
      const route =
        reminderType === 'digest' ? '/weekly-digest'
        : reminderType === 'food' ? '/(tabs)/food'
        : reminderType === 'symptom' ? '/log-symptom'
        : reminderType === 'checkin' ? '/(tabs)/checkin'
        : null;
      if (route) {
        // Defer until the router has mounted on cold starts.
        setTimeout(() => router.push(route as any), 300);
      }
    });
    return () => sub.remove();
  }, []);

  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(onboarding)" />
        <Stack.Screen name="log-symptom" options={{ presentation: 'modal' }} />
        <Stack.Screen name="privacy-policy" options={{ presentation: 'modal' }} />
        <Stack.Screen name="terms-of-service" options={{ presentation: 'modal' }} />
        <Stack.Screen name="reminders" options={{ presentation: 'modal' }} />
        <Stack.Screen name="photo-analysis" options={{ presentation: 'modal' }} />
        <Stack.Screen name="food-history" />
        <Stack.Screen name="weekly-digest" options={{ presentation: 'modal' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings', presentation: 'modal' }} />
        <Stack.Screen name="edit-checkin" options={{ title: 'Edit Check-in', presentation: 'modal' }} />
        <Stack.Screen name="paywall" options={{ title: 'GutWell Premium', presentation: 'modal', headerShown: false }} />
      </Stack>
      <HealthDisclaimerModal
        visible={showDisclaimer}
        userId={session?.user?.id}
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

  // On first launch after a fresh install, clear any stale Supabase auth
  // tokens that may have persisted in SecureStore across app deletions on iOS.
  // We detect "first launch" by checking a plain AsyncStorage marker
  // (AsyncStorage IS cleared on app deletion, unlike SecureStore).
  useEffect(() => {
    const INSTALL_MARKER = 'gutwell_install_v1';
    AsyncStorage.getItem(INSTALL_MARKER).then(async (marker) => {
      if (!marker) {
        // First launch after install — clear any stale SecureStore session.
        const SUPABASE_KEYS = [
          'supabase.auth.token',
          'supabase.auth.refreshToken',
          // Supabase JS v2 stores under this key pattern:
          `sb-${process.env.EXPO_PUBLIC_SUPABASE_URL?.split('.')?.[0]?.split('//')?.pop()}-auth-token`,
        ];
        await Promise.all(
          SUPABASE_KEYS.map((k) => SecureStore.deleteItemAsync(k).catch(() => {}))
        );
        await AsyncStorage.setItem(INSTALL_MARKER, '1');
      }
    }).catch(() => {});
  }, []);

  return (
    <ErrorBoundary>
      <LanguageProvider>
        <AuthProvider>
          <RootLayoutNav />
        </AuthProvider>
      </LanguageProvider>
    </ErrorBoundary>
  );
}

export default Sentry.wrap(RootLayout);
