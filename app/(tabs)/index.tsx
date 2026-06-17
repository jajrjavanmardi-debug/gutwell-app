import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, Alert, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { LoadingSkeleton, CardSkeleton } from '../../components/ui/LoadingSkeleton';
import { DailyTip } from '../../components/DailyTip';
import { StreakPopup } from '../../components/StreakPopup';
import { ProgressRing } from '../../components/ui/ProgressRing';
import { StatCard } from '../../components/ui/StatCard';
import { DaySelector } from '../../components/ui/DaySelector';
import { Colors, Spacing, FontSize, BorderRadius, Shadows, FontFamily } from '../../constants/theme';
import { updateTodayScore } from '../../lib/scoring';
import { scheduleStreakAtRiskAlert } from '../../lib/notifications';
import { ErrorState } from '../../components/ui/ErrorState';
import { getStreakSnapshot } from '../../lib/streaks';
import { computeCorrelations, type FoodCorrelation } from '../../lib/correlations';
import { getLocalDateKey, addDaysToLocalDateKey } from '../../lib/date';

type RecentEntry = {
  id: string | number;
  type: 'checkin' | 'food' | 'symptom';
  label: string;
  time: string;
  sortKey: string;
};

// ─── Gut Score Ring Color ─────────────────────────────────────────────────────

function scoreRingColor(score: number | null): string {
  if (score === null) return Colors.border;
  if (score >= 70) return Colors.secondary;
  if (score >= 40) return Colors.accent;
  return '#E07070';
}

