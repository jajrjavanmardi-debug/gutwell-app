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
import { Colors, Spacing, FontSize, BorderRadius, FontFamily } from '../constants/theme';
import { track, Events } from '../lib/analytics';
import { enqueue } from '../lib/offline-queue';

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

function normalizeAnalysisResult(data: any): AnalysisResult {
  const foods = Array.isArray(data?.foods)
    ? data.foods
      .filter((f: any) => typeof f?.name === 'string' && f.name.trim().length > 0)
      .map((f: any) => ({
        name: String(f.name),
        gut_score: typeof f.gut_score === 'number' ? f.gut_score : 5,
        fodmap_level: ['low', 'medium', 'high'].includes(f.fodmap_level) ? f.fodmap_level : 'medium',
        flags: Array.isArray(f.flags) ? f.flags.filter((x: any) => typeof x === 'string') : [],
        reasoning: typeof f.reasoning === 'string' ? f.reasoning : '',
      }))
    : [];

  return {
    foods,
    overall_score: typeof data?.overall_score === 'number' ? data.overall_score : 5,
    summary: typeof data?.summary === 'string' ? data.summary : 'Analysis completed.',
  };
}

function getAnalysisErrorMessage(error: any): string {
  const status = error?.context?.status;
  const code = error?.context?.code;
  const message = String(error?.message || '').toLowerCase();

  if (status === 401 || code === 'UNAUTHORIZED') {
    return 'Your session expired. Please sign in again.';
  }
  if (status === 429 || code === 'RATE_LIMITED') {
    return 'Too many scans right now. Please wait a minute and try again.';
  }
  if (status === 413 || code === 'IMAGE_TOO_LARGE') {
    return 'Image is too large. Please try another photo.';
  }
  if (status === 400 || code === 'BAD_REQUEST') {
    return 'Could not read this image. Try a clearer food photo.';
  }
  if (message.includes('network') || message.includes('timeout')) {
    return 'Network issue while analyzing. Please check your connection and retry.';
  }
  return 'Could not analyze the image. Try again.';
}

