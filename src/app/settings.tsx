import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  MEDICAL_CONDITION_OPTIONS,
  type MedicalCondition,
  getUserProfileSettings,
  saveUserProfileSettings,
} from '../../lib/user-profile-settings';
import {
  APP_LANGUAGE_OPTIONS,
  APP_LANGUAGE_STORAGE_KEY,
  isRtlLanguage,
  parseStoredLanguage,
  type AppLanguage,
} from '../../lib/app-language';

const MINT = '#DFF5EA';
const MINT_DARK = '#4CAF50';
const SLATE = '#53616D';
const SLATE_DARK = '#15212D';
const CARD_RADIUS = 15;
const SCREEN_PADDING = 20;
const SETTINGS_COPY = {
  en: {
    personalizedProfile: 'Personalized Profile',
    settings: 'Settings',
    medicalConditions: 'Medical Conditions',
    medicalConditionsHint: 'Select everything that applies. Your AI meal analysis will use this profile.',
    language: 'Language',
    languageHint: 'Choose your app language. Persian enables right-to-left layout.',
    aiPersonalization: 'AI Personalization',
    currentFocus: 'Current focus',
    generalGutHealth: 'General Gut Health',
    save: 'Save',
    cancel: 'Cancel',
    saved: 'Profile saved',
    saveFailed: 'Could not save profile',
    saving: 'Saving...',
    proTitle: 'NutriFlow Pro',
    proPlan: 'Current Plan: Free Preview',
    proCta: 'Upgrade to Pro – 5 USD/month',
    proBenefits: ['Unlimited Scans', 'Detailed 30-day Progress Charts', 'Priority SOS Support'],
    proComingSoon: 'Pro checkout preview selected',
  },
  de: {
    personalizedProfile: 'Personalisiertes Profil',
    settings: 'Einstellungen',
    medicalConditions: 'Vorerkrankungen',
    medicalConditionsHint: 'Wähle alles aus, was zutrifft. Die KI-Analyse nutzt dieses Profil.',
    language: 'Sprache',
    languageHint: 'Wähle deine App-Sprache. Bei Persisch wird RTL aktiviert.',
    aiPersonalization: 'KI-Personalisierung',
    currentFocus: 'Aktueller Fokus',
    generalGutHealth: 'Allgemeine Darmgesundheit',
    save: 'Speichern',
    cancel: 'Abbrechen',
    saved: 'Profil gespeichert',
    saveFailed: 'Profil konnte nicht gespeichert werden',
    saving: 'Speichern...',
    proTitle: 'NutriFlow Pro',
    proPlan: 'Aktueller Plan: Kostenlose Vorschau',
    proCta: 'Auf Pro upgraden – 5 USD/Monat',
    proBenefits: ['Unbegrenzte Scans', 'Detaillierte 30-Tage-Verlaufsgrafiken', 'Priorisierter SOS-Support'],
    proComingSoon: 'Pro-Checkout-Vorschau ausgewählt',
  },
  fa: {
    personalizedProfile: 'پروفایل شخصی سازی شده',
    settings: 'تنظیمات',
    medicalConditions: 'شرایط پزشکی',
    medicalConditionsHint: 'موارد مرتبط را انتخاب کنید. تحلیل هوش مصنوعی از این پروفایل استفاده می کند.',
    language: 'زبان',
    languageHint: 'زبان برنامه را انتخاب کنید. فارسی چیدمان راست به چپ را فعال می کند.',
    aiPersonalization: 'شخصی سازی هوش مصنوعی',
    currentFocus: 'تمرکز فعلی',
    generalGutHealth: 'سلامت عمومی گوارش',
    save: 'ذخیره',
    cancel: 'لغو',
    saved: 'پروفایل ذخیره شد',
    saveFailed: 'ذخیره پروفایل انجام نشد',
    saving: 'در حال ذخیره...',
    proTitle: 'NutriFlow Pro',
    proPlan: 'طرح فعلی: پیش نمایش رایگان',
    proCta: 'ارتقا به Pro – ماهانه ۵ دلار',
    proBenefits: ['اسکن نامحدود', 'نمودارهای پیشرفت دقیق ۳۰ روزه', 'پشتیبانی SOS با اولویت'],
    proComingSoon: 'پیش نمایش پرداخت Pro انتخاب شد',
  },
} as const;

