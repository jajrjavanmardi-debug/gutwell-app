import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { BorderRadius, Colors, FontFamily, FontSize, Shadows, Spacing } from '../constants/theme';

type ChartComponentProps = {
  title: string;
  children: React.ReactNode;
};

export default function ChartComponent({ title, children }: ChartComponentProps) {
  return (
    <>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.chartCard}>{children}</View>
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
  chartCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.sm,
  },
});
