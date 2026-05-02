import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Animated,
  Share,
  Alert,
  Dimensions,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontFamily, FontSize, BorderRadius, Spacing, Shadows } from '../constants/theme';

// ─── Props ────────────────────────────────────────────────────────────────────

export interface ShareCardProps {
  visible: boolean;
  score: number | null;
  streak: number;
  level: string;
  weekTrend?: 'up' | 'down' | 'flat';
  onClose: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = Math.min(SCREEN_WIDTH - 48, 340);

// ─── Component ────────────────────────────────────────────────────────────────

export function ShareCard({
  visible,
  score,
  streak,
  level,
  weekTrend,
  onClose,
}: ShareCardProps) {
  const scaleAnim = useRef(new Animated.Value(0.88)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          useNativeDriver: true,
          tension: 80,
          friction: 10,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      scaleAnim.setValue(0.88);
      opacityAnim.setValue(0);
    }
  }, [visible]);

  const getScoreColor = () => {
    if (score == null) return '#FFFFFF';
    if (score >= 70) return Colors.secondary;
    if (score >= 40) return Colors.accent;
    return '#E07070';
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: `My NutriFlow gut score this week: ${score ?? '--'}/100 🌿 Day ${streak} streak! Download NutriFlow to track your gut health.`,
      });
    } catch {
      // Share cancelled — no action needed
    }
  };

  const handleSaveScreenshot = () => {
    Alert.alert('Save Screenshot', 'Take a screenshot to save your progress card.');
  };

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Backdrop */}
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={onClose}
      >
        <BlurView intensity={35} tint="dark" style={StyleSheet.absoluteFill} />
      </TouchableOpacity>

      {/* Content */}
      <Animated.View
        style={[
          styles.centeredView,
          { opacity: opacityAnim, transform: [{ scale: scaleAnim }] },
          { pointerEvents: 'box-none' },
        ]}
      >
        <View style={[styles.sheet, { width: CARD_WIDTH }]}>

          {/* Close Button */}
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={onClose}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="close" size={20} color={Colors.textSecondary} />
          </TouchableOpacity>

          {/* Share Card Visual */}
          <LinearGradient
            colors={['#0B2618', '#1B4332']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0.3, y: 1 }}
            style={styles.card}
          >
            {/* Brand header */}
            <View style={styles.brandRow}>
              <Ionicons name="leaf" size={14} color={Colors.secondary} />
              <Text style={styles.brandName}>NutriFlow</Text>
            </View>

            {/* Score Circle */}
            <View style={styles.scoreCircleOuter}>
              <View style={[styles.scoreCircleInner, { borderColor: getScoreColor() }]}>
                <Text style={[styles.scoreNumber, { color: getScoreColor() }]}>
                  {score != null ? score : '--'}
                </Text>
              </View>
            </View>

            <Text style={styles.scoreLabel}>Gut Score</Text>

            {/* Trend pill */}
            {weekTrend && weekTrend !== 'flat' && (
              <View style={styles.trendPill}>
                <Ionicons
                  name={weekTrend === 'up' ? 'trending-up' : 'trending-down'}
                  size={12}
                  color={weekTrend === 'up' ? Colors.secondary : '#E07070'}
                />
                <Text style={[styles.trendPillText, { color: weekTrend === 'up' ? Colors.secondary : '#E07070' }]}>
                  {weekTrend === 'up' ? 'Improving' : 'Declining'} this week
                </Text>
              </View>
            )}

            {/* Divider */}
            <View style={styles.divider} />

            {/* Stats row */}
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Ionicons name="flame-outline" size={16} color={Colors.accent} />
                <Text style={styles.statValue}>{streak}</Text>
                <Text style={styles.statLabel}>day streak</Text>
              </View>
              <View style={styles.statSep} />
              <View style={styles.statItem}>
                <Ionicons name="ribbon-outline" size={16} color={Colors.secondary} />
                <Text style={styles.statValue}>{level}</Text>
                <Text style={styles.statLabel}>level</Text>
              </View>
            </View>

            {/* Footer tagline */}
            <Text style={styles.cardFooter}>Track your gut health daily</Text>
          </LinearGradient>

          {/* Action Area */}
          <View style={styles.actions}>
            <Text style={styles.actionsTitle}>Share your progress</Text>

            <TouchableOpacity style={styles.shareBtn} onPress={handleShare} activeOpacity={0.8}>
              <Ionicons name="share-social-outline" size={18} color={Colors.textInverse} />
              <Text style={styles.shareBtnText}>Share</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.screenshotBtn} onPress={handleSaveScreenshot} activeOpacity={0.7}>
              <Text style={styles.screenshotBtnText}>Save Screenshot</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  centeredView: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ── Bottom Sheet Container ──
  sheet: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
    ...Shadows.lg,
  },
  closeBtn: {
    position: 'absolute',
    top: Spacing.sm,
    right: Spacing.sm,
    zIndex: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.surfaceSecondary,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ── Card ──
  card: {
    padding: Spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: Spacing.lg,
  },
  brandName: {
    fontFamily: FontFamily.displayMedium,
    fontSize: 18,
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },

  // ── Score Circle ──
  scoreCircleOuter: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.05)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  scoreCircleInner: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  scoreNumber: {
    fontFamily: FontFamily.displayBold,
    fontSize: 40,
    lineHeight: 48,
    includeFontPadding: false,
  },
  scoreLabel: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.xs,
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: Spacing.sm,
  },

  // ── Trend Pill ──
  trendPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  trendPillText: {
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.xs,
  },

  // ── Divider ──
  divider: {
    width: '100%',
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginVertical: Spacing.md,
  },

  // ── Stats ──
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xl,
    marginBottom: Spacing.md,
  },
  statItem: {
    alignItems: 'center',
    gap: 3,
  },
  statSep: {
    width: 1,
    height: 36,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  statValue: {
    fontFamily: FontFamily.displayBold,
    fontSize: FontSize.lg,
    color: '#FFFFFF',
  },
  statLabel: {
    fontFamily: FontFamily.sansRegular,
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
  },

  // ── Card Footer ──
  cardFooter: {
    fontFamily: FontFamily.sansRegular,
    fontSize: 11,
    color: 'rgba(255,255,255,0.3)',
    letterSpacing: 0.3,
  },

  // ── Action Area ──
  actions: {
    padding: Spacing.lg,
    alignItems: 'center',
    backgroundColor: Colors.surface,
  },
  actionsTitle: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.md,
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md - 2,
    width: '100%',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
    ...Shadows.sm,
  },
  shareBtnText: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.md,
    color: Colors.textInverse,
  },
  screenshotBtn: {
    paddingVertical: Spacing.sm,
  },
  screenshotBtnText: {
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
});
