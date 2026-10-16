import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../../contexts/AuthContext';
import { FontFamily } from '../../constants/theme';
import LanguageSwitcher from '../../components/LanguageSwitcher';
import StoryCarousel from '../../components/story/StoryCarousel';
import { track, Events } from '../../lib/analytics';
import { useTranslation } from '../../lib/i18n';
import { saveLocalStage } from '../../lib/onboarding-stage';

/**
 * Welcome — the first screen a signed-out user sees.
 *
 * The centre is the Story Experience: four manually-swiped frames answering
 * "why should I trust this?" before anything is asked of the user. It replaces
 * the cycling taglines, the three value points, the brand mark and the
 * headline, all of which competed for the same vertical space and none of
 * which explained the product.
 *
 * Everything around the story is deliberately unchanged: the top bar and its
 * shared LanguageSwitcher, both calls to action, the legal links, the routes,
 * and the onboarding_stage write. This screen is the entry point to the whole
 * funnel, so the story is an inner replacement, not a rewrite of the frame.
 */
export default function WelcomeScreen() {
  // Called to match the pattern used by the later onboarding screens. Welcome
  // is only reachable without a session (app/index.tsx guarantees it), so this
  // never redirects — the user must choose Create Account or Sign In.
  useAuth();
  const t = useTranslation();
  const insets = useSafeAreaInsets();

  const handleCreateAccount = () => {
    track(Events.ONBOARDING_STARTED);
    // Stage is written before navigating so a relaunch resumes at the goal
    // question rather than starting over.
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

      {/* Compact top bar. The screen has no other top inset, so it brings its
          own safe area. */}
      <SafeAreaView edges={['top']} style={styles.topSafe}>
        <View style={styles.topBar}>
          <Text style={styles.wordmark}>{t.welcome.appName}</Text>
          <LanguageSwitcher />
        </View>
      </SafeAreaView>

      {/* The story takes the space between the bar and the CTA. It never grows
          into the buttons: the CTA block below is a fixed sibling, so a long
          translation or a large Dynamic Type size cannot push Sign In or the
          legal links off a small screen. */}
      <View style={styles.storyArea}>
        <StoryCarousel />
      </View>

      {/* Bottom CTA — two explicit actions so new users never wonder what to do.
          The home-indicator inset is absorbed as the block's bottom padding
          rather than stacked on top of its own: a SafeAreaView here spent 54pt
          on a notched phone where 34 is already generous, and every point of
          that came out of the hero. On a device with no inset (the SE) a 12pt
          floor keeps the legal line off the physical edge. */}
      <View style={[styles.bottomSection, { paddingBottom: Math.max(12, insets.bottom) }]}>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleCreateAccount}
            accessibilityRole="button"
            accessibilityLabel={t.welcome.accessCreateAccount}
            activeOpacity={0.88}
          >
            <Text style={styles.primaryButtonText} maxFontSizeMultiplier={1.4}>
              {t.welcome.createAccount}
            </Text>
          </TouchableOpacity>

          {/* Secondary: Sign In — visually distinct, not hidden */}
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={handleSignIn}
            accessibilityRole="button"
            accessibilityLabel={t.welcome.accessSignIn}
            activeOpacity={0.8}
          >
            <Text style={styles.secondaryButtonText} maxFontSizeMultiplier={1.4}>
              {t.welcome.signIn}
            </Text>
          </TouchableOpacity>

          {/* Terms and Privacy are tappable; the surrounding words are not.
              Routes are unchanged — both are existing modal screens. */}
          <Text style={styles.legalNote} maxFontSizeMultiplier={1.6}>
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
    alignItems: 'center',
    justifyContent: 'space-between',
    // 24 matches the CTA block, so the wordmark and the language chip line up
    // with the buttons below them.
    paddingHorizontal: 24,
    // Trimmed to 6/4: the row's height is set by the language switcher's own
    // 44pt target, which is protected, so only the padding around it is
    // available to give back to the hero.
    paddingTop: 6,
    paddingBottom: 4,
  },
  wordmark: {
    fontFamily: FontFamily.displayBold,
    fontSize: 20,
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  storyArea: {
    flex: 1,
    // No horizontal padding: the hero is full-bleed by design, and the story's
    // own caption carries the 24pt gutter.
  },
  bottomSection: {
    paddingHorizontal: 24,
    paddingTop: 10,
    gap: 8,
  },
  /* 52 and 48 rather than 60 and 56. Both stay clear of the 44pt minimum
     target, and paddingVertical lets either grow with Dynamic Type. */
  primaryButton: {
    backgroundColor: '#FFFFFF',
    minHeight: 52,
    borderRadius: 20,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
  },
  primaryButtonText: {
    fontFamily: FontFamily.sansBold,
    fontSize: 17,
    color: '#0B1F14',
    letterSpacing: -0.3,
  },
  secondaryButton: {
    minHeight: 48,
    borderRadius: 20,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
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
  /* Size and contrast left alone: this is the one block where reclaiming
     points would cost legibility of the terms a user is agreeing to. */
  legalNote: {
    fontFamily: FontFamily.sansRegular,
    fontSize: 11,
    color: 'rgba(255,255,255,0.3)',
    textAlign: 'center',
    lineHeight: 16,
  },
  legalLink: {
    fontFamily: FontFamily.sansSemiBold,
    color: 'rgba(255,255,255,0.7)',
    textDecorationLine: 'underline',
  },
});
