import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Animated,
  Easing,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from './ui/Button';
import { Colors, FontFamily, FontSize, Spacing } from '../constants/theme';

const STORAGE_KEY = 'health_disclaimer_accepted';

type Props = {
  visible: boolean;
  onAccept: () => void;
};

export function HealthDisclaimerModal({ visible, onAccept }: Props) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const buttonAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      fadeAnim.setValue(0);
      slideAnim.setValue(30);
      buttonAnim.setValue(0);

      Animated.stagger(200, [
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
        ]),
        Animated.timing(buttonAnim, {
          toValue: 1,
          duration: 380,
          delay: 800,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  const handleAccept = async () => {
    await AsyncStorage.setItem(STORAGE_KEY, 'true');
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
          </Animated.View>

          {/* Buttons */}
          <Animated.View style={[styles.buttonSection, { opacity: buttonAnim }]}>
            <Button
              title="I Understand"
              onPress={handleAccept}
              size="lg"
              style={styles.primaryButton}
            />
            <Button
              title="View Privacy Policy"
              onPress={handleViewPrivacy}
              variant="ghost"
              size="lg"
              style={styles.ghostButton}
              textStyle={styles.ghostButtonText}
            />
          </Animated.View>
        </SafeAreaView>
      </LinearGradient>
    </Modal>
  );
}

/** Check if disclaimer has been accepted */
export async function hasAcceptedDisclaimer(): Promise<boolean> {
  const value = await AsyncStorage.getItem(STORAGE_KEY);
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
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: Spacing.md,
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
  ghostButton: {
    alignSelf: 'center',
  },
  ghostButtonText: {
    color: 'rgba(255,255,255,0.6)',
  },
});
