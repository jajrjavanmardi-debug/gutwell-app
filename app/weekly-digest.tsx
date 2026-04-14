import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { LoadingSkeleton } from '../components/ui/LoadingSkeleton';
import { ShareCard, ShareCardProps } from '../components/ShareCard';
import { calculateLevel } from '../lib/levels';
import { EmptyState } from '../components/ui/EmptyState';
import { Colors, Spacing, FontSize, BorderRadius, Shadows, FontFamily } from '../constants/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

type DigestData = {
  avgScore: number | null;
  prevAvgScore: number | null;
  scoreDiff: number | null;
  bestDay: { date: string; score: number } | null;
  worstDay: { date: string; score: number } | null;
  checkInCount: number;
  mealsLogged: number;
  topSymptoms: { name: string; count: number; severity?: number }[];
  streak: number;
  weekDays: boolean[]; // Mon–Sun, true if check-in logged
  scoreByDay: (number | null)[]; // Mon–Sun scores
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getMonday(): Date {
  const now = new Date();
  const day = now.getDay(); // 0=Sun … 6=Sat
  const diff = day === 0 ? -6 : 1 - day; // offset to Monday
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function formatDayDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}`;
}

function mean(arr: number[]): number {
  if (!arr.length) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

const DOW_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

// ─── Component ────────────────────────────────────────────────────────────────

export default function WeeklyDigestScreen() {
  const { user } = useAuth();
  const [data, setData] = useState<DigestData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showShareCard, setShowShareCard] = useState(false);

  const loadDigest = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    try {

    const weekStart = getMonday();
    const weekStartISO = weekStart.toISOString();
    const weekStartDate = weekStartISO.split('T')[0];

    const prevWeekStart = new Date(weekStart.getTime() - 7 * 86400000);
    const prevWeekStartDate = prevWeekStart.toISOString().split('T')[0];

    const [scoresRes, checkInsRes, symptomsRes, foodsRes, prevScoresRes, checkInDatesRes] = await Promise.all([
      // This week gut_scores
      supabase
        .from('gut_scores')
        .select('score, date')
        .eq('user_id', user.id)
        .gte('date', weekStartDate)
        .order('date', { ascending: true }),

      // This week check-ins
      supabase
        .from('check_ins')
        .select('entry_date, stool_type')
        .eq('user_id', user.id)
        .gte('entry_date', weekStartDate),

      // This week symptoms
      supabase
        .from('symptoms')
        .select('symptom_type, severity, logged_at')
        .eq('user_id', user.id)
        .gte('logged_at', weekStartISO),

      // This week food logs
      supabase
        .from('food_logs')
        .select('meal_name')
        .eq('user_id', user.id)
        .gte('logged_at', weekStartISO),

      // Previous week gut_scores for comparison
      supabase
        .from('gut_scores')
        .select('score')
        .eq('user_id', user.id)
        .gte('date', prevWeekStartDate)
        .lt('date', weekStartDate),

      // Last 30 check-ins for streak
      supabase
        .from('check_ins')
        .select('entry_date')
        .eq('user_id', user.id)
        .order('entry_date', { ascending: false })
        .limit(30),
    ]);
    if (scoresRes.error) throw scoresRes.error;
    if (checkInsRes.error) throw checkInsRes.error;
    if (symptomsRes.error) throw symptomsRes.error;
    if (foodsRes.error) throw foodsRes.error;
    if (prevScoresRes.error) throw prevScoresRes.error;
    if (checkInDatesRes.error) throw checkInDatesRes.error;

    const scores = scoresRes.data ?? [];
    const checkIns = checkInsRes.data ?? [];
    const symptoms = symptomsRes.data ?? [];
    const foods = foodsRes.data ?? [];
    const prevScores = prevScoresRes.data ?? [];
    const checkInDates = checkInDatesRes.data ?? [];

    // Avg scores
    const scoreValues = scores.map(s => s.score);
    const prevScoreValues = prevScores.map(s => s.score);
    const avgScore = scoreValues.length > 0 ? Math.round(mean(scoreValues)) : null;
    const prevAvgScore = prevScoreValues.length > 0 ? Math.round(mean(prevScoreValues)) : null;
    const scoreDiff = avgScore != null && prevAvgScore != null ? avgScore - prevAvgScore : null;

    // Best / worst day
    let bestDay: DigestData['bestDay'] = null;
    let worstDay: DigestData['worstDay'] = null;
    if (scores.length > 0) {
      const sorted = [...scores].sort((a, b) => b.score - a.score);
      bestDay = { date: sorted[0].date, score: sorted[0].score };
      worstDay = { date: sorted[sorted.length - 1].date, score: sorted[sorted.length - 1].score };
      if (scores.length === 1) worstDay = null; // only 1 point — no contrast
    }

    // Top symptoms
    const symptomMap: Record<string, { count: number; totalSeverity: number }> = {};
    symptoms.forEach(s => {
      const key = s.symptom_type || 'symptom';
      if (!symptomMap[key]) symptomMap[key] = { count: 0, totalSeverity: 0 };
      symptomMap[key].count++;
      symptomMap[key].totalSeverity += s.severity ?? 0;
    });
    const topSymptoms = Object.entries(symptomMap)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 3)
      .map(([name, { count, totalSeverity }]) => ({
        name,
        count,
        severity: count > 0 ? Math.round(totalSeverity / count) : 0,
      }));

    // Streak
    let streak = 0;
    const today = new Date();
    for (let i = 0; i < checkInDates.length; i++) {
      const expected = new Date(today);
      expected.setDate(today.getDate() - i);
      if (checkInDates[i].entry_date === expected.toISOString().split('T')[0]) {
        streak++;
      } else break;
    }

    // Week days (Mon=0 … Sun=6) — did user check in?
    const checkInDateSet = new Set(checkIns.map(c => c.entry_date));
    const weekDays: boolean[] = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      return checkInDateSet.has(d.toISOString().split('T')[0]);
    });

    // Score per day of week
    const scoreMap: Record<string, number> = {};
    scores.forEach(s => { scoreMap[s.date] = s.score; });
    const scoreByDay: (number | null)[] = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      const key = d.toISOString().split('T')[0];
      return scoreMap[key] ?? null;
    });

    setData({
      avgScore,
      prevAvgScore,
      scoreDiff,
      bestDay,
      worstDay,
      checkInCount: checkIns.length,
      mealsLogged: foods.length,
      topSymptoms,
      streak,
      weekDays,
      scoreByDay,
    });
    } catch {
      setData(null);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => { loadDigest(); }, [loadDigest]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadDigest();
    setRefreshing(false);
  };

  const getScoreColor = (score: number | null) => {
    if (score == null) return Colors.textTertiary;
    if (score >= 70) return Colors.secondary;
    if (score >= 40) return Colors.accent;
    return '#E07070';
  };

  const getMotivation = () => {
    if (!data) return '';
    if (data.avgScore && data.avgScore >= 75) return 'Outstanding week — your gut is thriving.';
    if (data.avgScore && data.avgScore >= 50) return 'Solid progress. Keep building on these habits.';
    if (data.checkInCount >= 5) return 'Great consistency. Patterns become clearer each week.';
    return 'Every check-in counts. This week is a fresh start.';
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Weekly Digest</Text>
        <TouchableOpacity
          style={styles.closeBtn}
          onPress={() => setShowShareCard(true)}
          disabled={!data}
        >
          <Ionicons name="share-outline" size={20} color={data ? Colors.text : Colors.textTertiary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.secondary} />
        }
      >
        {isLoading ? (
          <>
            <LoadingSkeleton height={200} borderRadius={BorderRadius.xl} style={{ marginBottom: Spacing.md }} />
            <LoadingSkeleton height={80} borderRadius={BorderRadius.lg} style={{ marginBottom: Spacing.md }} />
            <LoadingSkeleton height={120} borderRadius={BorderRadius.lg} />
          </>
        ) : data ? (
          <>
            {/* Hero Card */}
            <LinearGradient
              colors={['#1B4332', '#0D2B1E']}
              start={{ x: 0, y: 0 }}
              end={{ x: 0.4, y: 1 }}
              style={styles.heroCard}
            >
              <Text style={styles.heroLabel}>This Week's Average</Text>
              <View style={styles.heroScoreRow}>
                <Text style={[styles.heroScore, { color: getScoreColor(data.avgScore) }]}>
                  {data.avgScore != null ? data.avgScore : '--'}
                </Text>
                {data.scoreDiff != null && (
                  <View style={[
                    styles.trendBadge,
                    { backgroundColor: data.scoreDiff > 0 ? Colors.secondary + '25' : data.scoreDiff < 0 ? '#E07070' + '25' : 'rgba(255,255,255,0.1)' },
                  ]}>
                    <Ionicons
                      name={data.scoreDiff > 0 ? 'trending-up' : data.scoreDiff < 0 ? 'trending-down' : 'remove'}
                      size={14}
                      color={data.scoreDiff > 0 ? Colors.secondary : data.scoreDiff < 0 ? '#E07070' : 'rgba(255,255,255,0.5)'}
                    />
                    <Text style={[
                      styles.trendText,
                      { color: data.scoreDiff > 0 ? Colors.secondary : data.scoreDiff < 0 ? '#E07070' : 'rgba(255,255,255,0.5)' },
                    ]}>
                      {data.scoreDiff > 0 ? '+' : ''}{data.scoreDiff} vs last week
                    </Text>
                  </View>
                )}
              </View>
              <Text style={styles.heroSubtext}>out of 100</Text>
              <Text style={styles.motivation}>{getMotivation()}</Text>
            </LinearGradient>

            {/* Stats Row */}
            <Text style={styles.sectionTitle}>AT A GLANCE</Text>
            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Ionicons name="checkmark-circle-outline" size={22} color={Colors.secondary} />
                <Text style={styles.statValue}>{data.checkInCount}<Text style={styles.statDenom}>/7</Text></Text>
                <Text style={styles.statLabel}>Check-ins</Text>
              </View>
              <View style={styles.statCard}>
                <Ionicons name="restaurant-outline" size={22} color={Colors.accent} />
                <Text style={styles.statValue}>{data.mealsLogged}</Text>
                <Text style={styles.statLabel}>Meals logged</Text>
              </View>
              <View style={styles.statCard}>
                <Ionicons name="pulse-outline" size={22} color='#E07070' />
                <Text style={styles.statValue}>{data.topSymptoms.reduce((s, t) => s + t.count, 0)}</Text>
                <Text style={styles.statLabel}>Symptoms</Text>
              </View>
            </View>

            {/* Best / Worst Day */}
            {(data.bestDay || data.worstDay) && (
              <>
                <Text style={styles.sectionTitle}>HIGHLIGHTS</Text>
                <View style={styles.dayRow}>
                  {data.bestDay && (
                    <View style={styles.dayCard}>
                      <View style={[styles.dayIcon, { backgroundColor: Colors.secondary + '18' }]}>
                        <Ionicons name="sunny-outline" size={18} color={Colors.secondary} />
                      </View>
                      <Text style={styles.dayLabel}>Best Day</Text>
                      <Text style={styles.dayDate}>{formatDayDate(data.bestDay.date)}</Text>
                      <Text style={[styles.dayScore, { color: Colors.secondary }]}>{data.bestDay.score}</Text>
                    </View>
                  )}
                  {data.worstDay && (
                    <View style={styles.dayCard}>
                      <View style={[styles.dayIcon, { backgroundColor: Colors.accent + '18' }]}>
                        <Ionicons name="cloudy-outline" size={18} color={Colors.accent} />
                      </View>
                      <Text style={styles.dayLabel}>Toughest Day</Text>
                      <Text style={styles.dayDate}>{formatDayDate(data.worstDay.date)}</Text>
                      <Text style={[styles.dayScore, { color: Colors.accent }]}>{data.worstDay.score}</Text>
                    </View>
                  )}
                </View>
              </>
            )}

            {/* Top Symptoms */}
            {data.topSymptoms.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>TOP SYMPTOMS THIS WEEK</Text>
                <View style={styles.symptomCard}>
                  {data.topSymptoms.map((s, i) => (
                    <View key={i} style={[styles.symptomRow, i < data.topSymptoms.length - 1 && styles.symptomRowBorder]}>
                      <View style={[styles.symptomDot, { backgroundColor: Colors.severity[Math.min(5, Math.max(1, s.severity || 1))] }]} />
                      <Text style={styles.symptomName}>
                        {s.name.charAt(0).toUpperCase() + s.name.slice(1).replace(/_/g, ' ')}
                      </Text>
                      <View style={styles.symptomRight}>
                        <View style={styles.symptomBarTrack}>
                          <View style={[styles.symptomBarFill, {
                            width: `${Math.min(100, (s.count / Math.max(...data.topSymptoms.map(x => x.count))) * 100)}%` as any,
                            backgroundColor: Colors.severity[Math.min(5, Math.max(1, s.severity || 1))],
                          }]} />
                        </View>
                        <Text style={styles.symptomCount}>{s.count}x</Text>
                      </View>
                    </View>
                  ))}
                </View>
              </>
            )}

            {/* Week Trend — day-by-day dots */}
            <Text style={styles.sectionTitle}>WEEK TREND</Text>
            <View style={styles.weekTrendCard}>
              <View style={styles.weekRow}>
                {DOW_LABELS.map((label, i) => {
                  const checked = data.weekDays[i];
                  const score = data.scoreByDay[i];
                  const isToday = (() => {
                    const today = new Date();
                    const day = today.getDay();
                    const todayIdx = day === 0 ? 6 : day - 1;
                    return i === todayIdx;
                  })();
                  return (
                    <View key={i} style={styles.weekDayCol}>
                      <View style={[
                        styles.weekDotOuter,
                        checked && { backgroundColor: Colors.secondary, borderColor: Colors.secondary },
                        isToday && !checked && { borderColor: Colors.secondary },
                      ]}>
                        {checked ? (
                          <Ionicons name="checkmark" size={12} color="#fff" />
                        ) : (
                          <View style={[styles.weekDotInner, isToday && { backgroundColor: Colors.secondary }]} />
                        )}
                      </View>
                      {score != null && (
                        <Text style={[styles.weekDayScore, { color: getScoreColor(score) }]}>{score}</Text>
                      )}
                      <Text style={[styles.weekDayLabel, isToday && { color: Colors.secondary }]}>{label}</Text>
                    </View>
                  );
                })}
              </View>
            </View>

            {/* No Data State */}
            {data.checkInCount === 0 && data.mealsLogged === 0 && (
              <EmptyState
                icon="calendar-outline"
                title="Check back after your first full week of tracking"
                message="Start checking in daily to see your weekly digest here."
              />
            )}
          </>
        ) : null}
      </ScrollView>

      {/* Share Card Modal */}
      <ShareCard
        visible={showShareCard}
        score={data?.avgScore ?? null}
        streak={data?.streak ?? 0}
        level={calculateLevel(0).name}
        weekTrend={
          data?.scoreDiff != null
            ? data.scoreDiff > 0 ? 'up' : data.scoreDiff < 0 ? 'down' : 'flat'
            : undefined
        }
        onClose={() => setShowShareCard(false)}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surfaceSecondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontFamily: FontFamily.displayMedium,
    fontSize: FontSize.lg,
    color: Colors.text,
  },

  scroll: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },

  // ── Hero Card ──
  heroCard: {
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    ...Shadows.md,
  },
  heroLabel: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.xs,
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: Spacing.sm,
  },
  heroScoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  heroScore: {
    fontFamily: FontFamily.displayBold,
    fontSize: 56,
    lineHeight: 64,
    includeFontPadding: false,
  },
  heroSubtext: {
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.sm,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 2,
  },
  trendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
  },
  trendText: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.xs,
  },
  motivation: {
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.sm,
    color: 'rgba(255,255,255,0.6)',
    marginTop: Spacing.md,
    lineHeight: 20,
  },

  // ── Section Title ──
  sectionTitle: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: 11,
    color: Colors.textTertiary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: Spacing.sm,
    marginTop: Spacing.xs,
  },

  // ── Stats Row ──
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
    gap: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.sm,
  },
  statValue: {
    fontFamily: FontFamily.displayBold,
    fontSize: FontSize.xl,
    color: Colors.text,
  },
  statDenom: {
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.sm,
    color: Colors.textTertiary,
  },
  statLabel: {
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.xs,
    color: Colors.textTertiary,
    textAlign: 'center',
  },

  // ── Best/Worst Day ──
  dayRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  dayCard: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.sm,
  },
  dayIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  dayLabel: {
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.xs,
    color: Colors.textTertiary,
  },
  dayDate: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
    color: Colors.text,
    marginTop: 2,
    textAlign: 'center',
  },
  dayScore: {
    fontFamily: FontFamily.displayBold,
    fontSize: FontSize.xl,
    marginTop: 2,
  },

  // ── Symptoms ──
  symptomCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.sm,
  },
  symptomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  symptomRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  symptomDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  symptomName: {
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.md,
    color: Colors.text,
    flex: 1,
  },
  symptomRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  symptomBarTrack: {
    width: 60,
    height: 5,
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: 3,
    overflow: 'hidden',
  },
  symptomBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  symptomCount: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    minWidth: 24,
    textAlign: 'right',
  },

  // ── Week Trend ──
  weekTrendCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.sm,
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  weekDayCol: {
    alignItems: 'center',
    gap: 4,
  },
  weekDotOuter: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Colors.surfaceSecondary,
    borderWidth: 1.5,
    borderColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  weekDotInner: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.textTertiary,
  },
  weekDayScore: {
    fontFamily: FontFamily.sansBold,
    fontSize: 10,
  },
  weekDayLabel: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: 10,
    color: Colors.textTertiary,
  },

});
