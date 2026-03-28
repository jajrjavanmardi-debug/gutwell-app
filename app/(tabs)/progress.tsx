import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Platform } from 'react-native';
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
import { analyzeCorrelations, CorrelationSummary } from '../../lib/correlations';

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
  const [checkInDates, setCheckInDates] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [weekInsights, setWeekInsights] = useState<{ avgScore: number | null, bestDay: string | null, trend: 'up' | 'down' | 'flat' } | null>(null);

  const loadData = useCallback(async () => {
    if (!user) return;
    const daysBack = period === 'W' ? 7 : period === 'M' ? 30 : 180;
    const since = new Date(); since.setDate(since.getDate() - daysBack);
    const sinceStr = since.toISOString();
    const sinceDateStr = since.toISOString().split('T')[0];

    const { data: checkIns } = await supabase.from('check_ins').select('stool_type, entry_date')
      .eq('user_id', user.id).gte('created_at', sinceStr).order('entry_date', { ascending: true });
    if (checkIns) {
      setCheckInCount(checkIns.length);
      const avg = checkIns.reduce((s, c) => s + c.stool_type, 0) / checkIns.length;
      setAvgStoolType(checkIns.length > 0 ? Math.round(avg * 10) / 10 : null);
      setStoolHistory(checkIns.map(c => ({ date: c.entry_date, type: c.stool_type })));
      setCheckInDates(checkIns.map(c => c.entry_date));
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
      .eq('user_id', user.id).gte('logged_at', sinceStr);
    if (symptoms) {
      const counts: Record<string, number> = {};
      symptoms.forEach(s => { counts[s.symptom_type] = (counts[s.symptom_type] || 0) + 1; });
      setSymptomCounts(counts);
    }

    const { count } = await supabase.from('food_logs').select('id', { count: 'exact', head: true })
      .eq('user_id', user.id).gte('logged_at', sinceStr);
    setFoodCount(count || 0);

    // Food-symptom correlations
    try {
      const corr = await analyzeCorrelations(user.id, daysBack);
      setCorrelations(corr);
    } catch {
      setCorrelations(null);
    }
    setIsLoading(false);
  }, [user, period]);

  useEffect(() => { loadData(); }, [loadData]);

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
          <TouchableOpacity
            style={styles.digestButton}
            onPress={() => router.push('/weekly-digest')}
            activeOpacity={0.7}
          >
            <Ionicons name="document-text-outline" size={16} color={Colors.primary} />
            <Text style={styles.digestButtonText}>Weekly Digest</Text>
          </TouchableOpacity>
        </View>

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
          <View style={styles.insightsCard}>
            <View style={styles.insightsHeader}>
              <Text style={styles.insightsTitle}>This Week</Text>
              <View style={[styles.trendBadge, { backgroundColor: weekInsights.trend === 'up' ? Colors.secondary + '20' : weekInsights.trend === 'down' ? '#E0707020' : Colors.border + '40' }]}>
                <Ionicons name={weekInsights.trend === 'up' ? 'trending-up' : weekInsights.trend === 'down' ? 'trending-down' : 'remove'} size={14} color={weekInsights.trend === 'up' ? Colors.secondary : weekInsights.trend === 'down' ? '#E07070' : Colors.textTertiary} />
                <Text style={[styles.trendBadgeText, { color: weekInsights.trend === 'up' ? Colors.secondary : weekInsights.trend === 'down' ? '#E07070' : Colors.textTertiary }]}>
                  {weekInsights.trend === 'up' ? 'Improving' : weekInsights.trend === 'down' ? 'Declining' : 'Steady'}
                </Text>
              </View>
            </View>
            <View style={styles.insightsRow}>
              <View style={styles.insightsStat}>
                <Text style={styles.insightsStatValue}>{weekInsights.avgScore}</Text>
                <Text style={styles.insightsStatLabel}>Avg Score</Text>
              </View>
              {weekInsights.bestDay && (
                <View style={[styles.insightsStat, { borderLeftWidth: 1, borderLeftColor: Colors.divider, paddingLeft: 20 }]}>
                  <Text style={[styles.insightsStatValue, { fontSize: 16 }]}>{weekInsights.bestDay}</Text>
                  <Text style={styles.insightsStatLabel}>Best Day</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {isLoading ? (
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
          <View style={styles.statCard}>
            <View style={styles.statIconWrap}>
              <Ionicons name="checkmark-circle" size={22} color={Colors.primary} />
            </View>
            <Text style={styles.statValue}>{checkInCount}</Text>
            <Text style={styles.statLabel}>Check-ins</Text>
          </View>
          <View style={styles.statCard}>
            <View style={styles.statIconWrap}>
              <Ionicons name="nutrition" size={22} color={Colors.accent} />
            </View>
            <Text style={styles.statValue}>{avgStoolType ?? '--'}</Text>
            <Text style={styles.statLabel}>Avg Stool</Text>
          </View>
          <View style={styles.statCard}>
            <View style={styles.statIconWrap}>
              <Ionicons name="restaurant" size={22} color={Colors.secondary} />
            </View>
            <Text style={styles.statValue}>{foodCount}</Text>
            <Text style={styles.statLabel}>Meals</Text>
          </View>
        </View>

        {/* Gut Score Trend */}
        {gutScores.length >= 2 && (
          <>
            <Text style={styles.sectionTitle}>Gut Score Trend</Text>
            <View style={styles.chartCard}>
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
            </View>
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

        {/* Stool Type Trend */}
        {stoolHistory.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Stool Type Trend</Text>
            <View style={styles.chartCard}>
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
            </View>
          </>
        )}

        {/* Top Symptoms */}
        {topSymptoms.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Top Symptoms</Text>
            {topSymptoms.map(([symptom, count]) => (
              <View key={symptom} style={styles.symptomCard}>
                <View style={styles.symptomRow}>
                  <Text style={styles.symptomName}>{symptom.charAt(0).toUpperCase() + symptom.slice(1).replace('_', ' ')}</Text>
                  <View style={styles.symptomBadge}>
                    <Text style={styles.symptomCount}>{count}x</Text>
                  </View>
                </View>
                <View style={styles.symptomBar}>
                  <View style={[styles.symptomFill, { width: `${(count / Math.max(1, ...Object.values(symptomCounts))) * 100}%` }]} />
                </View>
              </View>
            ))}
          </>
        )}

        {/* Correlations */}
        {correlations && !correlations.insufficientData && correlations.topTriggers.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Potential Food Patterns</Text>
            {correlations.topTriggers.slice(0, 5).map((trigger, i) => (
              <View key={i} style={styles.triggerCard}>
                <View style={styles.triggerRow}>
                  <Text style={styles.triggerFood}>{trigger.food}</Text>
                  <Ionicons name="arrow-forward" size={14} color={Colors.textTertiary} style={{ marginHorizontal: 4 }} />
                  <Text style={styles.triggerSymptom}>{trigger.symptom.replace('_', ' ')}</Text>
                  <View style={[styles.riskBadge, {
                    backgroundColor: trigger.riskMultiplier >= 2 ? Colors.severity[4] + '15' :
                      trigger.riskMultiplier >= 1.5 ? Colors.severity[3] + '15' : Colors.severity[2] + '15',
                    borderWidth: 1,
                    borderColor: trigger.riskMultiplier >= 2 ? Colors.severity[4] + '30' :
                      trigger.riskMultiplier >= 1.5 ? Colors.severity[3] + '30' : Colors.severity[2] + '30',
                  }]}>
                    <Text style={[styles.riskText, {
                      color: trigger.riskMultiplier >= 2 ? Colors.severity[4] :
                        trigger.riskMultiplier >= 1.5 ? Colors.severity[3] : Colors.severity[2],
                    }]}>
                      {trigger.riskMultiplier.toFixed(1)}x
                    </Text>
                  </View>
                </View>
                <Text style={styles.triggerDetail}>
                  {trigger.occurrences} of {trigger.totalMeals} meals · {trigger.confidence} confidence
                </Text>
              </View>
            ))}
            {correlations.safeFoods.length > 0 && (
              <View style={styles.safeFoodsRow}>
                <Text style={styles.safeFoodsLabel}>Well-tolerated foods:</Text>
                {correlations.safeFoods.slice(0, 5).map((food, i) => (
                  <View key={i} style={styles.safeFoodChip}>
                    <Text style={styles.safeFoodText}>{food}</Text>
                  </View>
                ))}
              </View>
            )}
          </>
        )}

        {correlations?.insufficientData && (
          <View style={styles.insufficientCard}>
            <Ionicons name="analytics-outline" size={28} color={Colors.textTertiary} />
            <Text style={styles.insufficientTitle}>Food-Symptom Patterns</Text>
            <Text style={styles.insufficientText}>
              Log meals with ingredients to unlock insights. Patterns emerge after 5+ logged meals.
            </Text>
          </View>
        )}

        {checkInCount === 0 && foodCount === 0 && topSymptoms.length === 0 && (
          <View style={styles.emptyCard}>
            <Ionicons name="leaf-outline" size={32} color={Colors.textTertiary} />
            <Text style={styles.emptyText}>Nothing here yet</Text>
            <Text style={styles.emptySubtext}>Log daily for 2 weeks and patterns will emerge.</Text>
          </View>
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
  statIconWrap: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surfaceSecondary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  statValue: {
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xl,
    color: Colors.text,
  },
  statLabel: {
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.xs,
    color: Colors.textTertiary,
    marginTop: 2,
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

  // Symptoms
  symptomCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  symptomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  symptomName: {
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.md,
    color: Colors.text,
  },
  symptomBadge: {
    backgroundColor: Colors.primary + '12',
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
  },
  symptomCount: {
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xs,
    color: Colors.primary,
  },
  symptomBar: {
    height: 6,
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: 3,
    marginTop: Spacing.sm,
    overflow: 'hidden',
  },
  symptomFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 3,
  },

  // Correlations
  triggerCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.sm,
  },
  triggerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  triggerFood: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.md,
    color: Colors.text,
    textTransform: 'capitalize',
  },
  triggerSymptom: {
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    flex: 1,
    textTransform: 'capitalize',
  },
  riskBadge: {
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: 3,
  },
  riskText: {
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xs,
  },
  triggerDetail: {
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.xs,
    color: Colors.textTertiary,
    marginTop: Spacing.xs,
  },
  safeFoodsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  safeFoodsLabel: {
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  safeFoodChip: {
    backgroundColor: Colors.primary + '12',
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 1,
    borderWidth: 1,
    borderColor: Colors.primary + '20',
  },
  safeFoodText: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.xs,
    color: Colors.primary,
    textTransform: 'capitalize',
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
  insufficientTitle: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.md,
    color: Colors.text,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  insufficientText: {
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.sm,
    color: Colors.textTertiary,
    textAlign: 'center',
  },
  emptyCard: {
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  emptyText: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    marginTop: Spacing.sm,
  },
  emptySubtext: {
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.sm,
    color: Colors.textTertiary,
    marginTop: Spacing.xs,
  },

  // Weekly Insights Card
  insightsCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: 20,
    marginBottom: Spacing.lg,
    ...Shadows.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  insightsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  insightsTitle: {
    fontFamily: FontFamily.displayMedium,
    fontSize: FontSize.xl,
    color: Colors.text,
  },
  trendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  trendBadgeText: {
    fontFamily: FontFamily.sansMedium,
    fontSize: 12,
  },
  insightsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  insightsStat: {
    flex: 1,
  },
  insightsStatValue: {
    fontFamily: FontFamily.displayBold,
    fontSize: 28,
    color: Colors.text,
    lineHeight: 34,
  },
  insightsStatLabel: {
    fontFamily: FontFamily.sansRegular,
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
});
