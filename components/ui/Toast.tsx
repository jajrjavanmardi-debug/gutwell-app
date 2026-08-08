import React, { useEffect, useRef } from 'react';
import { Animated, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, BorderRadius, Spacing, FontSize, Shadows, FontFamily } from '../../constants/theme';

type ToastType = 'success' | 'error' | 'info';

type Props = {
  message: string;
  type?: ToastType;
  visible: boolean;
  onDismiss: () => void;
  duration?: number;
};

export function Toast({ message, type = 'success', visible, onDismiss, duration = 3000 }: Props) {
  const insets = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-20)).current;

  // Held in a ref so the effect below can depend on what the toast SAYS
  // without also re-running every time the parent re-renders and hands us a
  // fresh inline arrow.
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => {
    if (!visible) return;
    // `message` and `type` are dependencies on purpose. A second toast raised
    // while the first is still on screen leaves `visible` true throughout, so
    // keying only on `visible` meant the new message inherited the old timer —
    // and if the first had already faded out, it never reappeared at all. The
    // values are reset here so every toast gets a full show-and-dismiss cycle.
    opacity.setValue(0);
    translateY.setValue(-20);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start();
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: -20, duration: 300, useNativeDriver: true }),
      ]).start(() => dismissRef.current());
    }, duration);
    return () => clearTimeout(timer);
  }, [visible, message, type, duration, opacity, translateY]);

  if (!visible) return null;

  const bgColors: Record<ToastType, string> = {
    success: Colors.primary,
    error: Colors.error,
    info: Colors.primaryLight,
  };

  return (
    <Animated.View
      accessible
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[
        styles.toast,
        {
          top: insets.top + Spacing.sm,
          backgroundColor: bgColors[type],
          opacity,
          transform: [{ translateY }],
        },
      ]}
    >
      <Text style={styles.text}>{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    left: Spacing.md,
    right: Spacing.md,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    zIndex: 1000,
    ...Shadows.lg,
  },
  text: {
    color: Colors.textInverse,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
    textAlign: 'center',
  },
});
