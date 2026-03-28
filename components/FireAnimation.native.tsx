import React from 'react';
import { Animated } from 'react-native';
import LottieView from 'lottie-react-native';

const AnimatedLottieView = Animated.createAnimatedComponent(LottieView);

const FIRE_SOURCES = [
  require('../assets/lottie/fire-milestone-0.json'),
  require('../assets/lottie/fire-milestone-1.json'),
  require('../assets/lottie/fire-milestone-2.json'),
  require('../assets/lottie/fire-milestone-3.json'),
  require('../assets/lottie/fire-milestone-4.json'),
  require('../assets/lottie/fire-milestone-5.json'),
];

interface FireAnimationProps {
  milestone: 0 | 1 | 2 | 3 | 4 | 5;
  progress?: Animated.Value;
  size?: number;
  staticFrame?: number; // 0-1, if provided renders a static frame
}

export const FireAnimation: React.FC<FireAnimationProps> = ({
  milestone,
  progress,
  size = 96,
  staticFrame,
}) => {
  if (staticFrame !== undefined) {
    return (
      <LottieView
        source={FIRE_SOURCES[milestone]}
        autoPlay={false}
        loop={false}
        progress={staticFrame}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <AnimatedLottieView
      source={FIRE_SOURCES[milestone]}
      progress={progress}
      style={{ width: size, height: size }}
    />
  );
};
