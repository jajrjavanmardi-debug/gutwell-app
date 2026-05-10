import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { ONBOARDING_COPY } from '../../constants/onboarding-copy';
import { FontFamily } from '../../constants/theme';
import { LanguageSelector } from '../../components/LanguageSelector';
import StarFieldBackground from '../../components/StarFieldBackground';

const TAGLINE_DISPLAY_MS = 2200;
const TAGLINE_FADE_MS = 150;

export default function WelcomeScreen() {
  // Keep import for pattern reference in later screens
  useAuth();

  const { language, setLanguage, isRtl } = useLanguage();
  const copy = ONBOARDING_COPY[language].welcome;
  const taglines = copy.taglines;
  const [taglineIndex, setTaglineIndex] = useState(0);
  const taglineOpacity = useRef(new Animated.Value(1)).current;
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setTaglineIndex((current) => current % taglines.length);
  }, [taglines.length]);

  useEffect(() => {
    const cycle = () => {
      Animated.timing(taglineOpacity, {
        toValue: 0,
        duration: TAGLINE_FADE_MS,
        useNativeDriver: true,
      }).start(() => {
        setTaglineIndex((prev) => (prev + 1) % taglines.length);
        Animated.timing(taglineOpacity, {
          toValue: 1,
          duration: TAGLINE_FADE_MS,
          useNativeDriver: true,
        }).start();
      });
    };

    const mountDelay = setTimeout(() => {
      intervalRef.current = setInterval(cycle, TAGLINE_DISPLAY_MS + TAGLINE_FADE_MS * 2);
    }, 800);

    return () => {
      clearTimeout(mountDelay);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [taglineOpacity, taglines.length]);

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <LinearGradient colors={['#0B1F14', '#1B4332']} style={StyleSheet.absoluteFill} />
      <StarFieldBackground count={180} seed={42} />

      <View style={styles.centerContent}>
        <View style={styles.iconCircle}>
          <Ionicons name="leaf" size={40} color="#FFFFFF" />
        </View>

        <Text style={styles.appName}>NutriFlow</Text>

        <View style={styles.taglineContainer}>
          <Animated.Text style={[styles.tagline, isRtl && styles.rtlText, { opacity: taglineOpacity }]}>
            {taglines[taglineIndex]}
          </Animated.Text>
        </View>
      </View>

      <View style={styles.bottomSection}>
        <LanguageSelector
          language={language}
          onChange={setLanguage}
          title={copy.languageTitle}
          subtitle={copy.languageSubtitle}
          isRtl={isRtl}
        />

        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => router.push('/(onboarding)/features')}
          activeOpacity={0.88}
        >
          <Text style={[styles.primaryButtonText, isRtl && styles.rtlText]}>
            {copy.primaryButton}
          </Text>
        </TouchableOpacity>

        <View style={[styles.signInRow, isRtl && styles.rtlRow]}>
          <Text style={[styles.signInPrompt, isRtl && styles.rtlText]}>
            {copy.signInPrompt}
          </Text>
          <TouchableOpacity
            onPress={() => router.replace('/(tabs)')}
            activeOpacity={0.7}
          >
            <Text style={[styles.signInLink, isRtl && styles.rtlText]}>
              {copy.signInLink}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 150,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  appName: {
    fontFamily: FontFamily.displayBold,
    fontSize: 52,
    color: '#FFFFFF',
    marginTop: 16,
    letterSpacing: -0.5,
  },
  taglineContainer: {
    marginTop: 40,
    minHeight: 32,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 18,
  },
  tagline: {
    fontFamily: FontFamily.sansMedium,
    fontSize: 18,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    lineHeight: 25,
  },
  bottomSection: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: 32,
    paddingHorizontal: 24,
    gap: 14,
  },
  primaryButton: {
    backgroundColor: '#FFFFFF',
    minHeight: 60,
    borderRadius: 20,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  primaryButtonText: {
    fontFamily: FontFamily.sansBold,
    fontSize: 17,
    color: '#0B1F14',
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  signInRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  signInPrompt: {
    fontFamily: FontFamily.sansRegular,
    fontSize: 14,
    color: 'rgba(255,255,255,0.55)',
  },
  signInLink: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: 14,
    color: '#52B788',
  },
  rtlRow: {
    flexDirection: 'row-reverse',
  },
  rtlText: {
    textAlign: 'right',
    writingDirection: 'rtl',
  },
});
