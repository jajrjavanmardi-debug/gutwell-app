import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Card } from '../components/ui/Card';
import { LoadingSkeleton } from '../components/ui/LoadingSkeleton';
import { Colors, Spacing, FontSize, BorderRadius, Shadows, FontFamily } from '../constants/theme';

type DigestData = {
  avgScore: number | null;
  prevAvgScore: number | null;
  bestDay: { date: string; score: number } | null;
  worstDay: { date: string; score: number } | null;
  checkInCount: number;
  prevCheckInCount: number;
  mealCount: number;
  topSymptoms: { name: string; count: number }[];
  streak: number;
};

export default function WeeklyDigestScreen() {
  const { user } = useAuth();
  const [data, setData] = useState<DigestData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadDigest = useCallback(async () => {
    if (!user) return;

    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - 7);
    const prevWeekStart = new Date(now);
    prevWeekStart.setDate(now.getDate() - 14);

    const weekStr = weekStart.toISOString().split('T')[0];
    const prevWeekStr = prevWeekStart.toISOString().split('T')[0];

    // Current week scores
    const { data: scores } = await supabase
      .from('gut_scores').select('score, date')
      .eq('user_id', user.id)
      .gte('date', weekStr)
      .order('date', { ascending: true });

    // Previous week scores
    const { data: prevScores } = await supabase
      .from('gut_scores').select('score')
      .eq('user_id', user.id)
      .gte('date', prevWeekStr)
      .lt('date', weekStr);

    const avgScore = scores && scores.length > 0
      ? Math.round(scores.reduce((s, r) => s + r.score, 0) / scores.length)
      : null;
    const prevAvgScore = prevScores && prevScores.length > 0
      ? Math.round(prevScores.reduce((s, r) => s + r.score, 0) / prevScores.length)
      : null;

    let bestDay = null;
    let worstDay = null;
    if (scores && scores.length > 0) {
      const sorted = [...scores].sort((a, b) => b.score - a.score);
      bestDay = { date: sorted[0].date, score: sorted[0].score };
      worstDay = { date: sorted[sorted.length - 1].date, score: sorted[sorted.length - 1].score };
    }

    // Check-in counts
    const { count: checkInCount } = await supabase
      .from('check_ins').select('id', { count: 'exact', head: true })
      .eq('user_id', user.id).gte('created_at', weekStart.toISOString());

    const { count: prevCheckInCount } = await supabase
      .from('check_ins').select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', prevWeekStart.toISOString())
      .lt('created_at', weekStart.toISOString());

    // Meal count
    const { count: mealCount } = await supabase
      .from('food_logs').select('id', { count: 'exact', head: true })
      .eq('user_id', user.id).gte('logged_at', weekStart.toISOString());

    // Top symptoms
    const { data: symptoms } = await supabase
      .from('symptoms').select('symptom_type')
      .eq('user_id', user.id).gte('logged_at', weekStart.toISOString());

    const symptomMap: Record<string, number> = {};
    symptoms?.forEach(s => { symptomMap[s.symptom_type] = (symptomMap[s.symptom_type] || 0) + 1; });
    const topSymptoms = Object.entries(symptomMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, count]) => ({ name, count }));

    // Streak
    const { data: checkIns } = await supabase
      .from('check_ins').select('entry_date')
      .eq('user_id', user.id)
      .order('entry_date', { ascending: false }).limit(30);

    let streak = 0;
    if (checkIns) {
      const todayDate = new Date();
      for (let i = 0; i < checkIns.length; i++) {
        const expected = new Date(todayDate);
        expected.setDate(expected.getDate() - i);
        if (checkIns[i].entry_date === expected.toISOString().split('T')[0]) {
          streak++;
        } else break;
      }
    }

    setData({
      avgScore,
      prevAvgScore,
      bestDay,
      worstDay,
      checkInCount: checkInCount || 0,
      prevCheckInCount: prevCheckInCount || 0,
      mealCount: mealCount || 0,
      topSymptoms,
      streak,
    });
    setIsLoading(false);
  }, [user]);

  useEffect(() => { loadDigest(); }, [loadDigest]);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return `${days[d.getDay()]}, ${d.getDate()}`;
  };

  const trendIcon = (current: number | null, prev: number | null) => {
    if (current == null || prev == null) return null;
    if (current > prev) return { icon: 'arrow-up', color: Colors.secondary };
    if (current < prev) return { icon: 'arrow-down', color: Colors.error };
    return { icon: 'remove', color: Colors.textTertiary };
  };

  const getMotivation = () => {
    if (!data) return '';
    if (data.avgScore && data.avgScore >= 75) return 'Outstanding week! Your gut is thriving.';
    if (data.avgScore && data.avgScore >= 50) return 'Solid progress. Keep building on these habits.';
    if (data.checkInCount >= 5) return 'Great consistency! Patterns become clearer each week.';
    return 'Every check-in counts. This week is a fresh start.';
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()}>
          <Ionicons name="close" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Weekly Digest</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {isLoading ? (
          <>
            <LoadingSkeleton height={160} borderRadius={BorderRadius.lg} />
            <View style={{ height: Spacing.md }} />
            <LoadingSkeleton height={80} borderRadius={BorderRadius.lg} />
            <View style={{ height: Spacing.md }} />
            <LoadingSkeleton height={100} borderRadius={BorderRadius.lg} />
          </>
        ) : data ? (
          <>
            {/* Hero Score Card */}
            <Card style={styles.heroCard} variant="premium">
              <Text style={styles.heroLabel}>This Week's Average</Text>
              <View style={styles.heroScoreRow}>
                <Text style={styles.heroScore}>
                  {data.avgScore != null ? data.avgScore : '--'}
                </Text>
                {data.avgScore != null && data.prevAvgScore != null && (() => {
                  const trend = trendIcon(data.avgScore, data.prevAvgScore);
                  if (!trend) return null;
                  const diff = data.avgScore - data.prevAvgScore;
                  return (
                    <View style={[styles.trendBadge, { backgroundColor: trend.color + '15' }]}>
                      <Ionicons name={trend.icon as any} size={14} color={trend.color} />
                      <Text style={[styles.trendText, { color: trend.color }]}>
                        {diff > 0 ? '+' : ''}{diff}
                      </Text>
                    </View>
                  );
                })()}
              </View>
              <Text style={styles.heroSubtext}>out of 100</Text>
              <Text style={styles.motivation}>{getMotivation()}</Text>
            </Card>

            {/* Best / Worst Days */}
            {(data.bestDay || data.worstDay) && (
              <View style={styles.dayRow}>
                {data.bestDay && (
                  <Card style={styles.dayCard}>
                    <View style={[styles.dayIcon, { backgroundColor: Colors.secondary + '15' }]}>
                      <Ionicons name="sunny" size={18} color={Colors.secondary} />
                    </View>
                    <Text style={styles.dayLabel}>Best Day</Text>
                    <Text style={styles.dayDate}>{formatDate(data.bestDay.date)}</Text>
                    <Text style={[styles.dayScore, { color: Colors.secondary }]}>{data.bestDay.score}</Text>
                  </Card>
                )}
                {data.worstDay && data.bestDay && data.worstDay.date !== data.bestDay.date && (
                  <Card style={styles.dayCard}>
                    <View style={[styles.dayIcon, { backgroundColor: Colors.accent + '15' }]}>
                      <Ionicons name="cloudy" size={18} color={Colors.accent} />
                    </View>
                    <Text style={styles.dayLabel}>Toughest Day</Text>
                    <Text style={styles.dayDate}>{formatDate(data.worstDay.date)}</Text>
                    <Text style={[styles.dayScore, { color: Colors.accent }]}>{data.worstDay.score}</Text>
                  </Card>
                )}
              </View>
            )}

            {/* Weekly Stats */}
            <Text style={styles.sectionTitle}>This Week</Text>
            <View style={styles.statsRow}>
              <Card style={styles.statCard}>
                <Text style={styles.statValue}>{data.checkInCount}</Text>
                <Text style={styles.statLabel}>Check-ins</Text>
                {(() => {
                  const trend = trendIcon(data.checkInCount, data.prevCheckInCount);
                  if (!trend) return null;
                  return <Ionicons name={trend.icon as any} size={12} color={trend.color} style={{ marginTop: 2 }} />;
                })()}
              </Card>
              <Card style={styles.statCard}>
                <Text style={styles.statValue}>{data.mealCount}</Text>
                <Text style={styles.statLabel}>Meals</Text>
              </Card>
              <Card style={styles.statCard}>
                <Text style={styles.statValue}>{data.streak}</Text>
                <Text style={styles.statLabel}>Streak</Text>
                {data.streak >= 3 && <Ionicons name="flame" size={12} color={Colors.accent} style={{ marginTop: 2 }} />}
              </Card>
            </View>

            {/* Top Symptoms */}
            {data.topSymptoms.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>Top Symptoms</Text>
                {data.topSymptoms.map((s, i) => (
                  <View key={i} style={styles.symptomRow}>
                    <View style={styles.symptomDot} />
                    <Text style={styles.symptomName}>
                      {s.name.charAt(0).toUpperCase() + s.name.slice(1).replace('_', ' ')}
                    </Text>
                    <Text style={styles.symptomCount}>{s.count}x</Text>
                  </View>
                ))}
              </>
            )}

            {data.checkInCount === 0 && (
              <Card style={styles.emptyCard}>
                <Ionicons name="calendar-outline" size={40} color={Colors.textTertiary} />
                <Text style={styles.emptyTitle}>No data this week</Text>
                <Text style={styles.emptySubtext}>Start checking in daily to see your weekly digest here.</Text>
              </Card>
            )}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
  },
  closeBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.surfaceSecondary, justifyContent: 'center', alignItems: 'center',
  },
  headerTitle: { fontFamily: FontFamily.sansSemiBold, fontSize: FontSize.lg, color: Colors.text },
  scroll: { padding: Spacing.lg, paddingBottom: Spacing.xxl },

  // Hero
  heroCard: { alignItems: 'center', padding: Spacing.xl, marginBottom: Spacing.lg },
  heroLabel: { fontFamily: FontFamily.sansMedium, fontSize: FontSize.sm, color: Colors.textSecondary },
  heroScoreRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.sm },
  heroScore: { fontFamily: FontFamily.displayBold, fontSize: 56, color: Colors.primary },
  heroSubtext: { fontFamily: FontFamily.sansRegular, fontSize: FontSize.sm, color: Colors.textTertiary },
  trendBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs, borderRadius: BorderRadius.full,
  },
  trendText: { fontFamily: FontFamily.sansSemiBold, fontSize: FontSize.sm },
  motivation: {
    fontFamily: FontFamily.sansRegular, fontSize: FontSize.sm, color: Colors.textSecondary,
    textAlign: 'center', marginTop: Spacing.md,
  },

  // Day cards
  dayRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.lg },
  dayCard: { flex: 1, alignItems: 'center', padding: Spacing.md },
  dayIcon: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', marginBottom: Spacing.xs },
  dayLabel: { fontFamily: FontFamily.sansMedium, fontSize: FontSize.xs, color: Colors.textTertiary },
  dayDate: { fontFamily: FontFamily.sansSemiBold, fontSize: FontSize.sm, color: Colors.text, marginTop: 2 },
  dayScore: { fontFamily: FontFamily.displayBold, fontSize: FontSize.xl, marginTop: 2 },

  // Section
  sectionTitle: { fontFamily: FontFamily.displayMedium, fontSize: FontSize.xl, color: Colors.text, marginBottom: Spacing.md },

  // Stats
  statsRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.lg },
  statCard: { flex: 1, alignItems: 'center', padding: Spacing.md },
  statValue: { fontFamily: FontFamily.sansBold, fontSize: FontSize.xl, color: Colors.primary },
  statLabel: { fontFamily: FontFamily.sansRegular, fontSize: FontSize.xs, color: Colors.textTertiary, marginTop: 2 },

  // Symptoms
  symptomRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  symptomDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.secondary },
  symptomName: { fontFamily: FontFamily.sansMedium, fontSize: FontSize.md, color: Colors.text, flex: 1 },
  symptomCount: { fontFamily: FontFamily.sansSemiBold, fontSize: FontSize.sm, color: Colors.textSecondary },

  // Empty
  emptyCard: { alignItems: 'center', padding: Spacing.xl, gap: Spacing.sm },
  emptyTitle: { fontFamily: FontFamily.sansSemiBold, fontSize: FontSize.md, color: Colors.textSecondary },
  emptySubtext: { fontFamily: FontFamily.sansRegular, fontSize: FontSize.sm, color: Colors.textTertiary, textAlign: 'center' },
});
