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
import { analyzeCorrelations, CorrelationSummary, computeCorrelations, FoodCorrelation, SafeFood } from '../../lib/correlations';
import { ShareCard } from '../../components/ShareCard';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { isPremiumFeature } from '../../lib/subscription';

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

  const loadData = useCallback(async () => {
    if (!user) return;
    try {
    const daysBack = period === 'W' ? 7 : period === 'M' ? 30 : 180;
    const since = new Date(); since.setDate(since.getDate() - daysBack);
    const sinceStr = since.toISOString();
    const sinceDateStr = since.toISOString().split('T')[0];

    const { data: checkIns } = await supabase.from('check_ins').select('stool_type, entry_date, mood')
      .eq('user_id', user.id).gte('created_at', sinceStr).order('entry_date', { ascending: true });
    if (checkIns) {
      setCheckInCount(checkIns.length);
      const avg = checkIns.reduce((s, c) => s + c.stool_type, 0) / checkIns.length;
      setAvgStoolType(checkIns.length > 0 ? Math.round(avg * 10) / 10 : null);
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
      .eq('user_id', user.id).gte('logged_at', sinceStr);
    if (symptoms) {
      const counts: Record<string, number> = {};
      symptoms.forEach(s => { counts[s.symptom_type] = (counts[s.symptom_type] || 0) + 1; });
      setSymptomCounts(counts);
    }

    const { count } = await supabase.from('food_logs').select('id', { count: 'exact', head: true })
      .eq('user_id', user.id).gte('logged_at', sinceStr);
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

        {/* Mood Trends */}
        <>
          <Text style={styles.sectionTitle}>Mood Trends</Text>
          <View style={styles.chartCard}>
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
          </View>
        </>

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

        {/* Premium Banner (future-proofing) */}
        {!isPremiumFeature('correlations') && (
          <TouchableOpacity style={styles.premiumBanner} onPress={() => router.push('/paywall')}>
            <Ionicons name="lock-closed" size={16} color={Colors.accent} />
            <Text style={styles.premiumBannerText}>Unlock food-symptom insights with Premium</Text>
            <Ionicons name="chevron-forward" size={14} color={Colors.accent} />
          </TouchableOpacity>
        )}

        {/* Trigger Foods — new engine */}
        <Text style={styles.sectionTitle}>Trigger Foods</Text>
        {triggerFoods.length > 0 ? (
          <>
            {triggerFoods.map((item, i) => {
              const riskColor = item.riskLevel === 'high' ? '#E07070' : item.riskLevel === 'medium' ? Colors.accent : Colors.secondary;
              return (
                <View key={i} style={styles.triggerCard}>
                  <View style={styles.triggerRow}>
                    <Text style={[styles.triggerFood, { fontFamily: FontFamily.displayMedium, fontSize: 15 }]}>{item.foodName}</Text>
                    <View style={[styles.riskBadge, { backgroundColor: riskColor + '18', borderWidth: 1, borderColor: riskColor + '40' }]}>
                      <Text style={[styles.riskText, { color: riskColor }]}>
                        {item.riskLevel.toUpperCase()}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.correlationBarRow}>
                    <View style={styles.correlationBarTrack}>
                      <View style={[styles.correlationBarFill, { width: `${item.correlationPct}%` as any, backgroundColor: riskColor }]} />
                    </View>
                    <Text style={styles.correlationPctText}>{item.correlationPct}% correlation</Text>
                  </View>
                  {item.topSymptom && (
                    <Text style={styles.topSymptomText}>→ {item.topSymptom.replace(/_/g, ' ')}</Text>
                  )}
                </View>
              );
            })}
          </>
        ) : (
          <View style={styles.insufficientCard}>
            <Ionicons name="analytics-outline" size={28} color={Colors.textTertiary} />
            <Text style={styles.insufficientTitle}>No Trigger Foods Yet</Text>
            <Text style={styles.insufficientText}>Log 2+ weeks of meals to detect trigger foods.</Text>
          </View>
        )}

        {/* Safe Foods — new engine */}
        {safeFoods.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Safe Foods</Text>
            <View style={styles.safeFoodsRow}>
              {safeFoods.map((item, i) => (
                <View key={i} style={styles.safeFoodChip}>
                  <Text style={styles.safeFoodText}>✓ {item.foodName} · {item.symptomFreeRate}% symptom-free</Text>
                </View>
              ))}
            </View>
          </>
        )}

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

  // Correlation bar
  correlationBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  correlationBarTrack: {
    flex: 1,
    height: 6,
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: 3,
    overflow: 'hidden',
  },
  correlationBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  correlationPctText: {
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    minWidth: 100,
  },
  topSymptomText: {
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.xs,
    color: Colors.textTertiary,
    marginTop: Spacing.xs,
    textTransform: 'capitalize',
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

  // Premium Banner
  premiumBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.accent + '15',
    borderRadius: BorderRadius.lg,
    padding: 14,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.accent + '30',
  },
  premiumBannerText: {
    flex: 1,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.sm,
    color: Colors.accent,
  },

});
