import React from 'react';
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Colors, BorderRadius, Spacing, FontFamily, FontSize } from '../../constants/theme';

export type OptionRowProps = {
  label: string;
  description?: string;
  icon?: React.ReactNode;
  selected: boolean;
  onPress: () => void;
  /** When true, the indicator is a checkbox (square); otherwise a radio (circle). */
  multiSelect?: boolean;
};

export function OptionRow({
  label,
  description,
  icon,
  selected,
  onPress,
  multiSelect = false,
}: OptionRowProps) {
  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  return (
    <TouchableOpacity
      style={[styles.container, selected ? styles.containerSelected : styles.containerUnselected]}
      onPress={handlePress}
      activeOpacity={0.85}
      accessibilityRole={multiSelect ? 'checkbox' : 'radio'}
      accessibilityState={{ checked: selected }}
    >
      {icon ? <View style={styles.icon}>{icon}</View> : null}

      <View style={styles.textWrap}>
        <Text style={styles.label} numberOfLines={1}>
          {label}
        </Text>
        {description ? (
          <Text style={styles.description} numberOfLines={1}>
            {description}
          </Text>
        ) : null}
      </View>

      <View
        style={[
          styles.indicator,
          multiSelect ? styles.indicatorSquare : styles.indicatorCircle,
          selected ? styles.indicatorSelected : styles.indicatorUnselected,
        ]}
      >
        {selected ? (
          <View style={multiSelect ? styles.dotSquare : styles.dotCircle} />
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: BorderRadius.lg,
    paddingVertical: 14,
    paddingHorizontal: Spacing.md,
    gap: Spacing.md,
  },
  containerUnselected: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  containerSelected: {
    backgroundColor: Colors.onboardingOptionBg,
    borderWidth: 2,
    borderColor: Colors.onboardingOptionBorder,
  },
  icon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: {
    flex: 1,
  },
  label: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.md,
    color: Colors.text,
  },
  description: {
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  indicator: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  indicatorCircle: {
    borderRadius: BorderRadius.full,
  },
  indicatorSquare: {
    borderRadius: 6,
  },
  indicatorUnselected: {
    borderColor: Colors.border,
    backgroundColor: 'transparent',
  },
  indicatorSelected: {
    borderColor: Colors.secondary,
    backgroundColor: 'transparent',
  },
  dotCircle: {
    width: 12,
    height: 12,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.secondary,
  },
  dotSquare: {
    width: 12,
    height: 12,
    borderRadius: 3,
    backgroundColor: Colors.secondary,
  },
});
