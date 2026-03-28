import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { Colors, Spacing, FontSize, FontFamily, BorderRadius } from '../../constants/theme';
import StarFieldBackground from '../../components/StarFieldBackground';

const { width } = Dimensions.get('window');

// ─── Carousel info slides ───────────────────────────────────────────────────
const INFO_SLIDES = [
  {
    icon: 'heart' as const,
    title: 'Welcome to GutWell',
    description:
      'Stop guessing. Start knowing. Track your gut to discover exactly what makes you feel your best.',
  },
  {
    icon: 'body' as const,
    title: 'Quick Daily Check-ins',
    description:
      'Every check-in reveals patterns. Stool type, bloating, pain, energy \u2014 it takes less than a minute.',
  },
  {
    icon: 'restaurant' as const,
    title: 'Connect Food & Symptoms',
    description:
      'Log your meals and see which foods energize you and which ones trigger discomfort.',
  },
  {
    icon: 'trending-up' as const,
    title: 'Your Personal Gut Score',
    description:
      'Watch your health improve over time. First patterns emerge after just 14 days of tracking.',
  },
];

// ─── Questionnaire slides ───────────────────────────────────────────────────
type QuestionnaireSlide = {
  key: 'gut_concern' | 'symptom_frequency' | 'goal';
  title: string;
  options: string[];
};

const QUESTIONNAIRE_SLIDES: QuestionnaireSlide[] = [
  {
    key: 'gut_concern',
    title: "What's your main gut concern?",
    options: ['Bloating', 'Pain', 'Irregular', 'Food Sensitivity', 'General Wellness'],
  },
  {
    key: 'symptom_frequency',
    title: 'How often do you experience symptoms?',
    options: ['Daily', 'Few times/week', 'Weekly', 'Rarely'],
  },
  {
    key: 'goal',
    title: "What's your goal?",
    options: ['Identify Triggers', 'Improve Digestion', 'Track Patterns', 'Overall Wellness'],
  },
];

const TOTAL_SLIDES = INFO_SLIDES.length + QUESTIONNAIRE_SLIDES.length;

