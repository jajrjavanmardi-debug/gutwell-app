import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Modal } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withDelay,
  withSequence,
  runOnJS,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontFamily, FontSize } from '../constants/theme';

interface Props {
  visible: boolean;
  score?: number | null;
  streak?: number;
  onDone: () => void;
}

export function CheckInSuccessOverlay({ visible, score, streak, onDone }: Props) {
  const opacity = useSharedValue(0);
  const checkScale = useSharedValue(0);
  const checkOpacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Fade in overlay
      opacity.value = withTiming(1, { duration: 200 });

      // Animate checkmark with spring overshoot
      checkScale.value = withSpring(1, { stiffness: 200, damping: 12 });
      checkOpacity.value = withDelay(100, withTiming(1, { duration: 200 }));

      // Auto-dismiss after 1800ms
      opacity.value = withSequence(
        withTiming(1, { duration: 200 }),
        withDelay(1300, withTiming(0, { duration: 300 }, (finished) => {
          if (finished) {
            runOnJS(onDone)();
          }
        }))
      );
    } else {
      opacity.value = 0;
      checkScale.value = 0;
      checkOpacity.value = 0;
    }
  }, [visible]);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const checkmarkStyle = useAnimatedStyle(() => ({
    opacity: checkOpacity.value,
    transform: [{ scale: checkScale.value }],
  }));

  if (!visible) return null;

  return (
    <Modal transparent animationType="none" visible={visible} statusBarTranslucent>
      <Animated.View style={[styles.backdrop, backdropStyle]}>
        <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={styles.card}>
          <LinearGradient
            colors={['#0D2B1E', '#1B4332']}
            style={styles.cardGradient}
          >
            {/* Checkmark Circle */}
            <Animated.View style={[styles.checkCircle, checkmarkStyle]}>
              <Ionicons name="checkmark" size={48} color={Colors.secondary} />
            </Animated.View>

            {/* Logged! */}
            <Text style={styles.loggedText}>Logged!</Text>

            {/* Streak */}
            {streak != null && streak > 0 && (
              <Text style={styles.streakText}>🔥 Day {streak}</Text>
            )}

            {/* Gut Score */}
            {score != null && (
              <Text style={styles.scoreText}>Gut Score: {score}</Text>
            )}
          </LinearGradient>
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  card: {
    borderRadius: 28,
    overflow: 'hidden',
    width: 280,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 20,
  },
  cardGradient: {
    padding: 40,
    alignItems: 'center',
    gap: 12,
  },
  checkCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 3,
    borderColor: Colors.secondary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  loggedText: {
    fontFamily: FontFamily.displayMedium,
    fontSize: 36,
    color: Colors.textInverse,
    lineHeight: 44,
  },
  streakText: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.md,
    color: Colors.secondaryLight,
  },
  scoreText: {
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.sm,
    color: Colors.textTertiary,
    marginTop: 4,
  },
});