export default function SettingsScreen() {
  const [selectedConditions, setSelectedConditions] = useState<MedicalCondition[]>([]);
  const [selectedLanguage, setSelectedLanguage] = useState<AppLanguage>('en');
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const isRtl = isRtlLanguage(selectedLanguage);
  const t = SETTINGS_COPY[selectedLanguage];

  useEffect(() => {
    Promise.all([
      getUserProfileSettings(),
      AsyncStorage.getItem(APP_LANGUAGE_STORAGE_KEY),
    ])
      .then(([settings, storedLanguage]) => {
        setSelectedConditions(settings.conditions);
        setSelectedLanguage(parseStoredLanguage(storedLanguage));
      })
      .catch(console.warn);
  }, []);

  const toggleCondition = (condition: MedicalCondition) => {
    setSelectedConditions((current) =>
      current.includes(condition)
        ? current.filter((item) => item !== condition)
        : [...current, condition]
    );
    setSaveMessage('');
  };

  const handleSaveProfile = async () => {
    setIsSaving(true);
    try {
      await saveUserProfileSettings({ conditions: selectedConditions });
      await AsyncStorage.setItem(APP_LANGUAGE_STORAGE_KEY, selectedLanguage);
      setSaveMessage(t.saved);
    } catch (error) {
      console.error('Profile save failed:', error);
      setSaveMessage(t.saveFailed);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.header, isRtl && styles.rtlRow]}>
          <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backButton}>
            <Ionicons name="chevron-back" size={21} color={SLATE_DARK} />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={[styles.kicker, isRtl && styles.rtlText]}>{t.personalizedProfile}</Text>
            <Text style={[styles.title, isRtl && styles.rtlText]}>{t.settings}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <View style={[styles.cardHeader, isRtl && styles.rtlRow]}>
            <View style={styles.iconCircle}>
              <Ionicons name="medical" size={22} color={MINT_DARK} />
            </View>
            <View style={styles.cardHeaderCopy}>
              <Text style={[styles.cardTitle, isRtl && styles.rtlText]}>{t.medicalConditions}</Text>
              <Text style={[styles.cardSubtitle, isRtl && styles.rtlText]}>{t.medicalConditionsHint}</Text>
            </View>
          </View>

          <View style={[styles.chipWrap, isRtl && styles.rtlRow]}>
            {MEDICAL_CONDITION_OPTIONS.map((condition) => {
              const isSelected = selectedConditions.includes(condition);
              return (
                <Pressable
                  key={condition}
                  onPress={() => toggleCondition(condition)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  style={({ pressed }) => [
                    styles.chip,
                    isSelected && styles.chipSelected,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={[styles.chipText, isSelected && styles.chipTextSelected, isRtl && styles.rtlText]}>
                    {condition}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.card}>
          <View style={[styles.cardHeader, isRtl && styles.rtlRow]}>
            <View style={styles.iconCircle}>
              <Ionicons name="language" size={22} color={MINT_DARK} />
            </View>
            <View style={styles.cardHeaderCopy}>
              <Text style={[styles.cardTitle, isRtl && styles.rtlText]}>{t.language}</Text>
              <Text style={[styles.cardSubtitle, isRtl && styles.rtlText]}>{t.languageHint}</Text>
            </View>
          </View>

          <View style={[styles.chipWrap, isRtl && styles.rtlRow]}>
            {APP_LANGUAGE_OPTIONS.map((languageOption) => {
              const isSelected = selectedLanguage === languageOption.value;
              return (
                <Pressable
                  key={languageOption.value}
                  onPress={() => {
                    setSelectedLanguage(languageOption.value);
                    setSaveMessage('');
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  style={({ pressed }) => [
                    styles.chip,
                    isSelected && styles.chipSelected,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={[styles.chipText, isSelected && styles.chipTextSelected, isRtl && styles.rtlText]}>
                    {languageOption.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.proCard}>
          <View style={[styles.proHeader, isRtl && styles.rtlRow]}>
            <View style={styles.proIconCircle}>
              <Ionicons name="diamond" size={22} color="#F5FFF9" />
            </View>
            <View style={styles.cardHeaderCopy}>
              <Text style={[styles.proTitle, isRtl && styles.rtlText]}>{t.proTitle}</Text>
              <Text style={[styles.proPlan, isRtl && styles.rtlText]}>{t.proPlan}</Text>
            </View>
          </View>

          <Pressable
            onPress={() => setSaveMessage(t.proComingSoon)}
            accessibilityRole="button"
            style={({ pressed }) => [styles.proCtaButton, isRtl && styles.rtlRow, pressed && styles.pressed]}
          >
            <Ionicons name="sparkles" size={18} color={SLATE_DARK} />
            <Text style={[styles.proCtaText, isRtl && styles.rtlText]}>{t.proCta}</Text>
          </Pressable>

          <View style={styles.proBenefitList}>
            {t.proBenefits.map((benefit, index) => (
              <View key={benefit} style={[styles.proBenefitItem, isRtl && styles.rtlRow]}>
                <View style={styles.proBenefitIcon}>
                  <Ionicons
                    name={index === 0 ? 'infinite' : index === 1 ? 'stats-chart' : 'shield-checkmark'}
                    size={15}
                    color="#D8FBEA"
                  />
                </View>
                <Text style={[styles.proBenefitText, isRtl && styles.rtlText]}>{benefit}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={[styles.cardTitle, isRtl && styles.rtlText]}>{t.aiPersonalization}</Text>
          <Text style={[styles.cardSubtitle, isRtl && styles.rtlText]}>
            {selectedConditions.length > 0
              ? `${t.currentFocus}: ${selectedConditions.join(', ')}`
              : `${t.currentFocus}: ${t.generalGutHealth}`}
          </Text>
        </View>

        <View style={[styles.actionRow, isRtl && styles.rtlRow]}>
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            style={({ pressed }) => [styles.cancelButton, isRtl && styles.rtlRow, pressed && styles.pressed]}
          >
            <Ionicons name="close-circle-outline" size={18} color={SLATE_DARK} />
            <Text style={[styles.cancelButtonText, isRtl && styles.rtlText]}>{t.cancel}</Text>
          </Pressable>
          <Pressable
            onPress={handleSaveProfile}
            disabled={isSaving}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.saveButton,
              isRtl && styles.rtlRow,
              isSaving && styles.saveButtonDisabled,
              pressed && !isSaving && styles.pressed,
            ]}
          >
            <Ionicons name="save" size={20} color="#FFFFFF" />
            <Text style={[styles.saveButtonText, isRtl && styles.rtlText]}>{isSaving ? t.saving : t.save}</Text>
          </Pressable>
        </View>

        {saveMessage ? <Text style={[styles.saveMessage, isRtl && styles.rtlText]}>{saveMessage}</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: '#F4F5F0',
    flex: 1,
  },
  content: {
    gap: 20,
    padding: SCREEN_PADDING,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14,
  },
  backButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#D8E4DE',
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  headerCopy: {
    flex: 1,
  },
  kicker: {
    color: MINT_DARK,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  title: {
    color: SLATE_DARK,
    fontSize: 34,
    fontWeight: '800',
    marginTop: 2,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderColor: '#D8E4DE',
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    padding: SCREEN_PADDING,
  },
  cardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14,
    marginBottom: 18,
  },
  iconCircle: {
    alignItems: 'center',
    backgroundColor: MINT,
    borderRadius: CARD_RADIUS,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  cardHeaderCopy: {
    flex: 1,
  },
  cardTitle: {
    color: SLATE_DARK,
    fontSize: 18,
    fontWeight: '800',
  },
  cardSubtitle: {
    color: SLATE,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 6,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  chip: {
    backgroundColor: '#F3F7F5',
    borderColor: '#D8E4DE',
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  chipSelected: {
    backgroundColor: MINT,
    borderColor: MINT_DARK,
  },
  chipText: {
    color: SLATE,
    fontSize: 14,
    fontWeight: '700',
  },
  chipTextSelected: {
    color: SLATE_DARK,
  },
  proCard: {
    backgroundColor: '#0F3D2E',
    borderColor: '#7DD9A855',
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    overflow: 'hidden',
    padding: SCREEN_PADDING,
    shadowColor: '#0F3D2E',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 4,
  },
  proHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14,
    marginBottom: 16,
  },
  proIconCircle: {
    alignItems: 'center',
    backgroundColor: '#2DCE8966',
    borderRadius: CARD_RADIUS,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  proTitle: {
    color: '#FFFFFF',
    fontSize: 21,
    fontWeight: '900',
  },
  proPlan: {
    color: '#D8FBEA',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 5,
  },
  proCtaButton: {
    alignItems: 'center',
    backgroundColor: '#DFF5EA',
    borderRadius: CARD_RADIUS,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  proCtaText: {
    color: SLATE_DARK,
    flexShrink: 1,
    fontSize: 15,
    fontWeight: '900',
    textAlign: 'center',
  },
  proBenefitList: {
    gap: 10,
    marginTop: 16,
  },
  proBenefitItem: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  proBenefitIcon: {
    alignItems: 'center',
    backgroundColor: '#2DCE8933',
    borderRadius: CARD_RADIUS,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  proBenefitText: {
    color: '#F5FFF9',
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  saveButton: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: MINT_DARK,
    borderRadius: CARD_RADIUS,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    minHeight: 54,
    padding: SCREEN_PADDING,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  cancelButton: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#D8E4DE',
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 54,
    padding: SCREEN_PADDING,
  },
  cancelButtonText: {
    color: SLATE_DARK,
    fontSize: 16,
    fontWeight: '800',
  },
  saveButtonDisabled: {
    opacity: 0.65,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  saveMessage: {
    color: SLATE,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.78,
    transform: [{ scale: 0.99 }],
  },
  rtlText: {
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  rtlRow: {
    flexDirection: 'row-reverse',
  },
});
