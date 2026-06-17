import React from 'react';
import { View, Text, Pressable, StyleSheet, ViewStyle } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { Colors, BorderRadius, FontFamily, FontSize, Spacing } from '../../constants/theme';

type StatCardProps = {
  icon?: React.ReactNode;
  value: string;
  label: string;
  /** Tints the icon circle. Defaults to Colors.secondary. */
  accentColor?: string;
  /** Optional 0..1 — draws a thin progress arc around the icon badge. */
  progress?: number;
  onPress?: () => void;
  style?: ViewStyle;
};

const BADGE_SIZE = 44;
const ARC_STROKE = 3;
const ARC_RADIUS = (BADGE_SIZE + ARC_STROKE + 4) / 2;
const ARC_DIAMETER = ARC_RADIUS * 2 + ARC_STROKE;
const ARC_CIRCUMFERENCE = 2 * Math.PI * ARC_RADIUS;

export function StatCard({
  icon,
  value,
  label,
  accentColor = Colors.secondary,
  progress,
  onPress,
  style,
}: StatCardProps) {
  const hasProgress = typeof progress === 'number';
  const clamped = hasProgress ? Math.max(0, Math.min(1, progress as number)) : 0;

  const content = (
    <>
      <View style={styles.badgeWrap}>
        {hasProgress && (
          <Svg
            width={ARC_DIAMETER}
            height={ARC_DIAMETER}
            style={StyleSheet.absoluteFill}
          >
            <Circle
              cx={ARC_DIAMETER / 2}
              cy={ARC_DIAMETER / 2}
              r={ARC_RADIUS}
              stroke={Colors.ringTrack}
              strokeWidth={ARC_STROKE}
              fill="none"
            />
            <Circle
              cx={ARC_DIAMETER / 2}
              cy={ARC_DIAMETER / 2}
              r={ARC_RADIUS}
              stroke={accentColor}
              strokeWidth={ARC_STROKE}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${ARC_CIRCUMFERENCE} ${ARC_CIRCUMFERENCE}`}
              strokeDashoffset={ARC_CIRCUMFERENCE * (1 - clamped)}
              transform={`rotate(-90 ${ARC_DIAMETER / 2} ${ARC_DIAMETER / 2})`}
            />
          </Svg>
        )}
        <View style={[styles.badge, { backgroundColor: accentColor + '22' }]}>
          {icon}
        </View>
      </View>

      <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={styles.label} numberOfLines={2}>
        {label}
      </Text>
    </>
  );

  if (onPress) {
    const handlePress = () => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onPress();
    };
    return (
      <Pressable
        onPress={handlePress}
        style={({ pressed }) => [styles.card, pressed && styles.pressed, style]}
        accessibilityRole="button"
        accessibilityLabel={`${value}, ${label}`}
      >
        {content}
      </Pressable>
    );
  }

  return <View style={[styles.card, style]}>{content}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  pressed: {
    opacity: 0.85,
  },
  badgeWrap: {
    width: ARC_DIAMETER,
    height: ARC_DIAMETER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    fontFamily: FontFamily.displaySemiBold,
    fontSize: FontSize.xxl,
    color: Colors.text,
  },
  label: {
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
});
