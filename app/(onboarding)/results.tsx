import React, { useEffect, useRef, useState } from 'react';
import {
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
import { FontFamily } from '../../constants/theme';
import StarFieldBackground from '../../components/StarFieldBackground';

type GutProfile = {
  type: string;
  emoji: string;
  color: string;
  description: string;
};

function computeProfile(answers: Record<string, string>): GutProfile {
  const meal = answers.meal_feeling ?? '';
  const bloating = answers.bloating_frequency ?? '';
  const energy = answers.energy_after_lunch ?? '';
  const knowledge = answers.food_knowledge ?? '';

  const hasSevereSymptoms =
    meal === 'Bloated or uncomfortable' ||
    bloating === 'Every single day' ||
    bloating === 'A few times a week';

  const hasEnergyIssues =
    energy === 'I crash — need caffeine or a rest' ||
    energy === 'Noticeable slump but I push through';

  const lacksKnowledge =
    knowledge === 'I have no idea' ||
    knowledge === "I suspect a few but can't be sure";

  if (hasSevereSymptoms && hasEnergyIssues) {
    return {
      type: 'Reactive Gut',
      emoji: '⚡',
      color: '#E07A5F',
      description:
        "Your gut reacts strongly to food and stress — often leaving you drained. The good news: reactive guts respond fast to the right changes.",
    };
  }
  if (hasSevereSymptoms && lacksKnowledge) {
    return {
      type: 'Sensitive Gut',
      emoji: '🌿',
      color: '#52B788',
      description:
        "Your gut is sensitive, but without knowing your triggers you're flying blind. Just 14 days of tracking will change everything.",
    };
  }
  if (hasEnergyIssues) {
    return {
      type: 'Energy-Depleted',
      emoji: '🔋',
      color: '#D4A373',
      description:
        "Your gut-energy connection is disrupted. What you eat is directly affecting how you feel and perform. GutWell will show you exactly how.",
    };
  }
  return {
    type: 'Optimisation Mode',
    emoji: '🎯',
    color: '#74C69D',
    description:
      "Your gut is in decent shape — you're here to fine-tune, eliminate subtle triggers, and operate at your peak. Smart move.",
  };
}

const NEXT_STEPS = [
  'Your gut score recalculates with every check-in',
  'Food-symptom patterns emerge after 7 days',
  'Weekly digests show what\'s changing and why',
];

export default function ResultsScreen() {
  const [profile, setProfile] = useState<GutProfile | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  // Entrance animation
  const contentAnim = useRef(new Animated.Value(0)).current;

  // Button always visible (no delayed animation to avoid invisible CTA)
  const buttonOpacity = useRef(new Animated.Value(1)).current;
  const buttonTranslateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Load answers and compute profile
    AsyncStorage.getItem('onboarding_answers').then((raw) => {
      const parsed: Record<string, string> = raw ? JSON.parse(raw) : {};
      setAnswers(parsed);
      setProfile(computeProfile(parsed));
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

  if (!profile) {
    return (
      <View style={styles.loadingContainer}>
        <LinearGradient colors={['#0B1F14', '#1B4332']} style={StyleSheet.absoluteFill} />
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
              {answers.goal ? (
                <View style={styles.nextRow}>
                  <View style={styles.checkCircle}>
                    <Ionicons name="checkmark" size={14} color="#52B788" />
                  </View>
                  <Text style={styles.nextTextGoal}>{'Your goal: ' + answers.goal}</Text>
                </View>
              ) : null}
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
            onPress={() => router.push('/(onboarding)/notifications')}
            activeOpacity={0.88}
          >
            <Text style={styles.ctaText}>I'm Ready to Start</Text>
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
  nextTextGoal: {
    fontFamily: FontFamily.sansMedium,
    fontSize: 14,
    color: '#52B788',
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
