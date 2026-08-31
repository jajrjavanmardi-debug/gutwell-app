import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router , useFocusEffect } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { Card } from '../../components/ui/Card';
import { LoadingSkeleton } from '../../components/ui/LoadingSkeleton';
import { ContributionCalendar } from '../../components/ContributionCalendar';
import { Colors, Spacing, FontSize, BorderRadius, Shadows, FontFamily } from '../../constants/theme';
import { analyzeCorrelations, CorrelationSummary, computeCorrelations, FoodCorrelation, SafeFood } from '../../lib/correlations';
import { ShareCard } from '../../components/ShareCard';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { isPremiumFeature, refreshPremiumStatus } from '../../lib/subscription';
import ScoreCard from '../../components/ScoreCard';
import TrendBox from '../../components/TrendBox';
import RecommendationBox from '../../components/RecommendationBox';
import ChartComponent from '../../components/ChartComponent';
import History from '../../components/History';
import TriggerFoodsBox from '../../components/TriggerFoodsBox';
import SafeFoodsBox from '../../components/SafeFoodsBox';
import { SegmentedToggle } from '../../components/ui/SegmentedToggle';
import { StatCard } from '../../components/ui/StatCard';
import { addDaysToLocalDateKey, getLocalDateKey } from '../../lib/date';
import { track, Events } from '../../lib/analytics';
import { getStreakSnapshot } from '../../lib/streaks';
import { calculatePoints, calculateLevel, getNextLevel, getLevelProgress } from '../../lib/levels';
import { useTranslation } from '../../lib/i18n';
import { useLanguage } from '../../lib/LanguageContext';

// Cal AI–style time ranges (90D / 6M / 1Y / ALL). Mapped to lookback windows
// in `loadData` — the data semantics are preserved, only the range labels
// match Cal AI's progress screens.
type Period = '90D' | '6M' | '1Y' | 'ALL';

const PERIOD_OPTIONS: { label: string; value: Period }[] = [
  { label: '90D', value: '90D' },
  { label: '6M', value: '6M' },
  { label: '1Y', value: '1Y' },
  { label: 'ALL', value: 'ALL' },
];

const PERIOD_DAYS: Record<Period, number> = {
  '90D': 90,
  '6M': 180,
  '1Y': 365,
  ALL: 3650,
};

// Windows for the Cal AI "Changes" table. Fixed day-windows plus an "All Time"
// entry computed over the full available score history.
type ChangeWindow = { label: string; days: number | null };
// CHANGE_WINDOWS built inside ProgressScreen to access i18n
const CHANGE_WINDOWS_DAYS: (number | null)[] = [3, 7, 14, 30, 90, null];

