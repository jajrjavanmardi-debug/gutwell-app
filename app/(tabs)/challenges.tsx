import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Colors, FontFamily, FontSize, Spacing, BorderRadius } from '../../constants/theme';
import { useAuth } from '../../contexts/AuthContext';
import {
  listChallenges,
  listUserChallenges,
  joinChallenge,
  computeChallengeProgress,
  type Challenge,
  type ActiveChallenge,
} from '../../lib/challenges';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { ErrorState } from '../../components/ui/ErrorState';
import { EmptyState } from '../../components/ui/EmptyState';
import { CardSkeleton } from '../../components/ui/LoadingSkeleton';

type ActiveProgress = ActiveChallenge & { ratio: number; progressDays: number };

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return String(n);
}

export default function ChallengesScreen() {
  const { user } = useAuth();
  const [catalog, setCatalog] = useState<Challenge[]>([]);
  const [active, setActive] = useState<ActiveProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [joiningId, setJoiningId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(false);
    try {
      const all = await listChallenges();
      let activeWithProgress: ActiveProgress[] = [];
      if (user?.id) {
        const joined = await listUserChallenges(user.id);
        activeWithProgress = await Promise.all(
          joined.map(async (uc) => {
            const p = await computeChallengeProgress(
              user.id,
              uc,
              uc.challenge.durationDays,
            );
            return { ...uc, ratio: p.ratio, progressDays: p.progressDays };
          }),
        );
      }
      setCatalog(all);
      setActive(activeWithProgress);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const handleJoin = useCallback(
    async (challengeId: string) => {
      if (!user?.id) {
        router.push({ pathname: '/challenge/[id]', params: { id: challengeId } });
        return;
      }
      setJoiningId(challengeId);
      try {
        await joinChallenge(user.id, challengeId);
        await load();
      } catch {
        setError(true);
      } finally {
        setJoiningId(null);
      }
    },
    [user?.id, load],
  );

  const joinedIds = new Set(active.map((a) => a.challengeId));
  const discover = catalog.filter((c) => !joinedIds.has(c.id));

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Challenges</Text>
        <TouchableOpacity
          style={styles.bell}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Notifications"
          onPress={() => router.push('/(tabs)/progress')}
        >
          <Ionicons name="notifications-outline" size={20} color={Colors.text} />
        </TouchableOpacity>
      </View>

      {error ? (
        <ErrorState onRetry={load} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={Colors.secondary}
            />
          }
        >
          {loading ? (
            <View style={{ gap: Spacing.sm }}>
              <CardSkeleton />
              <CardSkeleton />
              <CardSkeleton />
            </View>
          ) : (
            <>
              {/* Active section */}
              {active.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Active</Text>
                  {active.map((item) => (
                    <ActiveCard key={item.id} item={item} />
                  ))}
                </View>
              )}

              {/* Discover section */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Discover</Text>
                {discover.length === 0 ? (
                  <EmptyState
                    icon="trophy-outline"
                    title="You're in every challenge"
                    message="Nice work — you've joined them all. Pull to refresh for new gut-health challenges."
                  />
                ) : (
                  discover.map((item) => (
                    <DiscoverCard
                      key={item.id}
                      item={item}
                      joining={joiningId === item.id}
                      onJoin={() => handleJoin(item.id)}
                      onOpen={() => router.push({ pathname: '/challenge/[id]', params: { id: item.id } })}
                    />
                  ))
                )}
              </View>
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function ActiveCard({ item }: { item: ActiveProgress }) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => router.push({ pathname: '/challenge/[id]', params: { id: item.challengeId } })}
    >
      <Card variant="outlined" style={styles.card}>
        <View style={styles.cardRow}>
          <View style={styles.iconBadge}>
            <Ionicons
              name={item.challenge.icon as keyof typeof Ionicons.glyphMap}
              size={24}
              color={Colors.secondary}
            />
          </View>
          <View style={styles.cardBody}>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {item.challenge.title}
            </Text>
            <Text style={styles.progressLabel}>
              Day {item.progressDays} of {item.challenge.durationDays}
            </Text>
            <View style={styles.progressTrack}>
              <View
                style={[styles.progressFill, { width: `${Math.round(item.ratio * 100)}%` }]}
              />
            </View>
          </View>
        </View>
      </Card>
    </TouchableOpacity>
  );
}

function DiscoverCard({
  item,
  joining,
  onJoin,
  onOpen,
}: {
  item: Challenge;
  joining: boolean;
  onJoin: () => void;
  onOpen: () => void;
}) {
  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onOpen}>
      <Card variant="outlined" style={styles.card}>
        {/* Cal AI group-card anatomy: circular avatar (left) · name +
            member-count + short description (center) · Join button (right) */}
        <View style={styles.cardRow}>
          <View style={styles.iconBadge}>
            <Ionicons
              name={item.icon as keyof typeof Ionicons.glyphMap}
              size={24}
              color={Colors.secondary}
            />
          </View>
          <View style={styles.cardBody}>
            <Text style={styles.cardTitle} numberOfLines={2}>
              {item.title}
            </Text>
            <Text style={styles.metaText}>
              {formatCount(item.participantsCount)} joined · {item.durationDays} days
            </Text>
            <Text style={styles.description} numberOfLines={2}>
              {item.description}
            </Text>
          </View>
          <Button
            title={joining ? 'Joining…' : '+ Join'}
            variant="outline"
            size="sm"
            shape="pill"
            loading={joining}
            onPress={onJoin}
            style={styles.joinBtn}
          />
        </View>
      </Card>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
  },
  headerTitle: {
    fontFamily: FontFamily.displayBold,
    fontSize: FontSize.hero,
    color: Colors.text,
  },
  bell: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },
  section: { marginBottom: Spacing.lg },
  sectionTitle: {
    fontFamily: FontFamily.displaySemiBold,
    fontSize: FontSize.xl,
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  card: { marginBottom: Spacing.sm },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  iconBadge: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.secondary + '1A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: { flex: 1, gap: 4 },
  cardTitle: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.md,
    color: Colors.text,
  },
  metaText: {
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  description: {
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.sm,
    color: Colors.textTertiary,
    lineHeight: 20,
  },
  joinBtn: { alignSelf: 'center' },
  progressLabel: {
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.xs,
    color: Colors.secondary,
    marginTop: 2,
    marginBottom: Spacing.sm,
  },
  progressTrack: {
    height: 6,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.ringTrack,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.ringFill,
  },
});
