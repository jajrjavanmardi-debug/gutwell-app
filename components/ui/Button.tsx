import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { Colors, BorderRadius, FontSize, Spacing, Shadows } from '../../constants/theme';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost';
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
    <TouchableOpacity
      style={buttonStyle}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.7}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === 'primary' ? Colors.textInverse : Colors.primary}
          size="small"
        />
      ) : (
        <>
          {icon}
          <Text style={textStyle}>{title}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.lg,
    gap: Spacing.sm,
  },
  // Sizes
  size_sm: { paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md },
  size_md: { paddingVertical: Spacing.md, paddingHorizontal: Spacing.lg },
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
  disabled: { opacity: 0.5 },
  // Text
  text: { fontWeight: '600' },
  text_sm: { fontSize: FontSize.sm },
  text_md: { fontSize: FontSize.md },
  text_lg: { fontSize: FontSize.lg },
  textVariant_primary: { color: Colors.textInverse },
  textVariant_secondary: { color: Colors.primary },
  textVariant_outline: { color: Colors.primary },
  textVariant_ghost: { color: Colors.primary },
  textDisabled: { opacity: 0.7 },
});
