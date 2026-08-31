import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Colors, Spacing, FontSize, BorderRadius, FontFamily } from '../constants/theme';
import { useTranslation } from '../lib/i18n';

type SectionData = {
  title: string;
  body: string;
};


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
  const t = useTranslation();
  const legal = t.legalScreens;

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
        <Text style={styles.headerTitle}>{legal.termsOfServiceTitle}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.pageTitle}>{legal.termsOfServiceTitle}</Text>
        <Text style={styles.updated}>{legal.lastUpdated}</Text>
        <Text style={styles.intro}>{legal.termsIntro}</Text>

        {legal.termsSections.map((section: SectionData, i: number) => (
          <CollapsibleSection key={i} section={section} />
        ))}

        {/* Operator Footer — the contracting party, matching the Privacy screen. */}
        <View style={styles.companyFooter}>
          <Text style={styles.companyText}>
            {legal.operatorName}{'\n'}
            {legal.operatorAddress}
          </Text>
          <Text style={styles.contactText}>
            {legal.contactEmail}
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