export default function HomeScreen() {
  const { user, profile } = useAuth();
  const [gutScore, setGutScore] = useState<number | null>(null);
  const [yesterdayScore, setYesterdayScore] = useState<number | null>(null);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [weeklyCompletions, setWeeklyCompletions] = useState<boolean[]>(Array(7).fill(false));
  const [completionRate, setCompletionRate] = useState(0);
  const [streakPopupVisible, setStreakPopupVisible] = useState(false);
  const [recentEntries, setRecentEntries] = useState<RecentEntry[]>([]);
  const [mealsLoggedToday, setMealsLoggedToday] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [topTrigger, setTopTrigger] = useState<FoodCorrelation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  // Entrance animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true, easing: Easing.out(Easing.cubic) }),
      Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: true, easing: Easing.out(Easing.cubic) }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  const loadData = useCallback(async () => {
    if (!user) return;
    try {

    // Local-day keys: gut_scores/check_ins are keyed by the user's calendar
    // day, not UTC (a 7pm check-in in NY must not count as tomorrow).
    const today = getLocalDateKey();
    const yesterdayStr = addDaysToLocalDateKey(today, -1);
    const sevenDaysAgoStr = addDaysToLocalDateKey(today, -6);

    // ── Fetch all independent data in parallel ──────────────────────────────
    const [
      { data: scoreData },
      { data: yData },
      streakSnapshot,
      { data: recentCheckInDates },
      { count: foodLogsToday },
      { data: recentCheckins },
      { data: recentFood },
    ] = await Promise.all([
      // Today's score
      supabase
        .from('gut_scores')
        .select('score')
        .eq('user_id', user.id)
        .eq('date', today)
        .maybeSingle(),
      // Yesterday's score
      supabase
        .from('gut_scores')
        .select('score')
        .eq('user_id', user.id)
        .eq('date', yesterdayStr)
        .maybeSingle(),
      // Streak data
      getStreakSnapshot(user.id),
      // Last 7 days of check-ins for weekly completions
      supabase
        .from('check_ins')
        .select('entry_date')
        .eq('user_id', user.id)
        .gte('entry_date', sevenDaysAgoStr)
        .order('entry_date', { ascending: true }),
      // Food logs today (for "Meals logged" stat card)
      supabase
        .from('food_logs')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gte('logged_at', today),
      // Recent check-ins
      supabase
        .from('check_ins')
        .select('id, stool_type, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(3),
      // Recent food logs
      supabase
        .from('food_logs')
        .select('id, meal_name, logged_at')
        .eq('user_id', user.id)
        .order('logged_at', { ascending: false })
        .limit(3),
    ]);

    // ── Today's score (may need recomputation) ──────────────────────────────
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

    // ── Yesterday's score ───────────────────────────────────────────────────
    setYesterdayScore(yData?.score ?? null);

    // ── Streak data ─────────────────────────────────────────────────────────
    const currentStreak = streakSnapshot.currentStreak ?? 0;
    const fetchedBestStreak = streakSnapshot.bestStreak ?? 0;
    setStreak(currentStreak);
    setBestStreak(fetchedBestStreak);

    // ── Meals logged today ──────────────────────────────────────────────────
    setMealsLoggedToday(foodLogsToday ?? 0);

    // ── Weekly completions ──────────────────────────────────────────────────
    const checkedDates = new Set((recentCheckInDates ?? []).map((r: { entry_date: string }) => r.entry_date));

    const weekly = Array.from({ length: 7 }, (_, i) =>
      checkedDates.has(addDaysToLocalDateKey(today, -(6 - i))),
    );
    setWeeklyCompletions(weekly);

    const checkedCount = weekly.filter(Boolean).length;
    setCompletionRate(checkedCount / 7);

    // ── Streak-at-risk notification ─────────────────────────────────────────
    if (currentStreak > 0 && !checkedDates.has(today)) {
      scheduleStreakAtRiskAlert(currentStreak).catch(() => {});
    }

    // ── Recent entries ──────────────────────────────────────────────────────
    const entries: RecentEntry[] = [];

    recentCheckins?.forEach(c => {
      entries.push({
        id: c.id,
        type: 'checkin',
        label: `Stool type ${c.stool_type}`,
        time: formatTime(c.created_at),
        sortKey: c.created_at,
      });
    });

    recentFood?.forEach(f => {
      entries.push({
        id: f.id,
        type: 'food',
        label: f.meal_name,
        time: formatTime(f.logged_at),
        sortKey: f.logged_at,
      });
    });

    entries.sort((a, b) => b.sortKey.localeCompare(a.sortKey));
    setRecentEntries(entries.slice(0, 5));

    // ── Strongest trigger insight (non-blocking — needs weeks of data) ──────
    computeCorrelations(user.id)
      .then(({ triggerFoods }) => setTopTrigger(triggerFoods[0] ?? null))
      .catch(() => setTopTrigger(null));
    } catch {
      setError('offline');
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleEntryPress = useCallback((entry: RecentEntry) => {
    if (entry.type === 'checkin') {
      router.push({ pathname: '/edit-checkin', params: { id: String(entry.id) } });
    } else if (entry.type === 'food') {
      Alert.alert(
        'Remove Food Log',
        `Delete "${entry.label}"?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              const { error } = await supabase.from('food_logs').delete().eq('id', entry.id);
              if (!error) loadData();
            },
          },
        ]
      );
    } else if (entry.type === 'symptom') {
      Alert.alert(
        'Remove Symptom Log',
        `Delete "${entry.label}"?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              const { error } = await supabase.from('symptoms').delete().eq('id', entry.id);
              if (!error) loadData();
            },
          },
        ]
      );
    }
  }, [loadData]);

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

  const scoreColor = scoreRingColor(gutScore);
  const scoreCaption =
    gutScore === null
      ? 'No check-in yet'
      : gutScore >= 70
      ? 'Thriving gut'
      : gutScore >= 40
      ? 'Settling in'
      : 'Needs care';
  const trendDelta =
    gutScore !== null && yesterdayScore !== null ? gutScore - yesterdayScore : null;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.secondary} />}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
        {/* Header: wordmark left, streak pill right */}
        <View style={styles.headerRow}>
          <View style={styles.wordmark}>
            <Ionicons name="leaf" size={22} color={Colors.secondary} />
            <Text style={styles.wordmarkText}>Gutwell</Text>
          </View>

          <TouchableOpacity
            style={styles.streakPill}
            onPress={() => setStreakPopupVisible(true)}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel={streak > 0 ? `${streak} day streak, view details` : 'Start your streak'}
          >
            <Ionicons
              name={streak > 0 ? 'flame' : 'flame-outline'}
              size={16}
              color={streak > 0 ? Colors.accent : Colors.textTertiary}
            />
            <Text style={[styles.streakPillText, streak === 0 && styles.streakPillTextNew]}>
              {streak}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Day selector strip */}
        <View style={styles.daySelectorWrap}>
          <DaySelector selectedDate={selectedDate} onSelectDate={setSelectedDate} />
        </View>

        {!isLoading && error ? (
          <ErrorState type="offline" onRetry={() => { setError(null); loadData(); }} />
        ) : isLoading ? (
          <>
            <View style={styles.heroCard}>
              <View style={{ flex: 1, gap: 8 }}>
                <LoadingSkeleton width={90} height={44} borderRadius={8} />
                <LoadingSkeleton width={120} height={14} />
              </View>
              <LoadingSkeleton width={120} height={120} borderRadius={60} />
            </View>
            <View style={styles.statsRow}>
              <LoadingSkeleton height={130} borderRadius={BorderRadius.lg} style={{ flex: 1 }} />
              <LoadingSkeleton height={130} borderRadius={BorderRadius.lg} style={{ flex: 1 }} />
              <LoadingSkeleton height={130} borderRadius={BorderRadius.lg} style={{ flex: 1 }} />
            </View>
            <CardSkeleton />
            <CardSkeleton />
          </>
        ) : (
        <>
          {/* HERO — Gut Score: big number left, ring right (Cal AI calories-left) */}
          <View style={styles.heroCard}>
            <View style={styles.heroLeft}>
              <Text style={styles.heroValue}>{gutScore !== null ? gutScore : '--'}</Text>
              <Text style={styles.heroLabel}>Gut score today</Text>
              {trendDelta !== null && (
                <View style={styles.trendRow}>
                  <Ionicons
                    name={trendDelta >= 0 ? 'trending-up' : 'trending-down'}
                    size={13}
                    color={trendDelta >= 0 ? Colors.secondary : '#E07070'}
                  />
                  <Text style={[styles.trendText, { color: trendDelta >= 0 ? Colors.secondary : '#E07070' }]}>
                    {trendDelta > 0 ? `+${trendDelta}` : `${trendDelta}`} vs yesterday
                  </Text>
                </View>
              )}
            </View>

            <ProgressRing
              progress={gutScore !== null ? gutScore / 100 : 0}
              size={120}
              strokeWidth={12}
              fillColor={scoreColor}
            >
              <Text style={[styles.ringValue, { color: scoreColor }]}>
                {gutScore !== null ? gutScore : '--'}
              </Text>
              <Text style={styles.ringCaption}>{scoreCaption}</Text>
            </ProgressRing>
          </View>

          {/* STAT CARDS — gut factors (Cal AI macros) */}
          <View style={styles.statsRow}>
            <StatCard
              icon={<Ionicons name="body" size={22} color={Colors.primaryLight} />}
              value={checkedInToday ? 'Done' : '—'}
              label="Check-in"
              accentColor={Colors.primaryLight}
              progress={checkedInToday ? 1 : 0}
              onPress={() => router.push('/(tabs)/checkin')}
              style={styles.statCard}
            />
            <StatCard
              icon={<Ionicons name="restaurant" size={22} color={Colors.secondary} />}
              value={String(mealsLoggedToday)}
              label="Meals logged"
              accentColor={Colors.secondary}
              progress={Math.min(mealsLoggedToday / 3, 1)}
              onPress={() => router.push('/(tabs)/food')}
              style={styles.statCard}
            />
            <StatCard
              icon={<Ionicons name="water" size={22} color={Colors.info} />}
              value={`${Math.round(completionRate * 100)}%`}
              label="Week consistency"
              accentColor={Colors.info}
              progress={completionRate}
              onPress={() => router.push('/(tabs)/progress')}
              style={styles.statCard}
            />
          </View>

          {/* AI Meal Scan — flagship action */}
          <TouchableOpacity
            onPress={() => router.push('/photo-analysis')}
            style={styles.scanCardInner}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Scan a meal with AI"
          >
            <View style={styles.scanIconWrap}>
              <Ionicons name="camera" size={24} color={Colors.secondary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.scanTitle}>Scan your meal</Text>
              <Text style={styles.scanSubtitle}>
                Snap a photo — get gut-friendly insights in seconds
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} />
          </TouchableOpacity>

          {/* Strongest trigger insight — the core promise, surfaced on Home */}
          {topTrigger && (
            <TouchableOpacity
              style={styles.triggerCard}
              onPress={() => router.push('/(tabs)/progress')}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={`Your strongest trigger food is ${topTrigger.foodName}. View details`}
            >
              <View style={styles.triggerIconWrap}>
                <Ionicons name="warning-outline" size={18} color={Colors.warning} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.triggerLabel}>YOUR STRONGEST TRIGGER</Text>
                <Text style={styles.triggerFood}>{topTrigger.foodName}</Text>
                <Text style={styles.triggerDetail}>
                  {topTrigger.topSymptom
                    ? `Linked to ${topTrigger.topSymptom.toLowerCase()} after ${topTrigger.timesWithSymptoms} of ${topTrigger.timesLogged} logs`
                    : `Symptoms followed ${topTrigger.timesWithSymptoms} of ${topTrigger.timesLogged} logs`}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={Colors.textTertiary} />
            </TouchableOpacity>
          )}

          {/* Recently logged */}
          <View style={styles.sectionRow}>
            <Text style={styles.sectionTitle}>Recently logged</Text>
            {recentEntries.length > 0 && (
              <TouchableOpacity onPress={() => router.push('/(tabs)/progress')} accessibilityRole="button" accessibilityLabel="See all recent activity">
                <Text style={styles.seeAllLink}>See all</Text>
              </TouchableOpacity>
            )}
          </View>

          {recentEntries.length > 0 ? (
            <View style={styles.recentList}>
              {recentEntries.map((entry, i) => (
                <TouchableOpacity
                  key={i}
                  style={styles.recentItem}
                  onPress={() => handleEntryPress(entry)}
                  activeOpacity={0.72}
                  accessibilityRole="button"
                  accessibilityLabel={`${entry.label}, ${entry.time}`}
                >
                  <View style={[styles.recentIconWrap, { backgroundColor: entryColor(entry.type) + '18' }]}>
                    <Ionicons name={entryIcon(entry.type)} size={20} color={entryColor(entry.type)} />
                  </View>
                  <View style={styles.recentContent}>
                    <Text style={styles.recentLabel} numberOfLines={1}>{entry.label}</Text>
                    <Text style={styles.recentTime}>{entry.time}</Text>
                  </View>
                  <Ionicons
                    name={entry.type === 'checkin' ? 'pencil' : 'trash-outline'}
                    size={16}
                    color={Colors.textTertiary}
                  />
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <>
              <TouchableOpacity
                style={styles.emptyMealCard}
                onPress={() => router.push('/(tabs)/checkin')}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Log your first entry of the day"
              >
                <View style={styles.emptyMealThumb}>
                  <Ionicons name="leaf-outline" size={22} color={Colors.textTertiary} />
                </View>
                <View style={styles.emptyMealLines}>
                  <View style={[styles.emptyLine, { width: '70%' }]} />
                  <View style={[styles.emptyLine, { width: '45%' }]} />
                </View>
              </TouchableOpacity>
              <Text style={styles.emptyHint}>Tap + to log your first entry of the day</Text>
            </>
          )}

          {/* Daily Tip */}
          <View style={styles.dailyTipWrap}>
            <DailyTip gutConcern={profile?.gut_concern} goal={profile?.goal} />
          </View>
        </>
        )}
        </Animated.View>
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

// ─── Helpers ────────────────────────────────────────────────────────────────

function entryColor(type: string) {
  return type === 'checkin' ? Colors.primaryLight : type === 'food' ? Colors.secondary : Colors.accent;
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

  // ── Header ───────────────────────────────────────────
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  wordmark: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  wordmarkText: {
    fontFamily: FontFamily.displayBold,
    fontSize: FontSize.xxl,
    color: Colors.text,
  },
  streakPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    borderRadius: BorderRadius.full,
  },
  streakPillText: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
    color: Colors.accent,
  },
  streakPillTextNew: {
    color: Colors.textTertiary,
  },

  // ── Day selector ─────────────────────────────────────
  daySelectorWrap: {
    marginBottom: Spacing.lg,
  },

  // ── Hero (Gut Score) card ────────────────────────────
  heroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
    gap: Spacing.md,
    ...Shadows.md,
  },
  heroLeft: {
    flex: 1,
  },
  heroValue: {
    fontFamily: FontFamily.displayBold,
    fontSize: 56,
    lineHeight: 62,
    color: Colors.text,
  },
  heroLabel: {
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  trendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: Spacing.sm,
  },
  trendText: {
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.xs,
  },
  ringValue: {
    fontFamily: FontFamily.displayBold,
    fontSize: 32,
    lineHeight: 36,
  },
  ringCaption: {
    fontFamily: FontFamily.sansRegular,
    fontSize: 10,
    color: Colors.textTertiary,
    marginTop: 2,
    textAlign: 'center',
    paddingHorizontal: 6,
  },

  // ── Stat cards row ───────────────────────────────────
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
  },

  // ── AI Meal Scan card ────────────────────────────────
  scanCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.secondary + '30',
    padding: Spacing.md,
    gap: Spacing.md,
    marginBottom: Spacing.lg,
    ...Shadows.sm,
  },
  scanIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.secondary + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanTitle: {
    fontFamily: FontFamily.displaySemiBold,
    fontSize: FontSize.lg,
    color: Colors.text,
  },
  scanSubtitle: {
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },

  // ── Trigger insight card ─────────────────────────────
  triggerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.warning + '35',
    padding: Spacing.md,
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  triggerIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.warning + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  triggerLabel: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: 10,
    letterSpacing: 1.2,
    color: Colors.textTertiary,
  },
  triggerFood: {
    fontFamily: FontFamily.displaySemiBold,
    fontSize: FontSize.lg,
    color: Colors.text,
    marginTop: 1,
  },
  triggerDetail: {
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },

  // ── Section Row (title + "See all") ──────────────────
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
    marginTop: 0,
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

  // ── Recently logged list ─────────────────────────────
  recentList: {
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  recentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    gap: Spacing.md,
    ...Shadows.sm,
  },
  recentIconWrap: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recentContent: {
    flex: 1,
  },
  recentLabel: {
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.md,
    color: Colors.text,
  },
  recentTime: {
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.xs,
    color: Colors.textTertiary,
    marginTop: 2,
  },

  // ── Empty meal card (Cal AI empty state) ─────────────
  emptyMealCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    gap: Spacing.md,
    marginBottom: Spacing.sm,
  },
  emptyMealThumb: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyMealLines: {
    flex: 1,
    gap: 8,
  },
  emptyLine: {
    height: 10,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surfaceSecondary,
  },
  emptyHint: {
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.sm,
    color: Colors.textTertiary,
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },

  // ── Daily Tip ────────────────────────────────────────
  dailyTipWrap: {
    marginTop: Spacing.sm,
  },
});
