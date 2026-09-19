/**
 * Onboarding — Gut Profile Reveal.
 *
 * Sits between the example analysis and signup, and shows the user what their
 * two answers add up to before asking them to create an account.
 *
 * ── Honest by construction ──────────────────────────────────────────────────
 *
 * Everything on screen is a restatement of something the user selected. There
 * is no score, no percentage, no risk band, no severity, no ranking and no
 * prediction, because none of those could be supported by two multiple-choice
 * answers. The mapping lives in lib/gut-profile.ts and only ever resolves copy
 * KEYS — the screen cannot invent a finding even if someone later edits it.
 *
 * It also does not claim an analysis has happened. At this point in the flow
 * there is no account, no meal and no AI call: the copy says the profile is
 * "taking shape" and that GutWell "can become more useful over time", never
 * that anything has been assessed.
 *
 * ── No writes ───────────────────────────────────────────────────────────────
 *
 * The screen READS onboarding_answers and writes nothing: no AsyncStorage
 * write, no Supabase call, no stage write. The stage was already advanced to
 * 'signup' by the example screen, and this screen is part of that same leg, so
 * the stage model is untouched by its existence.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FontFamily } from '../../constants/theme';
import LanguageSwitcher from '../../components/LanguageSwitcher';
import { useTranslation } from '../../lib/i18n';
import { useReducedMotion } from '../../lib/useReducedMotion';
import { buildGutProfile, parseAnswers, type GutProfileSummary } from '../../lib/gut-profile';

const ANSWERS_KEY = 'onboarding_answers';

/** Matches the stepper's entrance so the two screens feel like one flow. */
const ENTER_MS = 260;
const STAGGER_MS = 70;
const ENTER_PX = 14;

/**
 * Fade-and-rise entrance. Same shape as the stepper's `useEntrance`, kept
 * local rather than shared: a two-screen helper does not earn a module, and
 * the alternative — a shared animation util imported by two onboarding
 * screens — is the kind of indirection that makes motion harder to read, not
 * easier.
 *
 * Under Reduce Motion the driver starts and stays at 1: final state on the
 * first frame, nothing scheduled.
 */
