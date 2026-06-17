import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Colors, FontFamily, FontSize, Spacing, BorderRadius } from '../../constants/theme';
import { useAuth } from '../../contexts/AuthContext';
import {
  getChallenge,
  getUserChallenge,
  joinChallenge,
  leaveChallenge,
  computeChallengeProgress,
  type Challenge,
  type UserChallenge,
} from '../../lib/challenges';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { ErrorState } from '../../components/ui/ErrorState';
import { LoadingSkeleton } from '../../components/ui/LoadingSkeleton';

/** A short rules / daily-task list tailored by challenge type. */
function dailyTasksFor(type: string): string[] {
  switch (type) {
    case 'check-in':
      return [
        'Open the app and log a daily gut check-in',
        'Note any symptoms while they’re fresh',
        'Keep the streak alive — one check-in per day',
      ];
    case 'habit':
      return [
        'Complete today’s habit and log it',
        'Stack it onto an existing routine',
        'Check in daily to keep your streak going',
      ];
    case 'reset':
      return [
        'Stick to the guided plan for the day',
        'Log meals and how your gut responds',
        'Avoid reintroducing foods until the window ends',
      ];
    default:
      return [
        'Avoid your known trigger foods today',
        'Log your meals so patterns stay visible',
        'Check in daily to extend your streak',
      ];
  }
}

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return String(n);
}

export default function ChallengeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();

  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [userChallenge, setUserChallenge] = useState<UserChallenge | null>(null);
  const [progress, setProgress] = useState<{ progressDays: number; ratio: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setError(false);
    try {
      const c = await getChallenge(id);
      setChallenge(c);
      if (c && user?.id) {
        const uc = await getUserChallenge(user.id, id);
        setUserChallenge(uc);
        if (uc) {
          const p = await computeChallengeProgress(user.id, uc, c.durationDays);
          setProgress({ progressDays: p.progressDays, ratio: p.ratio });
        } else {
          setProgress(null);
        }
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [id, user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleToggle = useCallback(async () => {
    if (!user?.id || !id) return;
    setBusy(true);
    try {
      if (userChallenge) {
        await leaveChallenge(user.id, id);
      } else {
        await joinChallenge(user.id, id);
      }
      await load();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }, [user?.id, id, userChallenge, load]);

  const joined = userChallenge != null;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.topbar}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.topbarTitle}>Challenge</Text>
        <View style={styles.backBtn} />
      </View>

      {error ? (
        <ErrorState onRetry={load} />
      ) : loading ? (
        <View style={styles.loadingWrap}>
          <LoadingSkeleton width={72} height={72} borderRadius={36} />
          <LoadingSkeleton width="70%" height={24} style={{ marginTop: Spacing.lg }} />
          <LoadingSkeleton width="100%" height={14} style={{ marginTop: Spacing.md }} />
          <LoadingSkeleton width="90%" height={14} style={{ marginTop: Spacing.sm }} />
        </View>
      ) : !challenge ? (
        <ErrorState
          type="empty"
          title="Challenge not found"
          message="This challenge may have ended or been removed."
        />
      ) : (
        <>
          <ScrollView
            contentContainerStyle={styles.scroll}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.hero}>
              <View style={styles.iconBadge}>
                <Ionicons
                  name={challenge.icon as keyof typeof Ionicons.glyphMap}
                  size={36}
                  color={Colors.secondary}
                />
              </View>
              <Text style={styles.title}>{challenge.title}</Text>
              <View style={styles.metaRow}>
                <View style={styles.metaPill}>
                  <Ionicons name="time-outline" size={14} color={Colors.textSecondary} />
                  <Text style={styles.metaText}>{challenge.durationDays} days</Text>
                </View>
                <View style={styles.metaPill}>
                  <Ionicons name="people-outline" size={14} color={Colors.textSecondary} />
                  <Text style={styles.metaText}>
                    {formatCount(challenge.participantsCount)} joined
                  </Text>
                </View>
              </View>
            </View>

            <Text style={styles.description}>{challenge.description}</Text>

            {/* Progress (only when joined) */}
            {joined && progress && (
              <Card variant="outlined" style={styles.progressCard}>
                <View style={styles.progressHeader}>
                  <Text style={styles.progressTitle}>Your progress</Text>
                  <Text style={styles.progressCount}>
                    {progress.progressDays} / {challenge.durationDays} days
                  </Text>
                </View>
                <View style={styles.progressTrack}>
                  <View
                    style={[styles.progressFill, { width: `${Math.round(progress.ratio * 100)}%` }]}
                  />
                </View>
              </Card>
            )}

            {/* Daily tasks / rules */}
            <Text style={styles.sectionTitle}>Daily tasks</Text>
            <Card variant="outlined" style={styles.tasksCard}>
              {dailyTasksFor(challenge.type).map((task, i) => (
                <View key={i} style={styles.taskRow}>
                  <Ionicons
                    name="checkmark-circle-outline"
                    size={20}
                    color={Colors.secondary}
                  />
                  <Text style={styles.taskText}>{task}</Text>
                </View>
              ))}
            </Card>
          </ScrollView>

          <View style={styles.ctaBar}>
            <Button
              title={joined ? 'Leave Challenge' : 'Join Challenge'}
              variant={joined ? 'outline' : 'primary'}
              fullWidth
              shape="pill"
              size="lg"
              loading={busy}
              onPress={handleToggle}
            />
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  topbarTitle: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.md,
    color: Colors.text,
  },
  loadingWrap: { padding: Spacing.lg, alignItems: 'center' },
  scroll: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xl },
  hero: { alignItems: 'center', marginTop: Spacing.md, marginBottom: Spacing.lg },
  iconBadge: {
    width: 72,
    height: 72,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.secondary + '1A',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  title: {
    fontFamily: FontFamily.displayBold,
    fontSize: FontSize.xxl,
    color: Colors.text,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  metaRow: { flexDirection: 'row', gap: Spacing.sm },
  metaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  metaText: {
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
  },
  description: {
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    lineHeight: 24,
    marginBottom: Spacing.lg,
  },
  progressCard: { marginBottom: Spacing.lg },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  progressTitle: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.md,
    color: Colors.text,
  },
  progressCount: {
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.sm,
    color: Colors.secondary,
  },
  progressTrack: {
    height: 8,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.ringTrack,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.ringFill,
  },
  sectionTitle: {
    fontFamily: FontFamily.displaySemiBold,
    fontSize: FontSize.lg,
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  tasksCard: { gap: Spacing.md },
  taskRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  taskText: {
    flex: 1,
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.sm,
    color: Colors.text,
    lineHeight: 20,
  },
  ctaBar: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
  },
});
