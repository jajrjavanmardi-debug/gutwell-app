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

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [devLoading, setDevLoading] = useState(false);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'error' as const });

  const networkHint =
    "Check .env: EXPO_PUBLIC_SUPABASE_URL must be your real https://…supabase.co URL (no quotes). Restart with: npx expo start -c. Create user dev@gutwell.app in Supabase → Authentication if needed.";

  const handleLogin = async () => {
    if (!email || !password) {
      setToast({ visible: true, message: 'Please fill in all fields', type: 'error' });
      return;
    }
    setLoading(true);
    const { error } = await signIn(email.trim(), password);
    setLoading(false);
    if (error) {
      const msg = error.message ?? String(error);
      setToast({
        visible: true,
        message: /network request failed/i.test(msg) ? `${msg}\n\n${networkHint}` : msg,
        type: 'error',
      });
    } else {
      // Back through the gate: it routes to tabs, or into onboarding if this
      // account never finished it.
      router.replace('/');
    }
  };

  const handleDevLogin = async () => {
    setDevLoading(true);
    const { error } = await signIn('dev@gutwell.app', 'devpass123');
    setDevLoading(false);
    if (error) {
      const msg = error.message ?? String(error);
      setToast({
        visible: true,
        message: /network request failed/i.test(msg) ? `${msg}\n\n${networkHint}` : msg,
        type: 'error',
      });
    } else {
      router.replace('/');
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
              <Text style={styles.title}>Welcome back</Text>
              <Text style={styles.subtitle}>Sign in to pick up your gut health journey.</Text>

              {/* ── Form ── */}
              <View style={styles.form}>
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
                  placeholder="Your password"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoComplete="password"
                />
              </View>

              {/* Forgot password */}
              <Link href="/(auth)/forgot-password" asChild>
                <TouchableOpacity activeOpacity={0.7} style={styles.forgotWrap}>
                  <Text style={styles.forgotText}>Forgot password?</Text>
                </TouchableOpacity>
              </Link>

              {/* Primary CTA */}
              <Button
                title="Sign In"
                onPress={handleLogin}
                loading={loading}
                size="lg"
                shape="pill"
                fullWidth
                style={styles.cta}
              />

              {/* Secondary link */}
              <View style={styles.switchRow}>
                <Text style={styles.switchText}>Don&apos;t have an account? </Text>
                <Link href="/(auth)/signup" asChild>
                  <TouchableOpacity activeOpacity={0.7}>
                    <Text style={styles.switchLink}>Sign Up</Text>
                  </TouchableOpacity>
                </Link>
              </View>

              {/* ── Dev login ── */}
              {__DEV__ && (
                <Button
                  title={devLoading ? 'Signing in…' : 'Dev Login'}
                  onPress={handleDevLogin}
                  loading={devLoading}
                  variant="ghost"
                  size="sm"
                  style={styles.devButton}
                  textStyle={styles.devButtonText}
                />
              )}
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
  forgotWrap: {
    alignSelf: 'flex-end',
    marginTop: Spacing.md,
  },
  forgotText: {
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.sm,
    color: 'rgba(255,255,255,0.7)',
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
  devButton: {
    marginTop: Spacing.md,
  },
  devButtonText: {
    color: 'rgba(255,255,255,0.5)',
  },
});
