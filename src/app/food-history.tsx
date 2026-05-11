import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GutHealthChart } from '../../components/GutHealthChart';
import { BorderRadius, FontFamily, FontSize, Spacing } from '../../constants/theme';
import { useAuth } from '../../contexts/AuthContext';
import { APP_LANGUAGE_STORAGE_KEY, isRtlLanguage, parseStoredLanguage, type AppLanguage } from '../../lib/app-language';
import { getPhotoAnalysisHistory, type PhotoAnalysisHistoryItem } from '../../lib/photo-analysis-history';

const HISTORY_COPY: Record<AppLanguage, {
  kicker: string;
  title: string;
  scorePending: string;
  emptyTitle: string;
  emptyText: string;
}> = {
  en: {
    kicker: 'Last 14 days',
    title: 'Meal History',
    scorePending: 'Score pending',
    emptyTitle: 'Your gut journey starts here!',
    emptyText: 'Take your first photo.',
  },
  de: {
    kicker: 'Letzte 14 Tage',
    title: 'Mahlzeitenverlauf',
    scorePending: 'Score offen',
    emptyTitle: 'Deine Darmreise beginnt hier!',
    emptyText: 'Nimm dein erstes Foto auf.',
  },
  fa: {
    kicker: '۱۴ روز گذشته',
    title: 'سوابق غذا',
    scorePending: 'امتیاز در انتظار',
    emptyTitle: 'مسیر گوارش شما از اینجا شروع می شود!',
    emptyText: 'اولین عکس غذای خود را بگیرید.',
  },
};

const LANGUAGE_LOCALES: Record<AppLanguage, string> = {
  en: 'en-US',
  de: 'de-DE',
  fa: 'fa-IR',
};

export default function FoodHistoryScreen() {
  const { user, loading } = useAuth();
  const [language, setLanguage] = useState<AppLanguage>('en');
  const [history, setHistory] = useState<PhotoAnalysisHistoryItem[]>([]);
  const isRtl = isRtlLanguage(language);
  const copy = HISTORY_COPY[language];

  useEffect(() => {
    AsyncStorage.getItem(APP_LANGUAGE_STORAGE_KEY)
      .then((storedLanguage) => setLanguage(parseStoredLanguage(storedLanguage)))
      .catch(console.warn);
  }, []);

  useEffect(() => {
    if (loading) return;

    getPhotoAnalysisHistory(user?.id)
      .then(setHistory)
      .catch(console.warn);
  }, [loading, user?.id]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={[styles.header, isRtl && styles.rtlRow]}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backButton}>
          <Ionicons name={isRtl ? 'chevron-forward' : 'chevron-back'} size={20} color="#FFFFFF" />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={[styles.kicker, isRtl && styles.rtlText]}>{copy.kicker}</Text>
          <Text style={[styles.title, isRtl && styles.rtlText]}>{copy.title}</Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator
      >
        <GutHealthChart userId={user?.id} language={language} />

        {history.length > 0 ? (
          history.map((item) => (
            <Pressable
              key={item.id}
              onPress={() => router.push({
                pathname: '/photo-analysis',
                params: { historyId: item.id },
              })}
              style={({ pressed }) => [styles.card, isRtl && styles.rtlRow, pressed && styles.pressed]}
            >
              {item.imageUri ? (
                <Image source={{ uri: item.imageUri }} style={styles.image} />
              ) : (
                <View style={[styles.image, styles.imagePlaceholder]}>
                  <Ionicons name="restaurant" size={24} color="#2DCE89" />
                </View>
              )}
              <View style={styles.cardCopy}>
                <Text style={[styles.date, isRtl && styles.rtlText]}>
                  {new Date(item.createdAt).toLocaleDateString(LANGUAGE_LOCALES[language])}
                </Text>
                <Text numberOfLines={1} style={[styles.mealName, isRtl && styles.rtlText]}>{item.mealName}</Text>
                <View style={[styles.scoreBadge, isRtl && styles.rtlRow]}>
                  <Ionicons name="speedometer" size={13} color="#2DCE89" />
                  <Text style={[styles.scoreText, isRtl && styles.rtlText]}>
                    {item.mealImpactScore ?? copy.scorePending}
                  </Text>
                </View>
              </View>
              <Ionicons name={isRtl ? 'chevron-back' : 'chevron-forward'} size={18} color="#777777" />
            </Pressable>
          ))
        ) : (
          <View style={styles.emptyCard}>
            <Ionicons name="camera" size={30} color="#B2AC88" />
            <Text style={[styles.emptyTitle, isRtl && styles.rtlText]}>{copy.emptyTitle}</Text>
            <Text style={[styles.emptyText, isRtl && styles.rtlText]}>{copy.emptyText}</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#000000',
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.md,
    padding: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  backButton: {
    alignItems: 'center',
    backgroundColor: '#101010',
    borderColor: '#242424',
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  headerCopy: {
    flex: 1,
  },
  kicker: {
    color: '#2DCE89',
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xs,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  title: {
    color: '#FFFFFF',
    fontFamily: FontFamily.displayBold,
    fontSize: FontSize.xxl,
    marginTop: 2,
  },
  content: {
    gap: Spacing.md,
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl + 48,
    paddingTop: Spacing.sm,
    width: '100%',
  },
  card: {
    alignItems: 'center',
    backgroundColor: '#0B0B0B',
    borderColor: '#242424',
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.md,
    minHeight: 112,
    padding: Spacing.md,
  },
  image: {
    borderRadius: BorderRadius.lg,
    height: 78,
    width: 78,
  },
  imagePlaceholder: {
    alignItems: 'center',
    backgroundColor: '#102C20',
    justifyContent: 'center',
  },
  cardCopy: {
    flex: 1,
    minWidth: 0,
  },
  date: {
    color: '#2DCE89',
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xs,
    marginBottom: 4,
  },
  mealName: {
    color: '#FFFFFF',
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.md,
    marginBottom: Spacing.sm,
  },
  scoreBadge: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#102C20',
    borderRadius: BorderRadius.full,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
  },
  scoreText: {
    color: '#2DCE89',
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xs,
  },
  emptyCard: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#ECE7D9',
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    padding: Spacing.xl,
    shadowColor: '#102018',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  emptyTitle: {
    color: '#15212D',
    fontFamily: FontFamily.sansExtraBold,
    fontSize: FontSize.xl,
    marginTop: Spacing.md,
    textAlign: 'center',
  },
  emptyText: {
    color: '#4E5B66',
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.md,
    lineHeight: 21,
    marginTop: Spacing.sm,
    textAlign: 'center',
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
