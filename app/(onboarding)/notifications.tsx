import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Sentry from '@sentry/react-native';
import { useTranslation } from '../../lib/i18n';
import { saveLocalStage } from '../../lib/onboarding-stage';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { FontFamily } from '../../constants/theme';
import StarFieldBackground from '../../components/StarFieldBackground';
import { track, Events } from '../../lib/analytics';
import {
  requestPermissions,
  scheduleDailyCheckInReminder,
  scheduleWeeklyDigestNotification,
} from '../../lib/notifications';

// BENEFITS now from t.notifications via i18n

export default function NotificationsScreen() {
  const { user, refreshProfile } = useAuth();
  const t = useTranslation();
  const [showCelebration, setShowCelebration] = useState(false);

  // Guards double-completion: repeated taps, or a tap during the 1.8s
  // celebration before navigation actually happens.
  const completingRef = useRef(false);
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

  /**
   * Finish onboarding. Reached from BOTH Allow and Skip — the notification
   * decision never gates completion.
   *
   * Idempotent by guard: repeated taps (or a tap during the celebration delay)
   * return immediately rather than issuing a second write or a second navigation.
   *
   * The user reaches Home no matter what fails. A profile write that errors is
   * reported to Sentry and then ignored for navigation purposes: being trapped
   * on this screen is a far worse outcome than a profile row that is briefly
   * missing a goal value, which the user can set later in Settings.
   */
  const completeOnboardingFlow = async () => {
    if (completingRef.current) return;
    completingRef.current = true;

    if (!user) {
      // Shouldn't happen — this screen is only reachable after signup — but
      // never strand the user on a button that does nothing.
      router.replace('/(auth)/signup');
      return;
    }

    // Local stage first: it is what resumes this device, and it must be set
    // even if the network is down. saveLocalStage never throws.
    await saveLocalStage('completed');

    try {
      const rawAnswers = await AsyncStorage.getItem('onboarding_answers');
      const answers: Record<string, unknown> = rawAnswers ? JSON.parse(rawAnswers) : {};

      /**
       * meal_feeling is an array since the feeling step became multi-select,
       * but legacy blobs hold a single string. Both collapse to the same
       * comma-separated TEXT that profiles.gut_concern has always stored, so no
       * migration is needed and existing rows stay valid.
       *
       * The stored values are the stable option identifiers (e.g. 'Heavy'),
       * never the translated labels — so this string means the same thing
       * whichever language the user answered in.
       */
      const feelings = Array.isArray(answers.meal_feeling)
        ? answers.meal_feeling.filter((v): v is string => typeof v === 'string' && v.length > 0)
        : typeof answers.meal_feeling === 'string' && answers.meal_feeling.length > 0
          ? [answers.meal_feeling]
          : [];
      const gutConcern = feelings.length > 0 ? feelings.join(', ') : null;

      // One write, so completion and the legacy answers can never disagree.
      //
      // display_name is deliberately absent: the handle_new_user trigger already
      // sets it from the signup metadata, making signup the single source. The
      // old `onboarding_name` read came from the retired About screen.
      //
      // symptom_frequency resolves to null for v1.0 users — the question that
      // fed `bloating_frequency` is no longer asked. The column is nullable and
      // has no functional readers, so null is written honestly rather than
      // back-filled with an invented value.
      await supabase
        .from('profiles')
        .update({
          onboarding_completed: true,
          onboarding_stage: 'completed',
          gut_concern: gutConcern,
          symptom_frequency: (answers.bloating_frequency as string | undefined) ?? null,
          goal: (answers.goal as string | undefined) ?? null,
          // answers.avoid stays local on purpose — no column, no AI payload.
        })
        .eq('id', user.id);

      await refreshProfile();
      // Event only — no personal names in analytics.
      track(Events.ONBOARDING_COMPLETED);

      // Show celebration moment before navigating
      setShowCelebration(true);
      Animated.parallel([
        Animated.spring(celebrationScale, { toValue: 1, friction: 6, tension: 40, useNativeDriver: true }),
        Animated.timing(celebrationFade, { toValue: 1, duration: 400, useNativeDriver: true }),
      ]).start();
      setTimeout(() => router.replace('/(tabs)'), 1800);
    } catch (error) {
      console.warn('Onboarding profile save failed:', error);
      Sentry.captureException(error, { tags: { context: 'onboarding_complete' } });
      router.replace('/(tabs)');
    }
  };

  const requestPermission = async () => {
    // Actually ask the OS for notification permission, then set up the default
    // reminders this screen promises (daily check-in + Sunday digest). We proceed
    // to completeOnboarding regardless of the outcome so a denial never traps the
    // user, and everything is crash-safe (the lib no-ops in Expo Go / on web).
    try {
      const granted = await requestPermissions();
      if (granted) {
        await scheduleDailyCheckInReminder(20, 0); // 8:00 PM daily check-in
        await scheduleWeeklyDigestNotification(9, 0); // Sunday 9:00 AM digest
      }
    } catch (err) {
      console.warn('[onboarding] enabling notifications failed', err);
    }
    await completeOnboardingFlow();
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
          <Text style={styles.title}>{t.notifications.title}</Text>

          {/* Subtitle */}
          <Text style={styles.subtitle}>
            {t.notifications.subtitle}
          </Text>

          {/* Benefit rows */}
          <View style={styles.benefitsContainer}>
            {[{ icon: 'time-outline' as const, text: t.notifications.benefitDaily }].map((benefit, i) => (
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
            style={styles.allowButton}
            onPress={requestPermission}
            accessibilityRole="button"
            accessibilityLabel={t.notifications.enableButton}
            activeOpacity={0.88}
          >
            <Text style={styles.allowButtonText}>{t.notifications.enableButton}</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => void completeOnboardingFlow()} accessibilityRole="button" accessibilityLabel={t.notifications.skipButton} activeOpacity={0.7}>
            <Text style={styles.skipText}>{t.notifications.skipButton}</Text>
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
            <Text style={styles.celebrationTitle}>{t.notifications.allSet}</Text>
            <Text style={styles.celebrationSubtitle}>{t.notifications.journeyStarts}</Text>
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
  celebrationSubtitle: {
    fontFamily: FontFamily.sansRegular,
    fontSize: 16,
    color: 'rgba(255,255,255,0.6)',
  },
});
