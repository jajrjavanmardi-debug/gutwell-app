import React, { useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { Link } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Toast } from '../../components/ui/Toast';
import { Colors, Spacing, FontSize } from '../../constants/theme';

export default function SignupScreen() {
  const { signUp } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'error' as const });

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
    setLoading(true);
    const { error } = await signUp(email.trim(), password, name.trim());
    setLoading(false);
    if (error) {
      setToast({ visible: true, message: error.message, type: 'error' });
    } else {
      setToast({ visible: true, message: 'Account created! Please check your email to verify.', type: 'success' });
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={styles.title}>Create Account</Text>
          <Text style={styles.subtitle}>Take control of your digestive health</Text>
        </View>

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
          <Button
            title="Create Account"
            onPress={handleSignup}
            loading={loading}
            size="lg"
          />
        </View>

        <View style={styles.footer}>
          <View style={styles.row}>
            <Text style={styles.footerText}>Already have an account? </Text>
            <Link href="/(auth)/login" style={styles.link}>
              Sign in
            </Link>
          </View>
        </View>
      </ScrollView>
      <Toast
        message={toast.message}
        type={toast.type}
        visible={toast.visible}
        onDismiss={() => setToast(t => ({ ...t, visible: false }))}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: Spacing.lg },
  header: { alignItems: 'center', marginBottom: Spacing.xl },
  title: { fontSize: FontSize.xxl, fontWeight: '700', color: Colors.text },
  subtitle: { fontSize: FontSize.md, color: Colors.textSecondary, marginTop: Spacing.xs },
  form: { gap: Spacing.md },
  footer: { alignItems: 'center', marginTop: Spacing.xl },
  row: { flexDirection: 'row' },
  footerText: { fontSize: FontSize.sm, color: Colors.textSecondary },
  link: { fontSize: FontSize.sm, color: Colors.primary, fontWeight: '600' },
});