function useEntrance(reduceMotion: boolean, delay = 0) {
  const value = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;

  useEffect(() => {
    if (reduceMotion) {
      value.setValue(1);
      return;
    }
    const animation = Animated.timing(value, {
      toValue: 1,
      duration: ENTER_MS,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [value, delay, reduceMotion]);

  return {
    opacity: value,
    transform: [
      { translateY: value.interpolate({ inputRange: [0, 1], outputRange: [ENTER_PX, 0] }) },
    ],
  };
}

export default function ProfileRevealScreen() {
  const t = useTranslation();
  const reduceMotion = useReducedMotion();

  /**
   * `null` until the read settles, so the cards never flash the generic
   * fallback and then swap to the user's real answers.
   */
  const [profile, setProfile] = useState<GutProfileSummary | null>(null);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(ANSWERS_KEY)
      .then((raw) => {
        if (!active) return;
        setProfile(buildGutProfile(parseAnswers(raw)));
      })
      .catch(() => {
        // A failed read is not a dead end: the generic profile is a real
        // screen, so the user still sees something true and can continue.
        if (active) setProfile(buildGutProfile(null));
      });
    return () => {
      active = false;
    };
  }, []);

  /**
   * One soft tick when the profile first appears. Fires once, only after the
   * read resolves, and never under Reduce Motion — a user who has asked the
   * system to calm down should not be tapped on the wrist by a decoration.
   */
  const greeted = useRef(false);
  useEffect(() => {
    if (!profile || greeted.current || reduceMotion) return;
    greeted.current = true;
    Haptics.selectionAsync().catch(() => {});
  }, [profile, reduceMotion]);

  const headerAnim = useEntrance(reduceMotion, 0);
  const focusAnim = useEntrance(reduceMotion, STAGGER_MS);
  const patternAnim = useEntrance(reduceMotion, STAGGER_MS * 2);
  const footerAnim = useEntrance(reduceMotion, STAGGER_MS * 3);

  const focusCopy = useMemo(() => {
    if (!profile) return '';
    const map = t.profileReveal.focus as Record<string, string>;
    return map[profile.focusKey] ?? map.fallback;
  }, [profile, t]);

  const patternCopy = useMemo(() => {
    if (!profile) return [];
    const map = t.profileReveal.feeling as Record<string, string>;
    return profile.feelingKeys.map((key) => map[key] ?? map.fallback);
  }, [profile, t]);

  const handleContinue = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    // No stage write: the example screen already advanced it to 'signup', and
    // this screen is part of that same leg.
    router.push('/(auth)/signup');
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <LinearGradient colors={['#0B1F14', '#1B4332']} style={StyleSheet.absoluteFill} />

      <SafeAreaView edges={['top', 'bottom']} style={styles.flex}>
        <View style={styles.topBar}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel={t.profileReveal.accessBack}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <LanguageSwitcher />
        </View>

        {/* Scrollable so large Dynamic Type grows the page instead of clipping
            it. No maxFontSizeMultiplier and no numberOfLines anywhere on this
            screen — the German copy is longer than the English throughout, and
            both must be free to wrap. */}
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Animated.View style={headerAnim}>
            <Text style={styles.eyebrow}>{t.profileReveal.eyebrow}</Text>
            <Text style={styles.title}>{t.profileReveal.title}</Text>
            <Text style={styles.intro}>{t.profileReveal.intro}</Text>
          </Animated.View>

          {/* Both cards render only once the read has settled. Until then the
              space stays empty rather than showing placeholder copy that would
              be replaced a frame later. */}
          {profile ? (
            <>
              <Animated.View style={[styles.card, focusAnim]}>
                <View style={styles.cardHeader}>
                  <View style={styles.cardIcon}>
                    <Ionicons name="compass-outline" size={18} color="#52B788" />
                  </View>
                  <Text style={styles.cardLabel}>{t.profileReveal.focusLabel}</Text>
                </View>
                <Text style={styles.cardBody}>{focusCopy}</Text>
              </Animated.View>

              <Animated.View style={[styles.card, patternAnim]}>
                <View style={styles.cardHeader}>
                  <View style={styles.cardIcon}>
                    <Ionicons name="restaurant-outline" size={18} color="#52B788" />
                  </View>
                  <Text style={styles.cardLabel}>{t.profileReveal.patternLabel}</Text>
                </View>
                {/* A plain list, never ordered by severity and never merged
                    into a single conclusion: several post-meal experiences can
                    be true at once and none of them outranks another. */}
                <View style={styles.patternList}>
                  {patternCopy.map((line, i) => (
                    <View key={i} style={styles.patternRow}>
                      <View style={styles.patternDot} />
                      <Text style={styles.cardBody}>{line}</Text>
                    </View>
                  ))}
                </View>
              </Animated.View>
            </>
          ) : null}

          <Animated.View style={footerAnim}>
            <Text style={styles.expectation}>{t.profileReveal.expectation}</Text>
            <Text style={styles.disclaimer}>{t.profileReveal.disclaimer}</Text>
          </Animated.View>
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.cta}
            onPress={handleContinue}
            activeOpacity={0.88}
            accessibilityRole="button"
            accessibilityLabel={t.profileReveal.accessCta}
          >
            <Text style={styles.ctaText}>{t.profileReveal.cta}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B1F14' },
  flex: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: -8,
  },
  // flexGrow, not flex: as a contentContainerStyle, flex:1 would pin the
  // content to the viewport and the screen would clip instead of scrolling at
  // large text sizes.
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 24,
  },

  eyebrow: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: 12,
    letterSpacing: 1.4,
    color: 'rgba(82,183,136,0.9)',
  },
  title: {
    fontFamily: FontFamily.displayBold,
    fontSize: 32,
    lineHeight: 38,
    letterSpacing: -0.4,
    color: '#FFFFFF',
    marginTop: 10,
  },
  intro: {
    fontFamily: FontFamily.sansRegular,
    fontSize: 15,
    lineHeight: 22,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 12,
  },

  card: {
    marginTop: 20,
    padding: 18,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  cardIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(82,183,136,0.14)',
  },
  cardLabel: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: 12,
    letterSpacing: 1.1,
    color: 'rgba(255,255,255,0.55)',
    flexShrink: 1,
  },
  cardBody: {
    fontFamily: FontFamily.sansRegular,
    fontSize: 16,
    lineHeight: 24,
    color: '#FFFFFF',
    flexShrink: 1,
  },

  patternList: { gap: 10 },
  patternRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  patternDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#52B788',
    // Aligns the dot with the first line of text rather than the row's centre,
    // so a wrapped line does not push it out of place.
    marginTop: 9,
  },

  expectation: {
    fontFamily: FontFamily.sansRegular,
    fontSize: 14,
    lineHeight: 21,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 24,
  },
  disclaimer: {
    fontFamily: FontFamily.sansRegular,
    fontSize: 13,
    lineHeight: 19,
    color: 'rgba(255,255,255,0.45)',
    marginTop: 12,
  },

  footer: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 12,
  },
  cta: {
    width: '100%',
    height: 60,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.28,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  ctaText: {
    fontFamily: FontFamily.sansBold,
    fontSize: 17,
    color: '#0B1F14',
    letterSpacing: -0.3,
  },
});
