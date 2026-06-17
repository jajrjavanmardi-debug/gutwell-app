import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, Path, Stop } from 'react-native-svg';
import { FontFamily } from '../../constants/theme';
import StarFieldBackground from '../../components/StarFieldBackground';
import { ProgressRing } from '../../components/ui/ProgressRing';
import { useAuth } from '../../contexts/AuthContext';
import { computePlan, type PlanFocusArea } from '../../lib/onboarding-config';

type Answers = Record<string, unknown>;

// Screen width minus the scroll content padding (24*2) and card padding (20*2).
const CHART_WIDTH = Dimensions.get('window').width - 24 * 2 - 20 * 2;

/**
 * A target date ~N weeks out, formatted like "12 August 2026".
 * Heavier symptom load → a slightly longer horizon, mirroring how Cal AI
 * dates its goal off the size of the change being asked for.
 */
function targetDate(answers: Answers): Date {
  const freq = String(answers.bloating_frequency ?? '');
  const weeks = freq === '6+' ? 12 : freq === '3-5' ? 10 : 8;
  const d = new Date();
  d.setDate(d.getDate() + weeks * 7);
  return d;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * A gut-health goal headline derived from the user's chosen goal.
 * Original copy (Cal AI's "Goal: lose 10.5kg by <date>" recast for the gut).
 */
function goalHeadline(answers: Answers): string {
  const goal = String(answers.goal ?? '');
  const map: Record<string, string> = {
    'Reduce bloating': 'calmer, flatter days',
    'Improve regularity': 'a steady daily rhythm',
    'Boost energy': 'steadier post-meal energy',
    'Less discomfort': 'less cramping and discomfort',
    'Identify triggers': 'your trigger foods pinned down',
  };
  return map[goal] ?? 'calmer digestion';
}

/** Pretty-print an answer for the "Your info" recap; skips empty values. */
function recapRows(answers: Answers): { icon: keyof typeof ROW_ICONS; label: string; value: string }[] {
  const rows: { icon: keyof typeof ROW_ICONS; label: string; value: string }[] = [];
  const push = (icon: keyof typeof ROW_ICONS, label: string, value: unknown) => {
    if (value === undefined || value === null || value === '') return;
    rows.push({ icon, label, value: String(value) });
  };
  push('flag', 'Main goal', answers.goal);
  push('pulse', 'Symptom days / week', answers.bloating_frequency);
  push('restaurant', 'Diet', answers.diet);
  push('navigate', 'Target', answers.target_state);
  return rows;
}

const ROW_ICONS = {
  flag: 'flag-outline',
  pulse: 'pulse-outline',
  restaurant: 'restaurant-outline',
  navigate: 'navigate-outline',
} as const;

/**
 * "Estimated progress" mini-chart: an improvement curve rising from a low
 * baseline ("Now") to a high target marker, drawn with react-native-svg.
 * Purely illustrative — the shape is fixed, mirroring Cal AI's projection card.
 */
function EstimatedProgressChart({ width = 280, height = 120 }: { width?: number; height?: number }) {
  const padX = 8;
  const padTop = 14;
  const padBottom = 14;
  const x0 = padX;
  const x1 = width - padX;
  // Start low (high symptoms / low score), rise with an ease-out S-curve.
  const yStart = height - padBottom;
  const yEnd = padTop;
  const midX = x0 + (x1 - x0) * 0.5;
  const line = `M ${x0} ${yStart} C ${midX} ${yStart} ${midX} ${yEnd} ${x1} ${yEnd}`;
  const area = `${line} L ${x1} ${height} L ${x0} ${height} Z`;

  return (
    <Svg width={width} height={height}>
      <Defs>
        <SvgLinearGradient id="progressFill" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#52B788" stopOpacity={0.28} />
          <Stop offset="1" stopColor="#52B788" stopOpacity={0} />
        </SvgLinearGradient>
      </Defs>
      <Path d={area} fill="url(#progressFill)" />
      <Path d={line} stroke="#52B788" strokeWidth={3} fill="none" strokeLinecap="round" />
      {/* "Now" marker (low) */}
      <Circle cx={x0} cy={yStart} r={5} fill="#0B1F14" stroke="#74C69D" strokeWidth={2.5} />
      {/* Target marker (high) */}
      <Circle cx={x1} cy={yEnd} r={6} fill="#52B788" stroke="#FFFFFF" strokeWidth={2.5} />
    </Svg>
  );
}

export default function ResultsScreen() {
  const { session } = useAuth();
  const [answers, setAnswers] = useState<Answers | null>(null);
  const [ringProgress, setRingProgress] = useState(0);

  const contentAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    AsyncStorage.getItem('onboarding_answers').then((raw) => {
      const parsed: Answers = raw ? (JSON.parse(raw) as Answers) : {};
      setAnswers(parsed);
      const { targetScore } = computePlan(parsed);
      // Animate the ring up to the target after mount.
      setTimeout(() => setRingProgress(targetScore / 100), 350);
    });

    Animated.timing(contentAnim, {
      toValue: 1,
      duration: 600,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [contentAnim]);

  if (!answers) {
    return (
      <View style={styles.loadingContainer}>
        <LinearGradient colors={['#0B1F14', '#1B4332']} style={StyleSheet.absoluteFill} />
      </View>
    );
  }

  const { targetScore, focusAreas } = computePlan(answers);
  const rows = recapRows(answers);
  const goalDate = targetDate(answers);
  const goalDateLabel = formatDate(goalDate);

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <LinearGradient colors={['#0B1F14', '#1B4332']} style={StyleSheet.absoluteFill} />
      <StarFieldBackground count={150} seed={33} />

      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Animated.View style={[styles.contentWrapper, { opacity: contentAnim }]}>
            {/* Check badge */}
            <View style={styles.checkBadge}>
              <Ionicons name="checkmark" size={22} color="#0B1F14" />
            </View>

            <Text style={styles.heroEyebrow}>Your plan</Text>
            <Text style={styles.heroTitle}>
              {goalHeadline(answers)} by {goalDateLabel}
            </Text>

            {/* Estimated progress mini-chart */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Estimated progress</Text>
              <View style={styles.chartWrap}>
                <EstimatedProgressChart width={CHART_WIDTH} height={120} />
              </View>
              <View style={styles.chartAxis}>
                <Text style={styles.chartAxisLabel}>Now</Text>
                <Text style={styles.chartAxisLabel}>{goalDateLabel}</Text>
              </View>
            </View>

            {/* Target Gut Score ring */}
            <View style={styles.ringWrap}>
              <ProgressRing progress={ringProgress} size={200} strokeWidth={16}>
                <Text style={styles.ringValue}>{targetScore}</Text>
                <Text style={styles.ringLabel}>Target{'\n'}Gut Score</Text>
              </ProgressRing>
            </View>

            {/* Your info recap */}
            {rows.length > 0 ? (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Your info</Text>
                <Text style={styles.cardSubtitle}>Based on your answers.</Text>
                {rows.map((row) => (
                  <View key={row.label} style={styles.recapRow}>
                    <Ionicons name={ROW_ICONS[row.icon]} size={18} color="#52B788" />
                    <Text style={styles.recapLabel}>{row.label}:</Text>
                    <Text style={styles.recapValue} numberOfLines={1}>
                      {row.value}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}

            {/* How to reach your goals */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>How to reach your goals</Text>
              {focusAreas.map((area: PlanFocusArea) => (
                <View key={area.title} style={styles.focusRow}>
                  <View style={styles.focusIcon}>
                    <Ionicons name={area.icon} size={18} color="#52B788" />
                  </View>
                  <Text style={styles.focusText}>{area.title}</Text>
                </View>
              ))}
            </View>

            <View style={styles.bottomSpacer} />
          </Animated.View>
        </ScrollView>

        <View style={styles.bottomCTA}>
          <TouchableOpacity
            style={styles.ctaButton}
            onPress={() =>
              // Completing onboarding writes to the profile, which needs an
              // account — new users create one here, returning users skip it.
              router.push(session ? '/(onboarding)/notifications' : '/(auth)/signup')
            }
            accessibilityRole="button"
            accessibilityLabel="Get started"
            activeOpacity={0.88}
          >
            <Text style={styles.ctaText}>Let&apos;s Get Started</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  safeArea: { flex: 1 },
  scrollArea: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  contentWrapper: {
    flex: 1,
    alignItems: 'center',
  },
  checkBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#52B788',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
  },
  heroEyebrow: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: 13,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: '#74C69D',
    textAlign: 'center',
    marginTop: 16,
  },
  heroTitle: {
    fontFamily: FontFamily.displayBold,
    fontSize: 28,
    color: '#FFFFFF',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 36,
  },
  chartWrap: {
    marginTop: 14,
    alignItems: 'center',
  },
  chartAxis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  chartAxisLabel: {
    fontFamily: FontFamily.sansMedium,
    fontSize: 12,
    color: 'rgba(255,255,255,0.55)',
  },
  ringWrap: {
    marginTop: 24,
    marginBottom: 8,
  },
  ringValue: {
    fontFamily: FontFamily.displayBold,
    fontSize: 56,
    color: '#FFFFFF',
  },
  ringLabel: {
    fontFamily: FontFamily.sansMedium,
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    marginTop: 2,
    lineHeight: 17,
  },
  card: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    padding: 20,
    marginTop: 20,
  },
  cardTitle: {
    fontFamily: FontFamily.sansBold,
    fontSize: 18,
    color: '#FFFFFF',
  },
  cardSubtitle: {
    fontFamily: FontFamily.sansRegular,
    fontSize: 14,
    color: 'rgba(255,255,255,0.55)',
    marginTop: 2,
    marginBottom: 12,
  },
  recapRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  recapLabel: {
    fontFamily: FontFamily.sansMedium,
    fontSize: 14,
    color: 'rgba(255,255,255,0.65)',
  },
  recapValue: {
    flex: 1,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: 14,
    color: '#FFFFFF',
  },
  focusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 14,
  },
  focusIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(82,183,136,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  focusText: {
    flex: 1,
    fontFamily: FontFamily.sansMedium,
    fontSize: 15,
    color: '#FFFFFF',
  },
  bottomSpacer: {
    height: 100,
  },
  bottomCTA: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: 32,
    paddingHorizontal: 24,
  },
  ctaButton: {
    width: '100%',
    height: 60,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  ctaText: {
    fontFamily: FontFamily.sansBold,
    fontSize: 17,
    color: '#0B1F14',
    letterSpacing: -0.3,
  },
});
