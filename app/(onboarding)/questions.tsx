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
import { FontFamily } from '../../constants/theme';
import StarFieldBackground from '../../components/StarFieldBackground';

const { width } = Dimensions.get('window');

const QUESTIONS = [
  {
    key: 'frequency',
    question: 'How often do you experience digestive symptoms?',
    options: ['Almost every day', 'A few times a week', 'Once a week or less', 'Rarely'],
  },
  {
    key: 'main_symptom',
    question: 'Which symptom bothers you most?',
    options: [
      'Bloating & gas',
      'Stomach pain or cramps',
      'Irregular bowel habits',
      'Food sensitivities',
      'Low energy after eating',
    ],
  },
  {
    key: 'diet',
    question: 'How would you describe your current diet?',
    options: [
      'Very clean & consistent',
      'Mostly healthy',
      'Mixed — some good, some bad',
      'I eat whatever I want',
    ],
  },
  {
    key: 'stress',
    question: 'How stressed are you in day-to-day life?',
    options: [
      'Highly stressed',
      'Moderately stressed',
      'Occasionally stressed',
      'Rarely stressed',
    ],
  },
  {
    key: 'goal',
    question: "What's your main goal with GutWell?",
    options: [
      'Identify food triggers',
      'Reduce bloating & pain',
      'Build consistent habits',
      'Improve energy & mood',
      'Overall gut wellness',
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
        router.push('/(onboarding)/results');
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
          {/* Spacer to center count label */}
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

          {/* Options */}
          <View style={styles.optionsContainer}>
            {question.options.map((option, index) => {
              const anim = optionAnims.current[index] ?? new Animated.Value(1);
              return (
                <Animated.View
                  key={`${currentQuestion}-${option}`}
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
                    onPress={() => handleOptionPress(option)}
                    activeOpacity={0.75}
                  >
                    <Text style={styles.optionText}>{option}</Text>
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
  optionsContainer: {
    marginTop: 28,
    gap: 10,
  },
  optionButton: {
    height: 58,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  optionText: {
    fontFamily: FontFamily.sansMedium,
    fontSize: 16,
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
});
