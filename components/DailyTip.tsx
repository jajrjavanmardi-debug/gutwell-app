import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, FontSize, BorderRadius, FontFamily, Shadows } from '../constants/theme';
import { getTodaysTip, getPersonalizedTip } from '../lib/tips';

type DailyTipProps = {
  gutConcern?: string | null;
  goal?: string | null;
};

export function DailyTip({ gutConcern, goal }: DailyTipProps = {}) {
  const tip = gutConcern || goal
    ? getPersonalizedTip(gutConcern, goal)
    : getTodaysTip();

  const categoryColors: Record<string, string> = {
    nutrition: Colors.secondary,
    lifestyle: Colors.primaryLight,
    science: Colors.accent,
    mindfulness: '#7C6FAE',
  };

  const color = categoryColors[tip.category] || Colors.secondary;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={[styles.iconWrap, { backgroundColor: color + '15' }]}>
          <Ionicons name={tip.icon as any} size={18} color={color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Daily Insight</Text>
          <Text style={styles.title}>{tip.title}</Text>
        </View>
        <View style={[styles.categoryPill, { backgroundColor: color + '15' }]}>
          <Text style={[styles.categoryText, { color }]}>
            {tip.category}
          </Text>
        </View>
      </View>
      <Text style={styles.body}>{tip.body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  label: {
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.xs,
    color: Colors.textTertiary,
  },
  title: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.md,
    color: Colors.text,
  },
  categoryPill: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
  },
  categoryText: {
    fontFamily: FontFamily.sansMedium,
    fontSize: 10,
    textTransform: 'capitalize',
  },
  body: {
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
});
