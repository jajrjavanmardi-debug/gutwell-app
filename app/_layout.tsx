import { useEffect, useCallback, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { View, ActivityIndicator, StyleSheet, Text } from 'react-native';
import { Colors, FontFamily } from '../constants/theme';
import { syncReminders } from '../lib/notifications';
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
import * as SplashScreen from 'expo-splash-screen';

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

  // Sync reminders when user is authenticated
  useEffect(() => {
    if (session?.user?.id) {
      syncReminders(session.user.id).catch(console.warn);
    }
  }, [session?.user?.id]);

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inOnboarding = segments[0] === '(onboarding)';

    if (!session) {
      if (!inAuthGroup) {
        router.replace('/(auth)/login');
      }
    } else if (profile && !profile.onboarding_completed && !inOnboarding) {
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

export default function RootLayout() {
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

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
  },
});
