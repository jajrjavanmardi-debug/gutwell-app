import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { PurchasesOffering } from 'react-native-purchases';
import { useAuth } from '../contexts/AuthContext';
import { Colors, FontFamily, FontSize, Spacing, BorderRadius } from '../constants/theme';
import { track, Events } from '../lib/analytics';
import { useTranslation } from '../lib/i18n';
import {
  formatSubscriptionDiagnostics,
  initSubscription,
  isMonetizationEnabled,
  isSubscriptionDebugEnabled,
  loadPaywallOffering,
  normalizedPriceString,
  purchasePlan,
  selectPackage,
  restorePurchases,
} from '../lib/subscription';

// Only features that are actually premium-gated. Data export, reminders, and
// achievements are free for everyone (export is a data-rights feature and
// must never sit behind a paywall).
// Icons stay in code; the copy lives in t.paywall.feature*.
const FEATURE_ICONS = [
  'analytics-outline',
  'shield-checkmark-outline',
  'calendar-outline',
  'trending-up-outline',
] as const;



export default function PaywallScreen() {
  const t = useTranslation();
  const FEATURES = FEATURE_ICONS.map((icon, i) => ({
    icon,
    text: [t.paywall.featureTrigger, t.paywall.featureSafeFoods, t.paywall.featureDigest, t.paywall.featureTrends][i],
  }));
  const { user } = useAuth();
  const { source } = useLocalSearchParams<{ source?: string }>();
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'annual'>('annual');

  // Free-launch mode: nothing routes here, but guard against deep links —
  // a paywall that cannot transact must never render (Guideline 2.1).
  useEffect(() => {
    if (!isMonetizationEnabled()) {
      if (router.canGoBack()) router.back();
      else router.replace('/');
    }
  }, []);

  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
  const [loadingOffering, setLoadingOffering] = useState(true);

  useEffect(() => {
    let active = true;
    track(Events.PAYWALL_VIEWED, { source: source ?? 'unknown' });
    (async () => {
      try {
        await initSubscription(user?.id);
        const result = await loadPaywallOffering();
        if (!active) return;
        // Only a sellable offering unlocks the CTA. The specific reason it is
        // not sellable (not configured / fetch failed / no current offering /
        // no usable packages / no price) is retained by lib/subscription.ts and
        // readable via getSubscriptionDiagnostics(); the user never sees it.
        setOffering(result.ok ? result.offering : null);
        if (!result.ok && __DEV__) {
          console.warn('[paywall] offering unavailable:', result.reason);
        }
      } catch (error) {
        if (__DEV__) console.warn('[paywall] offering load threw:', error);
      } finally {
        if (active) setLoadingOffering(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [user?.id]);

  // Prices come from StoreKit via RevenueCat and NOWHERE else.
  //
  // These used to fall back to '$6.99' / '$39.99' when no offering had loaded.
  // Those were both invented AND stale — the real targets are higher — so the
  // screen advertised a price the store would never charge. There is no honest
  // fallback for a price we do not have, so when the offering is missing the
  // screen says so instead of guessing.
  const monthlyPkg = selectPackage(offering, 'monthly');
  const annualPkg = selectPackage(offering, 'annual');
  const monthlyPrice = monthlyPkg?.product.priceString ?? null;
  const annualPrice = annualPkg?.product.priceString ?? null;
  const canPurchase = offering != null;

  // Two plans billed on different intervals are hard to compare, so each card
  // leads with the price restated on a common cadence and states the real
  // charge underneath. Null whenever it cannot be derived honestly, in which
  // case the card falls back to showing the actual price as its headline —
  // never a blank, a zero, or a fabricated figure.
  const monthlyPerWeek = normalizedPriceString(monthlyPkg, 'week');
  const annualPerMonth = normalizedPriceString(annualPkg, 'month');

  // The separate per-month sub-line and the savings percentage that used to sit
  // on the Annual card are both gone: the per-month figure IS the headline now,
  // and a discount claim is out of scope for this screen. Their i18n keys stay
  // defined so restoring either is a render change, not a translation pass.

  // Trial copy must reflect the SELECTED plan's actual introductory offer.
  const selectedPkg = selectedPlan === 'annual' ? annualPkg : monthlyPkg;
  const selectedIntro = selectedPkg?.product.introPrice;
  const trialCtaLabel = (() => {
    if (!selectedIntro || selectedIntro.price !== 0) return t.paywall.continueButton;
    const unit = selectedIntro.periodUnit?.toLowerCase() ?? 'day';
    const n = selectedIntro.periodNumberOfUnits ?? 0;
    if (!n) return t.paywall.startFreeTrial;
    // StoreKit reports the period unit in English. Capitalising it inline put
    // "Day"/"Week"/"Month" straight into the German sentence, so it is mapped
    // through i18n instead.
    const unitLabel =
      unit === 'week'
        ? t.paywall.trialUnitWeek
        : unit === 'month'
          ? t.paywall.trialUnitMonth
          : unit === 'year'
            ? t.paywall.trialUnitYear
            : t.paywall.trialUnitDay;
    return t.paywall.startTrialWithPeriod.replace('{n}', String(n)).replace('{unit}', unitLabel);
  })();

  // Preview/QA only. isSubscriptionDebugEnabled() is EXPO_PUBLIC_RC_DEBUG==='true',
  // which no production build sets, so this affordance never renders for a real
  // user. It is additionally limited to the case where there is nothing to sell.
  const showDiagnostics = isSubscriptionDebugEnabled() && !loadingOffering && !canPurchase;

  const handleCopyDiagnostics = async () => {
    await Clipboard.setStringAsync(formatSubscriptionDiagnostics());
    Alert.alert(t.paywall.debugInfoCopied);
  };

  const handleCTA = async () => {
    if (purchasing) return;
    if (!canPurchase) {
      // One calm, non-technical message for every underlying cause. "Coming
      // soon" was misleading once products exist but have not hydrated.
      Alert.alert(t.paywall.unavailableTitle, t.paywall.unavailableBody);
      return;
    }
    setPurchasing(true);
    const result = await purchasePlan(selectedPlan);
    setPurchasing(false);

    if (result.success) {
      track('purchase_success', { plan: selectedPlan });
      Alert.alert(t.paywall.successTitle, t.paywall.activateSuccess);
      router.back();
      return;
    }

    if (!result.cancelled) {
      track('purchase_failed', { plan: selectedPlan, message: result.message });
      Alert.alert(t.paywall.purchaseFailed, result.message || t.paywall.tryAgain);
    }
  };

  const handleRestore = async () => {
    if (restoring) return;
    setRestoring(true);
    const result = await restorePurchases();
    setRestoring(false);

    if (result.success) {
      track('restore_success');
      Alert.alert(t.paywall.restoreComplete, t.paywall.restoreSuccess);
      router.back();
      return;
    }

    track('restore_failed', { message: result.message });
    Alert.alert(t.paywall.restorePurchases, result.message || t.paywall.noPurchases);
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
          {/* Hero — Cal AI free-trial framing */}
          <View style={styles.hero}>
            <Text style={styles.heroTitle}>
              {t.paywall.heroLine1}{'\n'}
              <Ionicons name="leaf" size={30} color="#52B788" /> {t.paywall.heroLine2}
            </Text>
          </View>

          {/* Device-mockup preview of the GutWell dashboard */}
          <View style={styles.deviceFrame}>
            <View style={styles.deviceNotch} />
            <View style={styles.previewApp}>
              <View style={styles.previewBrandRow}>
                <Ionicons name="leaf" size={14} color="#1B4332" />
                <Text style={styles.previewBrand}>GutWell AI</Text>
              </View>

              <View style={styles.previewScoreCard}>
                <View>
                  <Text style={styles.previewScoreValue}>82</Text>
                  <Text style={styles.previewScoreLabel}>{t.paywall.gutScoreToday}</Text>
                </View>
                <View style={styles.previewRing}>
                  <Ionicons name="pulse-outline" size={20} color="#52B788" />
                </View>
              </View>

              <View style={styles.previewStatsRow}>
                {[
                  { v: '6', l: t.paywall.previewDayStreak },
                  { v: '3', l: t.paywall.previewSafeFoods },
                  { v: '12', l: t.paywall.previewCheckIns },
                ].map((s) => (
                  <View key={s.l} style={styles.previewStat}>
                    <Text style={styles.previewStatValue}>{s.v}</Text>
                    <Text style={styles.previewStatLabel}>{s.l}</Text>
                  </View>
                ))}
              </View>

              <Text style={styles.previewSectionLabel}>{t.paywall.recentlyLogged}</Text>
              <View style={styles.previewMealRow}>
                <Text style={styles.previewMealName}>{t.paywall.sampleMeal}</Text>
                <Text style={styles.previewMealScore}>{t.paywall.sampleScore}</Text>
              </View>
            </View>
          </View>

          {/* No Payment Due Now reassurance */}
          <View style={styles.reassuranceRow}>
            <Ionicons name="checkmark-circle" size={20} color="#52B788" />
            <Text style={styles.reassuranceText}>{t.paywall.noPaymentDue}</Text>
          </View>

          {/* Features List */}
          <View style={styles.featuresCard}>
            {FEATURES.map((feature, i) => (
              <View key={i} style={styles.featureRow}>
                <Ionicons name={feature.icon as keyof typeof Ionicons.glyphMap} size={20} color={Colors.secondary} />
                <Text style={styles.featureText}>{feature.text}</Text>
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
              {/* Neutral placeholder, never an invented figure. */}
              <Text style={styles.pricingAmount}>
                {monthlyPerWeek ?? monthlyPrice ?? t.paywall.priceUnavailable}
              </Text>
              <Text style={styles.pricingPeriod}>
                {monthlyPerWeek ? t.paywall.periodWeekShort : t.paywall.periodMonthShort}
              </Text>
              {/* What Apple actually charges, and when. Never omitted. */}
              <Text style={styles.pricingBilled}>
                {monthlyPrice
                  ? t.paywall.billedMonthlyAt.replace('{price}', monthlyPrice)
                  : t.paywall.billedMonthly}
              </Text>
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
                <Text style={styles.bestValueText}>{t.paywall.bestValue}</Text>
              </View>
              <Text style={styles.pricingAmount}>
                {annualPerMonth ?? annualPrice ?? t.paywall.priceUnavailable}
              </Text>
              <Text style={styles.pricingPeriod}>
                {annualPerMonth ? t.paywall.periodMonthShort : t.paywall.periodYearShort}
              </Text>
              {/* What Apple actually charges, and when. Never omitted. */}
              <Text style={styles.pricingBilled}>
                {annualPrice
                  ? t.paywall.billedAnnuallyAt.replace('{price}', annualPrice)
                  : t.paywall.billedAnnually}
              </Text>
            </TouchableOpacity>
          </View>

          {/* CTA Button */}
          <TouchableOpacity
            style={[styles.ctaWrapper, (purchasing || loadingOffering) && styles.ctaWrapperDisabled]}
            onPress={handleCTA}
            activeOpacity={0.85}
            disabled={purchasing || loadingOffering}
          >
            <LinearGradient
              colors={['#52B788', '#2D6A4F']}
              style={styles.ctaButton}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              {purchasing || loadingOffering ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.ctaText}>{trialCtaLabel}</Text>
              )}
            </LinearGradient>
          </TouchableOpacity>

          {/* Fine Print */}
          <Text style={styles.finePrint}>{t.paywall.finePrint}</Text>

          {/* Legal links — required on subscription paywalls (Guideline 3.1.2) */}
          <View style={styles.legalRow}>
            <TouchableOpacity onPress={() => router.push('/terms-of-service')} accessibilityRole="link">
              <Text style={styles.legalLink}>{t.paywall.termsOfService}</Text>
            </TouchableOpacity>
            <Text style={styles.legalDot}>·</Text>
            <TouchableOpacity onPress={() => router.push('/privacy-policy')} accessibilityRole="link">
              <Text style={styles.legalLink}>{t.paywall.privacyPolicy}</Text>
            </TouchableOpacity>
          </View>

          {/* Restore Purchases */}
          <TouchableOpacity onPress={handleRestore} activeOpacity={0.7} disabled={restoring || purchasing}>
            <Text style={styles.restoreText}>
              {restoring ? t.paywall.restoring : t.paywall.restoreButton}
            </Text>
          </TouchableOpacity>

          {/* Preview-build QA affordance. Never rendered in production: the flag
              that gates it is not set in any release environment. */}
          {showDiagnostics ? (
            <TouchableOpacity
              onPress={handleCopyDiagnostics}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={t.paywall.copyDebugInfo}
            >
              <Text style={styles.diagnosticsText}>{t.paywall.copyDebugInfo}</Text>
            </TouchableOpacity>
          ) : null}
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
    marginBottom: Spacing.lg,
  },
  heroTitle: {
    fontFamily: FontFamily.displayBold,
    fontSize: 34,
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 44,
  },

  // Device-mockup preview
  deviceFrame: {
    width: 240,
    alignSelf: 'center',
    backgroundColor: '#050A07',
    borderRadius: 34,
    borderWidth: 6,
    borderColor: '#0B1F14',
    padding: 8,
    paddingTop: 16,
    marginBottom: Spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 10,
  },
  deviceNotch: {
    position: 'absolute',
    top: 8,
    alignSelf: 'center',
    width: 70,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#1B4332',
  },
  previewApp: {
    backgroundColor: '#F4F6F4',
    borderRadius: 22,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  previewBrandRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  previewBrand: { fontFamily: FontFamily.sansBold, fontSize: 13, color: '#1B4332' },
  previewScoreCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  previewScoreValue: { fontFamily: FontFamily.displayBold, fontSize: 30, color: '#1B4332' },
  previewScoreLabel: { fontFamily: FontFamily.sansRegular, fontSize: 9, color: '#6B7B70' },
  previewRing: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 3,
    borderColor: '#D8F3DC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewStatsRow: { flexDirection: 'row', gap: 6 },
  previewStat: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.sm,
    paddingVertical: 8,
    alignItems: 'center',
  },
  previewStatValue: { fontFamily: FontFamily.sansBold, fontSize: 14, color: '#1B4332' },
  previewStatLabel: { fontFamily: FontFamily.sansRegular, fontSize: 8, color: '#6B7B70' },
  previewSectionLabel: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: 10,
    color: '#3D4D43',
    marginTop: 2,
  },
  previewMealRow: {
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.sm,
    padding: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  previewMealName: { fontFamily: FontFamily.sansMedium, fontSize: 10, color: '#1B2620' },
  previewMealScore: { fontFamily: FontFamily.sansBold, fontSize: 10, color: '#2D6A4F' },

  // Reassurance
  reassuranceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  reassuranceText: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.md,
    color: '#FFFFFF',
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
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 8,
  },
  ctaWrapperDisabled: {
    opacity: 0.7,
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
  // Deliberately quieter than restoreText — it is a QA affordance, not a
  // feature, and only ever visible in a preview build.
  diagnosticsText: {
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.xs,
    color: 'rgba(255,255,255,0.3)',
    textAlign: 'center',
    marginTop: Spacing.md,
  },
  legalRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: Spacing.md,
  },
  legalLink: {
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.xs,
    color: 'rgba(255,255,255,0.7)',
    textDecorationLine: 'underline',
  },
  legalDot: {
    color: 'rgba(255,255,255,0.4)',
  },
});
