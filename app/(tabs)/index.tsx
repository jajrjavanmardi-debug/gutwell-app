import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { LoadingSkeleton, CardSkeleton } from '../../components/ui/LoadingSkeleton';
import { PressableFeedback } from '../../components/ui/PressableFeedback';
import { DailyTip } from '../../components/DailyTip';
import { GutLevelBadge } from '../../components/GutLevelBadge';
import { StreakPopup } from '../../components/StreakPopup';
import { SparklineChart } from '../../components/SparklineChart';
import { Colors, Spacing, FontSize, BorderRadius, Shadows, FontFamily, Typography } from '../../constants/theme';
import { updateTodayScore } from '../../lib/scoring';
import { calculatePoints } from '../../lib/levels';

type RecentEntry = {
  type: 'checkin' | 'food' | 'symptom';
  label: string;
  time: string;
  sortKey: string;
};

// ─── Insight Helper ──────────────────────────────────────────────────────────

function getInsight(streak: number, score: number | null, checkedInToday: boolean): string {
  if (streak >= 7) return `🔥 ${streak}-day streak — your gut loves consistency.`;
  if (streak >= 3) return `Keep going — ${streak} days in a row builds lasting habits.`;
  if (score !== null && score >= 75) return '✨ Excellent gut score — keep up the great work!';
  if (score !== null && score >= 50) return '📈 Good progress. Log meals to refine your score.';
  if (!checkedInToday) return '🌿 No check-in yet today. Just 2 minutes to log.';
  return '🌱 Early days — log daily for 2 weeks to unlock patterns.';
}

// ─── Score Circle Border Color ───────────────────────────────────────────────

function scoreCircleBorderColor(score: number | null): string {
  if (score === null) return Colors.border;
  if (score >= 70) return Colors.secondary;
  if (score >= 40) return '#D4A373';
  return '#E07070';
}

