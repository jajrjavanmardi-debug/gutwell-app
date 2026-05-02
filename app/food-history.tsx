import { Ionicons } from '@expo/vector-icons';
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

import { BorderRadius, FontFamily, FontSize, Spacing } from '../constants/theme';
import { getPhotoAnalysisHistory, type PhotoAnalysisHistoryItem } from '../lib/photo-analysis-history';

export default function FoodHistoryScreen() {
  const [history, setHistory] = useState<PhotoAnalysisHistoryItem[]>([]);

  useEffect(() => {
    getPhotoAnalysisHistory()
      .then(setHistory)
      .catch(console.warn);
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backButton}>
          <Ionicons name="chevron-back" size={20} color="#FFFFFF" />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.kicker}>Last 14 days</Text>
          <Text style={styles.title}>Meal History</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {history.length > 0 ? (
          history.map((item) => (
            <Pressable
              key={item.id}
              onPress={() => router.push({
                pathname: '/photo-analysis',
                params: { historyId: item.id },
              })}
              style={({ pressed }) => [styles.card, pressed && styles.pressed]}
            >
              <Image source={{ uri: item.imageUri }} style={styles.image} />
              <View style={styles.cardCopy}>
                <Text style={styles.date}>{new Date(item.createdAt).toLocaleDateString()}</Text>
                <Text numberOfLines={1} style={styles.mealName}>{item.mealName}</Text>
                <View style={styles.scoreBadge}>
                  <Ionicons name="speedometer" size={13} color="#2DCE89" />
                  <Text style={styles.scoreText}>{item.mealImpactScore ?? 'Score pending'}</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#777777" />
            </Pressable>
          ))
        ) : (
          <View style={styles.emptyCard}>
            <Ionicons name="images-outline" size={28} color="#2DCE89" />
            <Text style={styles.emptyTitle}>No meal scans yet</Text>
            <Text style={styles.emptyText}>Your saved photo analyses will appear here after the first scan.</Text>
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
    paddingTop: Spacing.sm,
  },
  card: {
    alignItems: 'center',
    backgroundColor: '#0B0B0B',
    borderColor: '#242424',
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    flexDirection: 'row',
    gap: Spacing.md,
    padding: Spacing.md,
  },
  image: {
    borderRadius: BorderRadius.lg,
    height: 78,
    width: 78,
  },
  cardCopy: {
    flex: 1,
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
    backgroundColor: '#0B0B0B',
    borderColor: '#242424',
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    padding: Spacing.xl,
  },
  emptyTitle: {
    color: '#FFFFFF',
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.lg,
    marginTop: Spacing.md,
  },
  emptyText: {
    color: '#A7A7A7',
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.sm,
    lineHeight: 21,
    marginTop: Spacing.sm,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.78,
    transform: [{ scale: 0.99 }],
  },
});
