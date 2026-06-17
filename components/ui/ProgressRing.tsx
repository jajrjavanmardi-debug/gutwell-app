import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { Colors } from '../../constants/theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type ProgressRingProps = {
  progress: number; /* 0..1, clamp */
  size?: number; /* default 220 */
  strokeWidth?: number; /* default 18 */
  trackColor?: string;
  fillColor?: string;
  children?: React.ReactNode;
};

const clamp01 = (n: number): number => {
  'worklet';
  if (Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
};

export function ProgressRing({
  progress,
  size = 220,
  strokeWidth = 18,
  trackColor = Colors.ringTrack,
  fillColor = Colors.ringFill,
  children,
}: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;

  // Drives the visible fill fraction; animated whenever `progress` changes.
  const animatedProgress = useSharedValue(clamp01(progress));

  useEffect(() => {
    animatedProgress.value = withTiming(clamp01(progress), {
      duration: 700,
      easing: Easing.out(Easing.cubic),
    });
  }, [progress, animatedProgress]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - clamp01(animatedProgress.value)),
  }));

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        {/* Track */}
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Fill — starts at 12 o'clock via -90deg rotation around the center */}
        <AnimatedCircle
          cx={center}
          cy={center}
          r={radius}
          stroke={fillColor}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          animatedProps={animatedProps}
          originX={center}
          originY={center}
          rotation={-90}
        />
      </Svg>
      <View style={styles.center} pointerEvents="none">
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
