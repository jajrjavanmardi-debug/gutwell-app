import React, { useEffect, useRef, useState } from 'react';
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
import { useAuth } from '../../contexts/AuthContext';
import { FontFamily } from '../../constants/theme';
import StarFieldBackground from '../../components/StarFieldBackground';
import LanguageSwitcher from '../../components/LanguageSwitcher';
import { track, Events } from '../../lib/analytics';
import { useTranslation } from '../../lib/i18n';
import { saveLocalStage } from '../../lib/onboarding-stage';

// Taglines come from i18n (t.welcome.taglines) and cycle in the authored order.
// Display + both fades land each message at ~2.8s, inside the 2.5–3s target.
const TAGLINE_DISPLAY_MS = 2500;
const TAGLINE_FADE_MS = 150;

export default function WelcomeScreen() {
  // useAuth is called here only to match the existing pattern used in later
  // onboarding screens. The welcome screen itself is only shown when there is
  // no active session (app/index.tsx guarantees this), so we never redirect
  // away from here — the user must explicitly choose Create Account or Sign In.
  useAuth();
  const t = useTranslation();

  const [taglineIndex, setTaglineIndex] = useState(0);
  const taglineOpacity = useRef(new Animated.Value(1)).current;
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const cycle = () => {
      Animated.timing(taglineOpacity, {
        toValue: 0,
        duration: TAGLINE_FADE_MS,
        useNativeDriver: true,
      }).start(() => {
        setTaglineIndex((prev) => (prev + 1) % (t.welcome.taglines.length || 1));
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
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [taglineOpacity]);

  const handleCreateAccount = () => {
    track(Events.ONBOARDING_STARTED);
    // Stage is written before navigating so a relaunch resumes at the goal
    // question rather than starting over. Features/About are no longer on the
    // route: the value points below replace them.
    void saveLocalStage('goal');
    router.push('/(onboarding)/questions');
  };

  const handleSignIn = () => {
    router.push('/(auth)/login');
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <LinearGradient colors={['#0B1F14', '#1B4332']} style={StyleSheet.absoluteFill} />
      <StarFieldBackground count={180} seed={42} />

      {/* Language selector — the screen has no other top inset, so it brings
          its own safe area. Deliberately compact so it does not compete with
          the brand mark or the hero message below. */}
      <SafeAreaView edges={['top']} style={styles.topSafe}>
        <View style={styles.topBar}>
          <LanguageSwitcher />
        </View>
      </SafeAreaView>

      {/* Center content */}
      <View style={styles.centerContent}>
        <View style={styles.iconCircle}>
          <Ionicons name="leaf" size={40} color="#FFFFFF" />
        </View>

        {/* App name */}
        <Text style={styles.appName}>{t.welcome.appName}</Text>

        {/* Headline — shown only to new / signed-out users */}
        <Text style={styles.headline}>{t.welcome.headline}</Text>

        {/* Three mechanism lines — what the product does, in order. These
            replace the Features and About screens that used to sit between
            Welcome and the first question. */}
        <View style={styles.valuePoints}>
          {t.welcome.valuePoints.map((point) => (
            <View key={point} style={styles.valueRow}>
              <Ionicons name="checkmark-circle" size={18} color="#52B788" />
              <Text style={styles.valueText}>{point}</Text>
            </View>
          ))}
        </View>

        {/* Animated tagline */}
        <View style={styles.taglineContainer}>
          <Animated.Text
            style={[styles.tagline, { opacity: taglineOpacity }]}
            // The container is a fixed height so the hero does not jump between
            // messages. Shrink-to-fit rather than clip, which also keeps the
            // line intact at larger Dynamic Type sizes.
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.85}
          >
            {t.welcome.taglines[taglineIndex] ?? ''}
          </Animated.Text>
        </View>
      </View>

      {/* Bottom CTA — two explicit actions so new users never wonder what to do */}
      <SafeAreaView edges={['bottom']} style={styles.bottomSafe}>
        <View style={styles.bottomSection}>
          {/* Primary: Create Account */}
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleCreateAccount}
            accessibilityRole="button"
            accessibilityLabel={t.welcome.accessCreateAccount}
            activeOpacity={0.88}
          >
            <Text style={styles.primaryButtonText}>{t.welcome.createAccount}</Text>
          </TouchableOpacity>

          {/* Secondary: Sign In — visually distinct, not hidden */}
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={handleSignIn}
            accessibilityRole="button"
            accessibilityLabel={t.welcome.accessSignIn}
            activeOpacity={0.8}
          >
            <Text style={styles.secondaryButtonText}>{t.welcome.signIn}</Text>
          </TouchableOpacity>

          {/* Terms and Privacy are tappable; the surrounding words are not.
              Routes are unchanged — both are existing modal screens. */}
          <Text style={styles.legalNote}>
            {t.welcome.legalPrefix}{' '}
            <Text
              style={styles.legalLink}
              onPress={() => router.push('/terms-of-service')}
              accessibilityRole="link"
              accessibilityLabel={t.welcome.accessTerms}
              suppressHighlighting
            >
              {t.welcome.legalTerms}
            </Text>{' '}
            {t.welcome.legalAnd}{' '}
            <Text
              style={styles.legalLink}
              onPress={() => router.push('/privacy-policy')}
              accessibilityRole="link"
              accessibilityLabel={t.welcome.accessPrivacy}
              suppressHighlighting
            >
              {t.welcome.legalPrivacy}
            </Text>
            {t.welcome.legalSuffix === '.' ? '' : ' '}
            {t.welcome.legalSuffix}
          </Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topSafe: {
    backgroundColor: 'transparent',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    // 24 matches centerContent and bottomSection, so the chip's right edge
    // lines up with the hero text and the CTA buttons below it.
    paddingHorizontal: 24,
    // Sits below the safe-area inset, so this is clearance from the Dynamic
    // Island / notch rather than from the physical top edge.
    paddingTop: 14,
    paddingBottom: 4,
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
  valuePoints: { marginTop: 22, gap: 10, alignSelf: 'stretch', paddingHorizontal: 8 },
  valueRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  // flexShrink so long German lines wrap instead of clipping at 375pt.
  valueText: {
    fontFamily: FontFamily.sansRegular,
    fontSize: 15,
    color: 'rgba(255,255,255,0.85)',
    flexShrink: 1,
  },
  appName: {
    fontFamily: FontFamily.displayBold,
    fontSize: 44,
    color: '#FFFFFF',
    marginTop: 16,
    letterSpacing: -0.5,
  },
  headline: {
    fontFamily: FontFamily.sansMedium,
    fontSize: 16,
    color: 'rgba(255,255,255,0.55)',
    marginTop: 6,
    textAlign: 'center',
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
  bottomSafe: {
    backgroundColor: 'transparent',
  },
  bottomSection: {
    paddingBottom: 24,
    paddingHorizontal: 24,
    gap: 12,
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
  secondaryButton: {
    height: 56,
    borderRadius: 20,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.25)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  secondaryButtonText: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: 17,
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  legalNote: {
    fontFamily: FontFamily.sansRegular,
    fontSize: 11,
    color: 'rgba(255,255,255,0.3)',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 16,
  },
  legalLink: {
    fontFamily: FontFamily.sansSemiBold,
    color: 'rgba(255,255,255,0.7)',
    textDecorationLine: 'underline',
  },
});
