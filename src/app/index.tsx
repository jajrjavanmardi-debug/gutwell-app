import { Redirect, router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../../contexts/AuthContext';
import { APP_LANGUAGE_STORAGE_KEY, isRtlLanguage, parseStoredLanguage, type AppLanguage } from '../../lib/app-language';

const ENTRY_COPY: Record<AppLanguage, {
  loading: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  continueAsGuest: string;
  demoMode: string;
  accountAccess: string;
  startingGuest: string;
  guestError: string;
}> = {
  en: {
    loading: 'Loading your profile...',
    eyebrow: 'NutriFlow public feedback',
    title: 'Try NutriFlow without an account',
    subtitle: 'Use the web demo with local-only onboarding, language switching, food analysis, SOS, history, and settings.',
    continueAsGuest: 'Continue as Guest',
    demoMode: 'Demo Mode – data stored locally',
    accountAccess: 'Sign in or create account',
    startingGuest: 'Starting demo...',
    guestError: 'Could not start guest mode. Please try again.',
  },
  de: {
    loading: 'Profil wird geladen...',
    eyebrow: 'NutriFlow Public Feedback',
    title: 'NutriFlow ohne Konto testen',
    subtitle: 'Nutze die Web-Demo mit lokalem Onboarding, Sprachwechsel, Food-Analyse, SOS, Verlauf und Einstellungen.',
    continueAsGuest: 'Als Gast fortfahren',
    demoMode: 'Demo-Modus – Daten werden lokal gespeichert',
    accountAccess: 'Anmelden oder Konto erstellen',
    startingGuest: 'Demo wird gestartet...',
    guestError: 'Gastmodus konnte nicht gestartet werden. Bitte erneut versuchen.',
  },
  fa: {
    loading: 'در حال بارگذاری پروفایل...',
    eyebrow: 'بازخورد عمومی NutriFlow',
    title: 'NutriFlow را بدون حساب تست کنید',
    subtitle: 'دموی وب را با آنبوردینگ محلی، تغییر زبان، تحلیل غذا، SOS، سوابق و تنظیمات امتحان کنید.',
    continueAsGuest: 'ادامه به عنوان مهمان',
    demoMode: 'حالت دمو – داده ها فقط محلی ذخیره می شوند',
    accountAccess: 'ورود یا ساخت حساب',
    startingGuest: 'در حال شروع دمو...',
    guestError: 'شروع حالت مهمان انجام نشد. لطفاً دوباره تلاش کنید.',
  },
};

export default function AppEntry() {
  const { user, profile, isGuest, loading, continueAsGuest } = useAuth();
  const [language, setLanguage] = useState<AppLanguage>('en');
  const [isStartingGuest, setIsStartingGuest] = useState(false);
  const [guestError, setGuestError] = useState('');
  const isRtl = isRtlLanguage(language);
  const copy = ENTRY_COPY[language];

  useEffect(() => {
    AsyncStorage.getItem(APP_LANGUAGE_STORAGE_KEY)
      .then((storedLanguage) => setLanguage(parseStoredLanguage(storedLanguage)))
      .catch(console.warn);
  }, []);

  const handleContinueAsGuest = async () => {
    if (isStartingGuest) return;

    setIsStartingGuest(true);
    setGuestError('');
    try {
      const result = await continueAsGuest();
      if (result.error) {
        setGuestError(result.error.message ?? copy.guestError);
        return;
      }
      router.replace(result.profile?.onboarding_completed ? '/(tabs)' : '/onboarding/page');
    } catch (error) {
      setGuestError(error instanceof Error ? error.message : copy.guestError);
    } finally {
      setIsStartingGuest(false);
    }
  };

  if (Platform.OS === 'web' && !user && !isGuest) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.publicShell}>
          <View style={styles.publicCard}>
            <Text style={[styles.eyebrow, isRtl && styles.rtlText]}>{copy.eyebrow}</Text>
            <Text style={[styles.publicTitle, isRtl && styles.rtlText]}>{copy.title}</Text>
            <Text style={[styles.publicSubtitle, isRtl && styles.rtlText]}>{copy.subtitle}</Text>

            <Pressable
              onPress={handleContinueAsGuest}
              disabled={isStartingGuest}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.guestButton,
                isStartingGuest && styles.buttonDisabled,
                pressed && !isStartingGuest && styles.pressed,
              ]}
            >
              {isStartingGuest ? <ActivityIndicator color="#FFFFFF" size="small" /> : null}
              <Text style={styles.guestButtonText}>
                {isStartingGuest ? copy.startingGuest : copy.continueAsGuest}
              </Text>
            </Pressable>

            <Text style={[styles.demoLabel, isRtl && styles.rtlText]}>{copy.demoMode}</Text>
            {guestError ? <Text style={[styles.errorText, isRtl && styles.rtlText]}>{guestError}</Text> : null}

            <Pressable
              onPress={() => router.replace('/login')}
              accessibilityRole="button"
              style={({ pressed }) => [styles.accountButton, pressed && styles.pressed]}
            >
              <Text style={[styles.accountButtonText, isRtl && styles.rtlText]}>{copy.accountAccess}</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.loadingState}>
          <ActivityIndicator color="#4CAF50" size="large" />
          <Text style={[styles.loadingText, isRtl && styles.rtlText]}>{copy.loading}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!user && !isGuest) return <Redirect href="/login" />;

  return <Redirect href={profile?.onboarding_completed ? '/(tabs)' : '/onboarding/page'} />;
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: '#F4F5F0',
    flex: 1,
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
  publicShell: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  publicCard: {
    alignSelf: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#D8E4DE',
    borderRadius: 20,
    borderWidth: 1,
    maxWidth: 520,
    padding: 24,
    shadowColor: '#102018',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.1,
    shadowRadius: 24,
    width: '100%',
  },
  eyebrow: {
    color: '#4CAF50',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  publicTitle: {
    color: '#15212D',
    fontSize: 34,
    fontWeight: '900',
    lineHeight: 40,
    marginTop: 8,
  },
  publicSubtitle: {
    color: '#53616D',
    fontSize: 16,
    lineHeight: 24,
    marginTop: 12,
  },
  guestButton: {
    alignItems: 'center',
    backgroundColor: '#4CAF50',
    borderRadius: 15,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    marginTop: 22,
    minHeight: 54,
    paddingHorizontal: 18,
  },
  guestButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '900',
  },
  demoLabel: {
    alignSelf: 'flex-start',
    backgroundColor: '#E8F5EC',
    borderColor: '#BFE5CB',
    borderRadius: 999,
    borderWidth: 1,
    color: '#276E3A',
    fontSize: 13,
    fontWeight: '800',
    marginTop: 14,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  errorText: {
    color: '#C1444B',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
    marginTop: 12,
  },
  accountButton: {
    alignItems: 'center',
    borderColor: '#D8E4DE',
    borderRadius: 15,
    borderWidth: 1,
    marginTop: 16,
    minHeight: 50,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  accountButtonText: {
    color: '#15212D',
    fontSize: 15,
    fontWeight: '800',
  },
  buttonDisabled: {
    opacity: 0.68,
  },
  pressed: {
    opacity: 0.78,
    transform: [{ scale: 0.99 }],
  },
  rtlText: {
    textAlign: 'right',
    writingDirection: 'rtl',
  },
});
