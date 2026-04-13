import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BorderRadius, Colors, FontFamily, FontSize, Shadows } from '../constants/theme';

type TrendBoxProps = {
  avgScore: number;
  bestDay?: string | null;
  trend: 'up' | 'down' | 'flat';
};

export default function TrendBox({ avgScore, bestDay, trend }: TrendBoxProps) {
  const trendIcon = trend === 'up' ? 'trending-up' : trend === 'down' ? 'trending-down' : 'remove';
  const trendColor = trend === 'up' ? Colors.secondary : trend === 'down' ? '#E07070' : Colors.textTertiary;
  const trendLabel = trend === 'up' ? 'Improving' : trend === 'down' ? 'Declining' : 'Steady';

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>This Week</Text>
        <View style={[styles.badge, { backgroundColor: `${trendColor}20` }]}>
          <Ionicons name={trendIcon} size={14} color={trendColor} />
          <Text style={[styles.badgeText, { color: trendColor }]}>{trendLabel}</Text>
        </View>
      </View>
      <View style={styles.row}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{avgScore}</Text>
          <Text style={styles.statLabel}>Avg Score</Text>
        </View>
        {bestDay ? (
          <View style={styles.bestDay}>
            <Text style={styles.bestDayValue}>{bestDay}</Text>
            <Text style={styles.statLabel}>Best Day</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: 20,
    marginBottom: 16,
    ...Shadows.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  title: {
    fontFamily: FontFamily.displayMedium,
    fontSize: FontSize.xl,
    color: Colors.text,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  badgeText: {
    fontFamily: FontFamily.sansMedium,
    fontSize: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  stat: { flex: 1 },
  statValue: {
    fontFamily: FontFamily.displayBold,
    fontSize: 28,
    color: Colors.text,
    lineHeight: 34,
  },
  bestDay: {
    flex: 1,
    borderLeftWidth: 1,
    borderLeftColor: Colors.divider,
    paddingLeft: 20,
  },
  bestDayValue: {
    fontFamily: FontFamily.displayMedium,
    fontSize: 16,
    color: Colors.text,
  },
  statLabel: {
    fontFamily: FontFamily.sansRegular,
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
});
