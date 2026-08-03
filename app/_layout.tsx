import { useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import { router, Stack, useSegments } from 'expo-router';
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { LanguageProvider } from '../lib/LanguageContext';
import { supabase, clearStoredAuthSession } from '../lib/supabase';
import { parseAuthDeepLink, isPasswordRecoveryLink } from '../lib/auth-deep-link';
import { authGuardDecision } from '../lib/routing';
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
  const { session, loading, passwordRecovery, setPasswordRecovery } = useAuth();
  const [showDisclaimer, setShowDisclaimer] = useState(false);

  // Consume Supabase auth deep links (password recovery). The client runs with
  // detectSessionInUrl: false because there is no browser URL on native, so the
  // tokens have to be lifted out of the link and handed to Supabase here.
  useEffect(() => {
    let cancelled = false;

    const handleUrl = async (url: string | null) => {
      const parsed = parseAuthDeepLink(url);
      if (!parsed || cancelled) return;

      if (parsed.kind === 'error') {
        // Expired or already-used link — send the user to the screen that
        // explains it rather than leaving them on a dead URL.
        setPasswordRecovery(true);
        router.replace('/(auth)/reset-password');
        return;
      }

      if (!isPasswordRecoveryLink(parsed)) return;

      try {
        if (parsed.kind === 'tokens') {
          await supabase.auth.setSession({
            access_token: parsed.accessToken,
            refresh_token: parsed.refreshToken,
          });
        } else {
          await supabase.auth.verifyOtp({ token_hash: parsed.tokenHash, type: 'recovery' });
        }
      } catch {
        // Fall through — the screen reports an invalid link when no session
        // was established. Never log the link: it carries auth tokens.
      }

      if (cancelled) return;
      setPasswordRecovery(true);
      router.replace('/(auth)/reset-password');
    };

    // Cold start: the app was launched by the link.
    Linking.getInitialURL().then(handleUrl).catch(() => {});
    // Warm start: the app was already running.
    const sub = Linking.addEventListener('url', ({ url }) => {
      handleUrl(url);
    });

    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [setPasswordRecovery]);


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

  // Decision logic lives in lib/routing.ts so the unit tests exercise the same
  // code this component runs, rather than a copy of it.
  useEffect(() => {
    const decision = authGuardDecision({
      session: Boolean(session),
      loading,
      segments,
      passwordRecovery,
    });
    if (decision === 'welcome') {
      router.replace('/(onboarding)/welcome');
    } else if (decision === 'reset-password') {
      router.replace('/(auth)/reset-password');
    }
  }, [session, loading, segments, passwordRecovery]);

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
        // clearStoredAuthSession understands the chunked layout the storage
        // adapter uses, so no orphan chunks are left behind.
        await clearStoredAuthSession().catch(() => {});
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
