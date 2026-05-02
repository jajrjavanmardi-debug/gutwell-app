import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Toast } from '../../components/ui/Toast';
import { Card } from '../../components/ui/Card';
import { SwipeableCard } from '../../components/SwipeableCard';
import { Colors, Spacing, FontSize, BorderRadius, Shadows, FontFamily } from '../../constants/theme';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { enqueue } from '../../lib/offline-queue';

function formatMealTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();
  const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  if (isToday) return `Today ${time}`;
  if (isYesterday) return `Yesterday ${time}`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ` ${time}`;
}

const MEAL_TYPES = [
  { key: 'breakfast', label: 'Breakfast', icon: 'sunny' as const },
  { key: 'lunch', label: 'Lunch', icon: 'partly-sunny' as const },
  { key: 'dinner', label: 'Dinner', icon: 'moon' as const },
  { key: 'snack', label: 'Snack', icon: 'cafe' as const },
];

type Favorite = {
  id: number;
  meal_name: string;
  meal_type: string;
  foods: string[] | null;
};

function isSameLocalDay(iso: string, reference = new Date()): boolean {
  const date = new Date(iso);
  return date.toDateString() === reference.toDateString();
}

export default function FoodScreen() {
  const { user } = useAuth();
  const [mealType, setMealType] = useState('breakfast');
  const [mealName, setMealName] = useState('');
  const [foods, setFoods] = useState<string[]>([]);
  const [currentFood, setCurrentFood] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [recentMeals, setRecentMeals] = useState<{ id: number; meal_name: string; meal_type: string; logged_at: string }[]>([]);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' as 'success' | 'error' | 'info' });
  const [sensitiveFoods, setSensitiveFoods] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const todaysMeals = recentMeals.filter((meal) => isSameLocalDay(meal.logged_at));

  const loadData = async () => {
    try {
      await Promise.all([loadRecentMeals(), loadFavorites(), loadSensitiveFoods()]);
    } catch {
      setError('offline');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user]);

  const loadFavorites = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('favorites')
      .select('id, meal_name, meal_type, foods')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10);
    if (error) throw error;
    setFavorites(data || []);
  };

  const loadRecentMeals = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('food_logs').select('id, meal_name, meal_type, logged_at')
      .eq('user_id', user.id).order('logged_at', { ascending: false }).limit(5);
    if (error) throw error;
    setRecentMeals(data || []);
  };

  const loadSensitiveFoods = async () => {
    if (!user) return;
    const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const [
      { data: recentSymptoms, error: symptomsError },
      { data: recentFoodLogs, error: foodsError },
    ] = await Promise.all([
      supabase.from('symptoms').select('logged_at').eq('user_id', user.id).gte('logged_at', thirtyDaysAgo.toISOString()),
      supabase.from('food_logs').select('meal_name, logged_at').eq('user_id', user.id).gte('logged_at', thirtyDaysAgo.toISOString()),
    ]);
    if (symptomsError) throw symptomsError;
    if (foodsError) throw foodsError;
    if (recentSymptoms && recentFoodLogs) {
      const triggered = new Set<string>();
      recentSymptoms.forEach(s => {
        const symTime = new Date(s.logged_at).getTime();
        recentFoodLogs.forEach(f => {
          const foodTime = new Date(f.logged_at).getTime();
          if (foodTime < symTime && symTime - foodTime < 6 * 3600 * 1000 && typeof f.meal_name === 'string' && f.meal_name.trim()) {
            triggered.add(f.meal_name.toLowerCase());
          }
        });
      });
      setSensitiveFoods(Array.from(triggered));
    }
  };

  const addFood = () => {
    const normalized = currentFood.trim();
    if (!normalized) return;
    setFoods(prev => {
      const exists = prev.some(item => item.toLowerCase() === normalized.toLowerCase());
      return exists ? prev : [...prev, normalized];
    });
    setCurrentFood('');
  };

  const quickLogFavorite = async (fav: Favorite) => {
    if (!user) {
      setToast({ visible: true, message: 'Please log in to continue', type: 'error' });
      return;
    }
    setLoading(true);
    const payload = {
      user_id: user.id,
      meal_name: fav.meal_name,
      meal_type: fav.meal_type,
      foods: fav.foods || null,
      logged_at: new Date().toISOString(),
    };
    const { error } = await supabase.from('food_logs').insert(payload);
    setLoading(false);
    if (error) {
      if (error.message?.includes('network') || error.message?.includes('Network') || error.code === 'PGRST301' || !error.code) {
        await enqueue('food_logs', payload);
        setToast({ visible: true, message: 'Favorite saved offline — will sync when connected', type: 'info' });
      } else {
        setToast({ visible: true, message: 'Failed to log favorite', type: 'error' });
      }
    } else {
      setToast({ visible: true, message: `${fav.meal_name} logged!`, type: 'success' });
      loadRecentMeals();
    }
  };

  const handleSave = async () => {
    if (!mealName.trim() && foods.length === 0) {
      setToast({ visible: true, message: 'Please enter a meal name or add foods', type: 'error' }); return;
    }
    if (!user) {
      setToast({ visible: true, message: 'Please log in to continue', type: 'error' });
      return;
    }
    const normalizedMealName = (mealName.trim() || foods.join(', ')).trim().slice(0, 200);
    if (!normalizedMealName) {
      setToast({ visible: true, message: 'Meal name is required', type: 'error' });
      return;
    }
    const payload = {
      user_id: user.id,
      meal_name: normalizedMealName,
      meal_type: mealType,
      foods: foods.length > 0 ? foods : null,
      note: note.trim() || null,
      logged_at: new Date().toISOString(),
    };
    setLoading(true);
    const { data: existingRecent, error: existingRecentError } = await supabase
      .from('food_logs')
      .select('id')
      .eq('user_id', user.id)
      .eq('meal_name', payload.meal_name)
      .eq('meal_type', payload.meal_type)
      .gte('logged_at', new Date(Date.now() - 120000).toISOString())
      .limit(1);
    if (existingRecentError) {
      setLoading(false);
      if (existingRecentError.message?.includes('network') || existingRecentError.message?.includes('Network') || existingRecentError.code === 'PGRST301' || !existingRecentError.code) {
        await enqueue('food_logs', payload);
        setToast({ visible: true, message: 'Saved offline — will sync when connected', type: 'info' });
        setMealName('');
        setFoods([]);
        setNote('');
      } else {
        setToast({ visible: true, message: 'Failed to validate meal before saving', type: 'error' });
      }
      return;
    }
    if (existingRecent && existingRecent.length > 0) {
      setLoading(false);
      setToast({ visible: true, message: 'This meal was just logged.', type: 'info' });
      return;
    }
    const { error } = await supabase.from('food_logs').insert(payload);
    setLoading(false);
    if (error) {
      // Network error — queue offline
      if (error.message?.includes('network') || error.message?.includes('Network') || error.code === 'PGRST301' || !error.code) {
        await enqueue('food_logs', {
          ...payload,
        });
        setToast({ visible: true, message: 'Saved offline — will sync when connected', type: 'info' });
        setMealName(''); setFoods([]); setNote('');
      } else {
        setToast({ visible: true, message: 'Failed to save food log', type: 'error' });
      }
    } else {
      setToast({ visible: true, message: 'Meal logged!', type: 'success' });
      setRecentMeals((prev) => [
        {
          id: Date.now(),
          meal_name: payload.meal_name,
          meal_type: payload.meal_type,
          logged_at: payload.logged_at,
        },
        ...prev,
      ]);
      setMealName('');
      setFoods([]);
      setNote('');
      loadRecentMeals();
    }
  };

  const handleFavoriteFromRecent = async (meal: { id: number; meal_name: string; meal_type: string; logged_at: string }) => {
    if (!user) {
      setToast({ visible: true, message: 'Please log in to continue', type: 'error' });
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const { error } = await supabase
      .from('favorites')
      .upsert(
        { user_id: user.id, meal_name: meal.meal_name, meal_type: meal.meal_type },
        { onConflict: 'user_id,meal_name' }
      );
    if (error) {
      setToast({ visible: true, message: 'Failed to add favorite', type: 'error' });
    } else {
      setToast({ visible: true, message: 'Added to favorites ⭐', type: 'success' });
      loadFavorites();
    }
  };

  const handleDeleteFavorite = (fav: Favorite) => {
    Alert.alert(
      'Remove from Favorites',
      `Remove "${fav.meal_name}" from favorites?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            if (!user) return;
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            const { error } = await supabase
              .from('favorites')
              .delete()
              .eq('id', fav.id)
              .eq('user_id', user.id);
            if (error) {
              setToast({ visible: true, message: 'Failed to remove favorite', type: 'error' });
            } else {
              setToast({ visible: true, message: 'Removed from favorites', type: 'success' });
              loadFavorites();
            }
          },
        },
      ]
    );
  };

  const handleDeleteMeal = async (id: number) => {
    if (!user) {
      setToast({ visible: true, message: 'Please log in to continue', type: 'error' });
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const { error } = await supabase
      .from('food_logs')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);
    if (error) {
      setToast({ visible: true, message: 'Failed to remove meal', type: 'error' });
    } else {
      setToast({ visible: true, message: 'Meal removed', type: 'success' });
      loadRecentMeals();
    }
  };

  const getMealIcon = (type: string): string => {
    switch (type) {
      case 'breakfast': return 'sunny';
      case 'lunch': return 'partly-sunny';
      case 'dinner': return 'moon';
      case 'snack': return 'cafe';
      default: return 'restaurant';
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Track Your Plate</Text>
        <Text style={styles.subtitle}>What nourished you today?</Text>

        {!isLoading && error && (
          <ErrorState type="offline" onRetry={() => { setError(null); loadData(); }} />
        )}

        {/* Scan Button - Premium solid card */}
        <TouchableOpacity style={styles.scanButton} onPress={() => router.push('/photo-analysis')} activeOpacity={0.7}>
          <View style={styles.scanIcon}>
            <Ionicons name="camera" size={22} color={Colors.primary} />
          </View>
          <View style={styles.scanContent}>
            <Text style={styles.scanTitle}>Photo Meal Analysis</Text>
            <Text style={styles.scanSubtitle}>Take or choose a meal photo for gut-health analysis</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} />
        </TouchableOpacity>

        {/* Favorites Section */}
        {favorites.length > 0 && (
          <View style={styles.favoritesSection}>
            <View style={styles.sectionHeaderRow}>
              <Ionicons name="star" size={16} color={Colors.accent} />
              <Text style={styles.sectionTitle}>Favorites</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.favoritesScroll}>
              {favorites.map(fav => (
                <TouchableOpacity
                  key={fav.id}
                  style={styles.favoriteChip}
                  onPress={() => quickLogFavorite(fav)}
                  onLongPress={() => handleDeleteFavorite(fav)}
                  delayLongPress={400}
                  activeOpacity={0.7}
                >
                  <Ionicons name="add-circle" size={16} color={Colors.primary} />
                  <Text style={styles.favoriteText} numberOfLines={1}>{fav.meal_name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Meal Type Selector - Pill segments */}
        <Text style={styles.sectionTitle}>Meal Type</Text>
        <View style={styles.mealTypes}>
          {MEAL_TYPES.map(m => (
            <TouchableOpacity
              key={m.key}
              style={[styles.mealTypeBtn, mealType === m.key && styles.mealTypeSelected]}
              onPress={() => setMealType(m.key)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={m.icon}
                size={16}
                color={mealType === m.key ? Colors.textInverse : Colors.primary}
              />
              <Text style={[styles.mealTypeLabel, mealType === m.key && styles.mealTypeLabelSelected]}>
                {m.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Meal Name Input */}
        <Input label="Meal Name" placeholder="e.g., Chicken salad" value={mealName} onChangeText={setMealName} />

        {/* Today's Meals */}
        <View style={styles.todaysMealsSection}>
          <Text style={styles.sectionLabel}>Today's meals</Text>
          {todaysMeals.length > 0 ? (
            <View style={styles.todaysMealsList}>
              {todaysMeals.map((meal) => (
                <View key={`${meal.id}-${meal.logged_at}`} style={styles.todaysMealRow}>
                  <View style={styles.todaysMealInfo}>
                    <Text style={styles.todaysMealName} numberOfLines={1}>
                      {meal.meal_name}
                    </Text>
                    <Text style={styles.todaysMealTime}>{formatMealTime(meal.logged_at)}</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.todaysMealDeleteBtn}
                    activeOpacity={0.7}
                    onPress={() => {
                      setRecentMeals((prev) => prev.filter((m) => m.id !== meal.id));
                      handleDeleteMeal(meal.id);
                    }}
                  >
                    <Ionicons name="trash-outline" size={14} color={Colors.error} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.todaysMealsEmpty}>No meals logged yet today.</Text>
          )}
        </View>

        {/* Food Tags */}
        <Text style={styles.sectionLabel}>Foods (optional tags)</Text>
        <View style={styles.foodInputRow}>
          <View style={styles.foodInputWrap}>
            <Input placeholder="Add a food item..." value={currentFood} onChangeText={setCurrentFood} onSubmitEditing={addFood} returnKeyType="done" />
          </View>
          <Button title="Add" onPress={addFood} variant="secondary" size="sm" />
        </View>
        {foods.length > 0 && (
          <View style={styles.foodTags}>
            {foods.map((food, i) => (
              <TouchableOpacity key={i} style={styles.foodTag} onPress={() => setFoods(foods.filter((_, idx) => idx !== i))} activeOpacity={0.7}>
                <Text style={styles.foodTagText}>{food}</Text>
                <Ionicons name="close" size={14} color={Colors.primary} />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Notes */}
        <Input label="Notes (optional)" placeholder="How did it make you feel?" value={note} onChangeText={setNote} multiline numberOfLines={2} style={{ minHeight: 60, textAlignVertical: 'top' }} />

        {/* Log Meal Button */}
        <TouchableOpacity
          style={[styles.logButton, loading && styles.logButtonDisabled]}
          onPress={handleSave}
          activeOpacity={0.8}
          disabled={loading}
        >
          <Ionicons name="checkmark-circle" size={20} color={Colors.textInverse} />
          <Text style={styles.logButtonText}>{loading ? 'Saving...' : 'Log Meal'}</Text>
        </TouchableOpacity>

        {/* Recent Meals */}
        {recentMeals.length === 0 && !isLoading && (
          <EmptyState
            icon="restaurant-outline"
            title="No meals logged yet"
            message="Start tracking your meals to discover what foods make you feel your best."
          />
        )}
        {recentMeals.length > 0 && (
          <View style={styles.recentSection}>
            <Text style={styles.sectionTitle}>Recent Meals</Text>
            {recentMeals.map(meal => (
              <SwipeableCard
                key={meal.id}
                onFavorite={() => handleFavoriteFromRecent(meal)}
                onDelete={() => handleDeleteMeal(meal.id)}
                favoriteLabel="Favorite"
                deleteLabel="Delete"
              >
                <View style={styles.recentCard}>
                  <View style={styles.recentIconWrap}>
                    <Ionicons name={getMealIcon(meal.meal_type) as any} size={18} color={Colors.primary} />
                  </View>
                  <View style={styles.recentInfo}>
                    {(() => {
                      const safeMealName = typeof meal.meal_name === 'string' ? meal.meal_name : '';
                      const safeMealType = typeof meal.meal_type === 'string' ? meal.meal_type : '';
                      const mealTypeLabel = safeMealType
                        ? safeMealType.charAt(0).toUpperCase() + safeMealType.slice(1)
                        : 'Meal';
                      const normalizedMealName = safeMealName ? safeMealName.toLowerCase() : null;
                      const isSensitive = normalizedMealName ? sensitiveFoods.includes(normalizedMealName) : false;

                      return (
                        <>
                    <Text style={styles.recentName} numberOfLines={1}>{meal.meal_name}</Text>
                    <Text style={styles.recentMeta}>
                          {mealTypeLabel} · {formatMealTime(meal.logged_at)}
                    </Text>
                          {isSensitive && (
                      <View style={styles.sensitivityBadge}>
                        <Ionicons name="warning-outline" size={11} color="#D4A373" />
                        <Text style={styles.sensitivityText}>May trigger</Text>
                      </View>
                    )}
                        </>
                      );
                    })()}
                  </View>
                </View>
              </SwipeableCard>
            ))}
          </View>
        )}
      </ScrollView>
      </KeyboardAvoidingView>
      <Toast message={toast.message} type={toast.type} visible={toast.visible} onDismiss={() => setToast(t => ({ ...t, visible: false }))} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scroll: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl + 20,
  },
  title: {
    fontFamily: FontFamily.displayMedium,
    fontSize: FontSize.xxl,
    color: Colors.text,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
    marginBottom: Spacing.lg,
  },

  // Scan Button
  scanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary + '08',
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.secondary,
    ...Shadows.sm,
  },
  scanIcon: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.primary + '12',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  scanContent: {
    flex: 1,
  },
  scanTitle: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.md,
    color: Colors.text,
  },
  scanSubtitle: {
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.xs,
    color: Colors.textTertiary,
    marginTop: 2,
  },

  // Favorites
  favoritesSection: {
    marginBottom: Spacing.lg,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  favoritesScroll: {
    gap: Spacing.sm,
  },
  favoriteChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.sm,
  },
  favoriteText: {
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.sm,
    color: Colors.text,
    maxWidth: 120,
  },

  // Meal Types
  mealTypes: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: BorderRadius.full,
    padding: 4,
  },
  mealTypeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: Spacing.sm + 2,
    borderRadius: BorderRadius.full,
    backgroundColor: 'transparent',
  },
  mealTypeSelected: {
    backgroundColor: Colors.primary,
    ...Shadows.sm,
  },
  mealTypeLabel: {
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.xs,
    color: Colors.textTertiary,
  },
  mealTypeLabelSelected: {
    color: Colors.textInverse,
  },

  // Section label
  sectionLabel: {
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: Spacing.md,
    marginBottom: Spacing.xs,
    marginLeft: Spacing.xs,
  },
  todaysMealsSection: {
    marginTop: Spacing.xs,
    marginBottom: Spacing.md,
  },
  todaysMealsList: {
    gap: Spacing.xs,
  },
  todaysMealRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  todaysMealInfo: {
    flex: 1,
    marginRight: Spacing.sm,
  },
  todaysMealName: {
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.sm,
    color: Colors.text,
  },
  todaysMealTime: {
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.xs,
    color: Colors.textTertiary,
  },
  todaysMealDeleteBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.error + '12',
  },
  todaysMealsEmpty: {
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.xs,
    color: Colors.textTertiary,
    marginLeft: Spacing.xs,
    marginTop: 2,
  },
  sectionTitle: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.lg,
    color: Colors.text,
    marginBottom: Spacing.sm,
  },

  // Food input
  foodInputRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'flex-end',
  },
  foodInputWrap: {
    flex: 1,
  },
  foodTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  foodTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary + '10',
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    gap: 6,
    borderWidth: 1,
    borderColor: Colors.primary + '20',
  },
  foodTagText: {
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.sm,
    color: Colors.primary,
  },

  // Log Button
  logButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md,
    marginTop: Spacing.lg,
    ...Shadows.md,
  },
  logButtonDisabled: {
    opacity: 0.6,
  },
  logButtonText: {
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.md,
    color: Colors.textInverse,
    letterSpacing: 0.3,
  },

  // Recent Meals
  recentSection: {
    marginTop: Spacing.xl,
  },
  recentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.sm,
  },
  recentIconWrap: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.primary + '10',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  recentInfo: {
    flex: 1,
  },
  recentName: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.md,
    color: Colors.text,
  },
  recentMeta: {
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.xs,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  sensitivityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#D4A37320',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  sensitivityText: {
    fontFamily: FontFamily.sansRegular,
    fontSize: 11,
    color: '#D4A373',
  },

});
