import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import * as Haptics from 'expo-haptics';
import {
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Colors, FontFamily, FontSize } from '../../constants/theme';

export type RulerSliderProps = {
  min: number;
  max: number;
  /** Spacing between adjacent values. Default 0.1. */
  step?: number;
  value: number;
  onChange: (value: number) => void;
  unit?: string;
};

const TICK_SPACING = 10; // horizontal px between ticks
const RULER_HEIGHT = 64;

export function RulerSlider({
  min,
  max,
  step = 0.1,
  value,
  onChange,
  unit,
}: RulerSliderProps) {
  const scrollRef = useRef<ScrollView>(null);
  const lastIndexRef = useRef<number>(-1);
  const sideInsetRef = useRef<number>(0);
  const didInitRef = useRef<boolean>(false);

  const clamp = useCallback(
    (v: number) => Math.max(min, Math.min(max, v)),
    [min, max],
  );

  // Total number of ticks, guarding against float drift.
  const tickCount = useMemo(
    () => Math.max(1, Math.round((max - min) / step) + 1),
    [max, min, step],
  );

  const valueToIndex = useCallback(
    (v: number) => {
      const idx = Math.round((clamp(v) - min) / step);
      return Math.max(0, Math.min(tickCount - 1, idx));
    },
    [clamp, min, step, tickCount],
  );

  const indexToValue = useCallback(
    (idx: number) => {
      const raw = min + idx * step;
      // Round to the precision implied by step to avoid float noise.
      const decimals = step < 1 ? String(step).split('.')[1]?.length ?? 1 : 0;
      return clamp(Number(raw.toFixed(decimals)));
    },
    [clamp, min, step],
  );

  const scrollToIndex = useCallback(
    (idx: number, animated: boolean) => {
      scrollRef.current?.scrollTo({ x: idx * TICK_SPACING, animated });
    },
    [],
  );

  // Re-sync scroll position when the value changes externally (after layout).
  useEffect(() => {
    if (!didInitRef.current) return;
    const idx = valueToIndex(value);
    if (idx !== lastIndexRef.current) {
      lastIndexRef.current = idx;
      scrollToIndex(idx, false);
    }
  }, [value, valueToIndex, scrollToIndex]);

  const handleLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const width = e.nativeEvent.layout.width;
      sideInsetRef.current = width / 2;
      // Initial scroll to the current value once we know our width.
      if (!didInitRef.current) {
        didInitRef.current = true;
        const idx = valueToIndex(value);
        lastIndexRef.current = idx;
        // Defer so the contentContainer padding is applied first.
        requestAnimationFrame(() => scrollToIndex(idx, false));
      }
    },
    [value, valueToIndex, scrollToIndex],
  );

  const handleMomentumEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetX = e.nativeEvent.contentOffset.x;
      const idx = Math.max(
        0,
        Math.min(tickCount - 1, Math.round(offsetX / TICK_SPACING)),
      );
      if (idx !== lastIndexRef.current) {
        lastIndexRef.current = idx;
        Haptics.selectionAsync().catch(() => {});
        onChange(indexToValue(idx));
      }
    },
    [indexToValue, onChange, tickCount],
  );

  const sideInset = sideInsetRef.current;

  return (
    <View style={styles.container}>
      {unit !== undefined && (
        <Text style={styles.unit}>{unit}</Text>
      )}
      <View style={styles.rulerWrap} onLayout={handleLayout}>
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={TICK_SPACING}
          decelerationRate="fast"
          scrollEventThrottle={16}
          onMomentumScrollEnd={handleMomentumEnd}
          contentContainerStyle={{ paddingHorizontal: sideInset }}
        >
          {Array.from({ length: tickCount }).map((_, idx) => {
            const isMajor = idx % 10 === 0;
            return (
              <View key={idx} style={styles.tickSlot}>
                <View
                  style={[
                    styles.tick,
                    isMajor ? styles.tickMajor : styles.tickMinor,
                  ]}
                />
              </View>
            );
          })}
        </ScrollView>

        {/* Fixed center indicator */}
        <View pointerEvents="none" style={styles.centerIndicator} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    width: '100%',
  },
  unit: {
    color: Colors.text,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.hero,
    marginBottom: 12,
    textAlign: 'center',
  },
  rulerWrap: {
    height: RULER_HEIGHT,
    width: '100%',
    justifyContent: 'center',
  },
  tickSlot: {
    width: TICK_SPACING,
    height: RULER_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tick: {
    width: 2,
    borderRadius: 1,
    backgroundColor: Colors.border,
  },
  tickMinor: {
    height: 24,
  },
  tickMajor: {
    height: 44,
    backgroundColor: Colors.textTertiary,
  },
  centerIndicator: {
    position: 'absolute',
    left: '50%',
    marginLeft: -1.5,
    top: 4,
    bottom: 4,
    width: 3,
    borderRadius: 2,
    backgroundColor: Colors.secondary,
  },
});
