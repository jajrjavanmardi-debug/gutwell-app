import React, { useRef } from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
  Animated,
} from 'react-native';
import { Colors, BorderRadius, FontSize, Spacing, Shadows, FontFamily } from '../../constants/theme';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'accent';
type ButtonSize = 'sm' | 'md' | 'lg';

type Props = {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  style?: ViewStyle;
};

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  icon,
  style,
}: Props) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.timing(scaleAnim, {
      toValue: 0.97,
      duration: 100,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.timing(scaleAnim, {
      toValue: 1,
      duration: 150,
      useNativeDriver: true,
    }).start();
  };

  const buttonStyle: ViewStyle[] = [
    styles.base,
    styles[`size_${size}`],
    styles[`variant_${variant}`],
    (disabled || loading) && styles.disabled,
    style!,
  ].filter(Boolean) as ViewStyle[];

  const textStyle: TextStyle[] = [
    styles.text,
    styles[`text_${size}`],
    styles[`textVariant_${variant}`],
    (disabled || loading) && styles.textDisabled,
  ].filter(Boolean) as TextStyle[];

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <TouchableOpacity
        style={buttonStyle}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled || loading}
        activeOpacity={0.85}
      >
        {loading ? (
          <ActivityIndicator
            color={variant === 'primary' || variant === 'accent' ? Colors.textInverse : Colors.primary}
            size="small"
          />
        ) : (
          <>
            {icon}
            <Text style={textStyle}>{title}</Text>
          </>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  // Sizes
  size_sm: { paddingVertical: 10, paddingHorizontal: Spacing.md },
  size_md: { paddingVertical: 14, paddingHorizontal: Spacing.lg },
  size_lg: { paddingVertical: 18, paddingHorizontal: Spacing.xl },
  // Variants
  variant_primary: {
    backgroundColor: Colors.primary,
    ...Shadows.sm,
  },
  variant_secondary: {
    backgroundColor: Colors.surfaceSecondary,
  },
  variant_outline: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: Colors.primary,
  },
  variant_ghost: {
    backgroundColor: 'transparent',
  },
  variant_accent: {
    backgroundColor: Colors.accent,
    ...Shadows.sm,
  },
  disabled: { opacity: 0.5 },
  // Text
  text: {
    fontFamily: FontFamily.sansSemiBold,
    letterSpacing: 0.3,
  },
  text_sm: { fontSize: FontSize.sm },
  text_md: { fontSize: FontSize.md },
  text_lg: { fontSize: FontSize.lg },
  textVariant_primary: { color: Colors.textInverse },
  textVariant_secondary: { color: Colors.primary },
  textVariant_outline: { color: Colors.primary },
  textVariant_ghost: { color: Colors.primary },
  textVariant_accent: { color: Colors.textInverse },
  textDisabled: { opacity: 0.7 },
});
