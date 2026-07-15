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

import { BorderRadius, Colors, FontFamily, FontSize, Spacing } from '../constants/theme';
import { getPhotoAnalysisHistory, type PhotoAnalysisHistoryItem } from '../lib/photo-analysis-history';

function ImageWithFallback({ uri, style }: { uri: string; style: object }) {
  const [failed, setFailed] = useState(false);
  const hasUri = Boolean(uri);
  if (!hasUri || failed) {
    return (
      <View style={[style as any, { backgroundColor: "#1A2420", alignItems: "center", justifyContent: "center" }]}>
        <Ionicons name="image-outline" size={28} color="#3D5A4C" />
      </View>
    );
  }
  return <Image source={{ uri }} style={style as any} onError={() => setFailed(true)} />;
}

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
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={22} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>History</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.heading}>Meal History</Text>
        <Text style={styles.subheading}>Your last 14 days of meal scans</Text>
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
              <ImageWithFallback uri={item.imageUri} style={styles.image} />
              <View style={styles.cardCopy}>
                <Text style={styles.date}>{new Date(item.createdAt).toLocaleDateString()}</Text>
                <Text numberOfLines={1} style={styles.mealName}>{item.mealName}</Text>
                <View style={styles.scoreBadge}>
                  <Ionicons name="speedometer" size={13} color={Colors.secondary} />
                  <Text style={styles.scoreText}>{item.mealImpactScore ?? 'Score pending'}</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} />
            </Pressable>
          ))
        ) : (
          <View style={styles.emptyCard}>
            <Ionicons name="images-outline" size={28} color={Colors.secondary} />
            <Text style={styles.emptyTitle}>No meal scans yet</Text>
            <Text style={styles.emptyText}>Completed analyses are saved automatically and kept locally for 14 days. Your next scan will appear here.</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.background,
    flex: 1,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  backButton: {
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  headerTitle: {
    color: Colors.text,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.lg,
  },
  heading: {
    color: Colors.text,
    fontFamily: FontFamily.displayMedium,
    fontSize: FontSize.hero,
  },
  subheading: {
    color: Colors.textSecondary,
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.md,
    marginBottom: Spacing.md,
    marginTop: Spacing.xs,
  },
  content: {
    gap: Spacing.md,
    padding: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  card: {
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
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
    color: Colors.secondary,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xs,
    marginBottom: 4,
  },
  mealName: {
    color: Colors.text,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.md,
    marginBottom: Spacing.sm,
  },
  scoreBadge: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: Colors.primary + '26',
    borderRadius: BorderRadius.full,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
  },
  scoreText: {
    color: Colors.secondary,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xs,
  },
  emptyCard: {
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    padding: Spacing.xl,
  },
  emptyTitle: {
    color: Colors.text,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.lg,
    marginTop: Spacing.md,
  },
  emptyText: {
    color: Colors.textSecondary,
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
