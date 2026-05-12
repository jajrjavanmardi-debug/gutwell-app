import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../../contexts/AuthContext';
import {
  APP_LANGUAGE_STORAGE_KEY,
  isRtlLanguage,
  parseStoredLanguage,
  type AppLanguage,
} from '../../lib/app-language';
import { supabase } from '../../lib/supabase';

const COPY = {
  en: {
    eyebrow: 'NutriFlow account',
    title: 'Save your gut profile',
    subtitle: 'Create an account or sign in to sync your profile, onboarding answers, and meal history.',
    guestTitle: 'Continue as Guest',
    guestSubtitle: 'Demo Mode – data stored locally',
    signIn: 'Sign in',
    signUp: 'Create account',
    name: 'Display name',
    email: 'Email',
    password: 'Password',
    forgotPassword: 'Send password reset',
    resetSent: 'Password reset email sent.',
    loading: 'Checking session...',
    submitSignIn: 'Sign in',
    submitSignUp: 'Create account',
    needAccount: 'Need an account?',
    haveAccount: 'Already have an account?',
    switchToSignUp: 'Create one',
    switchToSignIn: 'Sign in',
    checkEmail: 'Account created. If your project requires email confirmation, verify your email, then sign in.',
    genericError: 'Authentication failed. Please try again.',
    guestError: 'Could not start guest mode. Please try again.',
  },
  de: {
    eyebrow: 'NutriFlow Konto',
    title: 'Speichere dein Darmprofil',
    subtitle: 'Erstelle ein Konto oder melde dich an, um Profil, Onboarding-Antworten und Mahlzeitenverlauf zu synchronisieren.',
    guestTitle: 'Als Gast fortfahren',
    guestSubtitle: 'Demo-Modus – Daten werden lokal gespeichert',
    signIn: 'Anmelden',
    signUp: 'Konto erstellen',
    name: 'Anzeigename',
    email: 'E-Mail',
    password: 'Passwort',
    forgotPassword: 'Passwort-Reset senden',
    resetSent: 'E-Mail zum Zurücksetzen wurde gesendet.',
    loading: 'Sitzung wird geprüft...',
    submitSignIn: 'Anmelden',
    submitSignUp: 'Konto erstellen',
    needAccount: 'Noch kein Konto?',
    haveAccount: 'Schon ein Konto?',
    switchToSignUp: 'Erstellen',
    switchToSignIn: 'Anmelden',
    checkEmail: 'Konto erstellt. Falls E-Mail-Bestätigung aktiv ist, bestätige deine E-Mail und melde dich dann an.',
    genericError: 'Authentifizierung fehlgeschlagen. Bitte erneut versuchen.',
    guestError: 'Gastmodus konnte nicht gestartet werden. Bitte erneut versuchen.',
  },
  fa: {
    eyebrow: 'حساب NutriFlow',
    title: 'پروفایل گوارش خود را ذخیره کنید',
    subtitle: 'حساب بسازید یا وارد شوید تا پروفایل، پاسخ‌های شروع برنامه و تاریخچه غذاها همگام شوند.',
    guestTitle: 'ادامه به عنوان مهمان',
    guestSubtitle: 'حالت دمو – داده ها فقط محلی ذخیره می شوند',
    signIn: 'ورود',
    signUp: 'ساخت حساب',
    name: 'نام نمایشی',
    email: 'ایمیل',
    password: 'رمز عبور',
    forgotPassword: 'ارسال بازنشانی رمز',
    resetSent: 'ایمیل بازنشانی رمز ارسال شد.',
    loading: 'در حال بررسی نشست...',
    submitSignIn: 'ورود',
    submitSignUp: 'ساخت حساب',
    needAccount: 'حساب ندارید؟',
    haveAccount: 'قبلاً حساب ساخته‌اید؟',
    switchToSignUp: 'یکی بسازید',
    switchToSignIn: 'وارد شوید',
    checkEmail: 'حساب ساخته شد. اگر تأیید ایمیل فعال است، ایمیل خود را تأیید کنید و سپس وارد شوید.',
    genericError: 'احراز هویت ناموفق بود. لطفاً دوباره تلاش کنید.',
    guestError: 'شروع حالت مهمان انجام نشد. لطفاً دوباره تلاش کنید.',
  },
} as const;

