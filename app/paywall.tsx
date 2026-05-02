import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, FontFamily, FontSize, Spacing, BorderRadius } from '../constants/theme';
import { track, Events } from '../lib/analytics';
import { getPaywallOffering, initSubscription, purchasePlan, restorePurchases } from '../lib/subscription';

const FEATURES = [
  '🔬 Food-symptom correlation analysis',
  '📊 Weekly gut health digest',
  '📈 Advanced trend insights',
  '🔔 Smart streak & reminder alerts',
  '📤 Export reports for your doctor',
  '🏆 Unlimited achievement tracking',
];

export default function PaywallScreen() {
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'annual'>('annual');
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    track(Events.PAYWALL_VIEWED);
    initSubscription()
      .then(() => getPaywallOffering())
      .catch((error) => {
        console.warn('Failed to load offerings:', error);
      });
  }, []);

  const handleCTA = async () => {
    if (purchasing) return;
    setPurchasing(true);
    const result = await purchasePlan(selectedPlan);
    setPurchasing(false);

    if (result.success) {
      track('purchase_success', { plan: selectedPlan });
      Alert.alert('Success', 'Premium is now active.');
      router.back();
      return;
    }

    if (!result.cancelled) {
      track('purchase_failed', { plan: selectedPlan, message: result.message });
      Alert.alert('Purchase Failed', result.message || 'Please try again.');
    }
  };

  const handleRestore = async () => {
    if (restoring) return;
    setRestoring(true);
    const result = await restorePurchases();
    setRestoring(false);

    if (result.success) {
      track('restore_success');
      Alert.alert('Restore Complete', 'Premium access has been restored.');
      router.back();
      return;
    }

    track('restore_failed', { message: result.message });
    Alert.alert('Restore Purchases', result.message || 'No previous purchases found.');
  };

  return (
    <LinearGradient
      colors={['#0B1F14', '#1B4332', '#0B1F14']}
      style={styles.gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
    >
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        {/* Close Button */}
        <TouchableOpacity
          style={styles.closeBtn}
          onPress={() => router.back()}
          activeOpacity={0.7}
          hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
        >
          <Ionicons name="close" size={22} color="rgba(255,255,255,0.9)" />
        </TouchableOpacity>

        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          {/* Hero */}
          <View style={styles.hero}>
            <View style={styles.heroIconWrap}>
              <Ionicons name="leaf" size={52} color="#52B788" />
            </View>
            <Text style={styles.heroTitle}>NutriFlow Premium</Text>
            <Text style={styles.heroSubtitle}>Unlock your full gut health picture</Text>
          </View>

          {/* Features List */}
          <View style={styles.featuresCard}>
            {FEATURES.map((feature, i) => (
              <View key={i} style={styles.featureRow}>
                <Ionicons name="checkmark-circle" size={20} color={Colors.secondary} />
                <Text style={styles.featureText}>{feature}</Text>
              </View>
            ))}
          </View>

          {/* Pricing Cards */}
          <View style={styles.pricingRow}>
            {/* Monthly */}
            <TouchableOpacity
              style={[
                styles.pricingCard,
                selectedPlan === 'monthly' && styles.pricingCardSelected,
              ]}
              onPress={() => setSelectedPlan('monthly')}
              activeOpacity={0.8}
            >
              <Text style={styles.pricingAmount}>$6.99</Text>
              <Text style={styles.pricingPeriod}>/mo</Text>
              <Text style={styles.pricingBilled}>Billed monthly</Text>
            </TouchableOpacity>

            {/* Annual */}
            <TouchableOpacity
              style={[
                styles.pricingCard,
                selectedPlan === 'annual' && styles.pricingCardSelected,
              ]}
              onPress={() => setSelectedPlan('annual')}
              activeOpacity={0.8}
            >
              <View style={styles.bestValueBadge}>
                <Text style={styles.bestValueText}>BEST VALUE</Text>
              </View>
              <Text style={styles.pricingAmount}>$39.99</Text>
              <Text style={styles.pricingPeriod}>/yr</Text>
              <Text style={styles.pricingSubPrice}>Just $3.33/mo</Text>
              <Text style={styles.pricingBilled}>Billed annually — save 52%</Text>
            </TouchableOpacity>
          </View>

          {/* CTA Button */}
          <TouchableOpacity
            style={styles.ctaWrapper}
            onPress={handleCTA}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={['#52B788', '#2D6A4F']}
              style={styles.ctaButton}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Text style={styles.ctaText}>Start 7-Day Free Trial</Text>
            </LinearGradient>
          </TouchableOpacity>

          {/* Fine Print */}
          <Text style={styles.finePrint}>
            Cancel anytime. Renews automatically. Restore purchases.
          </Text>

          {/* Restore Purchases */}
          <TouchableOpacity onPress={handleRestore} activeOpacity={0.7}>
            <Text style={styles.restoreText}>{restoring ? 'Restoring...' : 'Restore Purchases'}</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  safe: {
    flex: 1,
  },
  closeBtn: {
    position: 'absolute',
    top: 56,
    right: Spacing.lg,
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scroll: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xxl + Spacing.lg,
    paddingBottom: Spacing.xxl,
    alignItems: 'center',
  },

  // Hero
  hero: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  heroIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(82,183,136,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(82,183,136,0.25)',
  },
  heroTitle: {
    fontFamily: FontFamily.displayBold,
    fontSize: 36,
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 44,
    marginBottom: Spacing.sm,
  },
  heroSubtitle: {
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.md,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
  },

  // Features
  featuresCard: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    gap: Spacing.md,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  featureText: {
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.sm,
    color: 'rgba(255,255,255,0.88)',
    flex: 1,
    lineHeight: 20,
  },

  // Pricing
  pricingRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    width: '100%',
    marginBottom: Spacing.xl,
  },
  pricingCard: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.sm,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.12)',
    minHeight: 140,
    justifyContent: 'center',
  },
  pricingCardSelected: {
    borderColor: Colors.secondary,
    backgroundColor: 'rgba(82,183,136,0.15)',
  },
  bestValueBadge: {
    backgroundColor: '#52B788',
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    marginBottom: Spacing.sm,
  },
  bestValueText: {
    fontFamily: FontFamily.sansBold,
    fontSize: 10,
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  pricingAmount: {
    fontFamily: FontFamily.displayBold,
    fontSize: 28,
    color: '#FFFFFF',
    lineHeight: 34,
  },
  pricingPeriod: {
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.sm,
    color: 'rgba(255,255,255,0.6)',
    marginTop: -2,
  },
  pricingSubPrice: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
    color: Colors.secondary,
    marginTop: 4,
  },
  pricingBilled: {
    fontFamily: FontFamily.sansRegular,
    fontSize: 11,
    color: 'rgba(255,255,255,0.45)',
    marginTop: 4,
    textAlign: 'center',
  },

  // CTA
  ctaWrapper: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: Spacing.md,
    shadowColor: '#52B788',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  ctaButton: {
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
  },
  ctaText: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.lg,
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },

  // Fine Print
  finePrint: {
    fontFamily: FontFamily.sansRegular,
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
    textAlign: 'center',
    marginBottom: Spacing.md,
    lineHeight: 16,
  },
  restoreText: {
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.sm,
    color: 'rgba(255,255,255,0.5)',
    textDecorationLine: 'underline',
    textAlign: 'center',
  },
});
