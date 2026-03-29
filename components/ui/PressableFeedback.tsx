import React, { useRef } from 'react';
import { AccessibilityRole, Animated, TouchableWithoutFeedback, ViewStyle } from 'react-native';

type Props = {
  children: React.ReactNode;
  onPress: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
  style?: ViewStyle;
  scaleValue?: number;
  accessibilityRole?: AccessibilityRole;
  accessibilityLabel?: string;
};

export function PressableFeedback({
  children,
  onPress,
  onLongPress,
  disabled = false,
  style,
  scaleValue = 0.97,
  accessibilityRole,
  accessibilityLabel,
}: Props) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.parallel([
      Animated.timing(scale, { toValue: scaleValue, duration: 100, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0.85, duration: 100, useNativeDriver: true }),
    ]).start();
  };

  const handlePressOut = () => {
    Animated.parallel([
      Animated.timing(scale, { toValue: 1, duration: 150, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 150, useNativeDriver: true }),
    ]).start();
  };

  return (
    <TouchableWithoutFeedback
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
    >
      <Animated.View style={[{ transform: [{ scale }], opacity }, style]}>
        {children}
      </Animated.View>
    </TouchableWithoutFeedback>
  );
}
