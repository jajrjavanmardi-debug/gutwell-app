import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
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
import * as Haptics from 'expo-haptics';
import { FontFamily } from '../../constants/theme';
import StarFieldBackground from '../../components/StarFieldBackground';

const { width } = Dimensions.get('window');

type Option = {
  label: string;
  emoji: string;
};

type Question = {
  key: string;
  question: string;
  subtitle: string | null;
  options: Option[];
};

const QUESTIONS: Question[] = [
  {
    key: 'meal_feeling',
    question: 'How do you feel after most meals?',
    subtitle: 'Be honest — think about your last 7 days.',
    options: [
      { label: 'Bloated or uncomfortable', emoji: '😩' },
      { label: 'Unpredictable — sometimes fine, sometimes not', emoji: '😕' },
      { label: 'Mostly okay, occasionally off', emoji: '😐' },
      { label: 'Generally comfortable', emoji: '😊' },
    ],
  },
  {
    key: 'bloating_frequency',
    question: 'How often do you deal with bloating or gas?',
    subtitle: null,
    options: [
      { label: 'Every single day', emoji: '😮‍💨' },
      { label: 'A few times a week', emoji: '😤' },
      { label: 'Occasionally', emoji: '🤷' },
      { label: 'Rarely or never', emoji: '✅' },
    ],
  },
  {
    key: 'social_impact',
    question: 'Has your gut ever held you back from enjoying something?',
    subtitle: 'A meal out, travel, a social event — anything.',
    options: [
      { label: 'Yes, it affects my life regularly', emoji: '😔' },
      { label: 'Sometimes I plan around it', emoji: '🗓️' },
      { label: 'Once or twice', emoji: '🤔' },
      { label: 'Not really', emoji: '👋' },
    ],
  },
  {
    key: 'energy_after_lunch',
    question: 'How do you feel 1–2 hours after eating?',
    subtitle: 'Your digestion directly impacts your energy levels.',
    options: [
      { label: 'I crash — need caffeine or a rest', emoji: '😴' },
      { label: 'Noticeable slump but I push through', emoji: '😪' },
      { label: 'Slight dip, nothing major', emoji: '😑' },
      { label: 'I feel energised and clear', emoji: '⚡' },
    ],
  },
  {
    key: 'sleep_quality',
    question: 'How well do you sleep most nights?',
    subtitle: 'Poor gut health is one of the leading causes of disrupted sleep.',
    options: [
      { label: 'Poorly — I wake up or feel unrested', emoji: '🌙' },
      { label: 'Light or broken sleep', emoji: '😶' },
      { label: 'Decent, with some off nights', emoji: '🙂' },
      { label: 'I sleep well consistently', emoji: '💤' },
    ],
  },
  {
    key: 'food_knowledge',
    question: 'Do you know which specific foods trigger your symptoms?',
    subtitle: "Most people with gut issues have no idea — yet.",
    options: [
      { label: 'I have no idea', emoji: '❓' },
      { label: "I suspect a few but can't be sure", emoji: '🔍' },
      { label: "I've narrowed it down somewhat", emoji: '📋' },
      { label: 'I know my triggers well', emoji: '✅' },
    ],
  },
  {
    key: 'goal',
    question: 'What matters most to you right now?',
    subtitle: "We'll personalise your plan around this.",
    options: [
      { label: 'Eat freely without fear or consequences', emoji: '🍽️' },
      { label: 'Finally identify my food triggers', emoji: '🎯' },
      { label: 'Have consistent energy all day', emoji: '⚡' },
      { label: 'Build better gut health habits', emoji: '🌿' },
    ],
  },
];

const FADE_OUT_MS = 280;
const FADE_IN_MS = 380;
const STAGGER_MS = 60;
const OPTION_ANIM_MS = 300;

