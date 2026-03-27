import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { exportUserData } from '../../lib/export';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Toast } from '../../components/ui/Toast';
import { Colors, Spacing, FontSize, BorderRadius } from '../../constants/theme';

export default function ProfileScreen() {
  const { user, profile, signOut } = useAuth();
  const [toast, setToast] = useState({ visible: false, message: '', type: 'info' as const });
  const [deleting, setDeleting] = useState(false);

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

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Profile</Text>

        <Card style={styles.userCard} variant="elevated">
          <View style={styles.avatar}>
            <Ionicons name="person" size={36} color={Colors.primary} />
          </View>
          <Text style={styles.userName}>{profile?.display_name || 'User'}</Text>
          <Text style={styles.userEmail}>{user?.email}</Text>
        </Card>

        <Text style={styles.sectionTitle}>Settings</Text>
        <SettingsItem icon="notifications" label="Reminders" subtitle="Set daily check-in reminders" onPress={() => router.push('/reminders')} />
        <SettingsItem icon="download" label="Export Data" subtitle="Download your data as CSV" onPress={async () => {
          if (!user) return;
          try {
            await exportUserData(user.id);
          } catch {
            setToast({ visible: true, message: 'Failed to export data', type: 'error' });
          }
        }} />

        <Text style={styles.sectionTitle}>About</Text>
        <SettingsItem icon="shield-checkmark" label="Privacy Policy" subtitle="How we handle your data" onPress={() => router.push('/privacy-policy')} />
        <SettingsItem icon="information-circle" label="Health Disclaimer" subtitle="GutWell is not a medical device" onPress={() => Alert.alert('Health Disclaimer', 'GutWell is a wellness tracking tool and is not intended to diagnose, treat, cure, or prevent any disease. Always consult your healthcare provider for medical advice.', [{ text: 'OK' }])} />
        <SettingsItem icon="code-slash" label="Version" subtitle="1.0.0" showArrow={false} />

        <Text style={styles.sectionTitle}>Account</Text>
        <Button title="Sign Out" onPress={handleSignOut} variant="outline" size="lg" style={{ marginBottom: Spacing.md }} />
        <Button title={deleting ? 'Deleting...' : 'Delete Account'} onPress={handleDeleteAccount} variant="ghost" size="md" loading={deleting} style={{ marginBottom: Spacing.xxl }} />
      </ScrollView>
      <Toast message={toast.message} type={toast.type as any} visible={toast.visible} onDismiss={() => setToast(t => ({ ...t, visible: false }))} />
    </SafeAreaView>
  );
}

function SettingsItem({ icon, label, subtitle, onPress, showArrow = true }: { icon: keyof typeof Ionicons.glyphMap; label: string; subtitle: string; onPress?: () => void; showArrow?: boolean }) {
  return (
    <TouchableOpacity style={styles.settingsItem} onPress={onPress} activeOpacity={onPress ? 0.6 : 1} disabled={!onPress}>
      <View style={styles.settingsIcon}><Ionicons name={icon} size={22} color={Colors.primary} /></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.settingsLabel}>{label}</Text>
        <Text style={styles.settingsSubtitle}>{subtitle}</Text>
      </View>
      {showArrow && <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} />}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: Spacing.lg, paddingBottom: Spacing.xxl },
  title: { fontSize: FontSize.xxl, fontWeight: '700', color: Colors.text, marginBottom: Spacing.lg },
  userCard: { alignItems: 'center', padding: Spacing.xl, marginBottom: Spacing.lg },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: Colors.surfaceSecondary, justifyContent: 'center', alignItems: 'center', marginBottom: Spacing.md },
  userName: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.text },
  userEmail: { fontSize: FontSize.sm, color: Colors.textTertiary, marginTop: 2 },
  sectionTitle: { fontSize: FontSize.lg, fontWeight: '600', color: Colors.text, marginTop: Spacing.lg, marginBottom: Spacing.sm },
  settingsItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.sm, gap: Spacing.md },
  settingsIcon: { width: 40, height: 40, borderRadius: BorderRadius.sm, backgroundColor: Colors.surfaceSecondary, justifyContent: 'center', alignItems: 'center' },
  settingsLabel: { fontSize: FontSize.md, fontWeight: '500', color: Colors.text },
  settingsSubtitle: { fontSize: FontSize.xs, color: Colors.textTertiary, marginTop: 1 },
});
