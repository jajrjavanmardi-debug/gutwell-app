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
  const [toast, setToast] = useState({ visible: false, message: '', type: 'error' as const });

  const handleLogin = async () => {
    if (!email || !password) {
      setToast({ visible: true, message: 'Please fill in all fields', type: 'error' });
      return;
    }
    setLoading(true);
    const { error } = await signIn(email.trim(), password);
    setLoading(false);
    if (error) {
      setToast({ visible: true, message: error.message, type: 'error' });
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
              <Ionicons name="leaf" size={40} color="white" />
            </View>
            <Text style={styles.appName}>GutWell</Text>
            <Text style={styles.tagline}>Understand your gut. Feel your best.</Text>
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
          <Text style={styles.formTitle}>Welcome back</Text>

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
            <Button
              title="Sign In"
              onPress={handleLogin}
              loading={loading}
              size="lg"
            />
          </View>

          {/* ── Links ── */}
          <View style={styles.footer}>
            <Link href="/(auth)/forgot-password" asChild>
              <TouchableOpacity activeOpacity={0.7}>
                <Text style={styles.forgotText}>Forgot password?</Text>
              </TouchableOpacity>
            </Link>

            <View style={styles.signupRow}>
              <Text style={styles.footerText}>Don't have an account? </Text>
              <Link href="/(auth)/signup" asChild>
                <TouchableOpacity activeOpacity={0.7}>
                  <Text style={styles.signupLink}>Sign Up</Text>
                </TouchableOpacity>
              </Link>
            </View>
          </View>

          {/* ── Dev login ── */}
          {__DEV__ && (
            <Button
              title={loading ? 'Signing in…' : 'Dev Login'}
              onPress={async () => {
                setLoading(true);
                const { error } = await signIn('dev@gutwell.app', 'devpass123');
                setLoading(false);
                if (error) {
                  const isNetwork = /network|fetch|ECONNREFUSED/i.test(error.message);
                  setToast({
                    visible: true,
                    type: 'error',
                    message: isNetwork
                      ? `${error.message}\n\nChecklist:\n• Set EXPO_PUBLIC_SUPABASE_URL in .env (no quotes)\n• npx expo start -c\n• Add dev@gutwell.app user in Supabase`
                      : error.message,
                  });
                }
              }}
              variant="ghost"
              size="sm"
              loading={loading}
              style={{ marginTop: Spacing.lg }}
            />
          )}
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
  formTitle: {
    fontFamily: FontFamily.displayBold,
    fontSize: 28,
    color: Colors.primary,
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
    gap: Spacing.md,
  },
  forgotText: {
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  signupRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  footerText: {
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  signupLink: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
    color: Colors.secondary,
  },
});