export default function ScanFoodScreen() {
  const { user } = useAuth();
  const [state, setState] = useState<ScreenState>('camera');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' as 'success' | 'error' });

  const invokeAnalyzeFood = async (image: string, mimeType: string) => {
    const timeoutMs = 25000;
    const timeoutPromise = new Promise<never>((_, reject) => {
      const timeoutId = setTimeout(() => {
        clearTimeout(timeoutId);
        reject(new Error('Analysis timeout'));
      }, timeoutMs);
    });

    const invokePromise = supabase.functions.invoke('analyze-food', {
      body: { image, mimeType },
    });

    return Promise.race([invokePromise, timeoutPromise]);
  };

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
      const { data, error } = await invokeAnalyzeFood(imageData, 'image/jpeg');

      if (error) throw error;
      if (data?.code) {
        const apiError = new Error(data?.message || 'Analysis failed');
        (apiError as any).context = { status: 400, code: data.code };
        throw apiError;
      }

      const normalized = normalizeAnalysisResult(data);
      setAnalysis(normalized);
      setState('results');
      track(Events.FOOD_SCANNED, { foodsDetected: normalized.foods.length });
    } catch (err) {
      const typedErr: any = err;
      const message = getAnalysisErrorMessage(typedErr);
      const status = typedErr?.context?.status ?? typedErr?.status ?? null;
      const code = typedErr?.context?.code ?? typedErr?.code ?? 'unknown';
      console.warn('Analysis failed:', { message: typedErr?.message, status, code });
      track('food_scan_failed', { status, code });
      setState('camera');
      setToast({ visible: true, message, type: 'error' });
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
    if (score >= 8) return Colors.secondary;
    if (score >= 5) return Colors.accent;
    return Colors.error;
  };

  const scoreLabel = (score: number) => {
    if (score >= 8) return 'Great for your gut';
    if (score >= 5) return 'Moderate gut impact';
    return 'May irritate your gut';
  };

  const fodmapColor = (level: string) => {
    if (level === 'low') return Colors.primary;
    if (level === 'medium') return Colors.accent;
    return Colors.error;
  };

  const flagColor = (flag: string) => {
    const good = ['probiotic', 'prebiotic', 'high-fiber', 'anti-inflammatory'];
    return good.includes(flag) ? Colors.primary : Colors.error;
  };

  const handleLogMeal = async () => {
    if (!user || !analysis) return;
    setSaving(true);

    const foods = (Array.isArray(analysis.foods) ? analysis.foods : []).map(f => f.name.trim().toLowerCase());
    const mealName = foods.length > 0
      ? foods.slice(0, 3).join(', ') + (foods.length > 3 ? ` +${foods.length - 3} more` : '')
      : 'Scanned meal';

    const payload = {
      user_id: user.id,
      meal_name: mealName,
      meal_type: getMealType(),
      foods: foods.length > 0 ? foods : null,
      note: `Gut score: ${analysis.overall_score}/10. ${analysis.summary}`,
      logged_at: new Date().toISOString(),
    };
    const { error } = await supabase.from('food_logs').insert(payload);

    setSaving(false);
    if (error) {
      if (error.message?.includes('network') || error.message?.includes('Network') || error.code === 'PGRST301' || !error.code) {
        await enqueue('food_logs', payload);
        setToast({ visible: true, message: 'Saved offline — will sync when connected', type: 'success' });
        setTimeout(() => router.back(), 1500);
      } else {
        setToast({ visible: true, message: 'Failed to save meal', type: 'error' });
      }
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
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.closeBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="close" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Scan Food</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Camera State */}
      {state === 'camera' && (
        <View style={styles.cameraState}>
          <View style={styles.cameraPlaceholder}>
            <View style={styles.cameraIconCircle}>
              <Ionicons name="camera-outline" size={48} color={Colors.primary} />
            </View>
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
              style={styles.cameraActionBtn}
            />
            <Button
              title="Gallery"
              onPress={pickFromGallery}
              variant="outline"
              size="lg"
              icon={<Ionicons name="images-outline" size={20} color={Colors.primary} />}
              style={styles.cameraActionBtn}
            />
          </View>
        </View>
      )}

      {/* Analyzing State */}
      {state === 'analyzing' && (
        <View style={styles.analyzingState}>
          {imageUri && (
            <Image source={{ uri: imageUri }} style={styles.previewImage} />
          )}
          <View style={styles.analyzingOverlay}>
            <View style={styles.analyzingCard}>
              <ActivityIndicator size="large" color={Colors.primary} />
              <Text style={styles.analyzingText}>Analyzing your meal...</Text>
              <Text style={styles.analyzingSubtext}>
                Identifying foods and gut impact
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* Results State */}
      {state === 'results' && analysis && (
        <ScrollView
          contentContainerStyle={styles.resultsScroll}
          showsVerticalScrollIndicator={false}
        >
          {/* Image Preview */}
          {imageUri && (
            <Image source={{ uri: imageUri }} style={styles.resultImage} />
          )}

          {/* Overall Score Card */}
          <View style={styles.overallCard}>
            <View
              style={[
                styles.overallScoreCircle,
                { borderColor: scoreColor(analysis.overall_score) },
              ]}
            >
              <Text
                style={[
                  styles.overallScoreNum,
                  { color: scoreColor(analysis.overall_score) },
                ]}
              >
                {analysis.overall_score}
              </Text>
              <Text
                style={[
                  styles.overallScoreOutOf,
                  { color: scoreColor(analysis.overall_score) },
                ]}
              >
                /10
              </Text>
            </View>
            <Text
              style={[
                styles.overallLabel,
                { color: scoreColor(analysis.overall_score) },
              ]}
            >
              {scoreLabel(analysis.overall_score)}
            </Text>
            <Text style={styles.overallSummary}>{analysis.summary}</Text>
          </View>

          {/* Food Breakdown */}
          <Text style={styles.sectionTitle}>Food Breakdown</Text>
          {(Array.isArray(analysis.foods) ? analysis.foods : []).map((food, i) => (
            <View key={i} style={styles.foodCard}>
              <View style={styles.foodHeader}>
                <Text style={styles.foodName}>{food.name}</Text>
                <View
                  style={[
                    styles.foodScoreBadge,
                    { backgroundColor: scoreColor(food.gut_score) + '15' },
                  ]}
                >
                  <Text
                    style={[
                      styles.foodScoreText,
                      { color: scoreColor(food.gut_score) },
                    ]}
                  >
                    {food.gut_score}/10
                  </Text>
                </View>
              </View>

              <View style={styles.foodTags}>
                <View
                  style={[
                    styles.fodmapChip,
                    { backgroundColor: fodmapColor(food.fodmap_level) + '15' },
                  ]}
                >
                  <Text
                    style={[
                      styles.fodmapText,
                      { color: fodmapColor(food.fodmap_level) },
                    ]}
                  >
                    {food.fodmap_level.toUpperCase()} FODMAP
                  </Text>
                </View>
                {food.flags.map((flag, j) => (
                  <View
                    key={j}
                    style={[
                      styles.flagPill,
                      { backgroundColor: flagColor(flag) + '12' },
                    ]}
                  >
                    <Text
                      style={[styles.flagText, { color: flagColor(flag) }]}
                    >
                      {flag.replace('-', ' ')}
                    </Text>
                  </View>
                ))}
              </View>

              <Text style={styles.foodReasoning}>{food.reasoning}</Text>
            </View>
          ))}

          {/* Action Buttons */}
          <View style={styles.resultActions}>
            <Button
              title="Log This Meal"
              onPress={handleLogMeal}
              loading={saving}
              size="lg"
              icon={
                <Ionicons
                  name="checkmark-circle"
                  size={20}
                  color={Colors.textInverse}
                />
              }
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
        onDismiss={() => setToast((t) => ({ ...t, visible: false }))}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surfaceSecondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.lg,
    color: Colors.text,
  },
  headerSpacer: {
    width: 36,
  },

  // Camera State
  cameraState: {
    flex: 1,
    justifyContent: 'space-between',
    padding: Spacing.lg,
  },
  cameraPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: BorderRadius.xl,
    marginVertical: Spacing.lg,
    gap: Spacing.md,
  },
  cameraIconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: Colors.primary + '10',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  cameraTitle: {
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xl,
    color: Colors.text,
  },
  cameraSubtitle: {
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.sm,
    color: Colors.textTertiary,
    textAlign: 'center',
    maxWidth: 260,
    lineHeight: 20,
  },
  cameraActions: {
    flexDirection: 'row',
    gap: Spacing.md,
    paddingBottom: Spacing.lg,
  },
  cameraActionBtn: {
    flex: 1,
  },

  // Analyzing State
  analyzingState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
    opacity: 0.35,
  },
  analyzingOverlay: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  analyzingCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.xxl,
    alignItems: 'center',
    gap: Spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 6,
  },
  analyzingText: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.lg,
    color: Colors.text,
  },
  analyzingSubtext: {
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.sm,
    color: Colors.textTertiary,
  },

  // Results State
  resultsScroll: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl + 40,
  },
  resultImage: {
    width: '100%',
    height: 200,
    borderRadius: BorderRadius.xl,
    resizeMode: 'cover',
    marginBottom: Spacing.lg,
  },

  // Overall Score
  overallCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    alignItems: 'center',
    marginBottom: Spacing.xl,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  overallScoreCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 3.5,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    backgroundColor: Colors.surface,
  },
  overallScoreNum: {
    fontFamily: FontFamily.sansExtraBold,
    fontSize: 36,
  },
  overallScoreOutOf: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.md,
    marginTop: 10,
  },
  overallLabel: {
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.md,
    marginTop: Spacing.sm,
  },
  overallSummary: {
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: Spacing.xs,
    lineHeight: 20,
  },

  // Section
  sectionTitle: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.lg,
    color: Colors.text,
    marginBottom: Spacing.md,
  },

  // Food Cards
  foodCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  foodHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  foodName: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.md,
    color: Colors.text,
    textTransform: 'capitalize',
    flex: 1,
  },
  foodScoreBadge: {
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
  },
  foodScoreText: {
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xs,
  },
  foodTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginTop: Spacing.sm,
  },
  fodmapChip: {
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
  },
  fodmapText: {
    fontFamily: FontFamily.sansBold,
    fontSize: 10,
    letterSpacing: 0.5,
  },
  flagPill: {
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
  },
  flagText: {
    fontFamily: FontFamily.sansMedium,
    fontSize: 10,
    textTransform: 'capitalize',
  },
  foodReasoning: {
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.xs,
    color: Colors.textTertiary,
    marginTop: Spacing.sm,
    lineHeight: 18,
  },

  // Result Actions
  resultActions: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.xl,
  },
});
