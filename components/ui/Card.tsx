import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { Colors, BorderRadius, Spacing, Shadows } from '../../constants/theme';

type Props = {
  children: React.ReactNode;
  style?: ViewStyle;
  variant?: 'default' | 'outlined' | 'elevated';
};

export function Card({ children, style, variant = 'default' }: Props) {
  return (
    <View style={[styles.base, styles[variant], style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    backgroundColor: Colors.surface,
  },
  default: {
    ...Shadows.sm,
  },
  outlined: {
    borderWidth: 1,
    borderColor: Colors.border,
  },
  elevated: {
    ...Shadows.md,
  },
});
