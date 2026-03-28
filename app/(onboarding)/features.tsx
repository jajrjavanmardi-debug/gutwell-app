import React, { useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
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
import { FontFamily } from '../../constants/theme';
import StarFieldBackground from '../../components/StarFieldBackground';

const { width } = Dimensions.get('window');

const SLIDES = [
  {
    icon: 'analytics-outline' as const,
    title: 'Your Daily Gut Score',
    description:
      'Every check-in generates a personal gut score. Watch it climb as you learn what works for your body.',
  },
  {
    icon: 'restaurant-outline' as const,
    title: 'Connect Food & Symptoms',
    description:
      'Log meals and discover which foods trigger discomfort and which ones make you thrive — with real data.',
  },
  {
    icon: 'trending-up-outline' as const,
    title: 'Spot Patterns Instantly',
    description:
      'Our engine connects the dots between your food, mood, sleep, and symptoms so you never have to guess again.',
  },
  {
    icon: 'shield-checkmark-outline' as const,
    title: 'Your Privacy, Protected',
    description:
      'Your gut data is sensitive. It stays encrypted, on your terms. We never sell your health information.',
  },
];

const FADE_OUT_MS = 150;
const FADE_IN_MS = 250;

export default function FeaturesScreen() {
  const [currentSlide, setCurrentSlide] = useState(0);
  const contentOpacity = useRef(new Animated.Value(1)).current;
  const dotWidths = useRef(SLIDES.map((_, i) => new Animated.Value(i === 0 ? 24 : 8))).current;

  const isLast = currentSlide === SLIDES.length - 1;

  const advanceSlide = () => {
    if (isLast) {
      router.push('/(onboarding)/about');
      return;
    }

    Animated.timing(contentOpacity, {
      toValue: 0,
      duration: FADE_OUT_MS,
      useNativeDriver: true,
    }).start(() => {
      const next = currentSlide + 1;
      setCurrentSlide(next);

      // Animate dots
      SLIDES.forEach((_, i) => {
        Animated.timing(dotWidths[i], {
          toValue: i === next ? 24 : 8,
          duration: 200,
          useNativeDriver: false,
        }).start();
      });

      Animated.timing(contentOpacity, {
        toValue: 1,
        duration: FADE_IN_MS,
        useNativeDriver: true,
      }).start();
    });
  };

  const slide = SLIDES[currentSlide];

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <LinearGradient colors={['#0B1F14', '#1B4332']} style={StyleSheet.absoluteFill} />
      <StarFieldBackground count={120} seed={77} />

      <SafeAreaView edges={['top']} style={styles.safeTop}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </SafeAreaView>

      {/* Slide content */}
      <Animated.View style={[styles.slideContent, { opacity: contentOpacity }]}>
        <View style={styles.iconCircle}>
          <Ionicons name={slide.icon} size={48} color="#52B788" />
        </View>
        <Text style={styles.title}>{slide.title}</Text>
        <Text style={styles.description}>{slide.description}</Text>
      </Animated.View>

      {/* Bottom section */}
      <View style={styles.bottomSection}>
        {/* Pagination dots */}
        <View style={styles.dotsRow}>
          {SLIDES.map((_, i) => (
            <Animated.View
              key={i}
              style={[
                styles.dot,
                i === currentSlide ? styles.dotActive : styles.dotInactive,
                { width: dotWidths[i] },
              ]}
            />
          ))}
        </View>

        {/* Continue button */}
        <TouchableOpacity
          style={[styles.continueButton, isLast && styles.continueButtonLast]}
          onPress={advanceSlide}
          activeOpacity={0.88}
        >
          <Text style={[styles.continueText, isLast && styles.continueTextLast]}>
            {isLast ? "Let's Personalise" : 'Continue'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeTop: {
    paddingHorizontal: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  slideContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  iconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(82,183,136,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(82,183,136,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontFamily: FontFamily.displayBold,
    fontSize: 30,
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 38,
    marginTop: 32,
    paddingHorizontal: 24,
  },
  description: {
    fontFamily: FontFamily.sansRegular,
    fontSize: 16,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    lineHeight: 25,
    marginTop: 16,
    maxWidth: 300,
  },
  bottomSection: {
    paddingBottom: 40,
    paddingHorizontal: 24,
    gap: 24,
    alignItems: 'center',
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
  dotActive: {
    backgroundColor: '#52B788',
  },
  dotInactive: {
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  continueButton: {
    width: '100%',
    height: 60,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  continueButtonLast: {
    backgroundColor: '#FFFFFF',
    borderWidth: 0,
  },
  continueText: {
    fontFamily: FontFamily.sansBold,
    fontSize: 17,
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  continueTextLast: {
    color: '#0B1F14',
  },
});
