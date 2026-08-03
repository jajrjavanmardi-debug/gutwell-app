import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../../contexts/AuthContext';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Toast } from '../../components/ui/Toast';
import { Colors, Spacing, FontSize, FontFamily } from '../../constants/theme';
import { useTranslation } from '../../lib/i18n';

export default function ForgotPasswordScreen() {
  const t = useTranslation();
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'info' as 'success' | 'error' | 'info' });

  const handleReset = async () => {
    const trimmed = email.trim();
    if (!trimmed) {
      setToast({ visible: true, message: t.forgotPassword.fillEmail, type: 'error' });
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(trimmed)) {
      setToast({ visible: true, message: t.forgotPassword.invalidEmail, type: 'error' });
      return;
    }

    setLoading(true);
    const { error } = await resetPassword(trimmed);
    setLoading(false);

    if (error) {
      // Show a safe, localized message. The raw Supabase error is never
      // surfaced: it can distinguish a real account from an unknown one and
      // may echo request details back to the user.
      setToast({ visible: true, message: t.forgotPassword.errorMessage, type: 'error' });
      return;
    }

    // Privacy-safe: this wording does not confirm whether an account exists.
    setToast({ visible: true, message: t.forgotPassword.successMessage, type: 'success' });
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
              {/* Brand mark */}
              <View style={styles.iconCircle}>
                <Ionicons name="lock-closed" size={30} color="#FFFFFF" />
              </View>

              {/* Title + subtitle */}
              <Text style={styles.title}>{t.forgotPassword.title}</Text>
              <Text style={styles.subtitle}>
                {t.forgotPassword.subtitle}
              </Text>

              {/* ── Form ── */}
              <View style={styles.form}>
                <Input
                  label={t.forgotPassword.emailLabel}
                  placeholder={t.forgotPassword.emailPlaceholder}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>

              {/* Primary CTA */}
              <Button
                title={t.forgotPassword.sendButton}
                onPress={handleReset}
                loading={loading}
                size="lg"
                shape="pill"
                fullWidth
                style={styles.cta}
              />

              {/* Secondary link */}
              <View style={styles.switchRow}>
                <Link href="/(auth)/login" asChild>
                  <TouchableOpacity activeOpacity={0.7}>
                    <Text style={styles.switchLink}>{t.forgotPassword.backToSignIn}</Text>
                  </TouchableOpacity>
                </Link>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      <Toast
        message={toast.message}
        type={toast.type}
        visible={toast.visible}
        onDismiss={() => setToast((t) => ({ ...t, visible: false }))}
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
    fontSize: 36,
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
