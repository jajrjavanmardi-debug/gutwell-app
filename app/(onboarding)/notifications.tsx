import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import * as Sentry from '@sentry/react-native';
import { completeOnboardingProfile } from '../../lib/onboarding-profile';
import { useAuth } from '../../contexts/AuthContext';
import { FontFamily } from '../../constants/theme';
import StarFieldBackground from '../../components/StarFieldBackground';
import { track, Events } from '../../lib/analytics';
import {
  requestPermissions,
  scheduleDailyCheckInReminder,
} from '../../lib/notifications';

const BENEFITS = [
  { icon: 'time-outline' as const, text: 'One gentle daily reminder — nothing else.' },
];

export default function NotificationsScreen() {
  const { user, refreshProfile } = useAuth();
  const [showCelebration, setShowCelebration] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const celebrationFade = useRef(new Animated.Value(0)).current;
  const celebrationScale = useRef(new Animated.Value(0.8)).current;
  const buttonAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const timer = setTimeout(() => {
      Animated.timing(buttonAnim, {
        toValue: 1,
        duration: 480,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }, 1800);
    return () => clearTimeout(timer);
  }, [buttonAnim]);

  const completeOnboarding = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    if (!user?.id) {
      router.replace('/(auth)/signup');
      return;
    }
    try {
      await completeOnboardingProfile(user.id);
      await refreshProfile().catch(() => {});
      track(Events.ONBOARDING_COMPLETED);
      setShowCelebration(true);
      Animated.parallel([
        Animated.spring(celebrationScale, { toValue: 1, friction: 6, tension: 40, useNativeDriver: true }),
        Animated.timing(celebrationFade, { toValue: 1, duration: 400, useNativeDriver: true }),
      ]).start();
      setTimeout(() => router.replace('/(tabs)'), 1800);
    } catch (error) {
      console.warn('[notifications] onboarding completion failed:', error);
      Sentry.captureException(error, { tags: { context: 'onboarding_complete' } });
      // Remain on screen — preserve AsyncStorage — allow retry.
      setError('Could not save your profile. Please try again.');
      setLoading(false);
    }
  };

  const requestPermission = async () => {
    if (loading) return;
    try {
      const granted = await requestPermissions();
      if (granted) {
        // P0: schedule only the daily check-in reminder.
        // Weekly digest and other notification categories are available
        // via Settings-based opt-in after onboarding.
        await scheduleDailyCheckInReminder(20, 0); // 8:00 PM daily check-in
      }
    } catch (err) {
      console.warn('[onboarding] enabling notifications failed', err);
    }
    // completeOnboarding handles its own loading state from here.
    await completeOnboarding();
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <LinearGradient colors={['#0B1F14', '#1B4332']} style={StyleSheet.absoluteFill} />
      <StarFieldBackground count={120} seed={42} />

      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        {/* Main content */}
        <View style={styles.topSection}>
          {/* Bell icon ring */}
          <View style={styles.bellRing}>
            <Ionicons name="notifications-outline" size={40} color="#52B788" />
          </View>

          {/* Title */}
          <Text style={styles.title}>{"Your first check-in is saved."}</Text>

          {/* Subtitle */}
          <Text style={styles.subtitle}>
            Would a gentle daily reminder help you keep the pattern going? You can change this anytime in Settings.
          </Text>

          {/* Benefit rows */}
          <View style={styles.benefitsContainer}>
            {BENEFITS.map((benefit, i) => (
              <View key={i} style={styles.benefitRow}>
                <View style={styles.benefitIconCircle}>
                  <Ionicons name={benefit.icon} size={16} color="#52B788" />
                </View>
                <Text style={styles.benefitText}>{benefit.text}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Animated bottom buttons */}
        {error ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}
        <Animated.View
          style={[
            styles.bottomSection,
            {
              opacity: buttonAnim,
              transform: [
                {
                  translateY: buttonAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [16, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <TouchableOpacity
            style={[styles.allowButton, loading && { opacity: 0.5 }]}
            onPress={requestPermission}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel="Set a daily reminder"
            activeOpacity={0.88}
          >
            <Text style={styles.allowButtonText}>Set a daily reminder</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={completeOnboarding} disabled={loading} accessibilityRole="button" accessibilityLabel="Not now" activeOpacity={0.7} style={loading ? { opacity: 0.4 } : undefined}>
            <Text style={styles.skipText}>Not now</Text>
          </TouchableOpacity>
        </Animated.View>
      </SafeAreaView>

      {/* Celebration overlay */}
      {showCelebration && (
        <Animated.View
          style={[
            styles.celebrationOverlay,
            { opacity: celebrationFade },
          ]}
        >
          <Animated.View style={{ transform: [{ scale: celebrationScale }], alignItems: 'center' }}>
            <View style={styles.celebrationIcon}>
              <Ionicons name="leaf" size={48} color="#52B788" />
            </View>
            <Text style={styles.celebrationTitle}>You&apos;re all set!</Text>
            <Text style={styles.celebrationSubtitle}>
              Your gut health journey starts now
            </Text>
          </Animated.View>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  topSection: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingTop: 48,
  },
  bellRing: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(82,183,136,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(82,183,136,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontFamily: FontFamily.displayBold,
    fontSize: 32,
    color: '#FFFFFF',
    lineHeight: 40,
    textAlign: 'center',
    marginTop: 28,
  },
  subtitle: {
    fontFamily: FontFamily.sansRegular,
    fontSize: 16,
    color: 'rgba(255,255,255,0.65)',
    textAlign: 'center',
    lineHeight: 24,
    marginTop: 16,
    maxWidth: 290,
  },
  benefitsContainer: {
    marginTop: 36,
    width: '100%',
    gap: 16,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  benefitIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(82,183,136,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  benefitText: {
    fontFamily: FontFamily.sansMedium,
    fontSize: 15,
    color: '#FFFFFF',
    flex: 1,
  },
  bottomSection: {
    paddingBottom: 44,
    paddingHorizontal: 24,
    gap: 14,
  },
  allowButton: {
    width: '100%',
    height: 60,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  allowButtonText: {
    fontFamily: FontFamily.sansBold,
    fontSize: 17,
    color: '#0B1F14',
  },
  skipText: {
    fontFamily: FontFamily.sansRegular,
    fontSize: 15,
    color: 'rgba(255,255,255,0.45)',
    textAlign: 'center',
  },

  // ── Celebration overlay ──
  celebrationOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0B1F14',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  celebrationIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(82,183,136,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(82,183,136,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  celebrationTitle: {
    fontFamily: FontFamily.displayBold,
    fontSize: 32,
    color: '#FFFFFF',
    marginBottom: 8,
  },
  errorCard: {
    marginHorizontal: 24,
    marginBottom: 8,
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
  celebrationSubtitle: {
    fontFamily: FontFamily.sansRegular,
    fontSize: 16,
    color: 'rgba(255,255,255,0.6)',
  },
});
