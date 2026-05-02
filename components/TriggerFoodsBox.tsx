import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BorderRadius, Colors, FontFamily, FontSize, Shadows, Spacing } from '../constants/theme';

type TriggerFoodItem = {
  foodName: string;
  riskLevel: 'high' | 'medium' | 'low';
  correlationPct: number;
  topSymptom?: string;
};

type TriggerFoodsBoxProps = {
  triggerFoods: TriggerFoodItem[];
};

export default function TriggerFoodsBox({ triggerFoods }: TriggerFoodsBoxProps) {
  return (
    <>
      <Text style={styles.sectionTitle}>Trigger Foods</Text>
      {triggerFoods.length > 0 ? (
        <>
          {triggerFoods.map((item, i) => {
            const riskColor = item.riskLevel === 'high' ? '#E07070' : item.riskLevel === 'medium' ? Colors.accent : Colors.secondary;
            return (
              <View key={i} style={styles.triggerCard}>
                <View style={styles.triggerRow}>
                  <Text style={styles.triggerFood}>{item.foodName}</Text>
                  <View style={[styles.riskBadge, { backgroundColor: `${riskColor}18`, borderWidth: 1, borderColor: `${riskColor}40` }]}>
                    <Text style={[styles.riskText, { color: riskColor }]}>{item.riskLevel.toUpperCase()}</Text>
                  </View>
                </View>
                <View style={styles.correlationBarRow}>
                  <View style={styles.correlationBarTrack}>
                    <View style={[styles.correlationBarFill, { width: `${item.correlationPct}%`, backgroundColor: riskColor }]} />
                  </View>
                  <Text style={styles.correlationPctText}>{item.correlationPct}% correlation</Text>
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
          <Text style={styles.insufficientTitle}>No Trigger Foods Yet</Text>
          <Text style={styles.insufficientText}>Log 2+ weeks of meals to detect trigger foods.</Text>
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