export default function HomeScreen() {
  const { user, profile } = useAuth();
  const [gutScore, setGutScore] = useState<number | null>(null);
  const [yesterdayScore, setYesterdayScore] = useState<number | null>(null);
  const [weekScores, setWeekScores] = useState<number[]>([]);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [weeklyCompletions, setWeeklyCompletions] = useState<boolean[]>(Array(7).fill(false));
  const [completionRate, setCompletionRate] = useState(0);
  const [streakPopupVisible, setStreakPopupVisible] = useState(false);
  const [recentEntries, setRecentEntries] = useState<RecentEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [totalPoints, setTotalPoints] = useState(0);

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  const displayName = profile?.display_name || 'there';

  // Date display values for center header block
  const now = new Date();
  const dayName = now.toLocaleDateString('en-US', { weekday: 'long' });
  const dateStr = now.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });

  const loadData = useCallback(async () => {
    if (!user) return;

    const today = new Date().toISOString().split('T')[0];
    const { data: scoreData } = await supabase
      .from('gut_scores')
      .select('score')
      .eq('user_id', user.id)
      .eq('date', today)
      .maybeSingle();
    if (scoreData?.score != null) {
      setGutScore(scoreData.score);
    } else {
      const { count } = await supabase
        .from('check_ins')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('entry_date', today);
      if (count && count > 0) {
        try {
          const freshScore = await updateTodayScore(user.id);
          setGutScore(freshScore);
        } catch {
          setGutScore(null);
        }
      } else {
        setGutScore(null);
      }
    }

    // ── Yesterday's score for trend display ─────────────────────────────────
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    const { data: yData } = await supabase
      .from('gut_scores')
      .select('score')
      .eq('user_id', user.id)
      .eq('date', yesterdayStr)
      .maybeSingle();
    setYesterdayScore(yData?.score ?? null);

    // ── Last 7 days of gut scores for sparkline ──────────────────────────────
    const sevenDaysAgoSparkline = new Date();
    sevenDaysAgoSparkline.setDate(sevenDaysAgoSparkline.getDate() - 6);
    const { data: weekData } = await supabase
      .from('gut_scores')
      .select('score, date')
      .eq('user_id', user.id)
      .gte('date', sevenDaysAgoSparkline.toISOString().split('T')[0])
      .order('date', { ascending: true });
    if (weekData && weekData.length >= 2) {
      setWeekScores(weekData.map(d => d.score));
    }

    // ── Streak data from streaks table ──────────────────────────────────────
    const { data: streakData } = await supabase
      .from('streaks')
      .select('current_streak, best_streak')
      .eq('user_id', user.id)
      .maybeSingle();

    const currentStreak = streakData?.current_streak ?? 0;
    const fetchedBestStreak = streakData?.best_streak ?? 0;
    setStreak(currentStreak);
    setBestStreak(fetchedBestStreak);

    // ── Last 7 days of check-ins for weekly completions ──────────────────────
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];

    const { data: recentCheckInDates } = await supabase
      .from('check_ins')
      .select('check_date')
      .eq('user_id', user.id)
      .gte('check_date', sevenDaysAgoStr)
      .order('check_date', { ascending: true });

    const checkedDates = new Set((recentCheckInDates ?? []).map((r: { check_date: string }) => r.check_date));

    const todayDate = new Date();
    const weekly = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(todayDate);
      d.setDate(todayDate.getDate() - (6 - i));
      return checkedDates.has(d.toISOString().split('T')[0]);
    });
    setWeeklyCompletions(weekly);

    // Completion rate = days checked in over last 7
    const checkedCount = weekly.filter(Boolean).length;
    setCompletionRate(checkedCount / 7);

    // Fallback streak calculation from check_ins table if streaks table missing
    const { data: checkIns } = await supabase
      .from('check_ins')
      .select('entry_date')
      .eq('user_id', user.id)
      .order('entry_date', { ascending: false })
      .limit(30);

    if (!streakData && checkIns && checkIns.length > 0) {
      const todayDate = new Date();
      let fallbackStreak = 0;
      for (let i = 0; i < checkIns.length; i++) {
        const expected = new Date(todayDate);
        expected.setDate(expected.getDate() - i);
        const expectedStr = expected.toISOString().split('T')[0];
        if (checkIns[i].entry_date === expectedStr) {
          fallbackStreak++;
        } else {
          break;
        }
      }
      setStreak(fallbackStreak);
    }

    // Fetch counts for level points calculation
    const { count: totalCheckIns } = await supabase
      .from('check_ins')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id);

    const { count: totalFoodLogs } = await supabase
      .from('food_logs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id);

    const { count: totalSymptomLogs } = await supabase
      .from('symptom_logs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id);

    const points = calculatePoints({
      checkIns: totalCheckIns || 0,
      foodLogs: totalFoodLogs || 0,
      symptomLogs: totalSymptomLogs || 0,
      currentStreak,
    });
    setTotalPoints(points);

    const entries: RecentEntry[] = [];

    const { data: recentCheckins } = await supabase
      .from('check_ins')
      .select('stool_type, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(3);

    recentCheckins?.forEach(c => {
      entries.push({
        type: 'checkin',
        label: `Stool type ${c.stool_type}`,
        time: formatTime(c.created_at),
        sortKey: c.created_at,
      });
    });

    const { data: recentFood } = await supabase
      .from('food_logs')
      .select('meal_name, logged_at')
      .eq('user_id', user.id)
      .order('logged_at', { ascending: false })
      .limit(3);

    recentFood?.forEach(f => {
      entries.push({
        type: 'food',
        label: f.meal_name,
        time: formatTime(f.logged_at),
        sortKey: f.logged_at,
      });
    });

    entries.sort((a, b) => b.sortKey.localeCompare(a.sortKey));
    setRecentEntries(entries.slice(0, 5));
    setIsLoading(false);
  }, [user]);

  useEffect(() => { loadData(); }, [loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  // Derive streak state for popup
  const checkedInToday = weeklyCompletions[6];
  const streakState: 'new' | 'active' | 'at_risk' | 'broken' =
    streak === 0 && bestStreak === 0
      ? 'new'
      : streak === 0 && bestStreak > 0
      ? 'broken'
      : checkedInToday
      ? 'active'
      : 'at_risk';


  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.secondary} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Header: 3-column — Greeting | Date | Level Badge */}
        <View style={styles.headerRow}>
          {/* LEFT: greeting + name */}
          <View style={styles.greetingBlock}>
            <Text style={styles.greeting}>{greeting()},</Text>
            <Text style={styles.name}>{displayName}</Text>
          </View>

          {/* CENTER: day name + date */}
          <View style={styles.dateBlock}>
            <Text style={styles.dateDayText}>{dayName}</Text>
            <Text style={styles.dateDateText}>{dateStr}</Text>
          </View>

          {/* RIGHT: level badge */}
          <View style={styles.badgeBlock}>
            {!isLoading && <GutLevelBadge totalPoints={totalPoints} compact />}
          </View>
        </View>

        {isLoading ? (
          <>
            <View style={styles.scoreCard}>
              <LoadingSkeleton width={140} height={14} />
              <View style={[styles.scoreCircle, { borderColor: Colors.border }]}>
                <LoadingSkeleton width={40} height={36} borderRadius={8} />
              </View>
              <LoadingSkeleton width={80} height={12} />
            </View>
            <LoadingSkeleton width={120} height={18} style={{ marginBottom: Spacing.md }} />
            <View style={styles.actions}>
              <LoadingSkeleton height={100} borderRadius={BorderRadius.lg} style={{ flex: 1 }} />
              <LoadingSkeleton height={100} borderRadius={BorderRadius.lg} style={{ flex: 1 }} />
              <LoadingSkeleton height={100} borderRadius={BorderRadius.lg} style={{ flex: 1 }} />
            </View>
            <CardSkeleton />
            <CardSkeleton />
          </>
        ) : (
        <>
          {/* Gut Score Card */}
          <View style={styles.scoreCard}>
            <Text style={styles.scoreLabel}>YOUR GUT SCORE TODAY</Text>
            <View style={[styles.scoreCircle, { borderColor: scoreCircleBorderColor(gutScore) }]}>
              <Text style={styles.scoreValue}>
                {gutScore !== null ? gutScore : '--'}
              </Text>
              <Text style={styles.scoreOutOf}>/100</Text>
            </View>
            {streak > 0 && (
              <TouchableOpacity
                style={styles.streakRow}
                onPress={() => setStreakPopupVisible(true)}
                activeOpacity={0.75}
              >
                <Ionicons name="flame" size={16} color={Colors.accent} />
                <Text style={styles.streakText}>{streak} day streak</Text>
                <Ionicons name="chevron-forward" size={12} color={Colors.accent} style={{ marginLeft: 2, opacity: 0.7 }} />
              </TouchableOpacity>
            )}
            {streak === 0 && (
              <TouchableOpacity
                style={[styles.streakRow, styles.streakRowNew]}
                onPress={() => setStreakPopupVisible(true)}
                activeOpacity={0.75}
              >
                <Ionicons name="flame-outline" size={16} color={Colors.textTertiary} />
                <Text style={[styles.streakText, styles.streakTextNew]}>Start your streak</Text>
              </TouchableOpacity>
            )}
            {/* Trend vs yesterday */}
            {gutScore !== null && yesterdayScore !== null && (
              <View style={styles.trendRow}>
                <Ionicons
                  name={gutScore >= yesterdayScore ? 'trending-up' : 'trending-down'}
                  size={13}
                  color={gutScore >= yesterdayScore ? Colors.secondary : '#E07070'}
                />
                <Text style={[styles.trendText, { color: gutScore >= yesterdayScore ? Colors.secondary : '#E07070' }]}>
                  {gutScore > yesterdayScore ? `+${gutScore - yesterdayScore}` : `${gutScore - yesterdayScore}`} vs yesterday
                </Text>
              </View>
            )}
            {/* 7-day sparkline */}
            {weekScores.length >= 2 && (
              <View style={styles.sparklineWrap}>
                <SparklineChart data={weekScores} width={220} height={44} color={Colors.secondary} />
              </View>
            )}
          </View>

          {/* Insight Banner */}
          <View style={styles.insightBanner}>
            <Text style={styles.insightText}>{getInsight(streak, gutScore, checkedInToday)}</Text>
          </View>

          {/* Quick Actions */}
          <View style={styles.sectionRow}>
            <Text style={styles.sectionTitle}>Quick Actions</Text>
          </View>
          <View style={styles.actions}>
            <QuickAction
              icon="body"
              label="Check-in"
              color={Colors.primary}
              bgTint={Colors.primary + '08'}
              onPress={() => router.push('/(tabs)/checkin')}
            />
            <QuickAction
              icon="restaurant"
              label="Log Meal"
              color={Colors.secondary}
              bgTint={Colors.secondary + '10'}
              onPress={() => router.push('/(tabs)/food')}
            />
            <QuickAction
              icon="medical"
              label="Symptom"
              color={Colors.accent}
              bgTint={Colors.accent + '10'}
              onPress={() => router.push('/log-symptom')}
            />
          </View>

          {/* Recent Activity */}
          {recentEntries.length > 0 ? (
            <>
              <View style={styles.sectionRow}>
                <Text style={styles.sectionTitle}>Recent Activity</Text>
                <TouchableOpacity onPress={() => router.push('/(tabs)/progress')}>
                  <Text style={styles.seeAllLink}>See all</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.timelineContainer}>
                {/* Vertical connecting line */}
                <View style={styles.timelineLine} />
                {recentEntries.map((entry, i) => (
                  <View key={i} style={styles.timelineItem}>
                    <View style={styles.timelineDotWrap}>
                      <View style={[styles.timelineDot, { backgroundColor: entryColor(entry.type) }]} />
                    </View>
                    <View style={styles.timelineContent}>
                      <Text style={styles.activityLabel}>{entry.label}</Text>
                      <Text style={styles.activityTime}>{entry.time}</Text>
                    </View>
                    <View style={[styles.activityTypeBadge, { backgroundColor: entryColor(entry.type) + '12' }]}>
                      <Ionicons
                        name={entryIcon(entry.type)}
                        size={14}
                        color={entryColor(entry.type)}
                      />
                    </View>
                  </View>
                ))}
              </View>
            </>
          ) : (
            <View style={styles.firstActionCard}>
              <View style={styles.firstActionIconWrap}>
                <Ionicons name="leaf" size={32} color={Colors.secondary} />
              </View>
              <Text style={styles.firstActionTitle}>Welcome to GutWell</Text>
              <Text style={styles.firstActionBody}>
                Your gut health journey starts with a single check-in. It takes about 2 minutes.
              </Text>
              <View style={styles.firstActionSteps}>
                {[
                  { icon: 'body-outline', text: 'Log your stool type' },
                  { icon: 'fitness-outline', text: 'Rate your symptoms' },
                  { icon: 'happy-outline', text: 'Track your mood' },
                ].map((step, i) => (
                  <View key={i} style={styles.firstActionStep}>
                    <View style={styles.firstActionStepNum}>
                      <Text style={styles.firstActionStepNumText}>{i + 1}</Text>
                    </View>
                    <Ionicons name={step.icon as any} size={18} color={Colors.textSecondary} style={{ marginHorizontal: 8 }} />
                    <Text style={styles.firstActionStepText}>{step.text}</Text>
                  </View>
                ))}
              </View>
              <PressableFeedback onPress={() => router.push('/(tabs)/checkin')} style={styles.firstActionBtn}>
                <View style={styles.firstActionBtnInner}>
                  <Text style={styles.firstActionBtnText}>Start First Check-in</Text>
                  <Ionicons name="arrow-forward" size={16} color="#fff" />
                </View>
              </PressableFeedback>
            </View>
          )}

          {/* Daily Tip */}
          <View style={styles.dailyTipWrap}>
            <DailyTip />
          </View>
        </>
        )}
      </ScrollView>

      {/* Streak Popup Modal */}
      <StreakPopup
        visible={streakPopupVisible}
        currentStreak={streak}
        bestStreak={bestStreak}
        streakState={streakState}
        completionRate={completionRate}
        weeklyCompletions={weeklyCompletions}
        onClose={() => setStreakPopupVisible(false)}
      />
    </SafeAreaView>
  );
}

