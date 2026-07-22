import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FontFamily } from '../../constants/theme';
import StarFieldBackground from '../../components/StarFieldBackground';
import { buildProfileSummary } from '../../lib/onboarding-config';
import { useAuth } from '../../contexts/AuthContext';

export default function ResultsScreen() {
  const { session } = useAuth();
  const [summaryBody, setSummaryBody] = useState<string | null>(null);
  const [hasDiagnosis, setHasDiagnosis] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem('onboarding_answers').then((raw) => {
      const parsed: Record<string, unknown> = raw ? JSON.parse(raw) : {};
      const { body, hasDiagnosis: dx } = buildProfileSummary(parsed);
      setSummaryBody(body);
      setHasDiagnosis(dx);
    }).catch(() => {
      setSummaryBody("We'll start by building a picture of your gut patterns over time.");
    });
  }, []);

  const handleContinue = () => {
    // Authenticated incomplete user → checkin-prompt.
    // Unauthenticated user → signup.
    router.push(session ? '/(onboarding)/checkin-prompt' : '/(auth)/signup');
  };

  if (summaryBody === null) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color="#52B788" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <LinearGradient colors={['#0B1F14', '#1B4332']} style={StyleSheet.absoluteFill} />
      <StarFieldBackground count={120} seed={33} />

      <SafeAreaView edges={['top', 'bottom']} style={styles.safe}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Check badge */}
          <View style={styles.badgeWrap}>
            <View style={styles.checkBadge}>
              <Ionicons name="checkmark" size={22} color="#FFFFFF" />
            </View>
          </View>

          {/* Headline */}
          <Text style={styles.headline}>Your Gut Profile is ready to begin.</Text>

          {/* Dynamic summary */}
          <View style={styles.summaryCard}>
            <Text style={styles.summaryBody}>{summaryBody}</Text>
          </View>

          {/* Diagnosis note */}
          {hasDiagnosis ? (
            <View style={styles.noteCard}>
              <Ionicons name="information-circle-outline" size={18} color="#52B788" style={{ marginTop: 1 }} />
              <Text style={styles.noteText}>
                GutWell supports tracking and pattern awareness. It does not replace medical care or diagnosis.
              </Text>
            </View>
          ) : null}

          {/* Supporting copy */}
          <Text style={styles.supporting}>
            Your insights become more personal as you add meals and quick check-ins.
          </Text>

          <View style={styles.spacer} />
        </ScrollView>

        {/* CTA */}
        <View style={styles.bottom}>
          <TouchableOpacity
            style={styles.cta}
            onPress={handleContinue}
            activeOpacity={0.88}
            accessibilityRole="button"
            accessibilityLabel="Continue"
          >
            <Text style={styles.ctaText}>Continue</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0B1F14' },
  safe: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 16,
    alignItems: 'center',
  },
  badgeWrap: { alignItems: 'center', marginBottom: 20 },
  checkBadge: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#52B788',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headline: {
    fontFamily: FontFamily.displayBold,
    fontSize: 28,
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 36,
    marginBottom: 24,
  },
  summaryCard: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    padding: 20,
    marginBottom: 12,
  },
  summaryBody: {
    fontFamily: FontFamily.sansRegular,
    fontSize: 16,
    color: 'rgba(255,255,255,0.85)',
    lineHeight: 24,
  },
  noteCard: {
    width: '100%',
    flexDirection: 'row',
    gap: 10,
    backgroundColor: 'rgba(82,183,136,0.08)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(82,183,136,0.2)',
    padding: 14,
    marginBottom: 12,
    alignItems: 'flex-start',
  },
  noteText: {
    flex: 1,
    fontFamily: FontFamily.sansRegular,
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    lineHeight: 20,
  },
  supporting: {
    fontFamily: FontFamily.sansRegular,
    fontSize: 14,
    color: 'rgba(255,255,255,0.45)',
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 8,
    paddingHorizontal: 8,
  },
  spacer: { height: 80 },
  bottom: {
    paddingBottom: 40,
    paddingHorizontal: 24,
  },
  cta: {
    width: '100%',
    height: 60,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  ctaText: {
    fontFamily: FontFamily.sansBold,
    fontSize: 17,
    color: '#0B1F14',
    letterSpacing: -0.3,
  },
});
