import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Colors, Spacing, FontSize, BorderRadius, FontFamily } from '../constants/theme';

const MOODS = [
  { value: 1, emoji: '😞', label: 'Bad' },
  { value: 2, emoji: '😔', label: 'Low' },
  { value: 3, emoji: '😐', label: 'Okay' },
  { value: 4, emoji: '😊', label: 'Good' },
  { value: 5, emoji: '😄', label: 'Great' },
];

type Props = {
  value: number | null;
  onChange: (value: number) => void;
};

export function MoodSelector({ value, onChange }: Props) {
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
            accessibilityLabel={`${mood.label} mood`}
            accessibilityState={{ selected: isSelected }}
          >
            <Text style={styles.emoji}>{mood.emoji}</Text>
            <Text style={[
              styles.label,
              isSelected && { color: Colors.mood[mood.value], fontFamily: FontFamily.sansSemiBold },
            ]}>
              {mood.label}
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
