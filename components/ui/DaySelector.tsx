import React, { useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Colors, BorderRadius, FontFamily, FontSize, Spacing } from '../../constants/theme';
import { getLocalDateKey } from '../../lib/date';

type DaySelectorProps = {
  selectedDate: Date;
  onSelectDate: (d: Date) => void;
  /** Window size ending today, default 7. */
  days?: number;
};

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

export function DaySelector({ selectedDate, onSelectDate, days = 7 }: DaySelectorProps) {
  const today = useMemo(() => startOfDay(new Date()), []);
  const todayKey = getLocalDateKey(today);
  const selectedKey = getLocalDateKey(selectedDate);

  // Window of `days` ending today (today is the last item).
  const items = useMemo(() => {
    const result: Date[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      result.push(d);
    }
    return result;
  }, [today, days]);

  const handleSelect = (d: Date, isFuture: boolean) => {
    if (isFuture) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSelectDate(d);
  };

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {items.map((d) => {
        const key = getLocalDateKey(d);
        const isSelected = key === selectedKey;
        const isToday = key === todayKey;
        const isFuture = d.getTime() > today.getTime();

        return (
          <Pressable
            key={key}
            onPress={() => handleSelect(d, isFuture)}
            disabled={isFuture}
            style={styles.item}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected, disabled: isFuture }}
            accessibilityLabel={d.toDateString()}
          >
            <Text
              style={[
                styles.weekday,
                isSelected && styles.weekdaySelected,
                isFuture && styles.dimmed,
              ]}
            >
              {WEEKDAY_LABELS[d.getDay()]}
            </Text>
            <View
              style={[
                styles.circle,
                isSelected && styles.circleSelected,
                isFuture && styles.dimmed,
              ]}
            >
              <Text style={[styles.dateNum, isSelected && styles.dateNumSelected]}>
                {d.getDate()}
              </Text>
            </View>
            <View style={[styles.dot, isToday && styles.dotToday]} />
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const CIRCLE_SIZE = 38;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.xs,
    paddingVertical: Spacing.sm,
  },
  item: {
    alignItems: 'center',
    gap: Spacing.xs,
    minWidth: CIRCLE_SIZE + Spacing.xs,
  },
  weekday: {
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.xs,
    color: Colors.textTertiary,
  },
  weekdaySelected: {
    // Cal AI emphasizes the selected weekday label above the filled circle.
    fontFamily: FontFamily.sansSemiBold,
    color: Colors.text,
  },
  // Cal AI: unselected days are thin dashed-outline rings (no fill).
  circle: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: Colors.border,
  },
  // Cal AI: selected day is a solid filled circle (Gutwell green).
  circleSelected: {
    backgroundColor: Colors.secondary,
    borderStyle: 'solid',
    borderColor: Colors.secondary,
  },
  dateNum: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.md,
    color: Colors.textSecondary,
  },
  dateNumSelected: {
    color: Colors.surface,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: BorderRadius.full,
    backgroundColor: 'transparent',
  },
  dotToday: {
    backgroundColor: Colors.secondary,
  },
  dimmed: {
    opacity: 0.35,
  },
});
