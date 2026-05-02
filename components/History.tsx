import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { BorderRadius, Colors, FontFamily, FontSize, Spacing } from '../constants/theme';

type HistoryItem = {
  label: string;
  count: number;
  maxCount: number;
};

type HistoryProps = {
  title: string;
  items: HistoryItem[];
};

export default function History({ title, items }: HistoryProps) {
  if (items.length === 0) return null;

  return (
    <>
      <Text style={styles.sectionTitle}>{title}</Text>
      {items.map((item) => (
        <View key={item.label} style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.name}>{item.label}</Text>
            <View style={styles.badge}>
              <Text style={styles.count}>{item.count}x</Text>
            </View>
          </View>
          <View style={styles.bar}>
            <View style={[styles.fill, { width: `${(item.count / Math.max(1, item.maxCount)) * 100}%` }]} />
          </View>
        </View>
      ))}
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
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  name: {
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.md,
    color: Colors.text,
  },
  badge: {
    backgroundColor: `${Colors.primary}12`,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
  },
  count: {
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xs,
    color: Colors.primary,
  },
  bar: {
    height: 6,
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: 3,
    marginTop: Spacing.sm,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 3,
  },
});
