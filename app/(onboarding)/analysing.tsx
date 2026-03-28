import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { FontFamily } from '../../constants/theme';
import StarFieldBackground from '../../components/StarFieldBackground';

const ANALYSIS_STEPS = [
  'Reviewing your gut profile...',
  'Identifying your symptom patterns...',
  'Mapping your food-energy connections...',
  'Building your personalised plan...',
];

export default function AnalysingScreen() {
  const progressAnim = useRef(new Animated.Value(0)).current;
  const contentFade = useRef(new Animated.Value(0)).current;
  const [stepIndex, setStepIndex] = useState(0);
  const stepFade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Fade in content
    Animated.timing(contentFade, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();

    // Progress bar animation over 2400ms
    Animated.timing(progressAnim, {
      toValue: 1,
      duration: 2400,
      easing: Easing.inOut(Easing.quad),
      useNativeDriver: false,
    }).start();

    // Step cycling every 600ms
    let step = 0;
    const interval = setInterval(() => {
      step++;
      if (step >= ANALYSIS_STEPS.length) {
        clearInterval(interval);
        return;
      }
      // Cross-fade to next step
      Animated.timing(stepFade, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }).start(() => {
        setStepIndex(step);
        Animated.timing(stepFade, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }).start();
      });
    }, 600);

    // Navigate after 2600ms
    const navTimer = setTimeout(() => {
      router.replace('/(onboarding)/results');
    }, 2600);

    return () => {
      clearInterval(interval);
      clearTimeout(navTimer);
    };
  }, []);

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <LinearGradient colors={['#0B1F14', '#1B4332']} style={StyleSheet.absoluteFill} />
      <StarFieldBackground count={120} seed={44} />

      <Animated.View style={[styles.content, { opacity: contentFade }]}>
        {/* Icon */}
        <View style={styles.iconRing}>
          <Text style={styles.iconEmoji}>🔬</Text>
        </View>

        {/* Title */}
        <Text style={styles.title}>Analysing your answers</Text>

        {/* Progress bar */}
        <View style={styles.progressTrack}>
          <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
        </View>

        {/* Step label */}
        <Animated.Text style={[styles.stepLabel, { opacity: stepFade }]}>
          {ANALYSIS_STEPS[stepIndex]}
        </Animated.Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { width: '100%', alignItems: 'center', paddingHorizontal: 40 },
  iconRing: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(82,183,136,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(82,183,136,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 32,
  },
  iconEmoji: { fontSize: 40 },
  title: {
    fontFamily: FontFamily.displayBold,
    fontSize: 28,
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 36,
    lineHeight: 36,
  },
  progressTrack: {
    width: '100%',
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 20,
  },
  progressFill: {
    height: 4,
    backgroundColor: '#52B788',
    borderRadius: 2,
  },
  stepLabel: {
    fontFamily: FontFamily.sansRegular,
    fontSize: 14,
    color: 'rgba(255,255,255,0.55)',
    textAlign: 'center',
  },
});
