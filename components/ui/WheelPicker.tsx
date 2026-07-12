import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import * as Haptics from 'expo-haptics';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { BorderRadius, Colors, FontFamily, FontSize } from '../../constants/theme';

export type WheelPickerOption = { label: string; value: string | number };

export type WheelPickerProps = {
  options: WheelPickerOption[];
  value: string | number;
  onChange: (value: string | number) => void;
  /** Must be odd. Default 5. */
  visibleCount?: number;
  /** Height of each row in px. Default 44. */
  itemHeight?: number;
};

export function WheelPicker({
  options,
  value,
  onChange,
  visibleCount = 5,
  itemHeight = 44,
}: WheelPickerProps) {
  const scrollRef = useRef<ScrollView>(null);
  const lastIndexRef = useRef<number>(-1);

  // Ensure an odd count so a single row can sit dead-center.
  const odd = visibleCount % 2 === 0 ? visibleCount + 1 : visibleCount;
  const containerHeight = odd * itemHeight;
  const padding = ((odd - 1) / 2) * itemHeight;

  const clampIndex = useCallback(
    (idx: number) => Math.max(0, Math.min(options.length - 1, idx)),
    [options.length],
  );

  const selectedIndex = useMemo(() => {
    const idx = options.findIndex((o) => o.value === value);
    return idx < 0 ? 0 : idx;
  }, [options, value]);

  // Scroll to the current value on mount and whenever it changes externally.
  useEffect(() => {
    lastIndexRef.current = selectedIndex;
    scrollRef.current?.scrollTo({
      y: selectedIndex * itemHeight,
      animated: false,
    });
  }, [selectedIndex, itemHeight]);

  const handleMomentumEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetY = e.nativeEvent.contentOffset.y;
      const idx = clampIndex(Math.round(offsetY / itemHeight));
      const option = options[idx];
      if (!option) return;
      if (idx !== lastIndexRef.current) {
        lastIndexRef.current = idx;
        Haptics.selectionAsync().catch(() => {});
        onChange(option.value);
      }
    },
    [clampIndex, itemHeight, onChange, options],
  );

  return (
    <View style={[styles.container, { height: containerHeight }]}>
      {/* Centered selection band */}
      <View
        pointerEvents="none"
        style={[
          styles.highlight,
          { height: itemHeight, top: (containerHeight - itemHeight) / 2 },
        ]}
      />
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        snapToInterval={itemHeight}
        decelerationRate="fast"
        scrollEventThrottle={16}
        onMomentumScrollEnd={handleMomentumEnd}
        contentContainerStyle={{ paddingVertical: padding }}
      >
        {options.map((option, idx) => {
          const isSelected = idx === selectedIndex;
          return (
            <View
              key={`${option.value}-${idx}`}
              style={[styles.row, { height: itemHeight }]}
            >
              <Text
                style={[
                  styles.label,
                  { fontSize: isSelected ? FontSize.xl : FontSize.lg },
                  isSelected ? styles.labelSelected : styles.labelUnselected,
                ]}
                numberOfLines={1}
              >
                {option.label}
              </Text>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    overflow: 'hidden',
  },
  highlight: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: BorderRadius.lg,
  },
  row: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    textAlign: 'center',
  },
  labelSelected: {
    color: Colors.text,
    fontFamily: FontFamily.sansSemiBold,
  },
  labelUnselected: {
    color: 'rgba(255,255,255,0.35)',
    fontFamily: FontFamily.sansRegular,
  },
});
