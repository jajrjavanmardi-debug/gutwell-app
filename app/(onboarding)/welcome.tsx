import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  Pressable,
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
import { track, Events } from '../../lib/analytics';
import { useTranslation } from '../../lib/i18n';
import { useLanguage } from '../../lib/LanguageContext';
import { LANGUAGE_LABELS, SUPPORTED_LANGUAGES, type AppLanguage } from '../../lib/language';

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

  // Reuses the app-wide LanguageContext — the same source Settings writes to.
  // No second language-management implementation is introduced here.
  const { language, setLanguage } = useLanguage();
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);

  const handleSelectLanguage = async (next: AppLanguage) => {
    setLanguageMenuOpen(false);
    if (next === language) return;
    // setLanguage persists via saveLanguage() and re-renders the whole tree,
    // so this screen updates immediately and the choice survives a restart.
    await setLanguage(next);
  };

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
    router.push('/(onboarding)/features');
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
          <TouchableOpacity
            style={styles.languageChip}
            onPress={() => setLanguageMenuOpen(true)}
            activeOpacity={0.75}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={`${t.welcome.languageLabel}: ${LANGUAGE_LABELS[language]}`}
            accessibilityHint={t.welcome.accessLanguageHint}
          >
            <Ionicons name="globe-outline" size={15} color="rgba(255,255,255,0.75)" />
            <Text style={styles.languageChipText}>{language.toUpperCase()}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {/* Language menu */}
      <Modal
        visible={languageMenuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setLanguageMenuOpen(false)}
      >
        <Pressable
          style={styles.menuBackdrop}
          onPress={() => setLanguageMenuOpen(false)}
          accessibilityRole="button"
          accessibilityLabel={t.common.close}
        >
          {/* Stops a tap inside the card from dismissing the menu. */}
          <Pressable
            style={styles.menuCard}
            onPress={() => {}}
            // Keeps VoiceOver focus inside the card so the options are reached
            // before the backdrop's dismiss action.
            accessibilityViewIsModal
          >
            <Text style={styles.menuTitle}>{t.welcome.languageModalTitle}</Text>
            {SUPPORTED_LANGUAGES.map((lang, idx) => {
              const selected = lang === language;
              return (
                <TouchableOpacity
                  key={lang}
                  style={[styles.menuOption, idx > 0 && styles.menuOptionBorder]}
                  onPress={() => handleSelectLanguage(lang)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={LANGUAGE_LABELS[lang]}
                  accessibilityHint={t.welcome.accessLanguageOptionHint}
                >
                  <Text style={[styles.menuOptionText, selected && styles.menuOptionTextSelected]}>
                    {LANGUAGE_LABELS[lang]}
                  </Text>
                  {selected && (
                    <Ionicons name="checkmark" size={18} color="#52B788" />
                  )}
                </TouchableOpacity>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Center content */}
      <View style={styles.centerContent}>
        <View style={styles.iconCircle}>
          <Ionicons name="leaf" size={40} color="#FFFFFF" />
        </View>

        {/* App name */}
        <Text style={styles.appName}>{t.welcome.appName}</Text>

        {/* Headline — shown only to new / signed-out users */}
        <Text style={styles.headline}>{t.welcome.headline}</Text>

        {/* Animated tagline */}
        <View style={styles.taglineContainer}>
          <Animated.Text style={[styles.tagline, { opacity: taglineOpacity }]}>
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
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  languageChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    // 44pt minimum touch target (Apple HIG) without a bulky visual footprint.
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  languageChipText: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: 13,
    color: 'rgba(255,255,255,0.85)',
    letterSpacing: 0.5,
  },
  menuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  menuCard: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 20,
    backgroundColor: '#12301F',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    paddingVertical: 8,
  },
  menuTitle: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 0.4,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  menuOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 52,
    paddingHorizontal: 20,
  },
  menuOptionBorder: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  menuOptionText: {
    fontFamily: FontFamily.sansMedium,
    fontSize: 16,
    color: 'rgba(255,255,255,0.85)',
  },
  menuOptionTextSelected: {
    fontFamily: FontFamily.sansSemiBold,
    color: '#FFFFFF',
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
