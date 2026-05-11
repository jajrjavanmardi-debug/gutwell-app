import { Redirect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../../contexts/AuthContext';
import { APP_LANGUAGE_STORAGE_KEY, isRtlLanguage, parseStoredLanguage, type AppLanguage } from '../../lib/app-language';

const ENTRY_COPY: Record<AppLanguage, { loading: string }> = {
  en: { loading: 'Loading your profile...' },
  de: { loading: 'Profil wird geladen...' },
  fa: { loading: 'در حال بارگذاری پروفایل...' },
};

export default function AppEntry() {
  const { user, profile, loading } = useAuth();
  const [language, setLanguage] = useState<AppLanguage>('en');
  const isRtl = isRtlLanguage(language);
  const copy = ENTRY_COPY[language];

  useEffect(() => {
    AsyncStorage.getItem(APP_LANGUAGE_STORAGE_KEY)
      .then((storedLanguage) => setLanguage(parseStoredLanguage(storedLanguage)))
      .catch(console.warn);
  }, []);

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

  if (!user) return <Redirect href="/login" />;

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
  rtlText: {
    textAlign: 'right',
    writingDirection: 'rtl',
  },
});
