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
    title: '1. Usage Terms',
    body: 'By creating an account and using NutriFlow, you agree to these Terms of Service. NutriFlow is intended for personal wellness tracking only. You must be at least 13 years old to use this app. You are responsible for maintaining the confidentiality of your account credentials.',
  },
  {
    title: '2. Health Disclaimer',
    body: 'NutriFlow is a wellness tracking application, not a medical device. The information, scores, correlations, and insights provided are for personal tracking purposes only and do not constitute medical advice, diagnosis, or treatment. Always seek the advice of a qualified healthcare professional with any questions regarding a medical condition. Never disregard professional medical advice or delay seeking it because of information provided by NutriFlow.',
  },
  {
    title: '3. Subscription Terms',
    body: 'NutriFlow offers both free and premium subscription tiers. Premium subscriptions are billed through Apple\'s App Store. Payment is charged to your Apple ID account at confirmation of purchase. Subscriptions automatically renew unless cancelled at least 24 hours before the end of the current billing period. Your account will be charged for renewal within 24 hours prior to the end of the current period at the same rate.',
  },
  {
    title: '4. Cancellation Policy',
    body: 'You may cancel your subscription at any time through your Apple ID account settings. Cancellation takes effect at the end of the current billing period. No refunds are provided for partial billing periods. Free features remain accessible after cancellation.',
  },
  {
    title: '5. Limitation of Liability',
    body: 'To the maximum extent permitted by law, Parallel Labs Pte. Ltd. shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including but not limited to loss of data, health outcomes, or any reliance on information provided by the app. NutriFlow is provided "as is" without warranties of any kind.',
  },
  {
    title: '6. User Content',
    body: 'You retain ownership of all data you enter into NutriFlow. By using the service, you grant us a limited license to process your data solely for the purpose of providing the NutriFlow service. We do not sell your personal health data to third parties. You may export or delete your data at any time.',
  },
  {
    title: '7. Acceptable Use',
    body: 'You agree not to misuse the service, including but not limited to: attempting to access other users\' data, reverse-engineering the app, using automated tools to interact with the service, or using NutriFlow for any unlawful purpose.',
  },
  {
    title: '8. Changes to Terms',
    body: 'We may update these terms from time to time. Continued use of the app after changes constitutes acceptance of the new terms. We will notify users of material changes through the app or via email.',
  },
  {
    title: '9. Governing Law',
    body: 'These Terms of Service are governed by the laws of the Republic of Singapore. Any disputes arising from or relating to these terms shall be subject to the exclusive jurisdiction of the courts of Singapore.',
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
      {expanded && <Text style={styles.sectionBody}>{section.body}</Text>}
    </TouchableOpacity>
  );
}

export default function TermsOfServiceScreen() {
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
        <Text style={styles.headerTitle}>Terms of Service</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.pageTitle}>Terms of Service</Text>
        <Text style={styles.updated}>Last updated: March 2026</Text>
        <Text style={styles.intro}>
          Please review our terms below. Tap each section for details.
        </Text>

        {SECTIONS.map((section, i) => (
          <CollapsibleSection key={i} section={section} />
        ))}

        {/* Company Footer */}
        <View style={styles.companyFooter}>
          <Text style={styles.companyText}>
            Parallel Labs Pte. Ltd.{'\n'}
            Singapore
          </Text>
          <Text style={styles.contactText}>
            support@theparallellab.com
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
  companyFooter: {
    marginTop: Spacing.xl,
    paddingTop: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
    alignItems: 'center',
    gap: Spacing.xs,
  },
  companyText: {
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.sm,
    color: Colors.textTertiary,
    textAlign: 'center',
    lineHeight: 20,
  },
  contactText: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
    color: Colors.primary,
  },
});
