import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
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
import { useLanguage } from '../../contexts/LanguageContext';
import { ONBOARDING_COPY, type OnboardingQuestionKey } from '../../constants/onboarding-copy';
import { FontFamily } from '../../constants/theme';
import StarFieldBackground from '../../components/StarFieldBackground';

const FADE_OUT_MS = 280;
const FADE_IN_MS = 380;
const STAGGER_MS = 60;
const OPTION_ANIM_MS = 300;

export default function QuestionsScreen() {
  const { language, isRtl } = useLanguage();
  const copy = ONBOARDING_COPY[language].questions;
  const questions = copy.items;
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<Record<OnboardingQuestionKey, string> | Record<string, string>>({});
  const [contentOpacity] = useState(new Animated.Value(1));
  const progressAnim = useRef(new Animated.Value(1 / questions.length)).current;

  const optionAnims = useRef<Animated.Value[]>([]);
  const question = questions[currentQuestion];

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
  }, [currentQuestion, question.options.length]);

  const handleOptionPress = async (optionValue: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newAnswers = { ...answers, [question.key]: optionValue };
    setAnswers(newAnswers);

    await AsyncStorage.setItem('onboarding_answers', JSON.stringify(newAnswers));

    const isLast = currentQuestion === questions.length - 1;

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

      Animated.timing(progressAnim, {
        toValue: (next + 1) / questions.length,
        duration: 300,
        useNativeDriver: false,
      }).start();

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
          toValue: (prev + 1) / questions.length,
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
        <View style={[styles.progressTrack, isRtl && styles.progressTrackRtl]}>
          <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
        </View>

        <View style={[styles.headerRow, isRtl && styles.rtlRow]}>
          <TouchableOpacity
            style={[styles.backButton, isRtl && styles.backButtonRtl]}
            onPress={handleBack}
            activeOpacity={0.7}
          >
            <Ionicons name={isRtl ? 'chevron-forward' : 'chevron-back'} size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={[styles.questionCount, isRtl && styles.rtlText]}>
            {copy.count(currentQuestion + 1, questions.length)}
          </Text>
          <View style={styles.backButton} />
        </View>
      </SafeAreaView>

      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Animated.View style={[styles.questionWrapper, { opacity: contentOpacity }]}>
          <Text style={[styles.questionText, isRtl && styles.rtlText]}>{question.question}</Text>

          {question.subtitle !== null ? (
            <Text style={[styles.subtitleText, isRtl && styles.rtlText]}>{question.subtitle}</Text>
          ) : null}

          <View style={[styles.optionsContainer, question.subtitle === null && styles.optionsNoSubtitle]}>
            {question.options.map((option, index) => {
              const anim = optionAnims.current[index] ?? new Animated.Value(1);
              return (
                <Animated.View
                  key={`${currentQuestion}-${option.value}`}
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
                    style={[styles.optionButton, isRtl && styles.optionButtonRtl]}
                    onPress={() => handleOptionPress(option.value)}
                    activeOpacity={0.75}
                  >
                    <View style={styles.emojiCircle}>
                      <Text style={styles.emojiText}>{option.emoji}</Text>
                    </View>
                    <Text style={[styles.optionText, isRtl && styles.optionTextRtl]}>
                      {option.label}
                    </Text>
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
    alignItems: 'flex-start',
  },
  progressTrackRtl: {
    alignItems: 'flex-end',
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
  backButtonRtl: {
    alignItems: 'flex-end',
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
    lineHeight: 21,
  },
  optionsContainer: {
    marginTop: 28,
    gap: 10,
  },
  optionsNoSubtitle: {
    marginTop: 28,
  },
  optionButton: {
    minHeight: 58,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  optionButtonRtl: {
    flexDirection: 'row-reverse',
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
    lineHeight: 21,
  },
  optionTextRtl: {
    marginLeft: 0,
    marginRight: 14,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  rtlRow: {
    flexDirection: 'row-reverse',
  },
  rtlText: {
    textAlign: 'right',
    writingDirection: 'rtl',
  },
});