export default function LoginScreen() {
  const { user, profile, isGuest, loading, signIn, signUp, continueAsGuest, resetPassword, refreshProfile } = useAuth();
  const [language, setLanguage] = useState<AppLanguage>('en');
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const isRtl = isRtlLanguage(language);
  const t = COPY[language];

  useEffect(() => {
    AsyncStorage.getItem(APP_LANGUAGE_STORAGE_KEY)
      .then((storedLanguage) => setLanguage(parseStoredLanguage(storedLanguage)))
      .catch(console.warn);
  }, []);

  useEffect(() => {
    if (!loading && (user || isGuest)) {
      router.replace(profile?.onboarding_completed ? '/(tabs)' : '/onboarding/page');
    }
  }, [isGuest, loading, profile?.onboarding_completed, user]);

  const redirectAfterAuth = async () => {
    await refreshProfile();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) {
      router.replace('/login');
      return;
    }
    const { data } = await supabase
      .from('profiles')
      .select('onboarding_completed')
      .eq('id', user.id)
      .maybeSingle();

    router.replace(data?.onboarding_completed ? '/(tabs)' : '/onboarding/page');
  };

  const handleSubmit = async () => {
    if (isSubmitting) return;
    setErrorMessage('');
    setMessage('');
    setIsSubmitting(true);

    try {
      const result = mode === 'signIn'
        ? await signIn(email, password)
        : await signUp(email, password, displayName);

      if (result.error) {
        setErrorMessage(result.error.message ?? t.genericError);
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        await redirectAfterAuth();
      } else {
        setMessage(t.checkEmail);
        setMode('signIn');
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t.genericError);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetPassword = async () => {
    if (!email.trim() || isSubmitting) return;
    setErrorMessage('');
    setMessage('');
    setIsSubmitting(true);
    try {
      const { error } = await resetPassword(email);
      if (error) {
        setErrorMessage(error.message ?? t.genericError);
      } else {
        setMessage(t.resetSent);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleContinueAsGuest = async () => {
    if (isSubmitting) return;
    setErrorMessage('');
    setMessage('');
    setIsSubmitting(true);

    try {
      const result = await continueAsGuest();
      if (result.error) {
        setErrorMessage(result.error.message ?? t.guestError);
        return;
      }

      router.replace(result.profile?.onboarding_completed ? '/(tabs)' : '/onboarding/page');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t.guestError);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading && Platform.OS !== 'web') {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.loadingState}>
          <ActivityIndicator color="#4CAF50" size="large" />
          <Text style={[styles.loadingText, isRtl && styles.rtlText]}>{t.loading}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.header, isRtl && styles.rtlRow]}>
            <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backButton}>
              <Ionicons name={isRtl ? 'chevron-forward' : 'chevron-back'} size={21} color="#15212D" />
            </Pressable>
            <View style={styles.headerCopy}>
              <Text style={[styles.eyebrow, isRtl && styles.rtlText]}>{t.eyebrow}</Text>
              <Text style={[styles.title, isRtl && styles.rtlText]}>{t.title}</Text>
            </View>
          </View>

          <Text style={[styles.subtitle, isRtl && styles.rtlText]}>{t.subtitle}</Text>

          <Pressable
            onPress={handleContinueAsGuest}
            disabled={isSubmitting}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.guestButton,
              isRtl && styles.rtlRow,
              isSubmitting && styles.guestButtonDisabled,
              pressed && !isSubmitting && styles.pressed,
            ]}
          >
            <View style={styles.guestIconCircle}>
              <Ionicons name="phone-portrait-outline" size={20} color="#2F7D45" />
            </View>
            <View style={styles.guestCopy}>
              <Text style={[styles.guestTitle, isRtl && styles.rtlText]}>{t.guestTitle}</Text>
              <Text style={[styles.guestSubtitle, isRtl && styles.rtlText]}>{t.guestSubtitle}</Text>
            </View>
            <Ionicons name={isRtl ? 'chevron-back' : 'chevron-forward'} size={20} color="#2F7D45" />
          </Pressable>

          <View style={[styles.modeRow, isRtl && styles.rtlRow]}>
            {(['signIn', 'signUp'] as const).map((item) => (
              <Pressable
                key={item}
                onPress={() => {
                  setMode(item);
                  setErrorMessage('');
                  setMessage('');
                }}
                style={[styles.modeButton, mode === item && styles.modeButtonActive]}
              >
                <Text style={[styles.modeButtonText, mode === item && styles.modeButtonTextActive]}>
                  {item === 'signIn' ? t.signIn : t.signUp}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.card}>
            {mode === 'signUp' ? (
              <View style={styles.inputGroup}>
                <Text style={[styles.label, isRtl && styles.rtlText]}>{t.name}</Text>
                <TextInput
                  value={displayName}
                  onChangeText={setDisplayName}
                  placeholder={t.name}
                  placeholderTextColor="#7A8791"
                  autoCapitalize="words"
                  style={[styles.input, isRtl && styles.rtlText]}
                />
              </View>
            ) : null}

            <View style={styles.inputGroup}>
              <Text style={[styles.label, isRtl && styles.rtlText]}>{t.email}</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor="#7A8791"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="emailAddress"
                style={[styles.input, isRtl && styles.rtlText]}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, isRtl && styles.rtlText]}>{t.password}</Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor="#7A8791"
                secureTextEntry
                textContentType={mode === 'signIn' ? 'password' : 'newPassword'}
                style={[styles.input, isRtl && styles.rtlText]}
              />
            </View>

            {errorMessage ? (
              <Text style={[styles.errorText, isRtl && styles.rtlText]}>{errorMessage}</Text>
            ) : null}
            {message ? (
              <Text style={[styles.successText, isRtl && styles.rtlText]}>{message}</Text>
            ) : null}

            <Pressable
              onPress={handleSubmit}
              disabled={isSubmitting || !email.trim() || !password}
              style={({ pressed }) => [
                styles.submitButton,
                (isSubmitting || !email.trim() || !password) && styles.submitButtonDisabled,
                pressed && !isSubmitting && styles.pressed,
              ]}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Ionicons name={mode === 'signIn' ? 'log-in' : 'person-add'} size={18} color="#FFFFFF" />
              )}
              <Text style={styles.submitButtonText}>
                {mode === 'signIn' ? t.submitSignIn : t.submitSignUp}
              </Text>
            </Pressable>

            {mode === 'signIn' ? (
              <Pressable onPress={handleResetPassword} disabled={isSubmitting || !email.trim()}>
                <Text style={[styles.resetText, isRtl && styles.rtlText]}>{t.forgotPassword}</Text>
              </Pressable>
            ) : null}
          </View>

          <View style={[styles.switchRow, isRtl && styles.rtlRow]}>
            <Text style={[styles.switchText, isRtl && styles.rtlText]}>
              {mode === 'signIn' ? t.needAccount : t.haveAccount}
            </Text>
            <Pressable onPress={() => setMode(mode === 'signIn' ? 'signUp' : 'signIn')}>
              <Text style={styles.switchAction}>
                {mode === 'signIn' ? t.switchToSignUp : t.switchToSignIn}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: '#F4F5F0',
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    gap: 20,
    padding: 20,
    paddingBottom: 44,
  },
  loadingState: {
    alignItems: 'center',
    flex: 1,
    gap: 14,
    justifyContent: 'center',
    padding: 24,
  },
  loadingText: {
    color: '#53616D',
    fontSize: 15,
    fontWeight: '700',
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14,
  },
  backButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#D8E4DE',
    borderRadius: 15,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  headerCopy: {
    flex: 1,
  },
  eyebrow: {
    color: '#4CAF50',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  title: {
    color: '#15212D',
    fontSize: 32,
    fontWeight: '900',
    lineHeight: 38,
    marginTop: 4,
  },
  subtitle: {
    color: '#53616D',
    fontSize: 15,
    lineHeight: 22,
  },
  guestButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#BFE5CB',
    borderRadius: 15,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    shadowColor: '#102018',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 3,
  },
  guestButtonDisabled: {
    opacity: 0.65,
  },
  guestIconCircle: {
    alignItems: 'center',
    backgroundColor: '#DFF5EA',
    borderRadius: 15,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  guestCopy: {
    flex: 1,
    minWidth: 0,
  },
  guestTitle: {
    color: '#15212D',
    fontSize: 17,
    fontWeight: '900',
  },
  guestSubtitle: {
    color: '#53616D',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
    marginTop: 3,
  },
  modeRow: {
    backgroundColor: '#E8EFEA',
    borderRadius: 15,
    flexDirection: 'row',
    gap: 6,
    padding: 6,
  },
  modeButton: {
    alignItems: 'center',
    borderRadius: 12,
    flex: 1,
    paddingVertical: 12,
  },
  modeButtonActive: {
    backgroundColor: '#FFFFFF',
  },
  modeButtonText: {
    color: '#53616D',
    fontSize: 14,
    fontWeight: '800',
  },
  modeButtonTextActive: {
    color: '#15212D',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderColor: '#D8E4DE',
    borderRadius: 15,
    borderWidth: 1,
    gap: 14,
    padding: 20,
  },
  inputGroup: {
    gap: 7,
  },
  label: {
    color: '#15212D',
    fontSize: 13,
    fontWeight: '800',
  },
  input: {
    backgroundColor: '#F8FAF8',
    borderColor: '#D8E4DE',
    borderRadius: 15,
    borderWidth: 1,
    color: '#15212D',
    fontSize: 16,
    minHeight: 52,
    paddingHorizontal: 15,
  },
  submitButton: {
    alignItems: 'center',
    backgroundColor: '#4CAF50',
    borderRadius: 15,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: 16,
  },
  submitButtonDisabled: {
    opacity: 0.55,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
  errorText: {
    color: '#C1444B',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
  },
  successText: {
    color: '#2F7D45',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
  },
  resetText: {
    color: '#4CAF50',
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
  },
  switchRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
  },
  switchText: {
    color: '#53616D',
    fontSize: 14,
    fontWeight: '700',
  },
  switchAction: {
    color: '#4CAF50',
    fontSize: 14,
    fontWeight: '900',
  },
  pressed: {
    opacity: 0.78,
    transform: [{ scale: 0.99 }],
  },
  rtlRow: {
    flexDirection: 'row-reverse',
  },
  rtlText: {
    textAlign: 'right',
    writingDirection: 'rtl',
  },
});
