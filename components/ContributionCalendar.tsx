import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Spacing, FontSize, BorderRadius, FontFamily } from '../constants/theme';

type Props = {
  /** Map of date string (YYYY-MM-DD) to completion count (0-4) */
  data: Record<string, number>;
  weeks?: number;
};

export function ContributionCalendar({ data, weeks = 12 }: Props) {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0 = Sun
  const totalDays = weeks * 7;

  // Generate dates going backwards from today
  const dates: string[] = [];
  for (let i = totalDays - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().split('T')[0]);
  }

  // Organize into weeks (columns)
  const weekColumns: string[][] = [];
  let currentWeek: string[] = [];
  // Pad the first week to align to Sunday
  const firstDate = new Date(dates[0]);
  const firstDay = firstDate.getDay();
  for (let i = 0; i < firstDay; i++) {
    currentWeek.push('');
  }
  for (const date of dates) {
    currentWeek.push(date);
    if (currentWeek.length === 7) {
      weekColumns.push(currentWeek);
      currentWeek = [];
    }
  }
  if (currentWeek.length > 0) {
    weekColumns.push(currentWeek);
  }

  const getLevel = (date: string): number => {
    if (!date) return -1; // empty cell
    return data[date] || 0;
  };

  const levelColors = [
    Colors.calendarEmpty,
    Colors.calendarLevel1,
    Colors.calendarLevel2,
    Colors.calendarLevel3,
    Colors.calendarLevel4,
  ];

  const dayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  return (
    <View style={styles.container}>
      <View style={styles.dayLabels}>
        {dayLabels.map((label, i) => (
          <Text key={i} style={styles.dayLabel}>
            {i % 2 === 1 ? label : ''}
          </Text>
        ))}
      </View>
      <View style={styles.grid}>
        {weekColumns.map((week, wi) => (
          <View key={wi} style={styles.column}>
            {week.map((date, di) => {
              const level = getLevel(date);
              if (level === -1) return <View key={di} style={styles.cellEmpty} />;
              return (
                <View
                  key={di}
                  style={[
                    styles.cell,
                    { backgroundColor: levelColors[Math.min(level, 4)] },
                  ]}
                />
              );
            })}
          </View>
        ))}
      </View>
      <View style={styles.legend}>
        <Text style={styles.legendText}>Less</Text>
        {levelColors.map((color, i) => (
          <View key={i} style={[styles.legendCell, { backgroundColor: color }]} />
        ))}
        <Text style={styles.legendText}>More</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayLabels: {
    justifyContent: 'space-around',
    marginRight: 4,
  },
  dayLabel: {
    fontFamily: FontFamily.sansRegular,
    fontSize: 9,
    color: Colors.textTertiary,
    height: 12,
    lineHeight: 12,
  },
  grid: {
    flexDirection: 'row',
    gap: 2,
    flex: 1,
  },
  column: {
    gap: 2,
    flex: 1,
  },
  cell: {
    height: 12,
    borderRadius: 2,
  },
  cellEmpty: {
    height: 12,
  },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: Spacing.sm,
    width: '100%',
    justifyContent: 'flex-end',
  },
  legendCell: {
    width: 10,
    height: 10,
    borderRadius: 2,
  },
  legendText: {
    fontFamily: FontFamily.sansRegular,
    fontSize: 9,
    color: Colors.textTertiary,
  },
});
