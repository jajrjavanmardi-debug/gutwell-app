import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { BorderRadius, Colors, FontFamily, FontSize, Spacing } from '../constants/theme';

type SafeFoodItem = {
  foodName: string;
  symptomFreeRate: number;
};

type SafeFoodsBoxProps = {
  safeFoods: SafeFoodItem[];
};

export default function SafeFoodsBox({ safeFoods }: SafeFoodsBoxProps) {
  if (safeFoods.length === 0) return null;

  return (
    <>
      <Text style={styles.sectionTitle}>Safe Foods</Text>
      <View style={styles.safeFoodsRow}>
        {safeFoods.map((item, i) => (
          <View key={i} style={styles.safeFoodChip}>
            <Text style={styles.safeFoodText}>✓ {item.foodName} · {item.symptomFreeRate}% symptom-free</Text>
          </View>
        ))}
      </View>
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
  safeFoodsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  safeFoodChip: {
    backgroundColor: `${Colors.primary}12`,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 1,
    borderWidth: 1,
    borderColor: `${Colors.primary}20`,
  },
  safeFoodText: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.xs,
    color: Colors.primary,
    textTransform: 'capitalize',
  },
});
