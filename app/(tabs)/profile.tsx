import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { exportUserData } from '../../lib/export';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Toast } from '../../components/ui/Toast';
import {
  Colors,
  Spacing,
  FontSize,
  BorderRadius,
  Shadows,
  FontFamily,
} from '../../constants/theme';
import { GutLevelBadge } from '../../components/GutLevelBadge';
import { calculatePoints } from '../../lib/levels';

const AVATAR_COLORS = ['#1B4332', '#2D6A4F', '#40916C', '#52B788', '#74C69D'];

export default function ProfileScreen() {
  const { user, profile, signOut } = useAuth();
  const [toast, setToast] = useState({
    visible: false,
    message: '',
    type: 'info' as 'success' | 'error' | 'info',
  });
  const [deleting, setDeleting] = useState(false);
  const [totalPoints, setTotalPoints] = useState(0);
  const [loadingStats, setLoadingStats] = useState(true);
  const [accountStats, setAccountStats] = useState({ checkIns: 0, meals: 0, symptoms: 0 });

  // Compute initials from displayName
  const initials = (profile?.display_name || 'GU')
    .split(' ')
    .map((w: string) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const avatarColor = AVATAR_COLORS[initials.charCodeAt(0) % AVATAR_COLORS.length];

  useEffect(() => {
    if (!user) return;
    loadStats();
  }, [user]);

  const loadStats = async () => {
    if (!user) return;
    setLoadingStats(true);
    try {
      const [checkInsRes, foodLogsRes, symptomLogsRes, streakRes] = await Promise.all([
        supabase.from('check_ins').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
        supabase.from('food_logs').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
        supabase.from('symptom_logs').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
        supabase.from('streaks').select('current_streak').eq('user_id', user.id).maybeSingle(),
      ]);

      const [ci, fl, sl] = [checkInsRes, foodLogsRes, symptomLogsRes];
      setAccountStats({ checkIns: ci.count || 0, meals: fl.count || 0, symptoms: sl.count || 0 });

      const points = calculatePoints({
        checkIns: checkInsRes.count ?? 0,
        foodLogs: foodLogsRes.count ?? 0,
        symptomLogs: symptomLogsRes.count ?? 0,
        currentStreak: streakRes.data?.current_streak ?? 0,
      });
      setTotalPoints(points);
    } catch {
      // Silently fail — badge will show 0 points
    } finally {
      setLoadingStats(false);
    }
  };

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: signOut },
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This will permanently delete your account and all your data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Forever',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            const { error } = await supabase.rpc('delete_user_account');
            setDeleting(false);
            if (error) {
              setToast({
                visible: true,
                message: 'Failed to delete account. Please try again.',
                type: 'error' as any,
              });
            } else {
              await signOut();
            }
          },
        },
      ],
    );
  };

  const handleExport = async () => {
    if (!user) return;
    try {
      await exportUserData(user.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setToast({ visible: true, message: 'Data exported successfully', type: 'info' });
    } catch {
      setToast({ visible: true, message: 'Failed to export data', type: 'error' });
    }
  };

  const badges = [
    {
      id: 'first_checkin',
      icon: 'body',
      label: 'First Step',
      desc: 'Completed first check-in',
      unlocked: accountStats.checkIns >= 1,
    },
    {
      id: 'week_streak',
      icon: 'flame',
      label: '7-Day Streak',
      desc: '7 consecutive days logged',
      unlocked: (profile as any)?.total_points >= 50,
    },
    {
      id: 'meals_10',
      icon: 'restaurant',
      label: 'Mindful Eater',
      desc: 'Logged 10 meals',
      unlocked: accountStats.meals >= 10,
    },
    {
      id: 'points_100',
      icon: 'trophy',
      label: 'Gut Champion',
      desc: 'Reached 100 points',
      unlocked: ((profile as any)?.total_points || 0) >= 100,
    },
  ];

  return (
    <SafeAreaView style={styles.outerContainer} edges={['top']}>
      {/* ── Fixed gradient header (does not scroll) ── */}
      <LinearGradient colors={['#0B2618', '#1B4332']} style={styles.gradientHeader}>
        {/* Avatar */}
        <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
          <Text style={styles.avatarInitials}>{initials}</Text>
        </View>

        {/* Display name */}
        <Text style={styles.headerName}>{profile?.display_name || 'User'}</Text>

        {/* Gut concern pill */}
        {profile?.gut_concern ? (
          <View style={styles.gutPill}>
            <Text style={styles.gutPillText}>{profile.gut_concern}</Text>
          </View>
        ) : null}

        {/* Level badge (compact) */}
        {loadingStats ? (
          <ActivityIndicator size="small" color="#52B788" style={{ marginTop: 12 }} />
        ) : (
          <View style={{ marginTop: 12 }}>
            <GutLevelBadge totalPoints={totalPoints} compact />
          </View>
        )}
      </LinearGradient>

      {/* ── Scrollable content ── */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Stats cards — float over gradient with negative margin */}
        <View style={styles.statsRow}>
          <StatCard value={accountStats.checkIns} label="Check-ins" />
          <StatCard value={accountStats.meals} label="Meals" />
          <StatCard value={accountStats.symptoms} label="Symptoms" />
        </View>

        {/* Gut Level (full badge) */}
        <Card style={styles.levelCard} variant="elevated">
          {loadingStats ? (
            <ActivityIndicator size="small" color={Colors.secondary} />
          ) : (
            <GutLevelBadge totalPoints={totalPoints} />
          )}
        </Card>

        {/* Achievements */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>ACHIEVEMENTS</Text>
          <View style={styles.badgesRow}>
            {badges.map((b) => (
              <View
                key={b.id}
                style={[styles.badgeCard, !b.unlocked && styles.badgeCardLocked]}
              >
                <View
                  style={[
                    styles.badgeIcon,
                    { backgroundColor: b.unlocked ? Colors.primary + '15' : Colors.surfaceSecondary },
                  ]}
                >
                  <Ionicons
                    name={b.icon as any}
                    size={22}
                    color={b.unlocked ? Colors.primary : Colors.textTertiary}
                  />
                </View>
                <Text style={[styles.badgeLabel, !b.unlocked && styles.badgeLabelLocked]}>
                  {b.label}
                </Text>
                <Text style={styles.badgeDesc} numberOfLines={2}>
                  {b.unlocked ? b.desc : '🔒 Locked'}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Settings */}
        <Text style={styles.sectionTitle}>Settings</Text>
        <View style={styles.listCard}>
          <ListRow
            icon="person-outline"
            label="Edit Profile"
            onPress={() => router.push('/edit-profile')}
          />
          <View style={styles.listDivider} />
          <ListRow
            icon="notifications-outline"
            label="Reminders"
            onPress={() => router.push('/reminders')}
          />
          <View style={styles.listDivider} />
          <ListRow
            icon="settings-outline"
            label="Settings"
            onPress={() => router.push('/settings')}
          />
          <View style={styles.listDivider} />
          <ListRow
            icon="download-outline"
            label="Export Data"
            onPress={handleExport}
          />
          <View style={styles.listDivider} />
          <ListRow
            icon="mail-outline"
            label="Contact Support"
            onPress={() => Linking.openURL('mailto:support@theparallellab.com?subject=GutWell%20Support')}
            isLast
          />
        </View>

        {/* About */}
        <Text style={styles.sectionTitle}>About</Text>
        <View style={styles.listCard}>
          <ListRow
            icon="shield-checkmark-outline"
            label="Privacy Policy"
            onPress={() => router.push('/privacy-policy')}
          />
          <View style={styles.listDivider} />
          <ListRow
            icon="document-text-outline"
            label="Terms of Service"
            onPress={() => router.push('/terms-of-service')}
          />
          <View style={styles.listDivider} />
          <ListRow
            icon="information-circle-outline"
            label="Health Disclaimer"
            onPress={() =>
              Alert.alert(
                'Health Disclaimer',
                'GutWell is a wellness tracking tool and is not intended to diagnose, treat, cure, or prevent any disease. Always consult your healthcare provider for medical advice.',
                [{ text: 'OK' }],
              )
            }
          />
          <View style={styles.listDivider} />
          <ListRow
            icon="code-slash-outline"
            label="Version 1.0.0"
            showArrow={false}
            isLast
          />
        </View>

        {/* Account */}
        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.accountActions}>
          <Button
            title="Sign Out"
            onPress={handleSignOut}
            variant="outline"
            size="lg"
            style={styles.signOutButton}
          />
          <TouchableOpacity
            onPress={handleDeleteAccount}
            style={styles.deleteButton}
            disabled={deleting}
            accessibilityRole="button"
            accessibilityLabel="Delete account"
          >
            <Text style={styles.deleteButtonText}>
              {deleting ? 'Deleting...' : 'Delete Account'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: Spacing.xxl }} />
      </ScrollView>

      <Toast
        message={toast.message}
        type={toast.type as any}
        visible={toast.visible}
        onDismiss={() => setToast((t) => ({ ...t, visible: false }))}
      />
    </SafeAreaView>
  );
}

// ─── Stat Card ───────────────────────────────────────────────────────────────

function StatCard({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statNumber}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// ─── List Row ────────────────────────────────────────────────────────────────

function ListRow({
  icon,
  label,
  onPress,
  showArrow = true,
  isLast = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress?: () => void;
  showArrow?: boolean;
  isLast?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.listRow, isLast && styles.listRowLast]}
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress?.(); }}
      activeOpacity={onPress ? 0.6 : 1}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={20} color={Colors.secondary} style={styles.listRowIcon} />
      <Text style={styles.listRowLabel}>{label}</Text>
      {showArrow && (
        <Ionicons name="chevron-forward" size={16} color={Colors.textTertiary} />
      )}
    </TouchableOpacity>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  outerContainer: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  // ── Gradient header
  gradientHeader: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 36,
    alignItems: 'center',
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  avatarInitials: {
    fontFamily: FontFamily.displayBold,
    fontSize: 28,
    color: '#FFFFFF',
  },
  headerName: {
    fontFamily: FontFamily.displayBold,
    fontSize: 26,
    color: '#FFFFFF',
    marginTop: 12,
  },
  gutPill: {
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderRadius: 20,
    backgroundColor: 'rgba(82,183,136,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(82,183,136,0.4)',
  },
  gutPillText: {
    fontFamily: FontFamily.sansMedium,
    fontSize: 12,
    color: '#52B788',
  },

  // ── Scrollable area
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },

  // ── Stats cards row (overlaps gradient)
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: -24,
    marginBottom: Spacing.md,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 14,
    alignItems: 'center',
    ...Shadows.md,
  },
  statNumber: {
    fontFamily: FontFamily.sansBold,
    fontSize: 22,
    color: Colors.primary,
  },
  statLabel: {
    fontFamily: FontFamily.sansRegular,
    fontSize: 11,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 4,
  },

  // ── Level card
  levelCard: {
    alignItems: 'center',
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
    minHeight: 120,
    justifyContent: 'center',
  },

  // ── Achievements
  section: {
    marginBottom: Spacing.md,
  },
  sectionHeader: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: Spacing.sm,
    marginTop: Spacing.md,
    paddingLeft: Spacing.xs,
  },
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  badgeCard: {
    width: '48%',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    gap: 6,
  },
  badgeCardLocked: {
    opacity: 0.5,
  },
  badgeIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeLabel: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: 13,
    color: Colors.text,
    textAlign: 'center',
  },
  badgeLabelLocked: {
    color: Colors.textSecondary,
  },
  badgeDesc: {
    fontFamily: FontFamily.sansRegular,
    fontSize: 11,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 15,
  },

  // ── Section title
  sectionTitle: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: Spacing.sm,
    marginTop: Spacing.md,
    paddingLeft: Spacing.xs,
  },

  // ── List card (settings rows)
  listCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: Spacing.sm,
    ...Shadows.sm,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  listRowLast: {
    // No bottom border on last row
  },
  listRowIcon: {
    marginRight: 14,
  },
  listRowLabel: {
    flex: 1,
    fontFamily: FontFamily.sansMedium,
    fontSize: 15,
    color: Colors.text,
  },
  listDivider: {
    height: 1,
    backgroundColor: Colors.divider,
    marginLeft: 54, // icon offset (20 padding + 20 icon + 14 gap)
    marginRight: 20,
  },

  // ── Account actions
  accountActions: {
    alignItems: 'center',
    gap: Spacing.md,
    marginTop: Spacing.sm,
  },
  signOutButton: {
    width: '100%',
  },
  deleteButton: {
    paddingVertical: Spacing.sm,
  },
  deleteButtonText: {
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.md,
    color: Colors.error,
  },
});
