import React, { useEffect, useRef, useState } from 'react';
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
import { useAuth } from '../../contexts/AuthContext';
import { FontFamily } from '../../constants/theme';
import StarFieldBackground from '../../components/StarFieldBackground';

const { width } = Dimensions.get('window');

const TAGLINES = [
  'Understand your gut.',
  'Find your triggers.',
  'Reduce symptoms.',
  'Track what matters.',
  'Feel your best.',
];

const TAGLINE_DISPLAY_MS = 2200;
const TAGLINE_FADE_MS = 150;

export default function WelcomeScreen() {
  // Keep import for pattern reference in later screens
  useAuth();

  const [taglineIndex, setTaglineIndex] = useState(0);
  const taglineOpacity = useRef(new Animated.Value(1)).current;
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const cycle = () => {
      // Fade out
      Animated.timing(taglineOpacity, {
        toValue: 0,
        duration: TAGLINE_FADE_MS,
        useNativeDriver: true,
      }).start(() => {
        // Switch tagline
        setTaglineIndex((prev) => (prev + 1) % TAGLINES.length);
        // Fade in
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
  }, [taglineOpacity]);

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <LinearGradient colors={['#0B1F14', '#1B4332']} style={StyleSheet.absoluteFill} />
      <StarFieldBackground count={180} seed={42} />

      {/* Center content */}
      <View style={styles.centerContent}>
        {/* Logo icon */}
        <View style={styles.iconCircle}>
          <Ionicons name="leaf" size={40} color="#FFFFFF" />
        </View>

        {/* App name */}
        <Text style={styles.appName}>GutWell</Text>

        {/* Animated tagline */}
        <View style={styles.taglineContainer}>
          <Animated.Text style={[styles.tagline, { opacity: taglineOpacity }]}>
            {TAGLINES[taglineIndex]}
          </Animated.Text>
        </View>
      </View>

      {/* Bottom CTA section */}
      <View style={styles.bottomSection}>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => router.push('/(onboarding)/features')}
          activeOpacity={0.88}
        >
          <Text style={styles.primaryButtonText}>Build My Gut Plan</Text>
        </TouchableOpacity>

        <View style={styles.signInRow}>
          <Text style={styles.signInPrompt}>Already have an account? </Text>
          <TouchableOpacity
            onPress={() => router.replace('/(auth)/login')}
            activeOpacity={0.7}
          >
            <Text style={styles.signInLink}>Sign in</Text>
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
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tagline: {
    fontFamily: FontFamily.sansMedium,
    fontSize: 18,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
  },
  bottomSection: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: 32,
    paddingHorizontal: 24,
    gap: 16,
  },
  primaryButton: {
    backgroundColor: '#FFFFFF',
    height: 60,
    borderRadius: 20,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryButtonText: {
    fontFamily: FontFamily.sansBold,
    fontSize: 17,
    color: '#0B1F14',
    letterSpacing: -0.3,
  },
  signInRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
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
});
