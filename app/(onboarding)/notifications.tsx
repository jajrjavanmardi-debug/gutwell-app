import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Sentry from '@sentry/react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { ONBOARDING_COPY } from '../../constants/onboarding-copy';
import { FontFamily } from '../../constants/theme';
import StarFieldBackground from '../../components/StarFieldBackground';
import { track, Events } from '../../lib/analytics';

export default function NotificationsScreen() {
  const { user, refreshProfile } = useAuth();
  const { language, isRtl } = useLanguage();
  const copy = ONBOARDING_COPY[language].notifications;
  const [showCelebration, setShowCelebration] = useState(false);

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
    if (!user) return;
    try {
      const [rawName, rawAnswers] = await Promise.all([
        AsyncStorage.getItem('onboarding_name'),
        AsyncStorage.getItem('onboarding_answers'),
      ]);

      const name = rawName ?? '';
      const answers: Record<string, string> = rawAnswers ? JSON.parse(rawAnswers) : {};

      await supabase
        .from('profiles')
        .update({
          onboarding_completed: true,
          display_name: name || undefined,
          gut_concern: answers.meal_feeling ?? null,
          symptom_frequency: answers.bloating_frequency ?? null,
          goal: answers.goal ?? null,
        })
        .eq('id', user.id);

      await refreshProfile();
      track(Events.ONBOARDING_COMPLETED, { name: name || 'unknown' });

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
    await completeOnboarding();
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <LinearGradient colors={['#0B1F14', '#1B4332']} style={StyleSheet.absoluteFill} />
      <StarFieldBackground count={120} seed={42} />

      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <View style={styles.topSection}>
          <View style={styles.bellRing}>
            <Ionicons name="notifications-outline" size={40} color="#52B788" />
          </View>

          <Text style={[styles.title, isRtl && styles.rtlText]}>{copy.title}</Text>

          <Text style={[styles.subtitle, isRtl && styles.rtlText]}>
            {copy.subtitle}
          </Text>

          <View style={styles.benefitsContainer}>
            {copy.benefits.map((benefit, i) => (
              <View key={i} style={[styles.benefitRow, isRtl && styles.benefitRowRtl]}>
                <View style={styles.benefitIconCircle}>
                  <Ionicons name={benefit.icon} size={16} color="#52B788" />
                </View>
                <Text style={[styles.benefitText, isRtl && styles.rtlText]}>{benefit.text}</Text>
              </View>
            ))}
          </View>
        </View>

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
            activeOpacity={0.88}
          >
            <Text style={[styles.allowButtonText, isRtl && styles.rtlText]}>{copy.allow}</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={completeOnboarding} activeOpacity={0.7}>
            <Text style={[styles.skipText, isRtl && styles.rtlText]}>{copy.skip}</Text>
          </TouchableOpacity>
        </Animated.View>
      </SafeAreaView>

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
            <Text style={[styles.celebrationTitle, isRtl && styles.rtlText]}>{copy.celebrationTitle}</Text>
            <Text style={[styles.celebrationSubtitle, isRtl && styles.rtlText]}>
              {copy.celebrationSubtitle}
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
  benefitRowRtl: {
    flexDirection: 'row-reverse',
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
    minHeight: 60,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  allowButtonText: {
    fontFamily: FontFamily.sansBold,
    fontSize: 17,
    color: '#0B1F14',
    textAlign: 'center',
  },
  skipText: {
    fontFamily: FontFamily.sansRegular,
    fontSize: 15,
    color: 'rgba(255,255,255,0.45)',
    textAlign: 'center',
  },
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
    textAlign: 'center',
  },
  celebrationSubtitle: {
    fontFamily: FontFamily.sansRegular,
    fontSize: 16,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
  },
  rtlText: {
    textAlign: 'right',
    writingDirection: 'rtl',
  },
});
