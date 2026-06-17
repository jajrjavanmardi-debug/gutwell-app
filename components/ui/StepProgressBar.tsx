import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { BorderRadius, Colors } from '../../constants/theme';

type StepProgressBarProps = {
  /** Fill amount, 0..1 (clamped). */
  progress: number;
  /** Bar thickness in px. Default 4. */
  height?: number;
  trackColor?: string;
  fillColor?: string;
};

export function StepProgressBar({
  progress,
  height = 4,
  trackColor = Colors.onboardingProgressTrack,
  fillColor = Colors.onboardingProgressFill,
}: StepProgressBarProps) {
  const clamped = Math.min(1, Math.max(0, progress));
  const animatedProgress = useSharedValue(clamped);

  useEffect(() => {
    animatedProgress.value = withTiming(clamped, { duration: 300 });
  }, [clamped, animatedProgress]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${animatedProgress.value * 100}%`,
  }));

  return (
    <View
      style={[
        styles.track,
        { height, borderRadius: BorderRadius.full, backgroundColor: trackColor },
      ]}
    >
      <Animated.View
        style={[
          styles.fill,
          { borderRadius: BorderRadius.full, backgroundColor: fillColor },
          fillStyle,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: '100%',
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
  },
});
