import React, { useState } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { Button } from '../../components/ui/Button';
import { Colors, Spacing, FontSize } from '../../constants/theme';

const { width } = Dimensions.get('window');

const SLIDES = [
  {
    icon: 'heart' as const,
    title: 'Welcome to GutWell',
    description: 'Stop guessing. Start knowing. Track your gut to discover exactly what makes you feel your best.',
  },
  {
    icon: 'body' as const,
    title: 'Quick Daily Check-ins',
    description: 'Every check-in reveals patterns. Stool type, bloating, pain, energy — it takes less than a minute.',
  },
  {
    icon: 'restaurant' as const,
    title: 'Connect Food & Symptoms',
    description: 'Log your meals and see which foods energize you and which ones trigger discomfort.',
  },
  {
    icon: 'trending-up' as const,
    title: 'Your Personal Gut Score',
    description: 'Watch your health improve over time. First patterns emerge after just 14 days of tracking.',
  },
];

export default function WelcomeScreen() {
  const { user, refreshProfile } = useAuth();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [loading, setLoading] = useState(false);

  const isLast = currentSlide === SLIDES.length - 1;
  const slide = SLIDES[currentSlide];

  const handleNext = async () => {
    if (!isLast) {
      setCurrentSlide(currentSlide + 1);
      return;
    }

    // Complete onboarding
    if (!user) return;
    setLoading(true);
    await supabase
      .from('profiles')
      .update({ onboarding_completed: true })
      .eq('id', user.id);
    await refreshProfile();
    setLoading(false);
    router.replace('/(tabs)');
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.iconCircle}>
          <Ionicons name={slide.icon} size={48} color={Colors.primary} />
        </View>
        <Text style={styles.title}>{slide.title}</Text>
        <Text style={styles.description}>{slide.description}</Text>
      </View>

      <View style={styles.footer}>
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <View
              key={i}
              style={[styles.dot, i === currentSlide && styles.dotActive]}
            />
          ))}
        </View>

        <Button
          title={isLast ? "Get Started" : "Next"}
          onPress={handleNext}
          loading={loading}
          size="lg"
          style={{ width: '100%' }}
        />

        {!isLast && (
          <Button
            title="Skip"
            onPress={async () => {
              if (!user) return;
              setLoading(true);
              await supabase.from('profiles').update({ onboarding_completed: true }).eq('id', user.id);
              await refreshProfile();
              setLoading(false);
              router.replace('/(tabs)');
            }}
            variant="ghost"
            size="sm"
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, justifyContent: 'space-between' },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.xl },
  iconCircle: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: Colors.surfaceSecondary,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  title: { fontSize: FontSize.xxl, fontWeight: '700', color: Colors.text, textAlign: 'center', marginBottom: Spacing.md },
  description: { fontSize: FontSize.md, color: Colors.textSecondary, textAlign: 'center', lineHeight: 24, maxWidth: width * 0.8 },
  footer: { padding: Spacing.lg, paddingBottom: Spacing.xxl, alignItems: 'center', gap: Spacing.md },
  dots: { flexDirection: 'row', gap: Spacing.sm },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.border },
  dotActive: { backgroundColor: Colors.primary, width: 24 },
});
