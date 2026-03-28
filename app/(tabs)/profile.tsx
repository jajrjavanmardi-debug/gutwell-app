import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { exportUserData } from '../../lib/export';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Toast } from '../../components/ui/Toast';
import { Colors, Spacing, FontSize, BorderRadius, Shadows, FontFamily, Typography } from '../../constants/theme';
import { GutLevelBadge } from '../../components/GutLevelBadge';
import { calculatePoints } from '../../lib/levels';

const AVATAR_COLORS = ['#1B4332', '#2D6A4F', '#40916C', '#52B788', '#74C69D'];

export default function ProfileScreen() {
  const { user, profile, signOut } = useAuth();
  const [toast, setToast] = useState({ visible: false, message: '', type: 'info' as 'success' | 'error' | 'info' });
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
              setToast({ visible: true, message: 'Failed to delete account. Please try again.', type: 'error' as any });
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
      setToast({ visible: true, message: 'Data exported successfully', type: 'info' });
    } catch {
      setToast({ visible: true, message: 'Failed to export data', type: 'error' });
    }
  };

  const badges = [
    { id: 'first_checkin', icon: 'body', label: 'First Step', desc: 'Completed first check-in', unlocked: accountStats.checkIns >= 1 },
    { id: 'week_streak', icon: 'flame', label: '7-Day Streak', desc: '7 consecutive days logged', unlocked: (profile as any)?.total_points >= 50 },
    { id: 'meals_10', icon: 'restaurant', label: 'Mindful Eater', desc: 'Logged 10 meals', unlocked: accountStats.meals >= 10 },
    { id: 'points_100', icon: 'trophy', label: 'Gut Champion', desc: 'Reached 100 points', unlocked: ((profile as any)?.total_points || 0) >= 100 },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <Text style={styles.title}>Profile</Text>

        {/* User Card */}
        <Card style={styles.userCard} variant="elevated">
          <View style={styles.avatarRing}>
            <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
              <Text style={styles.avatarInitials}>{initials}</Text>
            </View>
          </View>
          <Text style={styles.userName}>{profile?.display_name || 'User'}</Text>
          <Text style={styles.userEmail}>{user?.email}</Text>

          {/* Stats Row */}
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{accountStats.checkIns}</Text>
              <Text style={styles.statLabel}>Check-ins</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{accountStats.meals}</Text>
              <Text style={styles.statLabel}>Meals</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{accountStats.symptoms}</Text>
              <Text style={styles.statLabel}>Symptoms</Text>
            </View>
          </View>
        </Card>

        {/* Gut Level Badge */}
        <Card style={styles.levelCard} variant="elevated">
          {loadingStats ? (
            <ActivityIndicator size="small" color={Colors.secondary} />
          ) : (
            <GutLevelBadge totalPoints={totalPoints} />
          )}
        </Card>

        {/* Achievements Section */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>ACHIEVEMENTS</Text>
          <View style={styles.badgesRow}>
            {badges.map(b => (
              <View key={b.id} style={[styles.badgeCard, !b.unlocked && styles.badgeCardLocked]}>
                <View style={[styles.badgeIcon, { backgroundColor: b.unlocked ? Colors.primary + '15' : Colors.surfaceSecondary }]}>
                  <Ionicons name={b.icon as any} size={22} color={b.unlocked ? Colors.primary : Colors.textTertiary} />
                </View>
                <Text style={[styles.badgeLabel, !b.unlocked && styles.badgeLabelLocked]}>{b.label}</Text>
                <Text style={styles.badgeDesc} numberOfLines={2}>{b.unlocked ? b.desc : '🔒 Locked'}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Settings Section */}
        <Text style={styles.sectionTitle}>Settings</Text>
        <Card style={styles.sectionCard} variant="elevated">
          <SettingsItem
            icon="settings-outline"
            label="Settings"
            subtitle="Preferences, notifications, diet type"
            onPress={() => router.push('/settings')}
          />
          <View style={styles.itemDivider} />
          <SettingsItem
            icon="notifications-outline"
            label="Reminders"
            subtitle="Set daily check-in reminders"
            onPress={() => router.push('/reminders')}
          />
          <View style={styles.itemDivider} />
          <SettingsItem
            icon="download-outline"
            label="Export Data"
            subtitle="Download your data as CSV"
            onPress={handleExport}
            isLast
          />
        </Card>

        {/* About Section */}
        <Text style={styles.sectionTitle}>About</Text>
        <Card style={styles.sectionCard} variant="elevated">
          <SettingsItem
            icon="shield-checkmark-outline"
            label="Privacy Policy"
            subtitle="How we handle your data"
            onPress={() => router.push('/privacy-policy')}
          />
          <View style={styles.itemDivider} />
          <SettingsItem
            icon="information-circle-outline"
            label="Health Disclaimer"
            subtitle="GutWell is not a medical device"
            onPress={() =>
              Alert.alert(
                'Health Disclaimer',
                'GutWell is a wellness tracking tool and is not intended to diagnose, treat, cure, or prevent any disease. Always consult your healthcare provider for medical advice.',
                [{ text: 'OK' }],
              )
            }
          />
          <View style={styles.itemDivider} />
          <SettingsItem
            icon="code-slash-outline"
            label="Version"
            subtitle="1.0.0"
            showArrow={false}
            isLast
          />
        </Card>

        {/* Account Section */}
        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.accountActions}>
          <Button
            title="Sign Out"
            onPress={handleSignOut}
            variant="outline"
            size="lg"
            style={styles.signOutButton}
          />
          <TouchableOpacity onPress={handleDeleteAccount} style={styles.deleteButton} disabled={deleting}>
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
        onDismiss={() => setToast(t => ({ ...t, visible: false }))}
      />
    </SafeAreaView>
  );
}

// ─── Settings Item Component ─────────────────────────────────────────────────

function SettingsItem({
  icon,
  label,
  subtitle,
  onPress,
  showArrow = true,
  isLast = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  subtitle: string;
  onPress?: () => void;
  showArrow?: boolean;
  isLast?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.settingsItem, isLast && { paddingBottom: Spacing.xs }]}
      onPress={onPress}
      activeOpacity={onPress ? 0.6 : 1}
      disabled={!onPress}
    >
      <View style={styles.settingsIconCircle}>
        <Ionicons name={icon} size={20} color={Colors.primary} />
      </View>
      <View style={styles.settingsContent}>
        <Text style={styles.settingsLabel}>{label}</Text>
        <Text style={styles.settingsSubtitle}>{subtitle}</Text>
      </View>
      {showArrow && <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} />}
    </TouchableOpacity>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scroll: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  title: {
    fontFamily: FontFamily.displayMedium,
    fontSize: FontSize.xxl,
    color: Colors.text,
    marginBottom: Spacing.lg,
  },

  // User Card
  userCard: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  avatarRing: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 3,
    borderColor: Colors.secondary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitials: {
    fontFamily: FontFamily.displayBold,
    fontSize: 28,
    color: '#FFFFFF',
  },
  userName: {
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xl,
    color: Colors.text,
    marginBottom: 2,
  },
  userEmail: {
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.sm,
    color: Colors.textTertiary,
  },

  // Stats Row
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 0,
    marginVertical: 20,
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: BorderRadius.lg,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignSelf: 'stretch',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statNumber: {
    fontFamily: FontFamily.displayBold,
    fontSize: 26,
    color: Colors.text,
  },
  statLabel: {
    fontFamily: FontFamily.sansRegular,
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 36,
    backgroundColor: Colors.divider,
  },

  // Level Card
  levelCard: {
    alignItems: 'center',
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
    minHeight: 120,
    justifyContent: 'center',
  },

  // Achievements Section
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

  // Section
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
  sectionCard: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: 0,
    overflow: 'hidden',
  },

  // Settings Item
  settingsItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    gap: Spacing.md,
  },
  settingsIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surfaceSecondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  settingsContent: {
    flex: 1,
  },
  settingsLabel: {
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.md,
    color: Colors.text,
  },
  settingsSubtitle: {
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.xs,
    color: Colors.textTertiary,
    marginTop: 1,
  },
  itemDivider: {
    height: 1,
    backgroundColor: Colors.divider,
    marginLeft: Spacing.md + 40 + Spacing.md, // icon offset
    marginRight: Spacing.md,
  },

  // Account Actions
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
