import React, { useEffect } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { BorderRadius, Colors, Spacing, Typography } from '../constants/theme';

export type FabAction = {
  key: string;
  label: string;
  icon: React.ReactNode;
  onPress: () => void;
};

export type FabActionMenuProps = {
  visible: boolean;
  onClose: () => void;
  actions: FabAction[];
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function FabActionMenu({ visible, onClose, actions }: FabActionMenuProps) {
  // Entrance animation: fade + slight upward translate of the tile grid.
  const progress = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      progress.value = withTiming(1, { duration: 220 });
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } else {
      progress.value = 0;
    }
  }, [visible, progress]);

  const gridAnimatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 24 }],
  }));

  const handleTilePress = (action: FabAction) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    action.onPress();
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        {/* Backdrop: frosted blur behind a dim scrim; tap anywhere to dismiss. */}
        <AnimatedPressable
          style={styles.backdrop}
          entering={FadeIn.duration(180)}
          exiting={FadeOut.duration(150)}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close menu"
        >
          <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={styles.scrim} />
        </AnimatedPressable>

        {/* Tile grid. Sits above the tab bar / FAB area. */}
        <Animated.View
          style={[styles.gridContainer, gridAnimatedStyle]}
          pointerEvents="box-none"
        >
          <View style={styles.grid}>
            {actions.map((action) => (
              <Pressable
                key={action.key}
                style={({ pressed }) => [
                  styles.tile,
                  pressed && styles.tilePressed,
                ]}
                onPress={() => handleTilePress(action)}
                accessibilityRole="button"
                accessibilityLabel={action.label}
              >
                <View style={styles.tileIcon}>{action.icon}</View>
                <Text style={styles.tileLabel} numberOfLines={1}>
                  {action.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const TILE_GAP = Spacing.md;

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.overlayScrim,
  },
  gridContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 110, // clear of the bottom tab bar / center FAB
    paddingHorizontal: Spacing.lg,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  tile: {
    width: '48%',
    aspectRatio: 1.15,
    marginBottom: TILE_GAP,
    backgroundColor: Colors.fabTile,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
  },
  tilePressed: {
    opacity: 0.7,
    transform: [{ scale: 0.97 }],
  },
  tileIcon: {
    marginBottom: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileLabel: {
    ...Typography.label,
    color: Colors.text,
    textAlign: 'center',
  },
});
