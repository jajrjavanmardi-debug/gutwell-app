import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ActivityIndicator, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
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
    loadingProfile: 'Loading profile...',
    loadFailed: 'Could not load saved profile',
    conditionLabels: {
      IBS: 'IBS',
      Gastritis: 'Gastritis',
      Bloating: 'Bloating',
      'Lactose Intolerance': 'Lactose Intolerance',
      Celiac: 'Celiac',
    },
    proTitle: 'NutriFlow Pro',
    proPlan: 'Current Plan: Free Preview',
    proCta: 'Upgrade to Pro – 5 USD/month',
    proBenefits: ['Unlimited Scans', 'Detailed 30-day Progress Charts', 'Priority SOS Support'],
    proComingSoon: 'Pro checkout preview selected',
    shareFeedbackTitle: 'Share App for Feedback',
    shareFeedbackHint: 'Invite a tester to try NutriFlow in Expo Go and send practical demo feedback.',
    shareFeedbackButton: 'Open share sheet',
    shareFeedbackOpened: 'Share sheet opened',
    shareFeedbackFailed: 'Could not open sharing right now',
    shareMessage: [
      'NutriFlow',
      '',
      'A mobile gut-health nutrition assistant for meal photo analysis, symptom-aware Gut Scores, quick relief tips, and daily food-history trends.',
      '',
      'How to test with Expo Go:',
      '1. Install Expo Go from the App Store or Google Play.',
      '2. Ask me for the current Expo QR code or development link.',
      '3. Open Expo Go, scan the QR code, and test onboarding, language switching, meal photo/demo analysis, SOS relief, history, and settings.',
      '',
      'Feedback request:',
      'Please share what feels confusing, what looks demo-ready, any crashes or slow screens, and whether the Gut Score/results feel useful.',
    ].join('\n'),
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
    loadingProfile: 'Profil wird geladen...',
    loadFailed: 'Gespeichertes Profil konnte nicht geladen werden',
    conditionLabels: {
      IBS: 'Reizdarmsyndrom',
      Gastritis: 'Gastritis',
      Bloating: 'Blähungen',
      'Lactose Intolerance': 'Laktoseintoleranz',
      Celiac: 'Zöliakie',
    },
    proTitle: 'NutriFlow Pro',
    proPlan: 'Aktueller Plan: Kostenlose Vorschau',
    proCta: 'Auf Pro upgraden – 5 USD/Monat',
    proBenefits: ['Unbegrenzte Scans', 'Detaillierte 30-Tage-Verlaufsgrafiken', 'Priorisierter SOS-Support'],
    proComingSoon: 'Pro-Checkout-Vorschau ausgewählt',
    shareFeedbackTitle: 'App für Feedback teilen',
    shareFeedbackHint: 'Lade Tester ein, NutriFlow in Expo Go auszuprobieren und Demo-Feedback zu senden.',
    shareFeedbackButton: 'Teilen öffnen',
    shareFeedbackOpened: 'Teilen geöffnet',
    shareFeedbackFailed: 'Teilen kann gerade nicht geöffnet werden',
    shareMessage: [
      'NutriFlow',
      '',
      'Eine mobile Darmgesundheits-App mit Fotoanalyse für Mahlzeiten, symptombezogenen Darm-Scores, schnellen SOS-Tipps und täglichen Food-History-Trends.',
      '',
      'So testest du mit Expo Go:',
      '1. Installiere Expo Go aus dem App Store oder Google Play.',
      '2. Frag mich nach dem aktuellen Expo-QR-Code oder Entwicklungslink.',
      '3. Öffne Expo Go, scanne den QR-Code und teste Onboarding, Sprachwechsel, Foto-/Demoanalyse, SOS-Hilfe, Verlauf und Einstellungen.',
      '',
      'Feedback-Wunsch:',
      'Bitte teile, was unklar wirkt, was präsentationsreif aussieht, ob es Abstürze oder langsame Screens gibt und ob Gut Score/Ergebnisse hilfreich wirken.',
    ].join('\n'),
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
    loadingProfile: 'در حال بارگذاری پروفایل...',
    loadFailed: 'بارگذاری پروفایل ذخیره شده انجام نشد',
    conditionLabels: {
      IBS: 'سندرم روده تحریک پذیر',
      Gastritis: 'گاستریت',
      Bloating: 'نفخ',
      'Lactose Intolerance': 'عدم تحمل لاکتوز',
      Celiac: 'سلیاک',
    },
    proTitle: 'NutriFlow Pro',
    proPlan: 'طرح فعلی: پیش نمایش رایگان',
    proCta: 'ارتقا به Pro – ماهانه ۵ دلار',
    proBenefits: ['اسکن نامحدود', 'نمودارهای پیشرفت دقیق ۳۰ روزه', 'پشتیبانی SOS با اولویت'],
    proComingSoon: 'پیش نمایش پرداخت Pro انتخاب شد',
    shareFeedbackTitle: 'اشتراک گذاری برنامه برای بازخورد',
    shareFeedbackHint: 'یک تستر را دعوت کنید تا NutriFlow را در Expo Go امتحان کند و بازخورد دمو بدهد.',
    shareFeedbackButton: 'باز کردن اشتراک گذاری',
    shareFeedbackOpened: 'صفحه اشتراک گذاری باز شد',
    shareFeedbackFailed: 'اکنون امکان باز کردن اشتراک گذاری وجود ندارد',
    shareMessage: [
      'NutriFlow',
      '',
      'یک دستیار موبایل برای سلامت گوارش با تحلیل عکس غذا، امتیاز گوارش بر اساس علائم، راهنمای سریع SOS و روند روزانه سوابق غذا.',
      '',
      'روش تست با Expo Go:',
      '۱. Expo Go را از App Store یا Google Play نصب کنید.',
      '۲. از من QR code فعلی Expo یا لینک توسعه را بگیرید.',
      '۳. Expo Go را باز کنید، QR code را اسکن کنید و آنبوردینگ، تغییر زبان، تحلیل عکس یا غذای دمو، SOS، سوابق و تنظیمات را تست کنید.',
      '',
      'درخواست بازخورد:',
      'لطفا بگویید چه بخش هایی گیج کننده است، چه چیزهایی برای دمو آماده به نظر می رسد، آیا کرش یا کندی وجود دارد و آیا Gut Score و نتایج مفید هستند.',
    ].join('\n'),
  },
} as const;

