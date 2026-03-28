import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, FontSize, BorderRadius, FontFamily, Shadows } from '../constants/theme';
import { calculateLevel, getNextLevel, getLevelProgress, GUT_LEVELS } from '../lib/levels';

type Props = {
  totalPoints: number;
  compact?: boolean;
};

export function GutLevelBadge({ totalPoints, compact = false }: Props) {
  const level = calculateLevel(totalPoints);
  const nextLevel = getNextLevel(totalPoints);
  const progress = getLevelProgress(totalPoints);
  const levelColor = (Colors.level as Record<string, string>)[level.key] || Colors.secondary;

  if (compact) {
    return (
      <View style={[styles.compactBadge, { backgroundColor: levelColor + '18' }]}>
        <Ionicons name={level.icon as any} size={14} color={levelColor} />
        <Text style={[styles.compactText, { color: levelColor }]}>{level.name}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.iconCircle, { backgroundColor: levelColor + '18', borderColor: levelColor }]}>
        <Ionicons name={level.icon as any} size={28} color={levelColor} />
      </View>
      <Text style={styles.levelName}>{level.name}</Text>
      <Text style={styles.points}>{totalPoints} points</Text>
      {nextLevel && (
        <View style={styles.progressWrap}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progress * 100}%`, backgroundColor: levelColor }]} />
          </View>
          <Text style={styles.nextLabel}>{nextLevel.minPoints - totalPoints} pts to {nextLevel.name}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: Spacing.xs,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    marginBottom: Spacing.xs,
  },
  levelName: {
    fontFamily: FontFamily.displayMedium,
    fontSize: FontSize.xl,
    color: Colors.text,
  },
  points: {
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  progressWrap: {
    width: '100%',
    maxWidth: 200,
    marginTop: Spacing.sm,
  },
  progressTrack: {
    height: 6,
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  nextLabel: {
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.xs,
    color: Colors.textTertiary,
    textAlign: 'center',
    marginTop: Spacing.xs,
  },
  // Compact variant
  compactBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  compactText: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.xs,
  },
});
