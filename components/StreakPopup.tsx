import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Animated,
  Dimensions,
  Platform,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { FireAnimation } from './FireAnimation';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontFamily, FontSize, BorderRadius, Spacing } from '../constants/theme';

// ─── Types & Constants ───────────────────────────────────────────────────────

export type StreakMilestone = {
  days: number;
  label: string;
};

const MILESTONES: StreakMilestone[] = [
  { days: 0,   label: 'Starting Out' },
  { days: 7,   label: '1 Week'       },
  { days: 30,  label: '1 Month'      },
  { days: 100, label: '100 Days'     },
  { days: 180, label: '6 Months'     },
  { days: 366, label: '1 Year'       },
];

const MILESTONE_THRESHOLDS = [0, 7, 30, 100, 180, 366];

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const STATE_MESSAGES: Record<string, string> = {
  active:  'Your gut is thriving!',
  at_risk: 'Keep your streak alive!',
  broken:  'Every day is a fresh start.',
  new:     'Begin your gut health journey!',
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = Math.min(SCREEN_WIDTH - 48, 360);

// ─── Helper: getStreakMilestone ───────────────────────────────────────────────

export function getStreakMilestone(streak: number): StreakMilestone {
  // Walk backwards to find the highest milestone achieved
  for (let i = MILESTONES.length - 1; i >= 0; i--) {
    if (streak >= MILESTONES[i].days) {
      return MILESTONES[i];
    }
  }
  return MILESTONES[0];
}

function getNextMilestone(streak: number): StreakMilestone | null {
  for (let i = 0; i < MILESTONES.length; i++) {
    if (streak < MILESTONES[i].days) return MILESTONES[i];
  }
  return null;
}

function getMilestoneProgress(streak: number): number {
  const current = getStreakMilestone(streak);
  const next = getNextMilestone(streak);
  if (!next) return 1;
  const range = next.days - current.days;
  const progress = streak - current.days;
  return Math.min(progress / range, 1);
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface StreakPopupProps {
  visible: boolean;
  currentStreak: number;
  bestStreak: number;
  streakState: 'new' | 'active' | 'at_risk' | 'broken';
  completionRate: number; // 0–1
  weeklyCompletions?: boolean[]; // 7 items, index 0 = 6 days ago, index 6 = today
  onClose: () => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function StreakPopup({
  visible,
  currentStreak,
  bestStreak,
  streakState,
  completionRate,
  weeklyCompletions = Array(7).fill(false),
  onClose,
}: StreakPopupProps) {
  const scaleAnim = useRef(new Animated.Value(0.85)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  const milestone = getStreakMilestone(currentStreak);
  const nextMilestone = getNextMilestone(currentStreak);
  const milestoneProgress = getMilestoneProgress(currentStreak);
  const lottieIndex = MILESTONES.indexOf(milestone);
  const message = STATE_MESSAGES[streakState] ?? STATE_MESSAGES.new;
  const completionPct = Math.round(completionRate * 100);

  // Derive day labels relative to today (today = last element, index 6)
  const today = new Date();
  const dayLabels = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (6 - i));
    return DAY_LABELS[d.getDay() === 0 ? 6 : d.getDay() - 1]; // Mon=0 … Sun=6
  });

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
      scaleAnim.setValue(0.85);
      opacityAnim.setValue(0);
    }
  }, [visible]);

  const fireMilestone = Math.max(0, Math.min(5, lottieIndex)) as 0 | 1 | 2 | 3 | 4 | 5;

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
        <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
      </TouchableOpacity>

      {/* Card */}
      <Animated.View
        style={[
          styles.centeredView,
          { opacity: opacityAnim, transform: [{ scale: scaleAnim }] },
        ]}
        pointerEvents="box-none"
      >
        <LinearGradient
          colors={['#0D2B1E', '#061510']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.3, y: 1 }}
          style={[styles.card, { width: CARD_WIDTH }]}
        >
          {/* Close Button */}
          <TouchableOpacity style={styles.closeBtn} onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="close" size={20} color="rgba(255,255,255,0.5)" />
          </TouchableOpacity>

          {/* Fire Animation */}
          <View style={styles.lottieWrap}>
            <FireAnimation milestone={fireMilestone} size={96} />
          </View>

          {/* Streak Number */}
          <Text style={styles.streakNumber}>{currentStreak}</Text>
          <Text style={styles.streakLabel}>Day Streak</Text>

          {/* Motivational Message */}
          <View style={[
            styles.messagePill,
            streakState === 'active'  && styles.messagePillActive,
            streakState === 'at_risk' && styles.messagePillAtRisk,
            streakState === 'broken'  && styles.messagePillBroken,
          ]}>
            <Text style={styles.messageText}>{message}</Text>
          </View>

          {/* Divider */}
          <View style={styles.divider} />

          {/* 7-Day Weekly Check-in Row */}
          <Text style={styles.sectionHeading}>This Week</Text>
          <View style={styles.weekRow}>
            {dayLabels.map((label, i) => {
              const done = weeklyCompletions[i] ?? false;
              const isToday = i === 6;
              return (
                <View key={i} style={styles.dayCol}>
                  <View style={[
                    styles.dayCircle,
                    done      && styles.dayCirDone,
                    isToday   && !done && styles.dayCirToday,
                  ]}>
                    {done ? (
                      <Ionicons name="checkmark" size={12} color="#fff" />
                    ) : (
                      <View style={[styles.dayDot, isToday && styles.dayDotToday]} />
                    )}
                  </View>
                  <Text style={[styles.dayLabel, isToday && styles.dayLabelToday]}>{label}</Text>
                </View>
              );
            })}
          </View>

          {/* Divider */}
          <View style={styles.divider} />

          {/* Milestone Progress */}
          <Text style={styles.sectionHeading}>Milestone Progress</Text>
          <View style={styles.milestoneRow}>
            <Text style={styles.milestoneCurrent}>{milestone.label}</Text>
            {nextMilestone ? (
              <Text style={styles.milestoneNext}>{nextMilestone.label} ({nextMilestone.days}d)</Text>
            ) : (
              <Text style={styles.milestoneNext}>Max reached!</Text>
            )}
          </View>
          <View style={styles.progressTrack}>
            <Animated.View
              style={[
                styles.progressFill,
                { width: `${Math.round(milestoneProgress * 100)}%` as any },
              ]}
            />
          </View>
          {nextMilestone && (
            <Text style={styles.progressSubtext}>
              {nextMilestone.days - currentStreak} day{nextMilestone.days - currentStreak !== 1 ? 's' : ''} until {nextMilestone.label}
            </Text>
          )}

          {/* Divider */}
          <View style={styles.divider} />

          {/* Stats Row */}
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Ionicons name="trophy-outline" size={18} color={Colors.secondary} />
              <Text style={styles.statValue}>{bestStreak}</Text>
              <Text style={styles.statLabel}>Best Streak</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Ionicons name="checkmark-circle-outline" size={18} color={Colors.secondary} />
              <Text style={styles.statValue}>{completionPct}%</Text>
              <Text style={styles.statLabel}>Completion Rate</Text>
            </View>
          </View>
        </LinearGradient>
      </Animated.View>
    </Modal>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  centeredView: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    borderRadius: BorderRadius.xl,
    paddingTop: Spacing.xl + Spacing.md,
    paddingBottom: Spacing.xl,
    paddingHorizontal: Spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(82, 183, 136, 0.18)',
    overflow: 'hidden',
  },
  closeBtn: {
    position: 'absolute',
    top: Spacing.md,
    right: Spacing.md,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ── Lottie ──
  lottieWrap: {
    width: 110,
    height: 110,
    marginBottom: Spacing.sm,
  },
  lottie: {
    width: '100%',
    height: '100%',
  },

  // ── Streak Number ──
  streakNumber: {
    fontFamily: FontFamily.displayBold,
    fontSize: 72,
    color: '#FFFFFF',
    lineHeight: 80,
    includeFontPadding: false,
  },
  streakLabel: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.md,
    color: 'rgba(255,255,255,0.65)',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: Spacing.md,
  },

  // ── Message Pill ──
  messagePill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(82,183,136,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(82,183,136,0.35)',
    marginBottom: Spacing.md,
  },
  messagePillActive: {
    backgroundColor: 'rgba(82,183,136,0.18)',
    borderColor: 'rgba(82,183,136,0.45)',
  },
  messagePillAtRisk: {
    backgroundColor: 'rgba(212,163,115,0.18)',
    borderColor: 'rgba(212,163,115,0.45)',
  },
  messagePillBroken: {
    backgroundColor: 'rgba(193,68,75,0.15)',
    borderColor: 'rgba(193,68,75,0.35)',
  },
  messageText: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
    color: 'rgba(255,255,255,0.9)',
  },

  // ── Divider ──
  divider: {
    width: '100%',
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.07)',
    marginVertical: Spacing.md,
  },

  // ── Section Heading ──
  sectionHeading: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.xs,
    color: 'rgba(255,255,255,0.45)',
    letterSpacing: 1,
    textTransform: 'uppercase',
    alignSelf: 'flex-start',
    marginBottom: Spacing.sm,
  },

  // ── Weekly Row ──
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: Spacing.xs,
  },
  dayCol: {
    alignItems: 'center',
    gap: 4,
  },
  dayCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayCirDone: {
    backgroundColor: Colors.secondary,
    borderColor: Colors.secondary,
  },
  dayCirToday: {
    borderColor: Colors.secondary,
    borderWidth: 1.5,
  },
  dayDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  dayDotToday: {
    backgroundColor: Colors.secondary,
  },
  dayLabel: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: 10,
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: 0.3,
  },
  dayLabelToday: {
    color: Colors.secondary,
  },

  // ── Milestone Progress ──
  milestoneRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: Spacing.xs + 2,
  },
  milestoneCurrent: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.xs,
    color: Colors.secondary,
  },
  milestoneNext: {
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.xs,
    color: 'rgba(255,255,255,0.45)',
  },
  progressTrack: {
    width: '100%',
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
    marginBottom: Spacing.xs,
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: Colors.secondary,
  },
  progressSubtext: {
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.xs,
    color: 'rgba(255,255,255,0.4)',
    alignSelf: 'flex-end',
    marginTop: 2,
  },

  // ── Stats ──
  statsRow: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  statValue: {
    fontFamily: FontFamily.displayBold,
    fontSize: FontSize.xl,
    color: '#FFFFFF',
  },
  statLabel: {
    fontFamily: FontFamily.sansRegular,
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
    textAlign: 'center',
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
});
