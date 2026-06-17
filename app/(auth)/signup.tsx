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
import { Link, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../../contexts/AuthContext';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Toast } from '../../components/ui/Toast';
import { Colors, Spacing, FontSize, FontFamily } from '../../constants/theme';
import { track, Events } from '../../lib/analytics';

export default function SignupScreen() {
  const { signUp } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'error' as 'success' | 'error' });

  const handleSignup = async () => {
    if (!name || !email || !password) {
      setToast({ visible: true, message: 'Please fill in all fields', type: 'error' });
      return;
    }
    if (password !== confirmPassword) {
      setToast({ visible: true, message: 'Passwords do not match', type: 'error' });
      return;
    }
    if (password.length < 6) {
      setToast({ visible: true, message: 'Password must be at least 6 characters', type: 'error' });
      return;
    }
    if (!termsAccepted) {
      setToast({ visible: true, message: 'Please accept the Terms of Service', type: 'error' });
      return;
    }
    setLoading(true);
    const { error } = await signUp(email.trim(), password, name.trim());
    setLoading(false);
    if (error) {
      setToast({ visible: true, message: error.message, type: 'error' });
    } else {
      track(Events.SIGNUP_COMPLETED);
      setToast({ visible: true, message: 'Welcome to GutWell!', type: 'success' });
      // Auto-confirm is on, so a session exists now — finish onboarding
      // (notification opt-in + profile save) before entering the app.
      setTimeout(() => router.replace('/(onboarding)/notifications'), 600);
    }
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
                <Ionicons name="leaf" size={32} color="#FFFFFF" />
              </View>

              {/* Title + subtitle */}
              <Text style={styles.title}>Create your account</Text>
              <Text style={styles.subtitle}>Start tracking your gut health in minutes.</Text>

              {/* ── Form ── */}
              <View style={styles.form}>
                <Input
                  label="Name"
                  placeholder="Your name"
                  value={name}
                  onChangeText={setName}
                  autoCapitalize="words"
                  autoComplete="name"
                />
                <Input
                  label="Email"
                  placeholder="you@example.com"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                />
                <Input
                  label="Password"
                  placeholder="At least 6 characters"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                />
                <Input
                  label="Confirm Password"
                  placeholder="Repeat your password"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry
                />

                {/* Terms checkbox */}
                <TouchableOpacity
                  style={styles.termsRow}
                  onPress={() => setTermsAccepted(!termsAccepted)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.checkbox, termsAccepted && styles.checkboxChecked]}>
                    {termsAccepted && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
                  </View>
                  <Text style={styles.termsText}>
                    I agree to the{' '}
                    <Text
                      style={styles.termsLink}
                      onPress={() => router.push('/terms-of-service')}
                    >
                      Terms of Service
                    </Text>
                    {' '}and{' '}
                    <Text
                      style={styles.termsLink}
                      onPress={() => router.push('/privacy-policy')}
                    >
                      Privacy Policy
                    </Text>
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Primary CTA */}
              <Button
                title="Create Account"
                onPress={handleSignup}
                loading={loading}
                size="lg"
                shape="pill"
                fullWidth
                style={styles.cta}
              />

              {/* Secondary link */}
              <View style={styles.switchRow}>
                <Text style={styles.switchText}>Already have an account? </Text>
                <Link href="/(auth)/login" asChild>
                  <TouchableOpacity activeOpacity={0.7}>
                    <Text style={styles.switchLink}>Sign In</Text>
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
  },
  form: {
    width: '100%',
    gap: Spacing.md,
  },

  // ── Terms checkbox ──
  termsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 4,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 1,
  },
  checkboxChecked: {
    backgroundColor: Colors.secondary,
    borderColor: Colors.secondary,
  },
  termsText: {
    flex: 1,
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.sm,
    color: 'rgba(255,255,255,0.65)',
    lineHeight: 20,
  },
  termsLink: {
    fontFamily: FontFamily.sansSemiBold,
    color: Colors.secondary,
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
  switchText: {
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.sm,
    color: 'rgba(255,255,255,0.55)',
  },
  switchLink: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
    color: Colors.secondary,
  },
});
