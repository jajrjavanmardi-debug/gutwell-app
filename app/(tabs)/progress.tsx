import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { Card } from '../../components/ui/Card';
import { Colors, Spacing, FontSize, BorderRadius } from '../../constants/theme';
import { analyzeCorrelations, CorrelationSummary } from '../../lib/correlations';

type Period = '7d' | '30d' | '90d';

export default function ProgressScreen() {
  const { user } = useAuth();
  const [period, setPeriod] = useState<Period>('7d');
  const [checkInCount, setCheckInCount] = useState(0);
  const [avgStoolType, setAvgStoolType] = useState<number | null>(null);
  const [symptomCounts, setSymptomCounts] = useState<Record<string, number>>({});
  const [foodCount, setFoodCount] = useState(0);
  const [stoolHistory, setStoolHistory] = useState<{ date: string; type: number }[]>([]);
  const [gutScores, setGutScores] = useState<{ x: number; y: number; label: string }[]>([]);
  const [correlations, setCorrelations] = useState<CorrelationSummary | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    if (!user) return;
    const days = { '7d': 7, '30d': 30, '90d': 90 }[period];
    const since = new Date(); since.setDate(since.getDate() - days);
    const sinceStr = since.toISOString();
    const sinceDateStr = since.toISOString().split('T')[0];

    const { data: checkIns } = await supabase.from('check_ins').select('stool_type, entry_date')
      .eq('user_id', user.id).gte('created_at', sinceStr).order('entry_date', { ascending: true });
    if (checkIns) {
      setCheckInCount(checkIns.length);
      const avg = checkIns.reduce((s, c) => s + c.stool_type, 0) / checkIns.length;
      setAvgStoolType(checkIns.length > 0 ? Math.round(avg * 10) / 10 : null);
      setStoolHistory(checkIns.map(c => ({ date: c.entry_date, type: c.stool_type })));
    }

    // Gut score trend
    const { data: scores } = await supabase.from('gut_scores').select('score, date')
      .eq('user_id', user.id).gte('date', sinceDateStr).order('date', { ascending: true });
    if (scores && scores.length > 0) {
      setGutScores(scores.map((s, i) => ({
        x: i,
        y: s.score,
        label: formatShortDate(s.date),
      })));
    } else {
      setGutScores([]);
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
      const corr = await analyzeCorrelations(user.id, days);
      setCorrelations(corr);
    } catch {
      setCorrelations(null);
    }
  }, [user, period]);

  useEffect(() => { loadData(); }, [loadData]);

  const onRefresh = async () => { setRefreshing(true); await loadData(); setRefreshing(false); };

  const topSymptoms = Object.entries(symptomCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}>
        <Text style={styles.title}>Progress</Text>

        <View style={styles.periods}>
          {(['7d', '30d', '90d'] as Period[]).map(p => (
            <TouchableOpacity key={p} style={[styles.periodBtn, period === p && styles.periodSelected]} onPress={() => setPeriod(p)}>
              <Text style={[styles.periodText, period === p && styles.periodTextSelected]}>
                {{ '7d': '7 Days', '30d': '30 Days', '90d': '90 Days' }[p]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.statsRow}>
          <Card style={styles.statCard}><Text style={styles.statValue}>{checkInCount}</Text><Text style={styles.statLabel}>Check-ins</Text></Card>
          <Card style={styles.statCard}><Text style={styles.statValue}>{avgStoolType ?? '--'}</Text><Text style={styles.statLabel}>Avg Stool Type</Text></Card>
          <Card style={styles.statCard}><Text style={styles.statValue}>{foodCount}</Text><Text style={styles.statLabel}>Meals Logged</Text></Card>
        </View>

        {gutScores.length >= 2 && (
          <>
            <Text style={styles.sectionTitle}>Gut Score Trend</Text>
            <Card style={styles.chartCard}>
              <View style={styles.scoreTrendChart}>
                {gutScores.map((point, i) => (
                  <View key={i} style={styles.scoreTrendCol}>
                    <View style={[styles.scoreTrendBar, {
                      height: `${point.y}%`,
                      backgroundColor: point.y >= 70 ? Colors.primary : point.y >= 40 ? Colors.accent : Colors.severity[4],
                    }]} />
                    <Text style={styles.scoreTrendValue}>{point.y}</Text>
                    <Text style={styles.scoreTrendLabel}>{point.label}</Text>
                  </View>
                ))}
              </View>
            </Card>
          </>
        )}

        {stoolHistory.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Stool Type Trend</Text>
            <Card style={styles.chartCard}>
              <View style={styles.stoolChart}>
                {stoolHistory.slice(-14).map((entry, i) => (
                  <View key={i} style={styles.stoolCol}>
                    <View style={[styles.stoolBar, {
                      height: `${(entry.type / 7) * 100}%`,
                      backgroundColor: Colors.bristol[entry.type],
                    }]} />
                    <Text style={styles.stoolBarLabel}>{new Date(entry.date).getDate()}</Text>
                  </View>
                ))}
              </View>
              <View style={styles.chartLegend}><Text style={styles.legendText}>Ideal: Type 3-4</Text></View>
            </Card>
          </>
        )}

        {topSymptoms.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Top Symptoms</Text>
            {topSymptoms.map(([symptom, count]) => (
              <Card key={symptom} style={styles.symptomCard}>
                <View style={styles.symptomRow}>
                  <Text style={styles.symptomName}>{symptom.charAt(0).toUpperCase() + symptom.slice(1).replace('_', ' ')}</Text>
                  <View style={styles.symptomBadge}><Text style={styles.symptomCount}>{count}x</Text></View>
                </View>
                <View style={styles.symptomBar}>
                  <View style={[styles.symptomFill, { width: `${(count / Math.max(...Object.values(symptomCounts))) * 100}%` }]} />
                </View>
              </Card>
            ))}
          </>
        )}

        {correlations && !correlations.insufficientData && correlations.topTriggers.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Potential Food Triggers</Text>
            {correlations.topTriggers.slice(0, 5).map((trigger, i) => (
              <Card key={i} style={styles.triggerCard}>
                <View style={styles.triggerRow}>
                  <Text style={styles.triggerFood}>{trigger.food}</Text>
                  <Text style={styles.triggerArrow}>→</Text>
                  <Text style={styles.triggerSymptom}>{trigger.symptom.replace('_', ' ')}</Text>
                  <View style={[styles.riskBadge, {
                    backgroundColor: trigger.riskMultiplier >= 2 ? Colors.severity[4] + '20' :
                      trigger.riskMultiplier >= 1.5 ? Colors.severity[3] + '20' : Colors.severity[2] + '20',
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
              </Card>
            ))}
            {correlations.safeFoods.length > 0 && (
              <View style={styles.safeFoodsRow}>
                <Text style={styles.safeFoodsLabel}>Safe foods:</Text>
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
          <Card style={styles.insufficientCard}>
            <Text style={styles.insufficientTitle}>Food Insights</Text>
            <Text style={styles.insufficientText}>
              Log more meals with food tags to see patterns between what you eat and how you feel.
            </Text>
          </Card>
        )}

        {checkInCount === 0 && foodCount === 0 && topSymptoms.length === 0 && (
          <Card style={styles.emptyCard}>
            <Text style={styles.emptyText}>No data yet for this period.</Text>
            <Text style={styles.emptySubtext}>Start logging to see your progress!</Text>
          </Card>
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
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: Spacing.lg, paddingBottom: Spacing.xxl },
  title: { fontSize: FontSize.xxl, fontWeight: '700', color: Colors.text, marginBottom: Spacing.md },
  periods: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.lg },
  periodBtn: { flex: 1, paddingVertical: Spacing.sm, borderRadius: BorderRadius.full, backgroundColor: Colors.surface, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  periodSelected: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  periodText: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textSecondary },
  periodTextSelected: { color: Colors.textInverse },
  statsRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.lg },
  statCard: { flex: 1, alignItems: 'center', padding: Spacing.md },
  statValue: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.primary },
  statLabel: { fontSize: FontSize.xs, color: Colors.textTertiary, marginTop: 2 },
  sectionTitle: { fontSize: FontSize.lg, fontWeight: '600', color: Colors.text, marginBottom: Spacing.sm },
  chartCard: { padding: Spacing.md, marginBottom: Spacing.lg },
  scoreTrendChart: { flexDirection: 'row', alignItems: 'flex-end', height: 140, gap: 2 },
  scoreTrendCol: { flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end' },
  scoreTrendBar: { width: '70%', borderRadius: 4, minHeight: 4 },
  scoreTrendValue: { fontSize: 10, fontWeight: '600', color: Colors.text, marginTop: 2 },
  scoreTrendLabel: { fontSize: 9, color: Colors.textTertiary, marginTop: 1 },
  stoolChart: { flexDirection: 'row', alignItems: 'flex-end', height: 100, gap: 2 },
  stoolCol: { flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end' },
  stoolBar: { width: '80%', borderRadius: 3, minHeight: 4 },
  stoolBarLabel: { fontSize: 10, color: Colors.textTertiary, marginTop: 4 },
  chartLegend: { alignItems: 'center', marginTop: Spacing.sm },
  legendText: { fontSize: FontSize.xs, color: Colors.secondary },
  symptomCard: { marginBottom: Spacing.sm },
  symptomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  symptomName: { fontSize: FontSize.md, fontWeight: '500', color: Colors.text },
  symptomBadge: { backgroundColor: Colors.surfaceSecondary, borderRadius: BorderRadius.full, paddingHorizontal: Spacing.sm, paddingVertical: 2 },
  symptomCount: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.primary },
  symptomBar: { height: 6, backgroundColor: Colors.surfaceSecondary, borderRadius: 3, marginTop: Spacing.sm, overflow: 'hidden' },
  symptomFill: { height: '100%', backgroundColor: Colors.primary, borderRadius: 3 },
  triggerCard: { marginBottom: Spacing.sm },
  triggerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  triggerFood: { fontSize: FontSize.md, fontWeight: '600', color: Colors.text, textTransform: 'capitalize' },
  triggerArrow: { fontSize: FontSize.md, color: Colors.textTertiary },
  triggerSymptom: { fontSize: FontSize.md, color: Colors.textSecondary, flex: 1, textTransform: 'capitalize' },
  riskBadge: { borderRadius: BorderRadius.full, paddingHorizontal: Spacing.sm, paddingVertical: 2 },
  riskText: { fontSize: FontSize.xs, fontWeight: '700' },
  triggerDetail: { fontSize: FontSize.xs, color: Colors.textTertiary, marginTop: Spacing.xs },
  safeFoodsRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.sm, marginBottom: Spacing.lg },
  safeFoodsLabel: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: '500' },
  safeFoodChip: { backgroundColor: Colors.primary + '15', borderRadius: BorderRadius.full, paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs },
  safeFoodText: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: '600', textTransform: 'capitalize' },
  insufficientCard: { alignItems: 'center', padding: Spacing.lg, marginBottom: Spacing.lg },
  insufficientTitle: { fontSize: FontSize.md, fontWeight: '600', color: Colors.text, marginBottom: Spacing.xs },
  insufficientText: { fontSize: FontSize.sm, color: Colors.textTertiary, textAlign: 'center' },
  emptyCard: { alignItems: 'center', padding: Spacing.xl },
  emptyText: { fontSize: FontSize.md, color: Colors.textSecondary, fontWeight: '600' },
  emptySubtext: { fontSize: FontSize.sm, color: Colors.textTertiary, marginTop: Spacing.xs },
});
