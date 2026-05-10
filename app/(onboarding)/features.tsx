import React, { useRef, useState } from 'react';
import {
  Animated,
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
import { useLanguage } from '../../contexts/LanguageContext';
import { ONBOARDING_COPY } from '../../constants/onboarding-copy';
import { FontFamily } from '../../constants/theme';
import StarFieldBackground from '../../components/StarFieldBackground';

const FADE_OUT_MS = 150;
const FADE_IN_MS = 250;

export default function FeaturesScreen() {
  const { language, isRtl } = useLanguage();
  const copy = ONBOARDING_COPY[language].features;
  const slides = copy.slides;
  const [currentSlide, setCurrentSlide] = useState(0);
  const contentOpacity = useRef(new Animated.Value(1)).current;
  const dotWidths = useRef(slides.map((_, i) => new Animated.Value(i === 0 ? 24 : 8))).current;

  const isLast = currentSlide === slides.length - 1;

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

      slides.forEach((_, i) => {
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

  const slide = slides[currentSlide];

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <LinearGradient colors={['#0B1F14', '#1B4332']} style={StyleSheet.absoluteFill} />
      <StarFieldBackground count={120} seed={77} />

      <SafeAreaView edges={['top']} style={styles.safeTop}>
        <TouchableOpacity
          style={[styles.backButton, isRtl && styles.backButtonRtl]}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <Ionicons name={isRtl ? 'chevron-forward' : 'chevron-back'} size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </SafeAreaView>

      <Animated.View style={[styles.slideContent, { opacity: contentOpacity }]}>
        <View style={styles.iconCircle}>
          <Ionicons name={slide.icon} size={48} color="#52B788" />
        </View>
        <Text style={[styles.title, isRtl && styles.rtlText]}>{slide.title}</Text>
        <Text style={[styles.description, isRtl && styles.rtlText]}>{slide.description}</Text>
      </Animated.View>

      <View style={styles.bottomSection}>
        <View style={[styles.dotsRow, isRtl && styles.rtlRow]}>
          {slides.map((_, i) => (
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

        <TouchableOpacity
          style={[styles.continueButton, isLast && styles.continueButtonLast]}
          onPress={advanceSlide}
          activeOpacity={0.88}
        >
          <Text style={[styles.continueText, isLast && styles.continueTextLast, isRtl && styles.rtlText]}>
            {isLast ? copy.finalButton : copy.continue}
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
  backButtonRtl: {
    alignSelf: 'flex-end',
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
    minHeight: 60,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 12,
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
    textAlign: 'center',
  },
  continueTextLast: {
    color: '#0B1F14',
  },
  rtlRow: {
    flexDirection: 'row-reverse',
  },
  rtlText: {
    textAlign: 'right',
    writingDirection: 'rtl',
  },
});
