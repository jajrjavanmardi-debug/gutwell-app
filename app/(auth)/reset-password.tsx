import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Toast } from '../../components/ui/Toast';
import { Colors, Spacing, FontSize, FontFamily } from '../../constants/theme';
import { useTranslation } from '../../lib/i18n';

/**
 * New Password screen — the destination of the password-recovery deep link.
 *
 * By the time this screen mounts, the recovery session has already been
 * established (app/_layout.tsx consumes the link and calls setSession or
 * verifyOtp). If no session is present the link was invalid or expired, so the
 * screen says so instead of silently failing on submit.
 *
 * After a successful update the recovery session is torn down deliberately:
 * a password change should end in a fresh, explicit sign-in.
 */
export default function ResetPasswordScreen() {
  const t = useTranslation();
  const { updatePassword, session, loading, setPasswordRecovery } = useAuth();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [linkValid, setLinkValid] = useState<boolean | null>(null);
  const [toast, setToast] = useState({
    visible: false,
    message: '',
    type: 'info' as 'success' | 'error' | 'info',
  });

  useEffect(() => {
    if (loading) return;
    setLinkValid(Boolean(session));
  }, [loading, session]);

  const handleSave = async () => {
    if (!newPassword || !confirmPassword) {
      setToast({ visible: true, message: t.resetPassword.fillAllFields, type: 'error' });
      return;
    }
    if (newPassword.length < 6) {
      setToast({ visible: true, message: t.resetPassword.tooShort, type: 'error' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setToast({ visible: true, message: t.resetPassword.mismatch, type: 'error' });
      return;
    }
    if (!session) {
      setToast({ visible: true, message: t.resetPassword.invalidLink, type: 'error' });
      return;
    }

    setSaving(true);
    const { error } = await updatePassword(newPassword);
    setSaving(false);

    if (error) {
      // Surface a safe, localized message rather than the raw API string.
      setToast({ visible: true, message: t.resetPassword.errorMessage, type: 'error' });
      return;
    }

    setToast({ visible: true, message: t.resetPassword.successMessage, type: 'success' });
    setPasswordRecovery(false);
    // End the recovery session so the user signs in fresh with the new password.
    await supabase.auth.signOut().catch(() => {});
    setTimeout(() => router.replace('/(auth)/login'), 900);
  };

  const goToSignIn = () => {
    setPasswordRecovery(false);
    supabase.auth.signOut().catch(() => {});
    router.replace('/(auth)/login');
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <LinearGradient colors={['#0B1F14', '#1B4332']} style={StyleSheet.absoluteFill} />

      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.inner}>
              <View style={styles.iconCircle}>
                <Ionicons name="key" size={30} color="#FFFFFF" />
              </View>

              <Text style={styles.title}>{t.resetPassword.title}</Text>
              <Text style={styles.subtitle}>
                {linkValid === false ? t.resetPassword.invalidLink : t.resetPassword.subtitle}
              </Text>

              {linkValid !== false && (
                <>
                  <View style={styles.form}>
                    <Input
                      label={t.resetPassword.newPasswordLabel}
                      placeholder={t.resetPassword.newPasswordPlaceholder}
                      value={newPassword}
                      onChangeText={setNewPassword}
                      secureTextEntry
                      autoCapitalize="none"
                      textContentType="newPassword"
                    />
                    <Input
                      label={t.resetPassword.confirmPasswordLabel}
                      placeholder={t.resetPassword.confirmPasswordPlaceholder}
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      secureTextEntry
                      autoCapitalize="none"
                      textContentType="newPassword"
                    />
                  </View>

                  <Button
                    title={saving ? t.resetPassword.saving : t.resetPassword.saveButton}
                    onPress={handleSave}
                    loading={saving}
                    size="lg"
                    shape="pill"
                    fullWidth
                    style={styles.cta}
                    accessibilityLabel={t.resetPassword.accessSaveButton}
                  />
                </>
              )}

              <View style={styles.switchRow}>
                <TouchableOpacity activeOpacity={0.7} onPress={goToSignIn}>
                  <Text style={styles.switchLink}>{t.resetPassword.backToSignIn}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      <Toast
        message={toast.message}
        type={toast.type}
        visible={toast.visible}
        onDismiss={() => setToast((prev) => ({ ...prev, visible: false }))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1 },
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: Spacing.xl,
  },
  inner: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    alignItems: 'center',
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  title: {
    fontFamily: FontFamily.displayBold,
    fontSize: 34,
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.md,
    color: 'rgba(255,255,255,0.65)',
    textAlign: 'center',
    marginTop: Spacing.sm,
    marginBottom: Spacing.xl,
    lineHeight: 22,
  },
  form: {
    width: '100%',
    gap: Spacing.md,
  },
  cta: {
    marginTop: Spacing.lg,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.lg,
  },
  switchLink: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
    color: Colors.secondary,
  },
});
