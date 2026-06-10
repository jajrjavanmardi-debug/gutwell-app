import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Colors, Spacing, FontSize, BorderRadius, FontFamily } from '../constants/theme';

type SectionData = {
  title: string;
  body: string;
};

const SECTIONS: SectionData[] = [
  {
    title: '1. Data We Collect',
    body: 'GutWell collects the data you voluntarily enter: check-in logs (stool type, bloating, pain, energy, mood, water intake), food logs (meal names, meal types, meal photos you choose to analyze), symptom logs (type, severity), supplement notes, onboarding answers (your gut concerns and goals), and basic account information (email, display name). If you use voice input, your speech is converted to text on your device or by your phone\u2019s operating system; we store only the resulting text. If you grant location access for local food suggestions, your approximate location is used during that analysis.',
  },
  {
    title: '2. How We Use Your Data',
    body: 'Your data is used to provide the GutWell service \u2014 displaying your health trends, calculating your gut health score, detecting food\u2013symptom patterns, personalizing AI meal analysis, and sending reminders you configure. We never sell your data, and we do not use it for advertising or cross-app tracking.',
  },
  {
    title: '3. Service Providers We Share Data With',
    body: 'To run GutWell we use a small number of processors, each bound by their own privacy commitments:\n\n\u2022 Supabase (hosted on AWS, EU region) \u2014 stores your account and all logs described above.\n\u2022 Google Gemini API \u2014 when you analyze a meal photo, the photo plus the context you provide (symptoms, conditions, supplements, and \u2014 if enabled \u2014 approximate location) is sent to Google\u2019s AI service to generate your analysis. Google does not use this data to train models per its API terms.\n\u2022 PostHog (analytics) \u2014 anonymous-style usage events (e.g. \u201ccheck-in logged\u201d) linked to a random user ID. We do not send your health values, name, or email to analytics.\n\u2022 Sentry (crash reporting) \u2014 technical crash data, not linked to your identity.\n\u2022 Apple / RevenueCat \u2014 only if you make a purchase, to process and validate it.\n\nWe do not sell or share your personal health data with any other third parties.',
  },
  {
    title: '4. Data Storage & Security',
    body: 'Your data is stored securely using Supabase (hosted on AWS) with encryption at rest and in transit. Row-level security ensures only you can access your data. Authentication tokens are stored in your device\u2019s secure storage. AI requests are processed by our server \u2014 API keys never live in the app.',
  },
  {
    title: '5. Data Retention & Deletion',
    body: 'Your data is retained as long as your account is active. You can export your data at any time from Settings or Profile. You can permanently delete your account and all associated data directly in the app: Profile \u2192 Delete Account. Deletion is immediate and irreversible.',
  },
  {
    title: '6. Your Rights',
    body: 'You have the right to access, export, correct, or delete your personal data (GDPR Articles 15\u201320 where applicable). You can exercise these rights through the app settings or by contacting us. You may also withdraw location, camera, microphone, or notification permissions at any time in your device Settings.',
  },
  {
    title: '7. Contact',
    body: 'GutWell is operated by Parallel Labs Pte. Ltd. For privacy-related questions, contact us at support@theparallellab.com.',
  },
];

function CollapsibleSection({ section }: { section: SectionData }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <TouchableOpacity
      style={styles.sectionCard}
      onPress={() => setExpanded(!expanded)}
      activeOpacity={0.7}
    >
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{section.title}</Text>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={20}
          color={Colors.textSecondary}
        />
      </View>
      {expanded && (
        <Text style={styles.sectionBody}>{section.body}</Text>
      )}
    </TouchableOpacity>
  );
}

export default function PrivacyPolicyScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Privacy Policy</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.pageTitle}>Privacy Policy</Text>
        <Text style={styles.updated}>Last updated: June 2026</Text>
        <Text style={styles.intro}>
          Your privacy matters to us. Tap each section below to learn how we handle your data.
        </Text>

        {SECTIONS.map((section, i) => (
          <CollapsibleSection key={i} section={section} />
        ))}

        {/* Contact Footer */}
        <View style={styles.contactFooter}>
          <Ionicons name="mail-outline" size={20} color={Colors.textSecondary} />
          <Text style={styles.contactText}>
            Questions? Reach us at{' '}
            <Text style={styles.contactEmail}>support@theparallellab.com</Text>
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surfaceSecondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.lg,
    color: Colors.text,
  },
  headerSpacer: {
    width: 36,
  },
  scroll: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl + 40,
  },
  pageTitle: {
    fontFamily: FontFamily.displayMedium,
    fontSize: 28,
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  updated: {
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.sm,
    color: Colors.textTertiary,
    marginBottom: Spacing.lg,
  },
  intro: {
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
    marginBottom: Spacing.lg,
  },

  // Collapsible Sections
  sectionCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.md,
    color: Colors.text,
    flex: 1,
    marginRight: Spacing.sm,
  },
  sectionBody: {
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 22,
    marginTop: Spacing.md,
  },

  // Contact Footer
  contactFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.xl,
    paddingTop: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
  },
  contactText: {
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    flex: 1,
    lineHeight: 20,
  },
  contactEmail: {
    fontFamily: FontFamily.sansSemiBold,
    color: Colors.primary,
  },
});
