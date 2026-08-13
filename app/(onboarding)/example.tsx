/**
 * Onboarding — Example analysis.
 *
 * Shows the real *structure* of a GutWell AI result before the user has an
 * account, so the signup ask that follows is credible rather than a promise.
 *
 * Deliberately static. There is no camera, no scan overlay, no progress bar and
 * no simulated delay: the earlier flow faked a 2.4s "analysing" step, and this
 * screen exists partly to replace that with something honest. Everything here
 * is a fixed sample — the "Example analysis" pill, the intro line and the
 * disclaimer all say so, in that order, before any section is read.
 *
 * The illustration is a vector icon rather than a photo so it cannot be
 * mistaken for the user's own meal.
 *
 * Copy safety: no diagnosis, no treatment, no promised outcome, no claim that
 * the example is personalised. Sensitivity wording stays hedged ("may feel
 * heavy for some people"). See LAUNCH_OPERATIONS.md.
 */
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FontFamily } from '../../constants/theme';
import { useTranslation } from '../../lib/i18n';
import { saveLocalStage } from '../../lib/onboarding-stage';
import LanguageSwitcher from '../../components/LanguageSwitcher';

export default function ExampleScreen() {
  const t = useTranslation();

  const handleCreateAccount = () => {
    // Stage advances before navigation so a relaunch resumes at signup rather
    // than replaying the example.
    void saveLocalStage('signup');
    router.push('/(auth)/signup');
  };

  const sections = [
    {
      key: 'impact',
      icon: 'pulse-outline' as const,
      title: t.example.gutImpactTitle,
      value: t.example.gutImpactValue,
    },
    {
      key: 'sensitivity',
      icon: 'alert-circle-outline' as const,
      title: t.example.sensitivityTitle,
      value: t.example.sensitivityValue,
    },
    {
      key: 'better',
      icon: 'leaf-outline' as const,
      title: t.example.betterOptionTitle,
      value: t.example.betterOptionValue,
    },
    {
      key: 'next',
      icon: 'footsteps-outline' as const,
      title: t.example.nextStepTitle,
      value: t.example.nextStepValue,
    },
  ];

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <LinearGradient colors={['#0B1F14', '#1B4332']} style={StyleSheet.absoluteFill} />

      <SafeAreaView edges={['top']} style={styles.flex}>
        {/* Language stays changeable right up until the account is created.
            Sits above the ScrollView so it remains reachable while reading. */}
        <View style={styles.topBar}>
          {/* Same chevron affordance the earlier onboarding screens use. Without
              it this screen was the only one with no visible way back, leaving
              the flow looking like a dead end before signup. */}
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={t.example.accessBack}
          >
            <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <LanguageSwitcher />
        </View>

        {/* Scrolls rather than shrinks: four sections plus the disclaimer do not
            fit an iPhone SE at larger Dynamic Type sizes, and clipping safety
            copy would be worse than a scroll. */}
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Label first in reading order — a screen reader announces that this
              is an example before any of the content below it. */}
          <View style={styles.labelPill}>
            <Ionicons name="information-circle-outline" size={15} color="#0B1F14" />
            <Text style={styles.labelText} accessibilityRole="header">
              {t.example.label}
            </Text>
          </View>

          <Text style={styles.intro}>{t.example.intro}</Text>

          {/* Generic vector illustration — deliberately not a photograph. */}
          <View
            style={styles.mealCard}
            accessible
            accessibilityRole="image"
            accessibilityLabel={t.example.mealImageAlt}
          >
            <View style={styles.mealIconRing}>
              <Ionicons name="restaurant-outline" size={30} color="#52B788" />
            </View>
            <Text style={styles.mealName}>{t.example.mealName}</Text>
          </View>

          <View style={styles.sections}>
            {sections.map((section) => (
              <View key={section.key} style={styles.sectionCard} accessible>
                <View style={styles.sectionHeader}>
                  {/* Icon is decorative; the title carries the meaning, so
                      nothing depends on colour or glyph alone. */}
                  <Ionicons name={section.icon} size={17} color="#52B788" />
                  <Text style={styles.sectionTitle} accessibilityRole="header">
                    {section.title}
                  </Text>
                </View>
                <Text style={styles.sectionValue}>{section.value}</Text>
              </View>
            ))}
          </View>

          <View style={styles.disclaimerRow}>
            <Ionicons name="shield-checkmark-outline" size={15} color="rgba(255,255,255,0.5)" />
            <Text style={styles.disclaimer}>{t.example.disclaimer}</Text>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.cta}
            onPress={handleCreateAccount}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={t.example.accessCta}
          >
            <Text style={styles.ctaText}>{t.example.cta}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.push('/(auth)/login')}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={t.example.accessSignIn}
          >
            <Text style={styles.signInText}>{t.example.signIn}</Text>
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
  backButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center', marginLeft: -8 },
  scrollContent: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 24 },

  labelPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#52B788',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
  },
  labelText: { fontFamily: FontFamily.sansSemiBold, fontSize: 13, color: '#0B1F14' },

  intro: {
    fontFamily: FontFamily.sansRegular,
    fontSize: 15,
    lineHeight: 22,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 14,
  },

  mealCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 20,
    padding: 16,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  mealIconRing: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(82,183,136,0.14)',
  },
  // flexShrink so the longer German meal name wraps instead of clipping.
  mealName: {
    fontFamily: FontFamily.sansMedium,
    fontSize: 16,
    color: '#FFFFFF',
    flexShrink: 1,
  },

  sections: { marginTop: 20, gap: 12 },
  sectionCard: {
    padding: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  sectionTitle: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: 13,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: '#52B788',
    flexShrink: 1,
  },
  sectionValue: {
    fontFamily: FontFamily.sansRegular,
    fontSize: 16,
    lineHeight: 23,
    color: '#FFFFFF',
  },

  disclaimerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 20,
  },
  disclaimer: {
    fontFamily: FontFamily.sansRegular,
    fontSize: 13,
    lineHeight: 19,
    color: 'rgba(255,255,255,0.5)',
    flexShrink: 1,
  },

  footer: { paddingHorizontal: 24, paddingBottom: 28, paddingTop: 8, gap: 14 },
  cta: {
    backgroundColor: '#52B788',
    borderRadius: 28,
    paddingVertical: 17,
    alignItems: 'center',
  },
  ctaText: { fontFamily: FontFamily.sansSemiBold, fontSize: 17, color: '#0B1F14' },
  signInText: {
    fontFamily: FontFamily.sansRegular,
    fontSize: 15,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
  },
});