// ─── Quick Action Card ──────────────────────────────────────────────────────

function QuickAction({ icon, label, color, bgTint, onPress }: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color: string;
  bgTint: string;
  onPress: () => void;
}) {
  return (
    <PressableFeedback onPress={onPress} style={styles.actionCardWrapper}>
      <View style={[styles.actionCard, { backgroundColor: bgTint }]}>
        <View style={[styles.actionIcon, { backgroundColor: color + '18' }]}>
          <Ionicons name={icon} size={26} color={color} />
        </View>
        <Text style={[styles.actionLabel, { color }]}>{label}</Text>
      </View>
    </PressableFeedback>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function entryColor(type: string) {
  return type === 'checkin' ? Colors.primary : type === 'food' ? Colors.secondary : Colors.accent;
}

function entryIcon(type: string): keyof typeof Ionicons.glyphMap {
  return type === 'checkin' ? 'body-outline' : type === 'food' ? 'restaurant-outline' : 'medical-outline';
}

function formatTime(iso: string) {
  const diffMins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return new Date(iso).toLocaleDateString();
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scroll: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xxl + Spacing.lg,
  },

  // ── Header (3-column) ────────────────────────────────
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: Spacing.xl,
  },
  greetingBlock: {
    flex: 1,
  },
  greeting: {
    fontFamily: FontFamily.displayRegular,
    fontSize: FontSize.xl,
    color: Colors.textSecondary,
    lineHeight: 28,
  },
  name: {
    fontFamily: FontFamily.displayBold,
    fontSize: FontSize.hero,
    color: Colors.text,
    lineHeight: 42,
    marginTop: 2,
  },
  dateBlock: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingTop: 4,
  },
  dateDayText: {
    fontFamily: FontFamily.displayMedium,
    fontSize: FontSize.md,
    color: Colors.text,
    textAlign: 'center',
  },
  dateDateText: {
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 2,
  },
  badgeBlock: {
    flex: 1,
    alignItems: 'flex-end',
  },

  // ── Gut Score Card ──────────────────────────
  scoreCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    alignItems: 'center',
    paddingVertical: Spacing.xl + Spacing.sm,
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.xl,
    ...Shadows.md,
  },
  scoreLabel: {
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: Spacing.md,
  },
  scoreCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: Colors.surfaceSecondary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: Colors.secondary,
  },
  scoreValue: {
    fontFamily: FontFamily.displayBold,
    fontSize: 42,
    color: Colors.primary,
    lineHeight: 48,
  },
  scoreOutOf: {
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.xs,
    color: Colors.textTertiary,
    marginTop: -4,
  },
  streakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: Spacing.md,
    backgroundColor: Colors.accent + '12',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    borderRadius: BorderRadius.full,
  },
  streakText: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
    color: Colors.accent,
  },
  streakRowNew: {
    backgroundColor: Colors.border + '40',
    borderColor: Colors.border,
  },
  streakTextNew: {
    color: Colors.textTertiary,
  },
  trendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  trendText: {
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.xs,
  },
  sparklineWrap: {
    marginTop: 16,
    alignItems: 'center',
    opacity: 0.85,
  },

  // ── Insight Banner ───────────────────────────
  insightBanner: {
    backgroundColor: Colors.primary + '0D',
    borderRadius: BorderRadius.lg,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: Spacing.xl,
    borderLeftWidth: 3,
    borderLeftColor: Colors.primary + '60',
  },
  insightText: {
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.sm,
    color: Colors.text,
    lineHeight: 20,
  },

  // ── Section Row (title + "See all") ─────────
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
    marginTop: Spacing.sm,
  },
  sectionTitle: {
    fontFamily: FontFamily.displayMedium,
    fontSize: FontSize.xl,
    color: Colors.text,
  },
  seeAllLink: {
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.sm,
    color: Colors.secondary,
  },

  // ── Quick Actions ───────────────────────────
  actions: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  actionCardWrapper: {
    flex: 1,
  },
  actionCard: {
    height: 100,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionLabel: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
  },

  // ── Timeline / Recent Activity ──────────────
  timelineContainer: {
    position: 'relative',
    marginBottom: Spacing.xl,
    paddingLeft: 20,
  },
  timelineLine: {
    position: 'absolute',
    left: 5,
    top: 12,
    bottom: 12,
    width: 2,
    backgroundColor: Colors.border,
    borderRadius: 1,
  },
  timelineItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    ...Shadows.sm,
  },
  timelineDotWrap: {
    position: 'absolute',
    left: -20,
    width: 12,
    height: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: Colors.background,
  },
  timelineContent: {
    flex: 1,
  },
  activityLabel: {
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.md,
    color: Colors.text,
  },
  activityTime: {
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.xs,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  activityTypeBadge: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ── First Action (Onboarding) Card ──────────
  firstActionCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: 24,
    ...Shadows.md,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.xl,
  },
  firstActionIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.secondary + '15',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  firstActionTitle: {
    fontFamily: FontFamily.displayBold,
    fontSize: FontSize.xxl,
    color: Colors.text,
    marginBottom: 8,
  },
  firstActionBody: {
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    lineHeight: 22,
    marginBottom: 20,
  },
  firstActionSteps: {
    gap: 12,
    marginBottom: 24,
    width: '100%' as const,
  },
  firstActionStep: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
  },
  firstActionStepNum: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
  },
  firstActionStepNumText: {
    fontFamily: FontFamily.sansBold,
    fontSize: 12,
    color: Colors.primary,
  },
  firstActionStepText: {
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    flex: 1,
  },
  firstActionBtn: {
    width: '100%' as const,
  },
  firstActionBtnInner: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.lg,
    paddingVertical: 14,
    paddingHorizontal: 20,
    flexDirection: 'row' as const,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    gap: 8,
  },
  firstActionBtnText: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.md,
    color: '#FFFFFF',
  },

  // ── Daily Tip ───────────────────────────────
  dailyTipWrap: {
    marginTop: Spacing.sm,
  },
});