export default function ProgressScreen() {
  const t = useTranslation();
  // Same mapping Home and food.tsx use, so dates follow the app language
  // rather than the device region — and rather than the hardcoded 'en-US'
  // that used to format the best-day label.
  const { language } = useLanguage();
  const dateLocale = language === 'de' ? 'de-DE' : 'en-US';
  const CHANGE_WINDOWS: ChangeWindow[] = [
    { label: t.progress.windowLabels['3'], days: 3 },
    { label: t.progress.windowLabels['7'], days: 7 },
    { label: t.progress.windowLabels['14'], days: 14 },
    { label: t.progress.windowLabels['30'], days: 30 },
    { label: t.progress.windowLabels['90'], days: 90 },
    { label: t.progress.allTime, days: null },
  ];
  const { user } = useAuth();
  const [period, setPeriod] = useState<Period>('90D');
  const [checkInCount, setCheckInCount] = useState(0);
  const [avgStoolType, setAvgStoolType] = useState<number | null>(null);
  const [symptomCounts, setSymptomCounts] = useState<Record<string, number>>({});
  const [foodCount, setFoodCount] = useState(0);
  const [stoolHistory, setStoolHistory] = useState<{ date: string; type: number }[]>([]);
  const [gutScores, setGutScores] = useState<{ x: number; y: number; label: string }[]>([]);
  const [allScores, setAllScores] = useState<{ score: number; date: string }[]>([]);
  const [correlations, setCorrelations] = useState<CorrelationSummary | null>(null);
  const [triggerFoods, setTriggerFoods] = useState<FoodCorrelation[]>([]);
  const [safeFoods, setSafeFoods] = useState<SafeFood[]>([]);
  const [showShare, setShowShare] = useState(false);
  const [checkInDates, setCheckInDates] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [weekInsights, setWeekInsights] = useState<{ avgScore: number | null, bestDay: string | null, trend: 'up' | 'down' | 'flat' } | null>(null);
  const [moodHistory, setMoodHistory] = useState<{ date: string; mood: number }[]>([]);
  const [avgMood, setAvgMood] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasPremium, setHasPremium] = useState<boolean>(isPremiumFeature('correlations'));
  // Cal AI header / status-card data
  const [currentStreak, setCurrentStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [totalPoints, setTotalPoints] = useState(0);
  const [badgesEarned, setBadgesEarned] = useState(0);
  const [currentScore, setCurrentScore] = useState<number | null>(null);
  /**
   * Date of the score in `currentScore`, as a local date key.
   *
   * The screen used to call the most recent score in the period "Current Gut
   * Score" with no date attached, so a four-day-old number was presented as
   * today's — while Home, on the same day, correctly said "No score yet".
   * Keeping the date lets the card say which it is. No extra query: the date
   * already comes back in the same row.
   */
  const [currentScoreDate, setCurrentScoreDate] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!user) return;
    try {
    const daysBack = PERIOD_DAYS[period];
    const sinceDateStr = addDaysToLocalDateKey(getLocalDateKey(), -daysBack);

    const { data: checkIns } = await supabase.from('check_ins').select('stool_type, entry_date, mood')
      .eq('user_id', user.id).gte('entry_date', sinceDateStr).order('entry_date', { ascending: true });
    if (checkIns) {
      setCheckInCount(checkIns.length);
      if (checkIns.length > 0) {
        const avg = checkIns.reduce((s, c) => s + c.stool_type, 0) / checkIns.length;
        setAvgStoolType(Math.round(avg * 10) / 10);
      } else {
        setAvgStoolType(null);
      }
      setStoolHistory(checkIns.map(c => ({ date: c.entry_date, type: c.stool_type })));
      setCheckInDates(checkIns.map(c => c.entry_date));
      const moodEntries = checkIns.filter(c => c.mood != null).map(c => ({ date: c.entry_date, mood: c.mood as number }));
      setMoodHistory(moodEntries);
      if (moodEntries.length > 0) {
        const moodAvg = moodEntries.reduce((s, c) => s + c.mood, 0) / moodEntries.length;
        setAvgMood(Math.round(moodAvg * 10) / 10);
      } else {
        setAvgMood(null);
      }
    }

    // Gut score trend
    const { data: scores } = await supabase.from('gut_scores').select('score, date')
      .eq('user_id', user.id).gte('date', sinceDateStr).order('date', { ascending: true });
    if (scores && scores.length > 0) {
      setAllScores(scores);
      setCurrentScore(scores[scores.length - 1].score);
      setCurrentScoreDate(scores[scores.length - 1].date);
      if (daysBack > 90) {
        // Group by ISO week and show weekly averages for long ranges
        const weekMap: Record<string, { sum: number; count: number; firstDate: string }> = {};
        scores.forEach(s => {
          const d = new Date(s.date + 'T00:00:00');
          const startOfYear = new Date(d.getFullYear(), 0, 1);
          const weekNum = Math.ceil(((d.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7);
          const key = `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
          if (!weekMap[key]) weekMap[key] = { sum: 0, count: 0, firstDate: s.date };
          weekMap[key].sum += s.score;
          weekMap[key].count += 1;
        });
        const weeklyScores = Object.entries(weekMap)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([, v], i) => ({
            x: i,
            y: Math.round(v.sum / v.count),
            label: formatShortDate(v.firstDate, dateLocale),
          }));
        setGutScores(weeklyScores);
      } else {
        setGutScores(scores.map((s, i) => ({
          x: i,
          y: s.score,
          label: formatShortDate(s.date, dateLocale),
        })));
      }
    } else {
      setAllScores([]);
      setCurrentScore(null);
      setCurrentScoreDate(null);
      setGutScores([]);
    }

    // Compute weekly insights from last 7 days of scores
    if (scores && scores.length >= 3) {
      const last7 = scores.slice(-7);
      if (last7.length >= 3) {
        const avg = Math.round(last7.reduce((s: number, d: { score: number; date: string }) => s + d.score, 0) / last7.length);
        const bestDay = last7.reduce((b: { score: number; date: string }, d: { score: number; date: string }) => d.score > b.score ? d : b, last7[0]);
        const firstHalf = last7.slice(0, 3).reduce((s: number, d: { score: number; date: string }) => s + d.score, 0) / 3;
        const secondHalf = last7.slice(-3).reduce((s: number, d: { score: number; date: string }) => s + d.score, 0) / 3;
        const trend = secondHalf > firstHalf + 3 ? 'up' : secondHalf < firstHalf - 3 ? 'down' : 'flat';
        // Was hardcoded 'en-US', so a German user read an English date inside
        // an otherwise German card.
        const dayLabel = new Date(bestDay.date).toLocaleDateString(dateLocale, { weekday: 'short', month: 'short', day: 'numeric' });
        setWeekInsights({ avgScore: avg, bestDay: dayLabel, trend });
      }
    } else {
      setWeekInsights(null);
    }

    const { data: symptoms } = await supabase.from('symptoms').select('symptom_type')
      .eq('user_id', user.id).gte('logged_at', `${sinceDateStr}T00:00:00`);
    if (symptoms) {
      const counts: Record<string, number> = {};
      symptoms.forEach(s => { counts[s.symptom_type] = (counts[s.symptom_type] || 0) + 1; });
      setSymptomCounts(counts);
    }

    const { count } = await supabase.from('food_logs').select('id', { count: 'exact', head: true })
      .eq('user_id', user.id).gte('logged_at', `${sinceDateStr}T00:00:00`);
    setFoodCount(count || 0);

    // Streak + level/badges for the Cal AI header & status card. Counts are
    // all-time (not period-scoped) so the streak/level matches Profile.
    try {
      const [allCheckIns, allFoodLogs, allSymptoms, streakSnapshot] = await Promise.all([
        supabase.from('check_ins').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
        supabase.from('food_logs').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
        supabase.from('symptoms').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
        getStreakSnapshot(user.id),
      ]);
      setCurrentStreak(streakSnapshot.currentStreak);
      setBestStreak(streakSnapshot.bestStreak);
      const ci = allCheckIns.count ?? 0;
      const fl = allFoodLogs.count ?? 0;
      const sl = allSymptoms.count ?? 0;
      const points = calculatePoints({
        checkIns: ci,
        foodLogs: fl,
        symptomLogs: sl,
        currentStreak: streakSnapshot.currentStreak,
      });
      setTotalPoints(points);
      // Badges mirror Profile's unlock conditions.
      const badges = [
        ci >= 1,
        points >= 50,
        fl >= 10,
        points >= 100,
      ];
      setBadgesEarned(badges.filter(Boolean).length);
    } catch {
      // Best-effort — header degrades to zeros.
    }

    // Food-symptom correlations (legacy engine)
    try {
      const corr = await analyzeCorrelations(user.id, daysBack);
      setCorrelations(corr);
    } catch {
      setCorrelations(null);
    }

    // New meal-level correlation engine
    try {
      const corr = await computeCorrelations(user.id, 90);
      setTriggerFoods(corr.triggerFoods);
      setSafeFoods(corr.safeFoods);
    } catch {
      setTriggerFoods([]);
      setSafeFoods([]);
    }

    } catch {
      setError('offline');
    } finally {
      setIsLoading(false);
    }
  }, [user, period, dateLocale]);

  useEffect(() => { loadData(); }, [loadData]);

  useFocusEffect(useCallback(() => {
    let active = true;
    const syncPremium = async () => {
      const status = await refreshPremiumStatus().catch(() => false);
      if (active) {
        setHasPremium(status);
      }
    };
    syncPremium();
    return () => {
      active = false;
    };
  }, []));

  const onRefresh = async () => { setRefreshing(true); await loadData(); setRefreshing(false); };

  const topSymptoms = Object.entries(symptomCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

  // Build heatmap data from check-in dates
  const buildHeatmapData = () => {
    const dateCounts: Record<string, number> = {};
    checkInDates.forEach(d => {
      dateCounts[d] = (dateCounts[d] || 0) + 1;
    });
    return dateCounts;
  };

  const getBarColor = (score: number) => {
    if (score >= 70) return Colors.secondary;
    if (score >= 40) return Colors.accent;
    return Colors.severity[4];
  };

  // Cal AI "Current Weight → Goal" analog: current Gut Score vs the next-level
  // milestone, with a progress bar toward that milestone.
  const level = calculateLevel(totalPoints);
  const nextLevel = getNextLevel(totalPoints);
  const levelProgress = getLevelProgress(totalPoints);

  /**
   * Localized level name.
   *
   * lib/levels.ts is left completely untouched — it carries the point
   * thresholds — so the stable `key` is mapped to display copy here rather
   * than renaming anything in the module.
   */
  const levelDisplayName = (key: string): string =>
    (t.progress.levelNames as Record<string, string>)[key] ?? key;

  // ── A. Current summary ──────────────────────────────────────────────────
  const scoreIsToday = currentScoreDate === getLocalDateKey();
  const scoreTitle = scoreIsToday ? t.progress.scoreTitleToday : t.progress.scoreTitleLatest;
  const scoreProvenance = scoreIsToday
    ? t.progress.scoreProvenanceToday
    : t.progress.scoreProvenanceOlder.replace(
        '{date}',
        currentScoreDate
          ? new Date(currentScoreDate + 'T00:00:00').toLocaleDateString(dateLocale, {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })
          : '',
      );
  /** Same vocabulary Home uses — referenced, not duplicated, so it cannot drift. */
  const scoreDayLabel =
    currentScore == null
      ? null
      : currentScore >= 70
        ? t.home.dayLabelSettled
        : currentScore >= 40
          ? t.home.dayLabelMixed
          : t.home.dayLabelTougher;

  // ── B. What GutWell is learning ─────────────────────────────────────────
  /**
   * Presentation over thresholds that already exist in code — nothing new is
   * introduced here:
   *   3 scores  — the gate on weekInsights in loadData above.
   *   5 meals   — `mealsWithFoods.length < 5` in lib/correlations.ts.
   * Neither number is changed; this only makes the distance to them visible,
   * so a thin screen reads as progress rather than as emptiness.
   */
  const LEARNING_SCORES_MIN = 3;
  const LEARNING_MEALS_MIN = 5;
  const scoresLogged = allScores.length;
  const learningScoresReady = scoresLogged >= LEARNING_SCORES_MIN;
  const learningMealsReady = foodCount >= LEARNING_MEALS_MIN;

  // ── C. Low-data guards ──────────────────────────────────────────────────
  /**
   * Below three samples an average is fake precision: "Avg Stool 4.0" from a
   * single check-in reads as an established baseline. The CALCULATION is
   * untouched — `avgStoolType` and `avgMood` are still computed exactly as
   * before; they are simply not presented as a figure yet.
   */
  const LOW_DATA_MIN = 3;
  const stoolSampleCount = stoolHistory.length;
  const moodSampleCount = moodHistory.length;
  const showStoolAverage = stoolSampleCount >= LOW_DATA_MIN && avgStoolType != null;
  const showMoodAverage = moodSampleCount >= LOW_DATA_MIN && avgMood != null;
  const showScoreChart = gutScores.length >= 2;
  const showMoodChart = moodSampleCount >= 2;
  const showStoolChart = stoolSampleCount >= 2;

  /** The active period's label, so period-scoped counts say so. */
  const periodLabel = t.progress.windowSuffix.replace('{period}', period);

  // Cal AI "Weight Changes" analog: gut-score change over fixed day windows,
  // derived from the full score history (period-scoped via the toggle above).
  const getWindowScores = (days: number | null): { score: number; date: string }[] => {
    if (days == null) return allScores;
    const windowStart = addDaysToLocalDateKey(getLocalDateKey(), -days);
    return allScores.filter(s => s.date >= windowStart);
  };

  const computeWindowChange = (days: number | null): number | null => {
    if (allScores.length < 2) return null;
    const inWindow = getWindowScores(days);
    if (inWindow.length < 2) return null;
    return inWindow[inWindow.length - 1].score - inWindow[0].score;
  };

  // Tiny sparkline thumbnail for a Changes-table row — mirrors Cal AI's mini
  // trend graphic beside each window. Normalises the window's scores to bar
  // heights; renders nothing when there isn't enough data to draw a shape.
  const renderSparkline = (days: number | null, color: string) => {
    const pts = getWindowScores(days);
    if (pts.length < 2) {
      return <View style={styles.changeSpark} />;
    }
    const sampled = pts.length > 8 ? pts.filter((_, i) => i % Math.ceil(pts.length / 8) === 0) : pts;
    const ys = sampled.map(p => p.score);
    const min = Math.min(...ys);
    const max = Math.max(...ys);
    const range = max - min || 1;
    return (
      <View style={styles.changeSpark}>
        {sampled.map((p, i) => (
          <View
            key={i}
            style={[
              styles.changeSparkBar,
              { height: `${20 + ((p.score - min) / range) * 80}%`, backgroundColor: color },
            ]}
          />
        ))}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <Text style={styles.title}>{t.progress.title}</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={() => {
                track(Events.SHARE_OPENED, { source: 'progress' });
                setShowShare(true);
              }}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={t.progress.accessShare}
            >
              <Ionicons name="share-outline" size={20} color={Colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.digestButton}
              onPress={() => router.push('/weekly-digest')}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={t.progress.accessDigest}
            >
              <Ionicons name="document-text-outline" size={16} color={Colors.primary} />
              <Text style={styles.digestButtonText}>{t.progress.weeklyDigest}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Share Card Modal
            `streak` was `checkInCount` — the number of check-ins in the
            selected period, not a consecutive-day streak. ShareCard labels it
            "day streak" AND substitutes it into the outbound share text, so a
            user on a two-day streak with twenty check-ins published "Day 20
            streak" to other people. `currentStreak` is the value
            getStreakSnapshot already returned into this component.

            `level` was the literal "Tracker" for every user in both
            languages, while the real level sat one line away in `level`. */}
        <ShareCard
          visible={showShare}
          score={weekInsights?.avgScore ?? null}
          streak={currentStreak}
          level={levelDisplayName(level.key)}
          weekTrend={weekInsights?.trend}
          onClose={() => setShowShare(false)}
        />

        {/* Empty state for new users */}
        {!isLoading && checkInCount < 3 && (
          <EmptyState
            icon="leaf-outline"
            title={t.progress.patternsTitle}
            message={t.progress.patternsMessage}
            actionLabel={t.progress.patternsAction}
            onAction={() => router.push('/(tabs)/checkin')}
          />
        )}

        {/* Streak, badges and level moved to the Milestones section at the
            bottom. They used to open the screen, above the score — so the
            first thing Progress said was a flame and a ribbon, not what the
            user's data shows. */}

        {/* ── A. CURRENT SUMMARY ─────────────────────────────────────── */}
        {currentScore != null ? (
          <Card style={styles.statusCard}>
            <View style={styles.statusTopRow}>
              <Text style={styles.statusLabel}>{scoreTitle}</Text>
              {scoreDayLabel ? (
                <View style={styles.statusPill}>
                  <Text style={styles.statusPillText}>{scoreDayLabel}</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.statusValue}>{currentScore}<Text style={styles.statusUnit}> / 100</Text></Text>
            {/* Always attached to the number, and it says WHICH day the score
                is from — the card no longer calls a four-day-old score
                "current". */}
            <Text style={styles.statusProvenance}>{scoreProvenance}</Text>
          </Card>
        ) : (
          <Card style={styles.statusCard}>
            <Text style={styles.statusLabel}>{t.progress.scoreEmptyTitle}</Text>
            <Text style={styles.statusProvenance}>{t.progress.scoreEmptyBody}</Text>
          </Card>
        )}

        {/* ── B. WHAT GUTWELL IS LEARNING ────────────────────────────────
            Presentation over thresholds that already exist. Makes a thin
            screen read as progress toward something rather than as failure. */}
        <Text style={styles.sectionTitle}>{t.progress.learningTitle}</Text>
        <Card style={styles.learningCard}>
          <View style={styles.learningRow}>
            <Ionicons
              name={learningScoresReady ? 'checkmark-circle' : 'ellipse-outline'}
              size={18}
              color={learningScoresReady ? Colors.secondary : Colors.textTertiary}
            />
            <Text style={styles.learningLabel}>{t.progress.learningScoresLabel}</Text>
            <Text style={styles.learningValue}>
              {learningScoresReady
                ? t.progress.learningScoresReady
                : t.progress.learningScoresProgress.replace('{n}', String(scoresLogged))}
            </Text>
          </View>
          <View style={styles.learningRow}>
            <Ionicons
              name={learningMealsReady ? 'checkmark-circle' : 'ellipse-outline'}
              size={18}
              color={learningMealsReady ? Colors.secondary : Colors.textTertiary}
            />
            <Text style={styles.learningLabel}>{t.progress.learningMealsLabel}</Text>
            <Text style={styles.learningValue}>
              {learningMealsReady
                ? t.progress.learningMealsReady
                : t.progress.learningMealsProgress.replace('{n}', String(foodCount))}
            </Text>
          </View>
        </Card>

        {/* Weekly Insights Card */}
        {weekInsights && (
          <TrendBox avgScore={weekInsights.avgScore ?? 0} bestDay={weekInsights.bestDay} trend={weekInsights.trend} />
        )}

        {!isLoading && error ? (
          <ErrorState type="offline" onRetry={() => { setError(null); loadData(); }} />
        ) : isLoading ? (
          <>
            <View style={styles.statsRow}>
              <Card style={styles.statCard}><LoadingSkeleton width={30} height={22} /><LoadingSkeleton width={60} height={10} style={{ marginTop: 4 }} /></Card>
              <Card style={styles.statCard}><LoadingSkeleton width={30} height={22} /><LoadingSkeleton width={60} height={10} style={{ marginTop: 4 }} /></Card>
              <Card style={styles.statCard}><LoadingSkeleton width={30} height={22} /><LoadingSkeleton width={60} height={10} style={{ marginTop: 4 }} /></Card>
            </View>
            <LoadingSkeleton width={140} height={18} style={{ marginBottom: Spacing.sm }} />
            <Card style={styles.chartCard}><LoadingSkeleton height={100} borderRadius={BorderRadius.sm} /></Card>
          </>
        ) : (
        <>
        {/* ── C. TRENDS ─────────────────────────────────────────────────
            Counts are period-scoped, which the labels never said — they sit
            under a period toggle many users will not connect to them. The
            average is withheld below three samples: "Avg Stool 4.0" from a
            single check-in is fake precision, not a baseline. The CALCULATION
            is unchanged; it is simply not shown as a figure yet. */}
        <Text style={styles.sectionTitle}>{t.progress.trendsTitle}</Text>
        <View style={styles.statsRow}>
          <ScoreCard icon="checkmark-circle" iconColor={Colors.primary} value={checkInCount} label={`${t.progress.labelCheckins} · ${periodLabel}`} />
          <ScoreCard icon="nutrition" iconColor={Colors.accent} value={showStoolAverage ? (avgStoolType as number) : '—'} label={showStoolAverage ? t.progress.labelAvgStool : t.progress.lowDataMore} />
          <ScoreCard icon="restaurant" iconColor={Colors.secondary} value={foodCount} label={`${t.progress.labelMeals} · ${periodLabel}`} />
        </View>

        {/* Gut Score Trend — Cal AI's main "Weight Progress" chart card, with
            the time-range toggle (90D / 6M / 1Y / ALL) attached at the bottom
            of the card exactly as Cal AI places it under Weight Progress. */}
        {/* Chart accessibility: the SVG-ish bar views carry no semantics, so
            VoiceOver read nothing at all here. One summary per chart, built
            from values already on screen — no extra data, no per-point
            narration. */}
        {showScoreChart ? (
          <View
            accessible
            accessibilityRole="image"
            accessibilityLabel={t.progress.a11yScoreTrend
              .replace('{n}', String(gutScores.length))
              .replace('{latest}', String(currentScore ?? ''))}
          >
          <ChartComponent title={t.progress.gutScoreTrend}>
            <View style={styles.scoreTrendChart}>
              {gutScores.map((point, i) => (
                <View key={i} style={styles.scoreTrendCol}>
                  <View style={[styles.scoreTrendBar, {
                    height: `${Math.max(point.y, 4)}%`,
                    backgroundColor: getBarColor(point.y),
                    borderRadius: 6,
                  }]} />
                  <Text style={styles.scoreTrendValue}>{point.y}</Text>
                  <Text style={styles.scoreTrendLabel}>{point.label}</Text>
                </View>
              ))}
            </View>
            <SegmentedToggle
              options={PERIOD_OPTIONS}
              value={period}
              onChange={setPeriod}
              style={styles.chartToggle}
            />
          </ChartComponent>
          </View>
        ) : (
          <>
            {/* One recorded point cannot show a trend. The chart is suppressed
                and the section says so, rather than drawing a single bar that
                looks like a line. */}
            {gutScores.length === 1 ? (
              <Text style={styles.lowDataText}>{t.progress.lowDataTrend}</Text>
            ) : null}
            <SegmentedToggle
              options={PERIOD_OPTIONS}
              value={period}
              onChange={setPeriod}
              style={styles.toggle}
            />
          </>
        )}

        {/* Cal AI "Weight Changes" analog: Gut Score change over day windows */}
        {allScores.length >= 2 && (
          <>
            <Text style={styles.sectionTitle}>{t.progress.scoreChanges}</Text>
            <Card style={styles.changesCard}>
              {CHANGE_WINDOWS.map((window, idx) => {
                const change = computeWindowChange(window.days);
                const up = change != null && change > 0;
                const down = change != null && change < 0;
                const color = up ? Colors.secondary : down ? Colors.error : Colors.textTertiary;
                const iconName = up ? 'arrow-up' : down ? 'arrow-down' : 'remove';
                const tag = change == null ? t.progress.changeNoData : up ? t.progress.changeImproved : down ? t.progress.changeDeclined : t.progress.changeNone;
                return (
                  <View
                    key={window.label}
                    style={[styles.changeRow, idx < CHANGE_WINDOWS.length - 1 && styles.changeRowBorder]}
                  >
                    <Text style={styles.changeWindow}>{window.label}</Text>
                    {renderSparkline(window.days, change == null ? Colors.textTertiary : color)}
                    <Text style={[styles.changeValue, { color: change == null ? Colors.textTertiary : color }]}>
                      {change == null ? '--' : `${change > 0 ? '+' : ''}${change} pts`}
                    </Text>
                    <View style={styles.changeTagWrap}>
                      <Ionicons name={iconName} size={14} color={color} />
                      <Text style={[styles.changeTag, { color }]}>{tag}</Text>
                    </View>
                  </View>
                );
              })}
            </Card>
          </>
        )}

        {/* Contribution Calendar */}
        {checkInDates.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>{t.progress.checkinConsistency}</Text>
            <View style={styles.calendarCard}>
              <View
                accessible
                accessibilityRole="image"
                accessibilityLabel={t.progress.a11yCalendar.replace('{n}', String(checkInCount))}
              >
                <ContributionCalendar data={buildHeatmapData()} />
              </View>
            </View>
          </>
        )}

        {/* Mood Trends */}
        <View
          accessible
          accessibilityRole="image"
          accessibilityLabel={t.progress.a11yMoodTrend.replace('{n}', String(moodSampleCount))}
        >
          <ChartComponent title={t.progress.moodTrends}>
            {moodHistory.length === 0 ? (
              <View style={styles.moodEmpty}>
                <Text style={styles.moodEmptyEmoji}>🙂</Text>
                <Text style={styles.moodEmptyText}>{t.progress.moodEmpty}</Text>
              </View>
            ) : !showMoodChart ? (
              /* One mood entry is not a trend. The average is withheld rather
                 than presented as an established figure — avgMood is still
                 computed exactly as before, just not shown yet. */
              <Text style={styles.lowDataText}>{t.progress.lowDataTrend}</Text>
            ) : (
              <>
                {showMoodAverage && avgMood !== null && (() => {
                  const avgRounded = Math.round(avgMood);
                  const clampedAvg = Math.min(5, Math.max(1, avgRounded)) as 1 | 2 | 3 | 4 | 5;
                  const MOOD_COLORS: Record<1 | 2 | 3 | 4 | 5, string> = { 1: '#C1444B', 2: '#E07A5F', 3: '#D4A373', 4: '#52B788', 5: '#2D6A4F' };
                  const MOOD_EMOJIS: Record<1 | 2 | 3 | 4 | 5, string> = { 1: '😣', 2: '😕', 3: '😐', 4: '🙂', 5: '😊' };
                  // Was a hardcoded English record; German users read "Okay",
                  // "Great" inside an otherwise translated card.
                  const MOOD_LABELS = t.progress.moodLabels as Record<string, string>;
                  return (
                    <View style={styles.moodAvgRow}>
                      <View style={[styles.moodAvgCircle, { backgroundColor: MOOD_COLORS[clampedAvg] + '20', borderColor: MOOD_COLORS[clampedAvg] + '50', borderWidth: 2 }]}>
                        <Text style={styles.moodAvgEmoji}>{MOOD_EMOJIS[clampedAvg]}</Text>
                      </View>
                      <View style={styles.moodAvgInfo}>
                        <Text style={[styles.moodAvgValue, { color: MOOD_COLORS[clampedAvg] }]}>{avgMood.toFixed(1)} / 5</Text>
                        <Text style={styles.moodAvgLabel}>{MOOD_LABELS[String(clampedAvg)]}</Text>
                        <Text style={styles.moodAvgSub}>{t.progress.avgMoodPeriod}</Text>
                      </View>
                    </View>
                  );
                })()}
                <View style={styles.moodDotsRow}>
                  {moodHistory.slice(-14).reverse().map((entry, i) => {
                    const moodKey = Math.min(5, Math.max(1, entry.mood)) as 1 | 2 | 3 | 4 | 5;
                    const MOOD_COLORS: Record<1 | 2 | 3 | 4 | 5, string> = { 1: '#C1444B', 2: '#E07A5F', 3: '#D4A373', 4: '#52B788', 5: '#2D6A4F' };
                    const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
                    const dayLetter = DAY_LETTERS[new Date(entry.date + 'T00:00:00').getDay()];
                    return (
                      <View key={i} style={styles.moodDotWrap}>
                        <View style={[styles.moodDot, { backgroundColor: MOOD_COLORS[moodKey] }]} />
                        <Text style={styles.moodDotLabel}>{dayLetter}</Text>
                      </View>
                    );
                  })}
                </View>
              </>
            )}
          </ChartComponent>
        </View>

        {/* Stool Type Trend — suppressed at a single sample, where the chart
            is one bar and communicates nothing. */}
        {showStoolChart && (
          <>
            <View
              accessible
              accessibilityRole="image"
              accessibilityLabel={t.progress.a11yStoolTrend.replace('{n}', String(stoolSampleCount))}
            >
            <ChartComponent title={t.progress.stoolTypeTrend}>
              <View style={styles.stoolChart}>
                {stoolHistory.slice(-14).map((entry, i) => (
                  <View key={i} style={styles.stoolCol}>
                    <View style={[styles.stoolBar, {
                      height: `${(entry.type / 7) * 100}%`,
                      backgroundColor: Colors.bristol[entry.type],
                      borderRadius: 4,
                    }]} />
                    <Text style={styles.stoolBarLabel}>{new Date(entry.date).getDate()}</Text>
                  </View>
                ))}
              </View>
              <View style={styles.chartLegend}>
                <Text style={styles.legendText}>{t.progress.idealStool}</Text>
              </View>
            </ChartComponent>
            </View>
          </>
        )}

        {/* Top Symptoms */}
        <History
          title={t.progress.topSymptoms}
          items={topSymptoms.map(([symptom, count]) => ({
            label: symptom.charAt(0).toUpperCase() + symptom.slice(1).replace('_', ' '),
            count,
            maxCount: Math.max(1, ...Object.values(symptomCounts)),
          }))}
        />

        {/* Food-symptom insights. Free users get a TEASER — their single
            strongest trigger food — so they can see a real, personalized insight
            before paying; the full set (all triggers + safe foods) is premium. */}
        {!hasPremium ? (
          (() => {
            const topTrigger = triggerFoods.length
              ? [...triggerFoods].sort(
                  (a, b) => (b.correlationPct ?? 0) - (a.correlationPct ?? 0),
                )[0]
              : null;
            return topTrigger ? (
              <>
                <TriggerFoodsBox triggerFoods={[topTrigger]} />
                <RecommendationBox
                  text={t.progress.premiumTriggerTeaser}
                  onPress={() => router.push({ pathname: '/paywall', params: { source: 'progress' } })}
                />
              </>
            ) : (
              <RecommendationBox
                text={t.progress.premiumFoodInsights}
                onPress={() => router.push({ pathname: '/paywall', params: { source: 'progress' } })}
              />
            );
          })()
        ) : (
          <>
            {/* Trigger Foods — new engine */}
            <TriggerFoodsBox triggerFoods={triggerFoods} />

            {/* Safe Foods — new engine */}
            <SafeFoodsBox safeFoods={safeFoods} />

            {safeFoods.length === 0 && triggerFoods.length === 0 && !correlations && (
              <View style={styles.insufficientCard}>
                <Ionicons name="leaf-outline" size={24} color={Colors.textTertiary} />
                <Text style={styles.insufficientText}>{t.progress.safeFoodsInsufficient}</Text>
              </View>
            )}
          </>
        )}

        {/* ── E. MILESTONES ──────────────────────────────────────────────
            The Gut Health Index card used to sit here. It rendered
            `currentScore` — the same number already shown at the top of the
            screen — inside red/amber/green bands with "Needs care / Building /
            Thriving" labels and hardcoded English legends, modelled on BMI.
            It was a duplicate metric wearing the most clinically authoritative
            framing in the app, so it is gone. Its one non-duplicate value,
            best streak, moved into Milestones below. Score logic is
            untouched. */}
        <Text style={styles.sectionTitle}>{t.progress.milestonesTitle}</Text>
        <View style={styles.headerStatsRow}>
          <StatCard
            icon={<Ionicons name="flame" size={22} color={Colors.accent} />}
            value={String(currentStreak)}
            label={t.progress.labelStreak}
            accentColor={Colors.accent}
            style={styles.headerStatCard}
          />
          <StatCard
            icon={<Ionicons name="ribbon" size={22} color={Colors.secondary} />}
            value={String(badgesEarned)}
            label={t.progress.labelBadges}
            accentColor={Colors.secondary}
            progress={badgesEarned / 4}
            onPress={() => router.push('/(tabs)/profile')}
            style={styles.headerStatCard}
          />
        </View>
        <Card style={styles.milestoneCard}>
          <View style={styles.milestoneRow}>
            <Text style={styles.statusMeta}>
              {t.progress.levelLabel}{' '}
              <Text style={styles.statusMetaStrong}>{levelDisplayName(level.key)}</Text>
            </Text>
            <Text style={styles.statusMeta}>
              {nextLevel
                ? t.progress.nextLevelLabel.replace('{name}', levelDisplayName(nextLevel.key))
                : t.progress.maxLevel}
            </Text>
          </View>
          <View style={styles.statusBarTrack}>
            <View style={[styles.statusBarFill, { width: `${Math.round(levelProgress * 100)}%` }]} />
          </View>
          {bestStreak > 0 ? (
            <Text style={styles.milestoneMeta}>
              {t.progress.bestStreakLabel}: {t.progress.bestStreakValue.replace('{n}', String(bestStreak))}
            </Text>
          ) : null}
        </Card>

        {checkInCount === 0 && foodCount === 0 && topSymptoms.length === 0 && (
          <EmptyState
            icon="leaf-outline"
            title={t.progress.noDataYet}
            message={t.progress.noDataMessage}
          />
        )}
        </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * Chart x-axis label.
 *
 * The month name was a hardcoded English array, so every chart on this screen
 * showed English months regardless of app language. Intl handles it and gives
 * each locale its own conventional order and abbreviation.
 */
function formatShortDate(dateStr: string, locale: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
}

const styles = StyleSheet.create({
  // ── A. Current summary ───────────────────────────────────
  // Always rendered beneath the number. The score is a summary of one
  // check-in, and saying so — including WHICH day's check-in — is what stops
  // it reading as a measurement.
  statusProvenance: {
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.sm,
    color: Colors.textTertiary,
    marginTop: 6,
  },

  // ── B. What GutWell is learning ──────────────────────────
  learningCard: {
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  learningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  // flexShrink so the longer German labels wrap instead of squeezing the value.
  learningLabel: {
    flex: 1,
    flexShrink: 1,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.sm,
    color: Colors.text,
  },
  learningValue: {
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    flexShrink: 1,
    textAlign: 'right',
  },

  // ── C. Low-data states ───────────────────────────────────
  lowDataText: {
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.sm,
    color: Colors.textTertiary,
    paddingVertical: Spacing.md,
    textAlign: 'center',
  },

  // ── E. Milestones ────────────────────────────────────────
  milestoneCard: {
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  milestoneRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  milestoneMeta: {
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.sm,
    color: Colors.textTertiary,
  },

  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scroll: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl + 20,
  },

  // Header
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary + '10',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.primary + '20',
  },
  title: {
    fontFamily: FontFamily.displayMedium,
    fontSize: FontSize.xxl,
    color: Colors.text,
    letterSpacing: -0.3,
  },
  digestButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.primary + '10',
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.primary + '20',
  },
  digestButtonText: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.xs,
    color: Colors.primary,
  },

  // Cal AI header stat cards
  headerStatsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  headerStatCard: {
    flex: 1,
  },

  // Cal AI "Current Weight" status card
  statusCard: {
    marginBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  statusTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusLabel: {
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  statusPill: {
    backgroundColor: Colors.primary + '22',
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: 4,
  },
  statusPillText: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.xs,
    color: Colors.secondary,
  },
  statusValue: {
    fontFamily: FontFamily.displaySemiBold,
    fontSize: FontSize.hero,
    color: Colors.text,
  },
  statusUnit: {
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.md,
    color: Colors.textTertiary,
  },
  statusBarTrack: {
    height: 8,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.ringTrack,
    overflow: 'hidden',
  },
  statusBarFill: {
    height: '100%',
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.ringFill,
  },
  statusBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statusMeta: {
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.xs,
    color: Colors.textTertiary,
  },
  statusMetaStrong: {
    fontFamily: FontFamily.sansSemiBold,
    color: Colors.text,
  },

  // Time-range toggle
  toggle: {
    marginBottom: Spacing.lg,
  },
  // Toggle attached to the bottom of the trend chart card (Cal AI placement)
  chartToggle: {
    marginTop: Spacing.md,
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.sm,
  },
  // Section
  sectionTitle: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.lg,
    color: Colors.text,
    marginBottom: Spacing.sm,
    marginTop: Spacing.xs,
  },

  // Changes table card (Cal AI "Weight Changes")
  changesCard: {
    marginBottom: Spacing.lg,
    paddingVertical: Spacing.xs,
  },
  changeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm + 2,
  },
  changeRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  changeWindow: {
    width: 56,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  // Mini sparkline thumbnail beside each change row (Cal AI mini-graphic)
  changeSpark: {
    width: 44,
    height: 24,
    marginRight: Spacing.md,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 1,
  },
  changeSparkBar: {
    flex: 1,
    minHeight: 2,
    borderRadius: 1,
    opacity: 0.85,
  },
  changeValue: {
    flex: 1,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.md,
    textAlign: 'left',
  },
  changeTagWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minWidth: 96,
    justifyContent: 'flex-end',
  },
  changeTag: {
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.xs,
  },

  // Charts
  chartCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.sm,
  },
  calendarCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.sm,
  },
  scoreTrendChart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 150,
    gap: 3,
  },
  scoreTrendCol: {
    flex: 1,
    alignItems: 'center',
    height: '100%',
    justifyContent: 'flex-end',
  },
  scoreTrendBar: {
    width: '65%',
    minHeight: 4,
  },
  scoreTrendValue: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: 10,
    color: Colors.text,
    marginTop: 3,
  },
  scoreTrendLabel: {
    fontFamily: FontFamily.sansRegular,
    fontSize: 9,
    color: Colors.textTertiary,
    marginTop: 1,
  },
  stoolChart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 100,
    gap: 2,
  },
  stoolCol: {
    flex: 1,
    alignItems: 'center',
    height: '100%',
    justifyContent: 'flex-end',
  },
  stoolBar: {
    width: '75%',
    minHeight: 4,
  },
  stoolBarLabel: {
    fontFamily: FontFamily.sansRegular,
    fontSize: 10,
    color: Colors.textTertiary,
    marginTop: 4,
  },
  chartLegend: {
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  legendText: {
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.xs,
    color: Colors.secondary,
  },

  // The Gut Health Index styles were removed with the card. It rendered the
  // same number as the summary at the top of the screen inside BMI-style
  // bands — a duplicate metric in the most clinically authoritative framing
  // in the app.

  // Empty / Insufficient
  insufficientCard: {
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  insufficientText: {
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.sm,
    color: Colors.textTertiary,
    textAlign: 'center',
  },

  // Mood Trends
  moodEmpty: {
    alignItems: 'center',
    paddingVertical: Spacing.lg,
    gap: Spacing.sm,
  },
  moodEmptyEmoji: {
    fontSize: 32,
  },
  moodEmptyText: {
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.sm,
    color: Colors.textTertiary,
    textAlign: 'center',
  },
  moodAvgRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  moodAvgCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  moodAvgEmoji: {
    fontSize: 28,
  },
  moodAvgInfo: {
    flex: 1,
    gap: 2,
  },
  moodAvgValue: {
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xl,
    lineHeight: 26,
  },
  moodAvgLabel: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
    color: Colors.text,
  },
  moodAvgSub: {
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.xs,
    color: Colors.textTertiary,
  },
  moodDotsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  moodDotWrap: {
    alignItems: 'center',
    gap: 4,
  },
  moodDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  moodDotLabel: {
    fontFamily: FontFamily.sansRegular,
    fontSize: 10,
    color: Colors.textTertiary,
  },

});