export default function QuestionsScreen() {
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [contentOpacity] = useState(new Animated.Value(1));
  const progressAnim = useRef(new Animated.Value(1 / QUESTIONS.length)).current;

  // Option stagger animations — reset when question changes
  const optionAnims = useRef<Animated.Value[]>([]);

  const question = QUESTIONS[currentQuestion];

  // Build option animations for current question
  const initOptionAnims = (count: number) => {
    optionAnims.current = Array.from({ length: count }, () => new Animated.Value(0));
    Animated.stagger(
      STAGGER_MS,
      optionAnims.current.map((anim) =>
        Animated.timing(anim, {
          toValue: 1,
          duration: OPTION_ANIM_MS,
          useNativeDriver: true,
        })
      )
    ).start();
  };

  useEffect(() => {
    initOptionAnims(question.options.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentQuestion]);

  const handleOptionPress = async (option: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newAnswers = { ...answers, [question.key]: option };
    setAnswers(newAnswers);

    // Save progressively
    await AsyncStorage.setItem('onboarding_answers', JSON.stringify(newAnswers));

    const isLast = currentQuestion === QUESTIONS.length - 1;

    // Fade out content
    Animated.timing(contentOpacity, {
      toValue: 0,
      duration: FADE_OUT_MS,
      useNativeDriver: true,
    }).start(() => {
      if (isLast) {
        router.push('/(onboarding)/analysing');
        return;
      }

      const next = currentQuestion + 1;
      setCurrentQuestion(next);

      // Animate progress bar
      Animated.timing(progressAnim, {
        toValue: (next + 1) / QUESTIONS.length,
        duration: 300,
        useNativeDriver: false,
      }).start();

      // Fade in
      Animated.timing(contentOpacity, {
        toValue: 1,
        duration: FADE_IN_MS,
        useNativeDriver: true,
      }).start();
    });
  };

  const handleBack = () => {
    if (currentQuestion === 0) {
      router.back();
    } else {
      Animated.timing(contentOpacity, {
        toValue: 0,
        duration: FADE_OUT_MS,
        useNativeDriver: true,
      }).start(() => {
        const prev = currentQuestion - 1;
        setCurrentQuestion(prev);

        Animated.timing(progressAnim, {
          toValue: (prev + 1) / QUESTIONS.length,
          duration: 300,
          useNativeDriver: false,
        }).start();

        Animated.timing(contentOpacity, {
          toValue: 1,
          duration: FADE_IN_MS,
          useNativeDriver: true,
        }).start();
      });
    }
  };

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <LinearGradient colors={['#0B1F14', '#1B4332']} style={StyleSheet.absoluteFill} />
      <StarFieldBackground count={120} seed={99} />

      <SafeAreaView edges={['top']} style={styles.safeTop}>
        {/* Progress bar */}
        <View style={styles.progressTrack}>
          <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
        </View>

        {/* Header row */}
        <View style={styles.headerRow}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={handleBack}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.questionCount}>
            Question {currentQuestion + 1} of {QUESTIONS.length}
          </Text>
          {/* Spacer to centre count label */}
          <View style={styles.backButton} />
        </View>
      </SafeAreaView>

      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Question text */}
        <Animated.View style={[styles.questionWrapper, { opacity: contentOpacity }]}>
          <Text style={styles.questionText}>{question.question}</Text>

          {question.subtitle !== null ? (
            <Text style={styles.subtitleText}>{question.subtitle}</Text>
          ) : null}

          {/* Options */}
          <View style={[styles.optionsContainer, question.subtitle === null && styles.optionsNoSubtitle]}>
            {question.options.map((option, index) => {
              const anim = optionAnims.current[index] ?? new Animated.Value(1);
              return (
                <Animated.View
                  key={`${currentQuestion}-${option.label}`}
                  style={{
                    opacity: anim,
                    transform: [
                      {
                        translateY: anim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [12, 0],
                        }),
                      },
                    ],
                  }}
                >
                  <TouchableOpacity
                    style={styles.optionButton}
                    onPress={() => handleOptionPress(option.label)}
                    activeOpacity={0.75}
                  >
                    <View style={styles.emojiCircle}>
                      <Text style={styles.emojiText}>{option.emoji}</Text>
                    </View>
                    <Text style={styles.optionText}>{option.label}</Text>
                  </TouchableOpacity>
                </Animated.View>
              );
            })}
          </View>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeTop: {
    paddingHorizontal: 24,
  },
  progressTrack: {
    width: '100%',
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 2,
    marginTop: 16,
    marginBottom: 8,
    overflow: 'hidden',
  },
  progressFill: {
    height: 4,
    backgroundColor: '#52B788',
    borderRadius: 2,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    marginBottom: 4,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  questionCount: {
    fontFamily: FontFamily.sansMedium,
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 40,
  },
  questionWrapper: {
    paddingHorizontal: 24,
    marginTop: 32,
  },
  questionText: {
    fontFamily: FontFamily.displayRegular,
    fontSize: 28,
    color: '#FFFFFF',
    lineHeight: 38,
  },
  subtitleText: {
    fontFamily: FontFamily.sansRegular,
    fontSize: 14,
    color: 'rgba(255,255,255,0.55)',
    marginTop: 8,
    marginBottom: 20,
  },
  optionsContainer: {
    marginTop: 28,
    gap: 10,
  },
  optionsNoSubtitle: {
    marginTop: 28,
  },
  optionButton: {
    height: 58,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },
  emojiCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emojiText: {
    fontSize: 18,
  },
  optionText: {
    flex: 1,
    fontFamily: FontFamily.sansMedium,
    fontSize: 15,
    color: '#FFFFFF',
    letterSpacing: -0.3,
    marginLeft: 14,
  },
});