export default function WelcomeScreen() {
  const { user, refreshProfile } = useAuth();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [loading, setLoading] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const isInfoSlide = currentSlide < INFO_SLIDES.length;
  const isLast = currentSlide === TOTAL_SLIDES - 1;
  const questionnaireIndex = currentSlide - INFO_SLIDES.length;

  const selectAnswer = (key: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  };

  const completeOnboarding = async () => {
    if (!user) return;
    setLoading(true);
    await supabase
      .from('profiles')
      .update({
        onboarding_completed: true,
        gut_concern: answers.gut_concern ?? null,
        symptom_frequency: answers.symptom_frequency ?? null,
        goal: answers.goal ?? null,
      })
      .eq('id', user.id);
    await refreshProfile();
    setLoading(false);
    router.replace('/(tabs)');
  };

  const handleNext = async () => {
    if (isLast) {
      await completeOnboarding();
      return;
    }
    // For questionnaire slides, require an answer before advancing
    if (!isInfoSlide) {
      const q = QUESTIONNAIRE_SLIDES[questionnaireIndex];
      if (!answers[q.key]) return;
    }
    setCurrentSlide(currentSlide + 1);
  };

  const handleSkip = async () => {
    await completeOnboarding();
  };

  // ─── Render helpers ──────────────────────────────────────────────────────
  const renderInfoSlide = () => {
    const slide = INFO_SLIDES[currentSlide];
    return (
      <View style={styles.slideContent}>
        <View style={styles.iconCircle}>
          <Ionicons name={slide.icon} size={52} color={Colors.textInverse} />
        </View>
        <Text style={styles.title}>{slide.title}</Text>
        <Text style={styles.description}>{slide.description}</Text>
      </View>
    );
  };

  const renderQuestionnaireSlide = () => {
    const q = QUESTIONNAIRE_SLIDES[questionnaireIndex];
    const selected = answers[q.key];
    return (
      <View style={styles.slideContent}>
        <Text style={styles.questionTitle}>{q.title}</Text>
        <View style={styles.optionsContainer}>
          {q.options.map((option) => {
            const isSelected = selected === option;
            return (
              <TouchableOpacity
                key={option}
                style={[styles.optionButton, isSelected && styles.optionButtonSelected]}
                onPress={() => selectAnswer(q.key, option)}
                activeOpacity={0.7}
              >
                <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>
                  {option}
                </Text>
                {isSelected && (
                  <Ionicons name="checkmark-circle" size={22} color={Colors.secondary} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  };

  // ─── Determine CTA state ─────────────────────────────────────────────────
  const canAdvance =
    isInfoSlide || (QUESTIONNAIRE_SLIDES[questionnaireIndex] && answers[QUESTIONNAIRE_SLIDES[questionnaireIndex].key]);

  const ctaLabel = isLast ? 'Get Started' : 'Continue';

  return (
    <LinearGradient
      colors={[Colors.onboardingGradientStart, Colors.onboardingGradientEnd]}
      style={styles.container}
    >
      <StarFieldBackground count={150} opacityVariation={0.2} seed={77} />
      {/* Slide area */}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {isInfoSlide ? renderInfoSlide() : renderQuestionnaireSlide()}
      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        {/* Dots */}
        <View style={styles.dots}>
          {Array.from({ length: TOTAL_SLIDES }).map((_, i) => (
            <View
              key={i}
              style={[styles.dot, i === currentSlide && styles.dotActive]}
            />
          ))}
        </View>

        {/* Primary CTA */}
        <TouchableOpacity
          style={[styles.ctaButton, !canAdvance && styles.ctaButtonDisabled]}
          onPress={handleNext}
          disabled={loading || !canAdvance}
          activeOpacity={0.8}
        >
          {loading ? (
            <Text style={styles.ctaText}>...</Text>
          ) : (
            <Text style={styles.ctaText}>{ctaLabel}</Text>
          )}
        </TouchableOpacity>

        {/* Skip */}
        {!isLast && (
          <TouchableOpacity
            style={styles.skipButton}
            onPress={handleSkip}
            disabled={loading}
            activeOpacity={0.7}
          >
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>
        )}
      </View>
    </LinearGradient>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xxl,
  },
  slideContent: {
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
  },

  // ── Info slides ──
  iconCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  title: {
    fontFamily: FontFamily.displayRegular,
    fontSize: FontSize.hero,
    color: Colors.textInverse,
    textAlign: 'center',
    marginBottom: Spacing.md,
    lineHeight: 42,
  },
  description: {
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.md,
    color: 'rgba(255,255,255,0.75)',
    textAlign: 'center',
    lineHeight: 24,
    maxWidth: width * 0.85,
  },

  // ── Questionnaire slides ──
  questionTitle: {
    fontFamily: FontFamily.displayRegular,
    fontSize: FontSize.xxl,
    color: Colors.textInverse,
    textAlign: 'center',
    marginBottom: Spacing.xl,
    lineHeight: 36,
  },
  optionsContainer: {
    width: '100%',
    gap: Spacing.sm,
  },
  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.25)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  optionButtonSelected: {
    borderColor: Colors.secondary,
    backgroundColor: 'rgba(82,183,136,0.15)',
  },
  optionText: {
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.md,
    color: 'rgba(255,255,255,0.85)',
  },
  optionTextSelected: {
    color: Colors.textInverse,
    fontFamily: FontFamily.sansSemiBold,
  },

  // ── Footer ──
  footer: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xxl,
    paddingTop: Spacing.lg,
    alignItems: 'center',
    gap: Spacing.md,
  },
  dots: {
    flexDirection: 'row',
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  dotActive: {
    backgroundColor: Colors.secondary,
    width: 24,
  },

  // ── Buttons ──
  ctaButton: {
    width: '100%',
    paddingVertical: 18,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaButtonDisabled: {
    opacity: 0.4,
  },
  ctaText: {
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.md,
    color: Colors.textInverse,
    letterSpacing: 0.5,
  },
  skipButton: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.3)',
    backgroundColor: 'transparent',
  },
  skipText: {
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.sm,
    color: 'rgba(255,255,255,0.7)',
  },
});
