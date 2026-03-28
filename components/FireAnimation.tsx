import React from 'react';
import { Text } from 'react-native';

// Web fallback — Lottie is not supported on web
const MILESTONE_EMOJIS = ['⬜', '🔥', '🔥', '🔥', '🔥', '🌟'];

interface FireAnimationProps {
  milestone: 0 | 1 | 2 | 3 | 4 | 5;
  progress?: unknown;
  size?: number;
  staticFrame?: number;
}

export const FireAnimation: React.FC<FireAnimationProps> = ({ milestone, size = 96 }) => (
  <Text style={{ fontSize: size * 0.6, textAlign: 'center' }}>
    {MILESTONE_EMOJIS[milestone]}
  </Text>
);
