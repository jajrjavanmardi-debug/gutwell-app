import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FontFamily } from '../../constants/theme';
import StarFieldBackground from '../../components/StarFieldBackground';
import { completeOnboardingProfile } from '../../lib/onboarding-profile';
import { useAuth } from '../../contexts/AuthContext';

const PENDING_FLAG = 'onboarding_checkin_pending';

export default function CheckinPromptScreen() {
  const { user, refreshProfile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleStartCheckin = async () => {
    // Set the flag so checkin.tsx knows to route to notifications on completion.
    await AsyncStorage.setItem(PENDING_FLAG, 'true');
    router.replace('/(tabs)/checkin');
  };

  const handleSkip = async () => {
    if (!user?.id || loading) return;
    setLoading(true);
    setError(null);
    try {
      // Clear any stale pending flag before completing onboarding.
      await AsyncStorage.removeItem(PENDING_FLAG);
      await completeOnboardingProfile(user.id);
      await refreshProfile().catch(() => {});
      // Navigate only on confirmed success.
      router.replace('/(tabs)');
    } catch (err) {
      console.warn('[checkin-prompt] skip completion failed:', err);
      // Remain on screen — preserve AsyncStorage — allow retry.
      setError('Could not save your profile. Please try again.');
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <LinearGradient colors={['#0B1F14', '#1B4332']} style={StyleSheet.absoluteFill} />
      <StarFieldBackground count={120} seed={77} />

      <SafeAreaView edges={['top', 'bottom']} style={styles.safe}>
        <View style={styles.content}>
          <View style={styles.iconRing}>
            <Ionicons name="checkmark-circle-outline" size={44} color="#52B788" />
          </View>

          <Text style={styles.title}>{"Let's take your first check-in."}</Text>

          <Text style={styles.subtitle}>
            {"Your Gut Score is built from real daily check-ins. This is your first one."}
          </Text>
        </View>

        {error ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}
      <View style={styles.bottom}>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={handleStartCheckin}
            activeOpacity={0.88}
            accessibilityRole="button"
            accessibilityLabel="Start my first check-in"
          >
            <Text style={styles.primaryBtnText}>Start my first check-in</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleSkip}
            disabled={loading}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Skip for now"
          >
            {loading ? (
              <ActivityIndicator color="rgba(255,255,255,0.45)" />
            ) : (
              <Text style={styles.skipText}>Skip for now</Text>
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1 },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  iconRing: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(82,183,136,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(82,183,136,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 32,
  },
  title: {
    fontFamily: FontFamily.displayBold,
    fontSize: 30,
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 38,
    marginBottom: 16,
  },
  subtitle: {
    fontFamily: FontFamily.sansRegular,
    fontSize: 16,
    color: 'rgba(255,255,255,0.65)',
    textAlign: 'center',
    lineHeight: 24,
    maxWidth: 300,
  },
  bottom: {
    paddingBottom: 44,
    paddingHorizontal: 24,
    gap: 16,
  },
  primaryBtn: {
    width: '100%',
    height: 60,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryBtnText: {
    fontFamily: FontFamily.sansBold,
    fontSize: 17,
    color: '#0B1F14',
    letterSpacing: -0.3,
  },
  errorCard: {
    marginHorizontal: 24,
    marginBottom: 12,
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
    padding: 12,
  },
  errorText: {
    fontFamily: FontFamily.sansRegular,
    fontSize: 14,
    color: '#FCA5A5',
    textAlign: 'center',
    lineHeight: 20,
  },
  skipText: {
    fontFamily: FontFamily.sansRegular,
    fontSize: 15,
    color: 'rgba(255,255,255,0.45)',
    textAlign: 'center',
  },
});
