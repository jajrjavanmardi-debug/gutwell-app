import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Toast } from '../../components/ui/Toast';
import { Card } from '../../components/ui/Card';
import { Colors, Spacing, FontSize, BorderRadius } from '../../constants/theme';

const MEAL_TYPES = [
  { key: 'breakfast', label: 'Breakfast', icon: 'sunny' as const },
  { key: 'lunch', label: 'Lunch', icon: 'partly-sunny' as const },
  { key: 'dinner', label: 'Dinner', icon: 'moon' as const },
  { key: 'snack', label: 'Snack', icon: 'cafe' as const },
];

export default function FoodScreen() {
  const { user } = useAuth();
  const [mealType, setMealType] = useState('breakfast');
  const [mealName, setMealName] = useState('');
  const [foods, setFoods] = useState<string[]>([]);
  const [currentFood, setCurrentFood] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [recentMeals, setRecentMeals] = useState<{ id: number; meal_name: string; meal_type: string; logged_at: string }[]>([]);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' as const });

  useEffect(() => { loadRecentMeals(); }, [user]);

  const loadRecentMeals = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('food_logs').select('id, meal_name, meal_type, logged_at')
      .eq('user_id', user.id).order('logged_at', { ascending: false }).limit(5);
    setRecentMeals(data || []);
  };

  const addFood = () => {
    if (currentFood.trim()) { setFoods([...foods, currentFood.trim()]); setCurrentFood(''); }
  };

  const handleSave = async () => {
    if (!mealName.trim() && foods.length === 0) {
      setToast({ visible: true, message: 'Please enter a meal name or add foods', type: 'error' }); return;
    }
    if (!user) return;
    setLoading(true);
    const { error } = await supabase.from('food_logs').insert({
      user_id: user.id, meal_name: mealName.trim() || foods.join(', '),
      meal_type: mealType, foods: foods.length > 0 ? foods : null, note: note.trim() || null,
    });
    setLoading(false);
    if (error) { setToast({ visible: true, message: 'Failed to save food log', type: 'error' }); }
    else { setToast({ visible: true, message: 'Meal logged!', type: 'success' }); setMealName(''); setFoods([]); setNote(''); loadRecentMeals(); }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Log a Meal</Text>
        <Text style={styles.subtitle}>What did you eat?</Text>

        <View style={styles.mealTypes}>
          {MEAL_TYPES.map(m => (
            <TouchableOpacity key={m.key} style={[styles.mealTypeBtn, mealType === m.key && styles.mealTypeSelected]} onPress={() => setMealType(m.key)} activeOpacity={0.7}>
              <Ionicons name={m.icon} size={24} color={mealType === m.key ? Colors.primary : Colors.textTertiary} />
              <Text style={[styles.mealTypeLabel, mealType === m.key && styles.mealTypeLabelSelected]}>{m.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Input label="Meal Name" placeholder="e.g., Chicken salad" value={mealName} onChangeText={setMealName} />

        <Text style={styles.sectionLabel}>Foods (optional tags)</Text>
        <View style={styles.foodInputRow}>
          <View style={{ flex: 1 }}>
            <Input placeholder="Add a food item..." value={currentFood} onChangeText={setCurrentFood} onSubmitEditing={addFood} returnKeyType="done" />
          </View>
          <Button title="Add" onPress={addFood} variant="secondary" size="sm" />
        </View>
        {foods.length > 0 && (
          <View style={styles.foodTags}>
            {foods.map((food, i) => (
              <TouchableOpacity key={i} style={styles.foodTag} onPress={() => setFoods(foods.filter((_, idx) => idx !== i))}>
                <Text style={styles.foodTagText}>{food}</Text>
                <Ionicons name="close-circle" size={16} color={Colors.textTertiary} />
              </TouchableOpacity>
            ))}
          </View>
        )}

        <Input label="Notes (optional)" placeholder="How did it make you feel?" value={note} onChangeText={setNote} multiline numberOfLines={2} style={{ minHeight: 60, textAlignVertical: 'top' }} />

        <Button title="Log Meal" onPress={handleSave} loading={loading} size="lg" style={{ marginTop: Spacing.lg }} />

        {recentMeals.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Recent Meals</Text>
            {recentMeals.map(meal => (
              <Card key={meal.id} style={styles.recentCard}>
                <Text style={styles.recentName}>{meal.meal_name}</Text>
                <Text style={styles.recentMeta}>{meal.meal_type} · {new Date(meal.logged_at).toLocaleDateString()}</Text>
              </Card>
            ))}
          </>
        )}
      </ScrollView>
      <Toast message={toast.message} type={toast.type} visible={toast.visible} onDismiss={() => setToast(t => ({ ...t, visible: false }))} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: Spacing.lg, paddingBottom: Spacing.xxl },
  title: { fontSize: FontSize.xxl, fontWeight: '700', color: Colors.text },
  subtitle: { fontSize: FontSize.md, color: Colors.textSecondary, marginBottom: Spacing.lg },
  mealTypes: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.lg },
  mealTypeBtn: { flex: 1, backgroundColor: Colors.surface, borderRadius: BorderRadius.md, padding: Spacing.md, alignItems: 'center', gap: 4, borderWidth: 1.5, borderColor: Colors.border },
  mealTypeSelected: { borderColor: Colors.primary, backgroundColor: Colors.surfaceSecondary },
  mealTypeLabel: { fontSize: FontSize.xs, color: Colors.textTertiary, fontWeight: '500' },
  mealTypeLabelSelected: { color: Colors.primary },
  sectionLabel: { fontSize: FontSize.sm, fontWeight: '500', color: Colors.textSecondary, marginTop: Spacing.md, marginBottom: Spacing.xs, marginLeft: Spacing.xs },
  foodInputRow: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-end' },
  foodTags: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.sm },
  foodTag: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surfaceSecondary, borderRadius: BorderRadius.full, paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs, gap: 4 },
  foodTagText: { fontSize: FontSize.sm, color: Colors.text },
  sectionTitle: { fontSize: FontSize.lg, fontWeight: '600', color: Colors.text, marginTop: Spacing.xl, marginBottom: Spacing.sm },
  recentCard: { marginBottom: Spacing.sm },
  recentName: { fontSize: FontSize.md, fontWeight: '500', color: Colors.text },
  recentMeta: { fontSize: FontSize.xs, color: Colors.textTertiary, marginTop: 2 },
});
