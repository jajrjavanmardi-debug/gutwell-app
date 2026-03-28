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

export default function ProfileScreen() {
  const { user, profile, signOut } = useAuth();
  const [toast, setToast] = useState({ visible: false, message: '', type: 'info' as 'success' | 'error' | 'info' });
  const [deleting, setDeleting] = useState(false);
  const [totalPoints, setTotalPoints] = useState(0);
  const [loadingStats, setLoadingStats] = useState(true);

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

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <Text style={styles.title}>Profile</Text>

        {/* User Card */}
        <Card style={styles.userCard} variant="elevated">
          <View style={styles.avatarOuter}>
            <View style={styles.avatarInner}>
              <Ionicons name="person" size={36} color={Colors.surface} />
            </View>
          </View>
          <Text style={styles.userName}>{profile?.display_name || 'User'}</Text>
          <Text style={styles.userEmail}>{user?.email}</Text>
        </Card>

        {/* Gut Level Badge */}
        <Card style={styles.levelCard} variant="elevated">
          {loadingStats ? (
            <ActivityIndicator size="small" color={Colors.secondary} />
          ) : (
            <GutLevelBadge totalPoints={totalPoints} />
          )}
        </Card>

        {/* Settings Section */}
        <Text style={styles.sectionTitle}>Settings</Text>
        <Card style={styles.sectionCard} variant="elevated">
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
  avatarOuter: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 3,
    borderColor: Colors.secondary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  avatarInner: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
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

  // Level Card
  levelCard: {
    alignItems: 'center',
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
    minHeight: 120,
    justifyContent: 'center',
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
