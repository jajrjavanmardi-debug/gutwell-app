import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Colors, Spacing, FontSize, BorderRadius, FontFamily, Shadows } from '../constants/theme';

type Props = {
  glasses: number;
  onAdd: () => void;
  onRemove: () => void;
  goal?: number;
};

export function WaterTracker({ glasses, onAdd, onRemove, goal = 8 }: Props) {
  const progress = Math.min(glasses / goal, 1);

  const handleAdd = () => {
    if (glasses + 1 >= goal) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onAdd();
  };

  const handleRemove = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onRemove();
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.iconWrap}>
          <Ionicons name="water" size={20} color={Colors.secondary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Hydration</Text>
          <Text style={styles.subtitle}>{glasses} of {goal} glasses</Text>
        </View>
        <View style={styles.controls}>
          <TouchableOpacity
            onPress={handleRemove}
            style={[styles.controlBtn, glasses === 0 && styles.controlDisabled]}
            disabled={glasses === 0}
            activeOpacity={0.7}
          >
            <Ionicons name="remove" size={18} color={glasses === 0 ? Colors.textTertiary : Colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleAdd} style={styles.controlBtn} activeOpacity={0.7}>
            <Ionicons name="add" size={18} color={Colors.primary} />
          </TouchableOpacity>
        </View>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
      </View>
      <View style={styles.glassRow}>
        {Array.from({ length: goal }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.glass,
              i < glasses && styles.glassFilled,
            ]}
          >
            <Ionicons
              name="water"
              size={14}
              color={i < glasses ? Colors.secondary : Colors.border}
            />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    ...Shadows.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.secondary + '15',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.md,
    color: Colors.text,
  },
  subtitle: {
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  controls: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  controlBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surfaceSecondary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  controlDisabled: {
    opacity: 0.4,
  },
  progressTrack: {
    height: 6,
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: Spacing.md,
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.secondary,
    borderRadius: 3,
  },
  glassRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  glass: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.surfaceSecondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  glassFilled: {
    backgroundColor: Colors.secondary + '20',
  },
});
