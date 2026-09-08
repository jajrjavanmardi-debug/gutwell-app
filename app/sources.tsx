import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Colors, Spacing, FontSize, BorderRadius, FontFamily } from '../constants/theme';
import { useTranslation } from '../lib/i18n';
import {
  SOURCES,
  SOURCE_CATEGORY_ORDER,
  sourcesByCategory,
  type Source,
  type SourceCategory,
} from '../lib/sources';

/**
 * Sources & Methodology — App Store Guideline 1.4.1.
 *
 * The screen deliberately keeps two things apart, because conflating them is
 * exactly what would be misleading:
 *
 *   SOURCES      external health information, with a citation you can open.
 *   METHODOLOGY  GutWell's own scores and pattern analysis, which have NO
 *                external source because we built them. They get an honest
 *                explanation instead of a borrowed citation.
 *
 * Every source comes from the static registry in lib/sources.ts. Nothing on
 * this screen is generated at runtime or by a model.
 */

function SourceRow({ source, openLabel }: { source: Source; openLabel: string }) {
  const meta = source.year ? `${source.organization} · ${source.year}` : source.organization;

  return (
    <TouchableOpacity
      style={styles.sourceCard}
      activeOpacity={0.7}
      // A citation the user cannot open is not a citation. Failure is silent by
      // design: a dead link should not throw an error dialog at the user.
      onPress={() => {
        Linking.openURL(source.url).catch(() => {});
      }}
      accessibilityRole="link"
      accessibilityLabel={`${source.title}. ${meta}. ${openLabel}`}
    >
      <View style={styles.sourceHeader}>
        <Text style={styles.sourceTitle}>{source.title}</Text>
        <Ionicons name="open-outline" size={16} color={Colors.textSecondary} />
      </View>
      <Text style={styles.sourceMeta}>{meta}</Text>
      <Text style={styles.sourceNote}>{source.note}</Text>
    </TouchableOpacity>
  );
}

function MethodologyCard({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.methodCard}>
      <Text style={styles.methodTitle}>{title}</Text>
      <Text style={styles.methodBody}>{body}</Text>
    </View>
  );
}

export default function SourcesScreen() {
  const t = useTranslation();
  const s = t.sources;

  // Only render a category that actually has entries, so removing a source can
  // never leave an empty heading behind.
  const categories = SOURCE_CATEGORY_ORDER.filter(
    (c) => sourcesByCategory(c).length > 0,
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
        >
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{s.title}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.intro}>{s.intro}</Text>

        {/* ── A. External sources ─────────────────────────────────────────── */}
        <Text style={styles.blockHeading}>{s.sourcesHeading}</Text>
        <Text style={styles.blockIntro}>{s.sourcesIntro}</Text>

        {categories.map((category) => (
          <View key={category} style={styles.categoryBlock}>
            <Text style={styles.categoryName}>
              {s.categoryNames[category as SourceCategory]}
            </Text>
            {sourcesByCategory(category).map((source) => (
              <SourceRow key={source.id} source={source} openLabel={s.openLink} />
            ))}
          </View>
        ))}

        {/* ── B. Methodology — ours, and deliberately uncited ─────────────── */}
        <Text style={styles.blockHeading}>{s.methodologyHeading}</Text>
        <Text style={styles.blockIntro}>{s.methodologyIntro}</Text>

        <MethodologyCard title={s.gutScoreTitle} body={s.gutScoreBody} />
        <MethodologyCard title={s.mealScoreTitle} body={s.mealScoreBody} />
        <MethodologyCard title={s.patternsTitle} body={s.patternsBody} />
        <MethodologyCard title={s.aiTitle} body={s.aiBody} />

        {/* ── Closing disclaimer ──────────────────────────────────────────── */}
        <View style={styles.disclaimerCard}>
          <Text style={styles.disclaimerTitle}>{s.disclaimerHeading}</Text>
          <Text style={styles.disclaimerBody}>{s.disclaimerBody}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  backBtn: { width: 32 },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: FontFamily.displayBold,
    fontSize: FontSize.lg,
    color: Colors.text,
  },
  headerSpacer: { width: 32 },
  scroll: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xxl },
  intro: {
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.sm,
    lineHeight: 21,
    color: Colors.textSecondary,
    marginBottom: Spacing.lg,
  },
  blockHeading: {
    fontFamily: FontFamily.displayBold,
    fontSize: FontSize.lg,
    color: Colors.text,
    marginTop: Spacing.lg,
    marginBottom: Spacing.xs,
  },
  blockIntro: {
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.sm,
    lineHeight: 21,
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
  },
  categoryBlock: { marginBottom: Spacing.md },
  categoryName: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
    color: Colors.primary,
    marginBottom: Spacing.xs,
  },
  sourceCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  sourceHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  sourceTitle: {
    flex: 1,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
    color: Colors.text,
  },
  sourceMeta: {
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  sourceNote: {
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.xs,
    lineHeight: 18,
    color: Colors.textTertiary,
    marginTop: Spacing.xs,
  },
  methodCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  methodTitle: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  methodBody: {
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.xs,
    lineHeight: 19,
    color: Colors.textSecondary,
  },
  disclaimerCard: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginTop: Spacing.lg,
  },
  disclaimerTitle: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  disclaimerBody: {
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.xs,
    lineHeight: 19,
    color: Colors.textSecondary,
  },
});
