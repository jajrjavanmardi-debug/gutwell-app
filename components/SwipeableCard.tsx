import React, { useRef } from 'react';
import {
  Animated,
  PanResponder,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, BorderRadius, Spacing, FontFamily, FontSize } from '../constants/theme';

interface SwipeableCardProps {
  children: React.ReactNode;
  onFavorite?: () => void;
  onDelete?: () => void;
  favoriteLabel?: string;
  deleteLabel?: string;
}

const ACTION_WIDTH = 80;
const SWIPE_THRESHOLD = 60;
const DAMPING = 0.5;

export function SwipeableCard({
  children,
  onFavorite,
  onDelete,
  favoriteLabel = 'Favorite',
  deleteLabel = 'Delete',
}: SwipeableCardProps) {
  const translateX = useRef(new Animated.Value(0)).current;

  const springBack = (toValue = 0, onComplete?: () => void) => {
    Animated.spring(translateX, {
      toValue,
      tension: 200,
      friction: 20,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && onComplete) onComplete();
    });
  };

  const snapAndReturn = (snapTo: number, callback?: () => void) => {
    Animated.sequence([
      Animated.spring(translateX, {
        toValue: snapTo,
        tension: 200,
        friction: 20,
        useNativeDriver: true,
      }),
      Animated.spring(translateX, {
        toValue: 0,
        tension: 200,
        friction: 20,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished && callback) callback();
    });
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        const { dx, dy } = gestureState;
        return Math.abs(dx) > 5 && Math.abs(dx) > Math.abs(dy);
      },
      onPanResponderMove: (_, gestureState) => {
        const rawX = gestureState.dx * DAMPING;
        // Clamp: only slide right if onFavorite exists, only left if onDelete exists
        const clamped = onFavorite && !onDelete
          ? Math.max(0, rawX)
          : !onFavorite && onDelete
          ? Math.min(0, rawX)
          : rawX;
        translateX.setValue(clamped);
      },
      onPanResponderRelease: (_, gestureState) => {
        const dx = gestureState.dx * DAMPING;

        if (dx > SWIPE_THRESHOLD && onFavorite) {
          snapAndReturn(ACTION_WIDTH, onFavorite);
        } else if (dx < -SWIPE_THRESHOLD && onDelete) {
          snapAndReturn(-ACTION_WIDTH, onDelete);
        } else {
          springBack(0);
        }
      },
      onPanResponderTerminate: () => {
        springBack(0);
      },
    })
  ).current;

  // Interpolate background color based on direction
  const favoriteOpacity = translateX.interpolate({
    inputRange: [0, ACTION_WIDTH],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const deleteOpacity = translateX.interpolate({
    inputRange: [-ACTION_WIDTH, 0],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  return (
    <View style={styles.container}>
      {/* Favorite background (right side, revealed on swipe right) */}
      {onFavorite && (
        <Animated.View style={[styles.actionBackground, styles.favoriteBackground, { opacity: favoriteOpacity }]}>
          <Ionicons name="star" size={22} color={Colors.textInverse} />
          <Text style={styles.actionLabel}>{favoriteLabel}</Text>
        </Animated.View>
      )}

      {/* Delete background (left side, revealed on swipe left) */}
      {onDelete && (
        <Animated.View style={[styles.actionBackground, styles.deleteBackground, { opacity: deleteOpacity }]}>
          <Ionicons name="trash" size={22} color={Colors.textInverse} />
          <Text style={styles.actionLabel}>{deleteLabel}</Text>
        </Animated.View>
      )}

      {/* Swipeable foreground */}
      <Animated.View
        style={[styles.card, { transform: [{ translateX }] }]}
        {...panResponder.panHandlers}
      >
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    marginBottom: Spacing.sm,
    overflow: 'hidden',
    borderRadius: BorderRadius.md,
  },
  actionBackground: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: ACTION_WIDTH + 20,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  favoriteBackground: {
    left: 0,
    backgroundColor: Colors.secondary,
    borderRadius: BorderRadius.md,
    alignItems: 'flex-start',
    paddingLeft: Spacing.md,
  },
  deleteBackground: {
    right: 0,
    backgroundColor: Colors.error,
    borderRadius: BorderRadius.md,
    alignItems: 'flex-end',
    paddingRight: Spacing.md,
  },
  actionLabel: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.xs,
    color: Colors.textInverse,
    letterSpacing: 0.2,
  },
  card: {
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surface,
  },
});
