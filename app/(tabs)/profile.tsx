import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { exportUserData } from '../../lib/export';
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
import { LoadingSkeleton } from '../../components/ui/LoadingSkeleton';
import { calculatePoints } from '../../lib/levels';
import { getStreakSnapshot } from '../../lib/streaks';
import { isPremium, isMonetizationEnabled } from '../../lib/subscription';

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
  const [premium, setPremium] = useState(false);

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

  useEffect(() => {
    let active = true;
    isPremium()
      .then((p) => {
        if (active) setPremium(p);
      })
      .catch(() => {
        /* treat as non-premium */
      });
    return () => {
      active = false;
    };
  }, [user]);

  const loadStats = async () => {
    if (!user) return;
    setLoadingStats(true);
    try {
      const [checkInsRes, foodLogsRes, symptomLogsRes, streakSnapshot] = await Promise.all([
        supabase.from('check_ins').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
        supabase.from('food_logs').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
        supabase.from('symptoms').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
        getStreakSnapshot(user.id),
      ]);

      const [ci, fl, sl] = [checkInsRes, foodLogsRes, symptomLogsRes];
      setAccountStats({ checkIns: ci.count || 0, meals: fl.count || 0, symptoms: sl.count || 0 });

      const points = calculatePoints({
        checkIns: checkInsRes.count ?? 0,
        foodLogs: foodLogsRes.count ?? 0,
        symptomLogs: symptomLogsRes.count ?? 0,
        currentStreak: streakSnapshot.currentStreak ?? 0,
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
                type: 'error',
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

  const handleSupport = () =>
    Linking.openURL('mailto:support@theparallellab.com?subject=GutWell%20Support');

  const handleDisclaimer = () =>
    Alert.alert(
      'Health Disclaimer',
      'GutWell is a wellness tracking tool and is not intended to diagnose, treat, cure, or prevent any disease. Always consult your healthcare provider for medical advice.',
      [{ text: 'OK' }],
    );

  const planLabel = premium ? 'Premium' : 'Free plan';

  return (
    <SafeAreaView style={styles.outerContainer} edges={['top']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Title ── */}
        <Text style={styles.title}>Profile</Text>

        {/* ── Account header card ── */}
        <TouchableOpacity
          style={styles.headerCard}
          activeOpacity={0.7}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push('/edit-profile');
          }}
          accessibilityRole="button"
          accessibilityLabel="Edit profile"
        >
          <View style={[styles.headerAvatar, { backgroundColor: avatarColor }]}>
            <Text style={styles.headerAvatarText}>{initials}</Text>
          </View>
          <View style={styles.headerInfo}>
            <View style={styles.planRow}>
              <Ionicons
                name={premium ? 'star' : 'leaf'}
                size={12}
                color={Colors.accent}
              />
              <Text style={styles.planLabel}>{planLabel}</Text>
            </View>
            <Text style={styles.headerName} numberOfLines={1}>
              {profile?.display_name || 'Set your name'}
            </Text>
            <Text style={styles.headerHint}>Tap to edit profile</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} />
        </TouchableOpacity>

        {/* ── Gut Level (points / level) ── */}
        <View style={styles.levelCard}>
          {loadingStats ? (
            <LoadingSkeleton width={80} height={20} borderRadius={10} />
          ) : (
            <GutLevelBadge totalPoints={totalPoints} />
          )}
        </View>

        {/* ── Stats row ── */}
        <View style={styles.statsRow}>
          <StatCard value={accountStats.checkIns} label="Check-ins" />
          <StatCard value={accountStats.meals} label="Meals" />
          <StatCard value={accountStats.symptoms} label="Symptoms" />
        </View>

        {/* ── Account section ── */}
        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.listCard}>
          <ListRow
            icon="person-outline"
            label="Personal Details"
            onPress={() => router.push('/edit-profile')}
          />
          <Divider />
          <ListRow
            icon="options-outline"
            label="Preferences"
            onPress={() => router.push('/settings')}
          />
          <Divider />
          <ListRow
            icon="lock-closed-outline"
            label="Change Password"
            onPress={() => router.push('/change-password')}
            isLast
          />
        </View>

        {/* ── Goals & Tracking section ── */}
        <Text style={styles.sectionTitle}>Goals & Tracking</Text>
        <View style={styles.listCard}>
          <ListRow
            icon="trending-up-outline"
            label="Progress & Insights"
            onPress={() => router.push('/progress')}
          />
          <Divider />
          <ListRow
            icon="restaurant-outline"
            label="Food History"
            onPress={() => router.push('/food-history')}
          />
          <Divider />
          <ListRow
            icon="notifications-outline"
            label="Reminders"
            onPress={() => router.push('/reminders')}
            isLast={!(isMonetizationEnabled() && !premium)}
          />
          {isMonetizationEnabled() && !premium ? (
            <>
              <Divider />
              <ListRow
                icon="star-outline"
                label="Upgrade to Premium"
                onPress={() => router.push('/paywall')}
                isLast
              />
            </>
          ) : null}
        </View>

        {/* ── Widgets preview (static, presentational) ── */}
        <Text style={styles.sectionTitle}>Widgets</Text>
        <View style={styles.widgetCard}>
          <View style={styles.widgetPreview}>
            <Text style={styles.widgetValue}>{accountStats.checkIns}</Text>
            <Text style={styles.widgetCaption}>check-ins</Text>
          </View>
          <View style={[styles.widgetPreview, styles.widgetPreviewAlt]}>
            <Ionicons name="leaf" size={26} color={Colors.secondary} />
            <Text style={styles.widgetCaption}>Gutwell</Text>
          </View>
          <View style={styles.widgetHintWrap}>
            <Text style={styles.widgetHint}>
              Add a Gutwell widget from your Home Screen to glance at your daily progress.
            </Text>
          </View>
        </View>

        {/* ── Support & Legal section ── */}
        <Text style={styles.sectionTitle}>Support & Legal</Text>
        <View style={styles.listCard}>
          <ListRow
            icon="mail-outline"
            label="Support Email"
            onPress={handleSupport}
          />
          <Divider />
          <ListRow
            icon="download-outline"
            label="Export Data"
            onPress={handleExport}
          />
          <Divider />
          <ListRow
            icon="shield-checkmark-outline"
            label="Privacy Policy"
            onPress={() => router.push('/privacy-policy')}
          />
          <Divider />
          <ListRow
            icon="document-text-outline"
            label="Terms of Service"
            onPress={() => router.push('/terms-of-service')}
          />
          <Divider />
          <ListRow
            icon="information-circle-outline"
            label="Health Disclaimer"
            onPress={handleDisclaimer}
            isLast
          />
        </View>

        {/* ── Follow Us section ── */}
        <Text style={styles.sectionTitle}>Follow Us</Text>
        <View style={styles.listCard}>
          <ListRow
            icon="logo-instagram"
            label="Instagram"
            onPress={() => Linking.openURL('https://instagram.com')}
          />
          <Divider />
          <ListRow
            icon="logo-tiktok"
            label="TikTok"
            onPress={() => Linking.openURL('https://tiktok.com')}
          />
          <Divider />
          <ListRow
            icon="logo-twitter"
            label="X"
            onPress={() => Linking.openURL('https://x.com')}
            isLast
          />
        </View>

        {/* ── Account Actions section ── */}
        <Text style={styles.sectionTitle}>Account Actions</Text>
        <View style={styles.listCard}>
          <ListRow
            icon="log-out-outline"
            label="Logout"
            onPress={handleSignOut}
          />
          <Divider />
          <ListRow
            icon="person-remove-outline"
            label={deleting ? 'Deleting…' : 'Delete Account'}
            onPress={deleting ? undefined : handleDeleteAccount}
            destructive
            showArrow={false}
            isLast
          />
        </View>

        <Text style={styles.versionText}>Version 1.0.0</Text>

        <View style={{ height: Spacing.xxl }} />
      </ScrollView>

      <Toast
        message={toast.message}
        type={toast.type}
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

// ─── Divider ─────────────────────────────────────────────────────────────────

function Divider() {
  return <View style={styles.listDivider} />;
}

// ─── List Row ────────────────────────────────────────────────────────────────

function ListRow({
  icon,
  label,
  onPress,
  showArrow = true,
  isLast = false,
  destructive = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress?: () => void;
  showArrow?: boolean;
  isLast?: boolean;
  destructive?: boolean;
}) {
  const tint = destructive ? Colors.error : Colors.secondary;
  return (
    <TouchableOpacity
      style={[styles.listRow, isLast && styles.listRowLast]}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress?.();
      }}
      activeOpacity={onPress ? 0.6 : 1}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={[styles.listRowIconCircle, { backgroundColor: tint + '1A' }]}>
        <Ionicons name={icon} size={18} color={tint} />
      </View>
      <Text style={[styles.listRowLabel, destructive && styles.listRowLabelDestructive]}>
        {label}
      </Text>
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

  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },

  // ── Title
  title: {
    fontFamily: FontFamily.displayBold,
    fontSize: 32,
    color: Colors.text,
    marginTop: Spacing.md,
    marginBottom: Spacing.lg,
  },

  // ── Account header card
  headerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    ...Shadows.md,
  },
  headerAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerAvatarText: {
    fontFamily: FontFamily.displayBold,
    fontSize: 20,
    color: '#FFFFFF',
  },
  headerInfo: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  planLabel: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: 12,
    color: Colors.accent,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  headerName: {
    fontFamily: FontFamily.sansBold,
    fontSize: 18,
    color: Colors.text,
  },
  headerHint: {
    fontFamily: FontFamily.sansRegular,
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 1,
  },

  // ── Level card
  levelCard: {
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 16,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    minHeight: 120,
    justifyContent: 'center',
    ...Shadows.sm,
  },

  // ── Stats row
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: Spacing.md,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 14,
    alignItems: 'center',
    ...Shadows.sm,
  },
  statNumber: {
    fontFamily: FontFamily.sansBold,
    fontSize: 22,
    color: Colors.secondary,
  },
  statLabel: {
    fontFamily: FontFamily.sansRegular,
    fontSize: 11,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 4,
  },

  // ── Section title
  sectionTitle: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: Spacing.sm,
    marginTop: Spacing.lg,
    paddingLeft: Spacing.xs,
  },

  // ── List card (grouped rows)
  listCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    overflow: 'hidden',
    ...Shadows.sm,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  listRowLast: {
    // no extra style; divider omitted on last row
  },
  listRowIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  listRowLabel: {
    flex: 1,
    fontFamily: FontFamily.sansMedium,
    fontSize: 15,
    color: Colors.text,
  },
  listRowLabelDestructive: {
    color: Colors.error,
  },
  listDivider: {
    height: 1,
    backgroundColor: Colors.divider,
    marginLeft: 64, // 16 padding + 34 icon + 14 gap
    marginRight: 16,
  },

  // ── Widgets preview
  widgetCard: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: Spacing.md,
    ...Shadows.sm,
  },
  widgetPreview: {
    width: 96,
    height: 96,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.surfaceSecondary,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 2,
  },
  widgetPreviewAlt: {
    backgroundColor: Colors.primary + '22',
  },
  widgetValue: {
    fontFamily: FontFamily.sansBold,
    fontSize: 26,
    color: Colors.secondary,
  },
  widgetCaption: {
    fontFamily: FontFamily.sansRegular,
    fontSize: 11,
    color: Colors.textSecondary,
  },
  widgetHintWrap: {
    flex: 1,
    minWidth: 120,
    justifyContent: 'center',
  },
  widgetHint: {
    fontFamily: FontFamily.sansRegular,
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 17,
  },

  // ── Version
  versionText: {
    fontFamily: FontFamily.sansRegular,
    fontSize: 12,
    color: Colors.textTertiary,
    textAlign: 'center',
    marginTop: Spacing.lg,
  },
});
