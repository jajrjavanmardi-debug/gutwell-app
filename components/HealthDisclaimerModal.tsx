import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Animated,
  Easing,
  ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from './ui/Button';
import { Colors, FontFamily, FontSize, Spacing } from '../constants/theme';
import { supabase } from '../lib/supabase';

// Per-user acceptance: a second account on the same device must see the
// disclaimer again. Acceptance is also timestamped server-side for an
// auditable consent trail (user_profiles.health_data_consent_*).
const STORAGE_KEY_PREFIX = 'health_disclaimer_accepted';
const CONSENT_VERSION = '2026-06-10';

function storageKeyFor(userId?: string | null): string {
  return userId ? `${STORAGE_KEY_PREFIX}:${userId}` : STORAGE_KEY_PREFIX;
}

type Props = {
  visible: boolean;
  onAccept: () => void;
  userId?: string | null;
};

export function HealthDisclaimerModal({ visible, onAccept, userId }: Props) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    if (visible) {
      fadeAnim.setValue(0);
      slideAnim.setValue(30);

      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 480,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 480,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  const handleAccept = async () => {
    await AsyncStorage.setItem(storageKeyFor(userId), 'true');
    if (userId) {
      // Best-effort consent trail; local acceptance is the gate either way.
      supabase
        .from('user_profiles')
        .upsert(
          {
            user_id: userId,
            health_data_consent_accepted: true,
            health_data_consent_accepted_at: new Date().toISOString(),
            health_data_consent_version: CONSENT_VERSION,
          },
          { onConflict: 'user_id' },
        )
        .then(({ error }) => {
          if (error) console.warn('[disclaimer] consent upsert failed', error.message);
        });
    }
    onAccept();
  };

  const handleViewPrivacy = () => {
    router.push('/privacy-policy');
  };

  return (
    <Modal visible={visible} animationType="fade" statusBarTranslucent>
      <StatusBar style="light" />
      <LinearGradient colors={['#0B1F14', '#1B4332', '#0B1F14']} style={styles.container}>
        <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
          <Animated.View
            style={[
              styles.content,
              {
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }],
              },
            ]}
          >
            <ScrollView
              contentContainerStyle={styles.scrollInner}
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
            {/* Icon */}
            <View style={styles.iconRing}>
              <Ionicons name="medical-outline" size={36} color="#52B788" />
            </View>

            {/* Title */}
            <Text style={styles.title}>Health Disclaimer</Text>

            {/* Body */}
            <Text style={styles.body}>
              GutWell is a wellness tracking app, not a medical device. The
              information provided is for personal tracking purposes only and
              does not constitute medical advice.
            </Text>

            <Text style={styles.body}>
              Always consult a qualified healthcare professional for medical
              concerns.
            </Text>

            {/* Divider */}
            <View style={styles.divider} />

            {/* Legal note */}
            <Text style={styles.legalNote}>
              By continuing, you acknowledge that GutWell does not diagnose,
              treat, cure, or prevent any disease or medical condition.
            </Text>
            </ScrollView>
          </Animated.View>

          {/* Buttons */}
          <View style={styles.buttonSection}>
            <Button
              title="I Understand"
              onPress={handleAccept}
              size="lg"
              style={styles.primaryButton}
              textStyle={styles.primaryButtonText}
            />
            <Button
              title="View Privacy Policy"
              onPress={handleViewPrivacy}
              variant="ghost"
              size="lg"
              style={styles.ghostButton}
              textStyle={styles.ghostButtonText}
            />
          </View>
        </SafeAreaView>
      </LinearGradient>
    </Modal>
  );
}

/** Check if disclaimer has been accepted */
export async function hasAcceptedDisclaimer(userId?: string | null): Promise<boolean> {
  const value = await AsyncStorage.getItem(storageKeyFor(userId));
  return value === 'true';
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    justifyContent: 'space-between',
  },
  content: {
    flex: 1,
    paddingHorizontal: 32,
  },
  scrollInner: {
    flexGrow: 1,
    justifyContent: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.lg,
  },
  iconRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(82,183,136,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(82,183,136,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: Spacing.md,
  },
  title: {
    fontFamily: FontFamily.displayBold,
    fontSize: 30,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  body: {
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.md,
    color: 'rgba(255,255,255,0.75)',
    textAlign: 'center',
    lineHeight: 24,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginVertical: Spacing.md,
    marginHorizontal: Spacing.xl,
  },
  legalNote: {
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.xs,
    color: 'rgba(255,255,255,0.45)',
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: Spacing.md,
  },
  buttonSection: {
    paddingHorizontal: 32,
    paddingBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  primaryButton: {
    backgroundColor: '#FFFFFF',
  },
  primaryButtonText: {
    // The Button primary variant uses white text; on this white pill the
    // label must be dark or it disappears entirely.
    color: '#0B2618',
  },
  ghostButton: {
    alignSelf: 'center',
  },
  ghostButtonText: {
    color: 'rgba(255,255,255,0.6)',
  },
});
