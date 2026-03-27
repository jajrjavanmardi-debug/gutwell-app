import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { Card } from '../../components/ui/Card';
import { LoadingSkeleton, CardSkeleton } from '../../components/ui/LoadingSkeleton';
import { Colors, Spacing, FontSize, BorderRadius, Shadows } from '../../constants/theme';
import { updateTodayScore } from '../../lib/scoring';

type RecentEntry = {
  type: 'checkin' | 'food' | 'symptom';
  label: string;
  time: string;
  sortKey: string;
};

export default function HomeScreen() {
  const { user, profile } = useAuth();
  const [gutScore, setGutScore] = useState<number | null>(null);
  const [streak, setStreak] = useState(0);
  const [recentEntries, setRecentEntries] = useState<RecentEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  const displayName = profile?.display_name || 'there';

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
      // No score yet — check if there's a check-in for today and calculate
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

    const { data: checkIns } = await supabase
      .from('check_ins')
      .select('entry_date')
      .eq('user_id', user.id)
      .order('entry_date', { ascending: false })
      .limit(30);

    if (checkIns && checkIns.length > 0) {
      let currentStreak = 0;
      const todayDate = new Date();
      for (let i = 0; i < checkIns.length; i++) {
        const expected = new Date(todayDate);
        expected.setDate(expected.getDate() - i);
        const expectedStr = expected.toISOString().split('T')[0];
        if (checkIns[i].entry_date === expectedStr) {
          currentStreak++;
        } else {
          break;
        }
      }
      setStreak(currentStreak);
    }

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

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        <Text style={styles.greeting}>{greeting()},</Text>
        <Text style={styles.name}>{displayName}</Text>

        {isLoading ? (
          <>
            <Card style={styles.scoreCard} variant="elevated">
              <LoadingSkeleton width={120} height={14} />
              <View style={[styles.scoreCircle, { borderColor: Colors.border }]}>
                <LoadingSkeleton width={40} height={32} borderRadius={8} />
              </View>
            </Card>
            <LoadingSkeleton width={120} height={18} style={{ marginBottom: Spacing.md }} />
            <View style={styles.actions}>
              <LoadingSkeleton height={80} borderRadius={BorderRadius.lg} style={{ flex: 1 }} />
              <LoadingSkeleton height={80} borderRadius={BorderRadius.lg} style={{ flex: 1 }} />
              <LoadingSkeleton height={80} borderRadius={BorderRadius.lg} style={{ flex: 1 }} />
            </View>
            <CardSkeleton />
            <CardSkeleton />
          </>
        ) : (
        <>
        <Card style={styles.scoreCard} variant="elevated">
          <Text style={styles.scoreLabel}>Your Gut Score Today</Text>
          <View style={styles.scoreCircle}>
            <Text style={styles.scoreValue}>{gutScore !== null ? gutScore : '--'}</Text>
          </View>
          {streak > 0 && <Text style={styles.streak}>{streak} day streak</Text>}
        </Card>

        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.actions}>
          <QuickAction icon="body" label="Check-in" color={Colors.primary} onPress={() => router.push('/(tabs)/checkin')} />
          <QuickAction icon="restaurant" label="Log Meal" color={Colors.secondary} onPress={() => router.push('/(tabs)/food')} />
          <QuickAction icon="medical" label="Symptom" color={Colors.accent} onPress={() => router.push('/log-symptom')} />
        </View>

        {recentEntries.length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>Recent Activity</Text>
            {recentEntries.map((entry, i) => (
              <Card key={i} style={styles.activityCard}>
                <View style={styles.activityRow}>
                  <View style={[styles.activityDot, { backgroundColor: entryColor(entry.type) }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.activityLabel}>{entry.label}</Text>
                    <Text style={styles.activityTime}>{entry.time}</Text>
                  </View>
                </View>
              </Card>
            ))}
          </>
        ) : (
          <Card style={styles.emptyCard}>
            <Text style={styles.emptyText}>Your gut story starts here</Text>
            <Text style={styles.emptySubtext}>Do your first check-in to unlock your gut score.</Text>
          </Card>
        )}
        </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function QuickAction({ icon, label, color, onPress }: {
  icon: keyof typeof Ionicons.glyphMap; label: string; color: string; onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.actionCard} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.actionIcon, { backgroundColor: color + '15' }]}>
        <Ionicons name={icon} size={28} color={color} />
      </View>
      <Text style={styles.actionLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

function entryColor(type: string) {
  return type === 'checkin' ? Colors.primary : type === 'food' ? Colors.secondary : Colors.accent;
}

function formatTime(iso: string) {
  const diffMins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return new Date(iso).toLocaleDateString();
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: Spacing.lg, paddingBottom: Spacing.xxl },
  greeting: { fontSize: FontSize.lg, color: Colors.textSecondary },
  name: { fontSize: FontSize.xxl, fontWeight: '700', color: Colors.text, marginBottom: Spacing.lg },
  scoreCard: { alignItems: 'center', padding: Spacing.xl, marginBottom: Spacing.lg },
  scoreLabel: { fontSize: FontSize.sm, color: Colors.textSecondary, marginBottom: Spacing.md },
  scoreCircle: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: Colors.surfaceSecondary,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 3, borderColor: Colors.primary,
  },
  scoreValue: { fontSize: FontSize.hero, fontWeight: '700', color: Colors.primary },
  streak: { fontSize: FontSize.sm, color: Colors.secondary, fontWeight: '600', marginTop: Spacing.sm },
  sectionTitle: { fontSize: FontSize.lg, fontWeight: '600', color: Colors.text, marginBottom: Spacing.md, marginTop: Spacing.md },
  actions: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.md },
  actionCard: {
    flex: 1, backgroundColor: Colors.surface, borderRadius: BorderRadius.lg,
    padding: Spacing.md, alignItems: 'center', gap: Spacing.sm, ...Shadows.sm,
  },
  actionIcon: { width: 56, height: 56, borderRadius: BorderRadius.lg, justifyContent: 'center', alignItems: 'center' },
  actionLabel: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text },
  activityCard: { marginBottom: Spacing.sm },
  activityRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  activityDot: { width: 10, height: 10, borderRadius: 5 },
  activityLabel: { fontSize: FontSize.md, color: Colors.text },
  activityTime: { fontSize: FontSize.xs, color: Colors.textTertiary },
  emptyCard: { alignItems: 'center', padding: Spacing.xl },
  emptyText: { fontSize: FontSize.md, color: Colors.textSecondary, fontWeight: '600' },
  emptySubtext: { fontSize: FontSize.sm, color: Colors.textTertiary, marginTop: Spacing.xs },
});