export default function SettingsScreen() {
  const [selectedConditions, setSelectedConditions] = useState<MedicalCondition[]>([]);
  const [selectedLanguage, setSelectedLanguage] = useState<AppLanguage>('en');
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const isRtl = isRtlLanguage(selectedLanguage);
  const t = SETTINGS_COPY[selectedLanguage];

  useFocusEffect(useCallback(() => {
    let isActive = true;
    setIsLoadingProfile(true);
    setSaveMessage('');

    Promise.all([
      getUserProfileSettings(),
      AsyncStorage.getItem(APP_LANGUAGE_STORAGE_KEY),
    ])
      .then(([settings, storedLanguage]) => {
        if (!isActive) return;
        setSelectedConditions(settings.conditions);
        setSelectedLanguage(settings.preferredLanguage ?? parseStoredLanguage(storedLanguage));
      })
      .catch(async (error) => {
        console.error('Profile load failed:', error);
        const storedLanguage = await AsyncStorage.getItem(APP_LANGUAGE_STORAGE_KEY);
        const messageLanguage = parseStoredLanguage(storedLanguage);
        if (isActive) setSaveMessage(SETTINGS_COPY[messageLanguage].loadFailed);
      })
      .finally(() => {
        if (isActive) setIsLoadingProfile(false);
      });

    return () => {
      isActive = false;
    };
  }, []));

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
      await saveUserProfileSettings({
        conditions: selectedConditions,
        preferredLanguage: selectedLanguage,
      });
      await AsyncStorage.setItem(APP_LANGUAGE_STORAGE_KEY, selectedLanguage);
      setSaveMessage(t.saved);
    } catch (error) {
      console.error('Profile save failed:', error);
      setSaveMessage(t.saveFailed);
    } finally {
      setIsSaving(false);
    }
  };

  const handleShareForFeedback = async () => {
    try {
      await Share.share({
        title: t.shareFeedbackTitle,
        message: t.shareMessage,
      });
      setSaveMessage(t.shareFeedbackOpened);
    } catch (error) {
      console.error('App feedback share failed:', error);
      setSaveMessage(t.shareFeedbackFailed);
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

          {isLoadingProfile ? (
            <View style={[styles.loadingRow, isRtl && styles.rtlRow]}>
              <ActivityIndicator color={MINT_DARK} size="small" />
              <Text style={[styles.loadingText, isRtl && styles.rtlText]}>{t.loadingProfile}</Text>
            </View>
          ) : (
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
                      {t.conditionLabels[condition]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
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
          <View style={[styles.cardHeader, isRtl && styles.rtlRow]}>
            <View style={styles.iconCircle}>
              <Ionicons name="share-social" size={22} color={MINT_DARK} />
            </View>
            <View style={styles.cardHeaderCopy}>
              <Text style={[styles.cardTitle, isRtl && styles.rtlText]}>{t.shareFeedbackTitle}</Text>
              <Text style={[styles.cardSubtitle, isRtl && styles.rtlText]}>{t.shareFeedbackHint}</Text>
            </View>
          </View>

          <Pressable
            onPress={handleShareForFeedback}
            accessibilityRole="button"
            style={({ pressed }) => [styles.shareFeedbackButton, isRtl && styles.rtlRow, pressed && styles.pressed]}
          >
            <Ionicons name="share-outline" size={18} color={SLATE_DARK} />
            <Text style={[styles.shareFeedbackButtonText, isRtl && styles.rtlText]}>{t.shareFeedbackButton}</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={[styles.cardTitle, isRtl && styles.rtlText]}>{t.aiPersonalization}</Text>
          <Text style={[styles.cardSubtitle, isRtl && styles.rtlText]}>
            {selectedConditions.length > 0
              ? `${t.currentFocus}: ${selectedConditions.map((condition) => t.conditionLabels[condition]).join(', ')}`
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
            disabled={isSaving || isLoadingProfile}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.saveButton,
              isRtl && styles.rtlRow,
              (isSaving || isLoadingProfile) && styles.saveButtonDisabled,
              pressed && !isSaving && !isLoadingProfile && styles.pressed,
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
  loadingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  loadingText: {
    color: SLATE,
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
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
  shareFeedbackButton: {
    alignItems: 'center',
    backgroundColor: MINT,
    borderColor: '#BFE5CB',
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  shareFeedbackButtonText: {
    color: SLATE_DARK,
    flexShrink: 1,
    fontSize: 15,
    fontWeight: '900',
    textAlign: 'center',
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
