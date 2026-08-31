import React from 'react';
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Colors, BorderRadius, Spacing, FontFamily, FontSize } from '../../constants/theme';

export type OptionCardProps = {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  selected: boolean;
  onPress: () => void;
  /**
   * Renders as a checkbox rather than a radio: square indicator and
   * accessibilityRole="checkbox". Defaults false, so every existing caller is
   * unaffected. Announcing a multi-select option as a radio button would tell
   * a screen-reader user that only one choice is possible.
   */
  multiSelect?: boolean;
};

export function OptionCard({ title, subtitle, icon, selected, onPress, multiSelect = false }: OptionCardProps) {
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
      {icon ? (
        <View style={[styles.badge, selected ? styles.badgeSelected : styles.badgeUnselected]}>
          {icon}
        </View>
      ) : null}

      <View style={styles.textWrap}>
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      <View
        style={[
          styles.indicator,
          multiSelect ? styles.indicatorSquare : null,
          selected ? styles.indicatorSelected : styles.indicatorUnselected,
        ]}
      >
        {selected ? <View style={[styles.dot, multiSelect ? styles.dotSquare : null]} /> : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  // Square indicator distinguishes "choose any" from "choose one" visually, so
  // the affordance does not rely on the accessibility role alone.
  indicatorSquare: { borderRadius: 6 },
  dotSquare: { borderRadius: 2 },

  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    gap: Spacing.md,
  },
  containerUnselected: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  containerSelected: {
    backgroundColor: Colors.onboardingOptionBg,
    borderWidth: 2,
    borderColor: Colors.onboardingOptionBorder,
  },
  badge: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeUnselected: {
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  badgeSelected: {
    backgroundColor: Colors.primary,
  },
  textWrap: {
    flex: 1,
  },
  title: {
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.md,
    color: Colors.text,
  },
  subtitle: {
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  indicator: {
    width: 24,
    height: 24,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  indicatorUnselected: {
    borderColor: 'rgba(255,255,255,0.3)',
    backgroundColor: 'transparent',
  },
  indicatorSelected: {
    borderColor: Colors.secondary,
    backgroundColor: 'transparent',
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.secondary,
  },
});
