import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { FontFamily } from '../../constants/theme';
import StarFieldBackground from '../../components/StarFieldBackground';

type GutProfile = {
  type: string;
  emoji: string;
  color: string;
  description: string;
};

function computeProfile(answers: Record<string, string>): GutProfile {
  const freq = answers.frequency;
  const stress = answers.stress;

  if (freq === 'Almost every day' || freq === 'A few times a week') {
    if (stress === 'Highly stressed' || stress === 'Moderately stressed') {
      return {
        type: 'Reactive Gut',
        emoji: '⚡',
        color: '#E07A5F',
        description:
          'Your gut is highly reactive to both food and stress. The good news: it responds quickly to positive changes too.',
      };
    }
    return {
      type: 'Sensitive Gut',
      emoji: '🌿',
      color: '#52B788',
      description:
        'Your digestive system is sensitive but manageable. Consistent tracking will reveal your exact triggers fast.',
    };
  }

  if (stress === 'Highly stressed' || stress === 'Moderately stressed') {
    return {
      type: 'Stress-Driven',
      emoji: '🧠',
      color: '#D4A373',
      description:
        "Your gut symptoms are likely connected to your stress levels. The gut-brain connection is real — and trackable.",
    };
  }

  return {
    type: 'Optimisation Mode',
    emoji: '🎯',
    color: '#74C69D',
    description:
      "Your gut is in decent shape. You're here to fine-tune, identify subtle triggers, and perform at your best.",
  };
}

const NEXT_STEPS = [
  'Your gut score recalculates with every check-in',
  'Food-symptom patterns emerge after 7 days',
  'Weekly digests show what\'s changing and why',
];

export default function ResultsScreen() {
  const { user, refreshProfile } = useAuth();
  const [profile, setProfile] = useState<GutProfile | null>(null);
  const [loading, setLoading] = useState(false);

  // Entrance animation
  const contentAnim = useRef(new Animated.Value(0)).current;

  // Delayed button animation
  const buttonOpacity = useRef(new Animated.Value(0)).current;
  const buttonTranslateY = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    // Load answers and compute profile
    AsyncStorage.getItem('onboarding_answers').then((raw) => {
      const answers: Record<string, string> = raw ? JSON.parse(raw) : {};
      setProfile(computeProfile(answers));
    });

    // Fade in content
    Animated.timing(contentAnim, {
      toValue: 1,
      duration: 600,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();

    // Delayed button entrance
    const buttonTimer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(buttonOpacity, {
          toValue: 1,
          duration: 480,
          useNativeDriver: true,
        }),
        Animated.timing(buttonTranslateY, {
          toValue: 0,
          duration: 480,
          useNativeDriver: true,
        }),
      ]).start();
    }, 2500);

    return () => clearTimeout(buttonTimer);
  }, [contentAnim, buttonOpacity, buttonTranslateY]);

  const completeOnboarding = async () => {
    if (!user || loading) return;
    setLoading(true);
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
          gut_concern: answers.main_symptom ?? null,
          symptom_frequency: answers.frequency ?? null,
          goal: answers.goal ?? null,
          display_name: name || undefined,
        })
        .eq('id', user.id);

      await refreshProfile();
      router.replace('/(tabs)');
    } finally {
      setLoading(false);
    }
  };

  if (!profile) {
    return (
      <View style={styles.loadingContainer}>
        <LinearGradient colors={['#0B1F14', '#1B4332']} style={StyleSheet.absoluteFill} />
        <ActivityIndicator color="#52B788" size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <LinearGradient colors={['#0B1F14', '#1B4332']} style={StyleSheet.absoluteFill} />
      <StarFieldBackground count={150} seed={33} />

      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Animated.View style={[styles.contentWrapper, { opacity: contentAnim }]}>
            {/* Label */}
            <Text style={styles.profileLabel}>YOUR GUT HEALTH PROFILE</Text>

            {/* Profile card */}
            <View style={styles.profileCard}>
              <Text style={styles.profileEmoji}>{profile.emoji}</Text>
              <Text style={styles.profileType}>{profile.type}</Text>
              <View style={[styles.profileUnderline, { backgroundColor: profile.color }]} />
              <Text style={styles.profileDescription}>{profile.description}</Text>
            </View>

            {/* Divider */}
            <View style={styles.divider} />

            {/* What happens next */}
            <View style={styles.nextSection}>
              <Text style={styles.nextTitle}>WHAT HAPPENS NEXT</Text>
              {NEXT_STEPS.map((step, i) => (
                <View key={i} style={styles.nextRow}>
                  <View style={styles.checkCircle}>
                    <Ionicons name="checkmark" size={14} color="#52B788" />
                  </View>
                  <Text style={styles.nextText}>{step}</Text>
                </View>
              ))}
            </View>

            {/* Spacer so button doesn't overlap content */}
            <View style={styles.bottomSpacer} />
          </Animated.View>
        </ScrollView>

        {/* Delayed CTA button */}
        <Animated.View
          style={[
            styles.bottomCTA,
            {
              opacity: buttonOpacity,
              transform: [{ translateY: buttonTranslateY }],
            },
          ]}
        >
          <TouchableOpacity
            style={styles.ctaButton}
            onPress={completeOnboarding}
            disabled={loading}
            activeOpacity={0.88}
          >
            {loading ? (
              <ActivityIndicator color="#0B1F14" size="small" />
            ) : (
              <Text style={styles.ctaText}>I'm Ready to Start</Text>
            )}
          </TouchableOpacity>
        </Animated.View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  safeArea: {
    flex: 1,
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 28,
  },
  contentWrapper: {
    flex: 1,
    alignItems: 'center',
  },
  profileLabel: {
    fontFamily: FontFamily.sansMedium,
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 2,
    marginTop: 60,
    textAlign: 'center',
  },
  profileCard: {
    marginTop: 28,
    alignItems: 'center',
    width: '100%',
  },
  profileEmoji: {
    fontSize: 72,
    textAlign: 'center',
  },
  profileType: {
    fontFamily: FontFamily.displayBold,
    fontSize: 38,
    color: '#FFFFFF',
    textAlign: 'center',
    marginTop: 16,
  },
  profileUnderline: {
    height: 3,
    width: 80,
    borderRadius: 2,
    marginTop: 10,
    alignSelf: 'center',
  },
  profileDescription: {
    fontFamily: FontFamily.sansRegular,
    fontSize: 17,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
    lineHeight: 26,
    marginTop: 20,
    maxWidth: 310,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    width: '100%',
    marginTop: 36,
    marginHorizontal: 24,
  },
  nextSection: {
    marginTop: 28,
    width: '100%',
  },
  nextTitle: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: 14,
    color: '#FFFFFF',
    marginBottom: 16,
    letterSpacing: 0.5,
  },
  nextRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 14,
  },
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(82,183,136,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(82,183,136,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  nextText: {
    fontFamily: FontFamily.sansRegular,
    fontSize: 14,
    color: 'rgba(255,255,255,0.75)',
    flex: 1,
    lineHeight: 20,
  },
  bottomSpacer: {
    height: 120,
  },
  bottomCTA: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: 32,
    paddingHorizontal: 24,
  },
  ctaButton: {
    width: '100%',
    height: 60,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  ctaText: {
    fontFamily: FontFamily.sansBold,
    fontSize: 17,
    color: '#0B1F14',
    letterSpacing: -0.3,
  },
});
