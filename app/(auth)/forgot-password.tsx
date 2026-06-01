import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Toast } from '../../components/ui/Toast';
import { Colors, Spacing, FontSize, FontFamily } from '../../constants/theme';

export default function ForgotPasswordScreen() {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'info' as 'success' | 'error' | 'info' });

  const handleReset = async () => {
    if (!email) {
      setToast({ visible: true, message: 'Please enter your email', type: 'error' });
      return;
    }
    setLoading(true);
    const { error } = await resetPassword(email.trim());
    setLoading(false);
    if (error) {
      setToast({ visible: true, message: error.message, type: 'error' });
    } else {
      setToast({ visible: true, message: 'Check your email for a reset link!', type: 'success' });
    }
  };

  return (
    <View style={styles.container}>
      {/* Dark gradient header */}
      <LinearGradient
        colors={['#0B1F14', '#1B4332']}
        style={styles.header}
      >
        <SafeAreaView edges={['top']}>
          <View style={styles.logoSection}>
            <View style={styles.logoCircle}>
              <Ionicons name="lock-closed" size={36} color="white" />
            </View>
            <Text style={styles.appName}>GutWell</Text>
            <Text style={styles.tagline}>Reset Password</Text>
          </View>
        </SafeAreaView>
      </LinearGradient>

      {/* White form card — rises over gradient with rounded top corners */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          style={styles.formCard}
          contentContainerStyle={styles.formScroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.formInner}>
            <Text style={styles.formTitle}>Forgot your password?</Text>
            <Text style={styles.subtitle}>
              Enter your email and we'll send you a link to reset your password.
            </Text>

            {/* ── Form ── */}
            <View style={styles.form}>
              <Input
                label="Email"
                placeholder="you@example.com"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
              <Button
                title="Send Reset Link"
                onPress={handleReset}
                loading={loading}
                size="lg"
              />
            </View>

            {/* ── Footer ── */}
            <View style={styles.footer}>
              <Link href="/(auth)/login" style={styles.backLink}>
                Back to Sign In
              </Link>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

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
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  // ── Gradient header ──
  header: {
    paddingBottom: 32,
  },
  logoSection: {
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: 20,
    paddingBottom: 8,
    gap: 8,
  },
  logoCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  appName: {
    fontFamily: FontFamily.displayBold,
    fontSize: 42,
    color: 'white',
  },
  tagline: {
    color: 'rgba(255,255,255,0.65)',
    fontFamily: FontFamily.sansRegular,
    fontSize: 14,
    textAlign: 'center',
  },

  // ── White form card ──
  formCard: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    marginTop: -20,
    flex: 1,
  },
  formScroll: {
    padding: 28,
    paddingTop: 24,
    paddingBottom: 40,
  },
  formInner: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
  },
  formTitle: {
    fontFamily: FontFamily.displayBold,
    fontSize: 28,
    color: Colors.primary,
    marginBottom: 8,
  },
  subtitle: {
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    lineHeight: 22,
    marginBottom: 20,
  },

  // ── Form ──
  form: {
    gap: Spacing.md,
  },

  // ── Footer ──
  footer: {
    alignItems: 'center',
    marginTop: Spacing.xl,
  },
  backLink: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
    color: Colors.secondary,
    textAlign: 'center',
  },
});
