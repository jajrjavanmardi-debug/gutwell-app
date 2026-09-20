import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BorderRadius, Colors, FontFamily, FontSize, Shadows, Spacing } from '../constants/theme';
import { useTranslation } from '../lib/i18n';

type TriggerFoodItem = {
  foodName: string;
  riskLevel: 'high' | 'medium' | 'low';
  correlationPct: number;
  topSymptom?: string | null;
};

type TriggerFoodsBoxProps = {
  triggerFoods: TriggerFoodItem[];
};

/**
 * Strength of an OBSERVED pattern — never a risk level.
 *
 * `riskLevel` is the field name lib/correlations.ts already produces and is
 * left untouched; only its presentation changes. It used to render as
 * "HIGH" / "MEDIUM" / "LOW" in a red-to-green badge, which reads as a verdict
 * about a food: unhedged risk language, hardcoded in English, sitting inside a
 * card whose own title and empty state are carefully hedged ("Possible Trigger
 * Foods", "Log 2+ weeks of meals to see possible patterns"). The badge won.
 *
 * The new labels describe how much co-occurrence has been logged, which is all
 * the data supports, and the palette drops red so no food is colour-coded as
 * dangerous.
 */
const PATTERN_LABEL_KEY = {
  high: 'patternStronger',
  medium: 'patternPossible',
  low: 'patternEarly',
} as const;

export default function TriggerFoodsBox({ triggerFoods }: TriggerFoodsBoxProps) {
  const t = useTranslation();
  return (
    <>
      <Text style={styles.sectionTitle}>{t.components.triggerFoods.title}</Text>
      {triggerFoods.length > 0 ? (
        <>
          {triggerFoods.map((item, i) => {
            // Neutral accent for the strongest pattern instead of the former
            // '#E07070' alarm red — a stronger pattern is more worth looking
            // at, not more dangerous.
            const patternColor =
              item.riskLevel === 'high'
                ? Colors.accent
                : item.riskLevel === 'medium'
                  ? Colors.primaryLight
                  : Colors.textTertiary;
            const patternLabel = t.progress[PATTERN_LABEL_KEY[item.riskLevel]];
            return (
              <View key={i} style={styles.triggerCard}>
                <View style={styles.triggerRow}>
                  <Text style={styles.triggerFood}>{item.foodName}</Text>
                  <View style={[styles.riskBadge, { backgroundColor: `${patternColor}18`, borderWidth: 1, borderColor: `${patternColor}40` }]}>
                    <Text style={[styles.riskText, { color: patternColor }]}>{patternLabel}</Text>
                  </View>
                </View>
                <View style={styles.correlationBarRow}>
                  <View style={styles.correlationBarTrack}>
                    <View style={[styles.correlationBarFill, { width: `${item.correlationPct}%`, backgroundColor: patternColor }]} />
                  </View>
                  {/* Was a bare "{pct}% correlation" — a statistic with no
                      stated denominator. This names what was counted. */}
                  <Text style={styles.correlationPctText}>
                    {t.progress.patternCoOccurrence.replace('{pct}', String(item.correlationPct))}
                  </Text>
                </View>
                {item.topSymptom ? (
                  <Text style={styles.topSymptomText}>→ {item.topSymptom.replace(/_/g, ' ')}</Text>
                ) : null}
              </View>
            );
          })}
        </>
      ) : (
        <View style={styles.insufficientCard}>
          <Ionicons name="analytics-outline" size={28} color={Colors.textTertiary} />
          <Text style={styles.insufficientTitle}>{t.components.triggerFoods.emptyTitle}</Text>
          <Text style={styles.insufficientText}>{t.components.triggerFoods.emptyMessage}</Text>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.lg,
    color: Colors.text,
    marginBottom: Spacing.sm,
    marginTop: Spacing.xs,
  },
  triggerCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.sm,
  },
  triggerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  triggerFood: {
    fontFamily: FontFamily.displayMedium,
    fontSize: 15,
    color: Colors.text,
    textTransform: 'capitalize',
  },
  riskBadge: {
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: 3,
  },
  riskText: {
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xs,
  },
  correlationBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  correlationBarTrack: {
    flex: 1,
    height: 6,
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: 3,
    overflow: 'hidden',
  },
  correlationBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  correlationPctText: {
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    minWidth: 100,
  },
  topSymptomText: {
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.xs,
    color: Colors.textTertiary,
    marginTop: Spacing.xs,
    textTransform: 'capitalize',
  },
  insufficientCard: {
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  insufficientTitle: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.md,
    color: Colors.text,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  insufficientText: {
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.sm,
    color: Colors.textTertiary,
    textAlign: 'center',
  },
});
