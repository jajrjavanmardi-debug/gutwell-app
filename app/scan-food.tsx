import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Image,
  ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { readAsStringAsync } from 'expo-file-system/legacy';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Toast } from '../components/ui/Toast';
import { Colors, Spacing, FontSize, BorderRadius, Shadows } from '../constants/theme';

type FoodItem = {
  name: string;
  gut_score: number;
  fodmap_level: 'low' | 'medium' | 'high';
  flags: string[];
  reasoning: string;
};

type AnalysisResult = {
  foods: FoodItem[];
  overall_score: number;
  summary: string;
};

type ScreenState = 'camera' | 'analyzing' | 'results';

export default function ScanFoodScreen() {
  const { user } = useAuth();
  const [state, setState] = useState<ScreenState>('camera');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' as 'success' | 'error' });

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Camera Access', 'Please enable camera access in Settings to scan food.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      base64: true,
    });
    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
      setImageBase64(result.assets[0].base64 ?? null);
      analyzeImage(result.assets[0].base64 ?? null, result.assets[0].uri);
    }
  };

  const pickFromGallery = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      base64: true,
    });
    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
      setImageBase64(result.assets[0].base64 ?? null);
      analyzeImage(result.assets[0].base64 ?? null, result.assets[0].uri);
    }
  };

  const analyzeImage = async (base64: string | null, uri: string) => {
    setState('analyzing');

    let imageData = base64;
    if (!imageData) {
      try {
        const fileData = await readAsStringAsync(uri, {
          encoding: 'base64',
        });
        imageData = fileData;
        setImageBase64(fileData);
      } catch {
        setState('camera');
        setToast({ visible: true, message: 'Failed to read image', type: 'error' });
        return;
      }
    }

    try {
      const { data, error } = await supabase.functions.invoke('analyze-food', {
        body: { image: imageData, mimeType: 'image/jpeg' },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setAnalysis(data as AnalysisResult);
      setState('results');
    } catch (err) {
      console.warn('Analysis failed:', err);
      setState('camera');
      setToast({ visible: true, message: 'Could not analyze the image. Try again.', type: 'error' });
    }
  };

  const getMealType = (): string => {
    const hour = new Date().getHours();
    if (hour < 11) return 'breakfast';
    if (hour < 14) return 'lunch';
    if (hour < 17) return 'snack';
    return 'dinner';
  };

  const scoreColor = (score: number) => {
    if (score >= 8) return Colors.primary;
    if (score >= 5) return Colors.accent;
    return Colors.severity[4];
  };

  const scoreLabel = (score: number) => {
    if (score >= 8) return 'Great for your gut';
    if (score >= 5) return 'Moderate gut impact';
    return 'May irritate your gut';
  };

  const fodmapColor = (level: string) => {
    if (level === 'low') return Colors.primary;
    if (level === 'medium') return Colors.accent;
    return Colors.severity[4];
  };

  const flagColor = (flag: string) => {
    const good = ['probiotic', 'prebiotic', 'high-fiber', 'anti-inflammatory'];
    return good.includes(flag) ? Colors.primary : Colors.severity[4];
  };

  const handleLogMeal = async () => {
    if (!user || !analysis) return;
    setSaving(true);

    const foods = analysis.foods.map(f => f.name.trim().toLowerCase());
    const mealName = foods.length > 0
      ? foods.slice(0, 3).join(', ') + (foods.length > 3 ? ` +${foods.length - 3} more` : '')
      : 'Scanned meal';

    const { error } = await supabase.from('food_logs').insert({
      user_id: user.id,
      meal_name: mealName,
      meal_type: getMealType(),
      foods: foods.length > 0 ? foods : null,
      note: `Gut score: ${analysis.overall_score}/10. ${analysis.summary}`,
    });

    setSaving(false);
    if (error) {
      setToast({ visible: true, message: 'Failed to save meal', type: 'error' });
    } else {
      setToast({ visible: true, message: 'Meal logged!', type: 'success' });
      setTimeout(() => router.back(), 1500);
    }
  };

  const resetScan = () => {
    setState('camera');
    setImageUri(null);
    setImageBase64(null);
    setAnalysis(null);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="close" size={28} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Scan Food</Text>
        <View style={{ width: 28 }} />
      </View>

      {state === 'camera' && (
        <View style={styles.cameraState}>
          <View style={styles.cameraPlaceholder}>
            <Ionicons name="camera" size={64} color={Colors.textTertiary} />
            <Text style={styles.cameraTitle}>Scan your meal</Text>
            <Text style={styles.cameraSubtitle}>
              Take a photo and get an instant gut health analysis
            </Text>
          </View>
          <View style={styles.cameraActions}>
            <Button
              title="Take Photo"
              onPress={takePhoto}
              size="lg"
              icon={<Ionicons name="camera" size={20} color={Colors.textInverse} />}
              style={{ flex: 1 }}
            />
            <Button
              title="Gallery"
              onPress={pickFromGallery}
              variant="outline"
              size="lg"
              icon={<Ionicons name="images" size={20} color={Colors.primary} />}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      )}

      {state === 'analyzing' && (
        <View style={styles.analyzingState}>
          {imageUri && (
            <Image source={{ uri: imageUri }} style={styles.previewImage} />
          )}
          <View style={styles.analyzingOverlay}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.analyzingText}>Analyzing your meal...</Text>
            <Text style={styles.analyzingSubtext}>Identifying foods and gut impact</Text>
          </View>
        </View>
      )}

      {state === 'results' && analysis && (
        <ScrollView contentContainerStyle={styles.resultsScroll}>
          {imageUri && (
            <Image source={{ uri: imageUri }} style={styles.resultImage} />
          )}

          {/* Overall Score */}
          <Card style={styles.overallCard} variant="elevated">
            <View style={[styles.overallBadge, { backgroundColor: scoreColor(analysis.overall_score) + '15', borderColor: scoreColor(analysis.overall_score) }]}>
              <Text style={[styles.overallScore, { color: scoreColor(analysis.overall_score) }]}>
                {analysis.overall_score}
              </Text>
              <Text style={[styles.overallOutOf, { color: scoreColor(analysis.overall_score) }]}>/10</Text>
            </View>
            <Text style={[styles.overallLabel, { color: scoreColor(analysis.overall_score) }]}>
              {scoreLabel(analysis.overall_score)}
            </Text>
            <Text style={styles.overallSummary}>{analysis.summary}</Text>
          </Card>

          {/* Food Items */}
          <Text style={styles.sectionTitle}>Food Breakdown</Text>
          {analysis.foods.map((food, i) => (
            <Card key={i} style={styles.foodCard}>
              <View style={styles.foodHeader}>
                <Text style={styles.foodName}>{food.name}</Text>
                <View style={[styles.foodScoreBadge, { backgroundColor: scoreColor(food.gut_score) + '15' }]}>
                  <Text style={[styles.foodScoreText, { color: scoreColor(food.gut_score) }]}>
                    {food.gut_score}/10
                  </Text>
                </View>
              </View>

              <View style={styles.foodTags}>
                <View style={[styles.fodmapChip, { backgroundColor: fodmapColor(food.fodmap_level) + '15' }]}>
                  <Text style={[styles.fodmapText, { color: fodmapColor(food.fodmap_level) }]}>
                    {food.fodmap_level.toUpperCase()} FODMAP
                  </Text>
                </View>
                {food.flags.map((flag, j) => (
                  <View key={j} style={[styles.flagPill, { backgroundColor: flagColor(flag) + '12' }]}>
                    <Text style={[styles.flagText, { color: flagColor(flag) }]}>
                      {flag.replace('-', ' ')}
                    </Text>
                  </View>
                ))}
              </View>

              <Text style={styles.foodReasoning}>{food.reasoning}</Text>
            </Card>
          ))}

          {/* Actions */}
          <View style={styles.resultActions}>
            <Button
              title="Log This Meal"
              onPress={handleLogMeal}
              loading={saving}
              size="lg"
              icon={<Ionicons name="checkmark-circle" size={20} color={Colors.textInverse} />}
              style={{ flex: 2 }}
            />
            <Button
              title="Scan Again"
              onPress={resetScan}
              variant="outline"
              size="lg"
              style={{ flex: 1 }}
            />
          </View>
        </ScrollView>
      )}

      <Toast
        message={toast.message}
        type={toast.type}
        visible={toast.visible}
        onDismiss={() => setToast(t => ({ ...t, visible: false }))}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: Spacing.md, paddingTop: Spacing.sm,
  },
  title: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.text },

  // Camera state
  cameraState: { flex: 1, justifyContent: 'space-between', padding: Spacing.lg },
  cameraPlaceholder: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    backgroundColor: Colors.surfaceSecondary, borderRadius: BorderRadius.xl,
    margin: Spacing.lg, gap: Spacing.md,
  },
  cameraTitle: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.text },
  cameraSubtitle: { fontSize: FontSize.sm, color: Colors.textTertiary, textAlign: 'center', maxWidth: 250 },
  cameraActions: { flexDirection: 'row', gap: Spacing.md, paddingBottom: Spacing.lg },

  // Analyzing state
  analyzingState: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  previewImage: { width: '100%', height: '60%', resizeMode: 'cover', borderRadius: BorderRadius.lg, opacity: 0.4 },
  analyzingOverlay: {
    position: 'absolute', alignItems: 'center', gap: Spacing.md,
  },
  analyzingText: { fontSize: FontSize.lg, fontWeight: '600', color: Colors.text },
  analyzingSubtext: { fontSize: FontSize.sm, color: Colors.textTertiary },

  // Results state
  resultsScroll: { padding: Spacing.lg, paddingBottom: Spacing.xxl },
  resultImage: { width: '100%', height: 200, borderRadius: BorderRadius.lg, resizeMode: 'cover', marginBottom: Spacing.lg },
  overallCard: { alignItems: 'center', padding: Spacing.xl, marginBottom: Spacing.lg },
  overallBadge: {
    width: 80, height: 80, borderRadius: 40,
    justifyContent: 'center', alignItems: 'center',
    flexDirection: 'row', borderWidth: 3,
  },
  overallScore: { fontSize: FontSize.hero, fontWeight: '800' },
  overallOutOf: { fontSize: FontSize.md, fontWeight: '600', marginTop: 8 },
  overallLabel: { fontSize: FontSize.md, fontWeight: '700', marginTop: Spacing.sm },
  overallSummary: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', marginTop: Spacing.xs, lineHeight: 20 },
  sectionTitle: { fontSize: FontSize.lg, fontWeight: '600', color: Colors.text, marginBottom: Spacing.sm },

  // Food cards
  foodCard: { marginBottom: Spacing.sm },
  foodHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  foodName: { fontSize: FontSize.md, fontWeight: '600', color: Colors.text, textTransform: 'capitalize', flex: 1 },
  foodScoreBadge: { borderRadius: BorderRadius.full, paddingHorizontal: Spacing.sm, paddingVertical: 2 },
  foodScoreText: { fontSize: FontSize.xs, fontWeight: '700' },
  foodTags: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, marginTop: Spacing.sm },
  fodmapChip: { borderRadius: BorderRadius.full, paddingHorizontal: Spacing.sm, paddingVertical: 3 },
  fodmapText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  flagPill: { borderRadius: BorderRadius.full, paddingHorizontal: Spacing.sm, paddingVertical: 3 },
  flagText: { fontSize: 10, fontWeight: '600', textTransform: 'capitalize' },
  foodReasoning: { fontSize: FontSize.xs, color: Colors.textTertiary, marginTop: Spacing.sm, lineHeight: 18 },

  // Result actions
  resultActions: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.lg },
});
