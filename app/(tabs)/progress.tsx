import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
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
import { addDaysToLocalDateKey, getLocalDateKey } from '../../lib/date';

type Period = 'W' | 'M' | '6M';

export default function ProgressScreen() {
  const { user } = useAuth();
  const [period, setPeriod] = useState<Period>('W');
  const [checkInCount, setCheckInCount] = useState(0);
  const [avgStoolType, setAvgStoolType] = useState<number | null>(null);
  const [symptomCounts, setSymptomCounts] = useState<Record<string, number>>({});
  const [foodCount, setFoodCount] = useState(0);
  const [stoolHistory, setStoolHistory] = useState<{ date: string; type: number }[]>([]);
  const [gutScores, setGutScores] = useState<{ x: number; y: number; label: string }[]>([]);
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

  const loadData = useCallback(async () => {
    if (!user) return;
    try {
    const daysBack = period === 'W' ? 7 : period === 'M' ? 30 : 180;
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
      if (period === '6M') {
        // Group by ISO week and show weekly averages
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
            label: formatShortDate(v.firstDate),
          }));
        setGutScores(weeklyScores);
      } else {
        setGutScores(scores.map((s, i) => ({
          x: i,
          y: s.score,
          label: formatShortDate(s.date),
        })));
      }
    } else {
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
        const dayLabel = new Date(bestDay.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
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
  }, [user, period]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
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
  }, []);

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

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <Text style={styles.title}>Progress</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={() => setShowShare(true)}
              activeOpacity={0.7}
            >
              <Ionicons name="share-outline" size={20} color={Colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.digestButton}
              onPress={() => router.push('/weekly-digest')}
              activeOpacity={0.7}
            >
              <Ionicons name="document-text-outline" size={16} color={Colors.primary} />
              <Text style={styles.digestButtonText}>Weekly Digest</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Share Card Modal */}
        <ShareCard
          visible={showShare}
          score={weekInsights?.avgScore ?? null}
          streak={checkInCount}
          level="Tracker"
          weekTrend={weekInsights?.trend}
          onClose={() => setShowShare(false)}
        />

        {/* Empty state for new users */}
        {!isLoading && checkInCount < 3 && (
          <EmptyState
            icon="leaf-outline"
            title="Patterns take shape with data"
            message="Keep checking in — trends and correlations appear after about 7 days of daily logging."
            actionLabel="Log Today's Check-in"
            onAction={() => router.push('/(tabs)/checkin')}
          />
        )}

        {/* Period Selector */}
        <View style={styles.periodContainer}>
          {(['W', 'M', '6M'] as Period[]).map(p => (
            <TouchableOpacity
              key={p}
              style={[styles.periodBtn, period === p && styles.periodSelected]}
              onPress={() => {
                setPeriod(p);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
              activeOpacity={0.7}
            >
              <Text style={[styles.periodText, period === p && styles.periodTextSelected]}>
                {p}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

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
        {/* Stats Cards */}
        <View style={styles.statsRow}>
          <ScoreCard icon="checkmark-circle" iconColor={Colors.primary} value={checkInCount} label="Check-ins" />
          <ScoreCard icon="nutrition" iconColor={Colors.accent} value={avgStoolType ?? '--'} label="Avg Stool" />
          <ScoreCard icon="restaurant" iconColor={Colors.secondary} value={foodCount} label="Meals" />
        </View>

        {/* Gut Score Trend */}
        {gutScores.length >= 2 && (
          <>
            <ChartComponent title="Gut Score Trend">
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
            </ChartComponent>
          </>
        )}

        {/* Contribution Calendar */}
        {checkInDates.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Check-in Consistency</Text>
            <View style={styles.calendarCard}>
              <ContributionCalendar data={buildHeatmapData()} />
            </View>
          </>
        )}

        {/* Mood Trends */}
        <>
          <ChartComponent title="Mood Trends">
            {moodHistory.length === 0 ? (
              <View style={styles.moodEmpty}>
                <Text style={styles.moodEmptyEmoji}>🙂</Text>
                <Text style={styles.moodEmptyText}>Log your mood during check-ins to see trends</Text>
              </View>
            ) : (
              <>
                {avgMood !== null && (() => {
                  const avgRounded = Math.round(avgMood);
                  const clampedAvg = Math.min(5, Math.max(1, avgRounded)) as 1 | 2 | 3 | 4 | 5;
                  const MOOD_COLORS: Record<1 | 2 | 3 | 4 | 5, string> = { 1: '#C1444B', 2: '#E07A5F', 3: '#D4A373', 4: '#52B788', 5: '#2D6A4F' };
                  const MOOD_EMOJIS: Record<1 | 2 | 3 | 4 | 5, string> = { 1: '😣', 2: '😕', 3: '😐', 4: '🙂', 5: '😊' };
                  const MOOD_LABELS: Record<1 | 2 | 3 | 4 | 5, string> = { 1: 'Bad', 2: 'Low', 3: 'Okay', 4: 'Good', 5: 'Great' };
                  return (
                    <View style={styles.moodAvgRow}>
                      <View style={[styles.moodAvgCircle, { backgroundColor: MOOD_COLORS[clampedAvg] + '20', borderColor: MOOD_COLORS[clampedAvg] + '50', borderWidth: 2 }]}>
                        <Text style={styles.moodAvgEmoji}>{MOOD_EMOJIS[clampedAvg]}</Text>
                      </View>
                      <View style={styles.moodAvgInfo}>
                        <Text style={[styles.moodAvgValue, { color: MOOD_COLORS[clampedAvg] }]}>{avgMood.toFixed(1)} / 5</Text>
                        <Text style={styles.moodAvgLabel}>{MOOD_LABELS[clampedAvg]}</Text>
                        <Text style={styles.moodAvgSub}>avg mood this period</Text>
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
        </>

        {/* Stool Type Trend */}
        {stoolHistory.length > 0 && (
          <>
            <ChartComponent title="Stool Type Trend">
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
                <Text style={styles.legendText}>Ideal: Type 3-4</Text>
              </View>
            </ChartComponent>
          </>
        )}

        {/* Top Symptoms */}
        <History
          title="Top Symptoms"
          items={topSymptoms.map(([symptom, count]) => ({
            label: symptom.charAt(0).toUpperCase() + symptom.slice(1).replace('_', ' '),
            count,
            maxCount: Math.max(1, ...Object.values(symptomCounts)),
          }))}
        />

        {/* Premium Banner (future-proofing) */}
        {!hasPremium && (
          <RecommendationBox
            text="Unlock food-symptom insights with Premium"
            onPress={() => router.push('/paywall')}
          />
        )}

        {/* Trigger Foods — new engine */}
        <TriggerFoodsBox triggerFoods={triggerFoods} />

        {/* Safe Foods — new engine */}
        <SafeFoodsBox safeFoods={safeFoods} />

        {safeFoods.length === 0 && triggerFoods.length === 0 && !correlations && (
          <View style={styles.insufficientCard}>
            <Ionicons name="leaf-outline" size={24} color={Colors.textTertiary} />
            <Text style={styles.insufficientText}>Safe foods appear after consistent tracking.</Text>
          </View>
        )}

        {checkInCount === 0 && foodCount === 0 && topSymptoms.length === 0 && (
          <EmptyState
            icon="leaf-outline"
            title="Nothing here yet"
            message="Log daily for 2 weeks and patterns will emerge."
          />
        )}
        </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}

const styles = StyleSheet.create({
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

  // Period Selector
  periodContainer: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: BorderRadius.full,
    padding: 4,
    marginBottom: Spacing.lg,
  },
  periodBtn: {
    flex: 1,
    paddingVertical: Spacing.sm + 2,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
  },
  periodSelected: {
    backgroundColor: Colors.primary,
    ...Shadows.sm,
  },
  periodText: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
    color: Colors.textTertiary,
  },
  periodTextSelected: {
    color: Colors.textInverse,
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
