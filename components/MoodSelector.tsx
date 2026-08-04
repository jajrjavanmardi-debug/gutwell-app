import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Colors, Spacing, FontSize, BorderRadius, FontFamily } from '../constants/theme';
import { useTranslation } from '../lib/i18n';

// `value` is the 1–5 score persisted to Supabase; labels come from
// t.components.mood.levels, indexed by value - 1.
const MOODS = [
  { value: 1, emoji: '😞' },
  { value: 2, emoji: '😔' },
  { value: 3, emoji: '😐' },
  { value: 4, emoji: '😊' },
  { value: 5, emoji: '😄' },
];

type Props = {
  value: number | null;
  onChange: (value: number) => void;
};

export function MoodSelector({ value, onChange }: Props) {
  const t = useTranslation();
  const moodLabel = (v: number) => t.components.mood.levels[v - 1] ?? String(v);
  return (
    <View style={styles.container}>
      {MOODS.map(mood => {
        const isSelected = value === mood.value;
        return (
          <TouchableOpacity
            key={mood.value}
            style={[
              styles.moodItem,
              isSelected && {
                backgroundColor: Colors.mood[mood.value] + '18',
                borderColor: Colors.mood[mood.value],
              },
            ]}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onChange(mood.value); }}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={moodLabel(mood.value)}
            accessibilityState={{ selected: isSelected }}
          >
            <Text style={styles.emoji}>{mood.emoji}</Text>
            <Text style={[
              styles.label,
              isSelected && { color: Colors.mood[mood.value], fontFamily: FontFamily.sansSemiBold },
            ]}>
              {moodLabel(mood.value)}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  moodItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.border,
    gap: 4,
  },
  emoji: {
    fontSize: 28,
  },
  label: {
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.xs,
    color: Colors.textTertiary,
  },
});
