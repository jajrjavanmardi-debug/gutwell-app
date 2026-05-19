import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import Head from 'expo-router/head';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { APP_LANGUAGE_STORAGE_KEY, isRtlLanguage, parseStoredLanguage, type AppLanguage } from '../../lib/app-language';

const COPY: Record<AppLanguage, {
  back: string;
  title: string;
  subtitle: string;
  languageNote: string;
  updated: string;
  privacy: string;
}> = {
  en: {
    back: 'Back',
    title: 'Terms / Disclaimer',
    subtitle: 'Important limits for using NutriFlow in this early preview.',
    languageNote: 'This initial disclaimer is provided in English. Localized legal text will be expanded as the product matures.',
    updated: 'Initial MVP version',
    privacy: 'Privacy Policy',
  },
  de: {
    back: 'Zurück',
    title: 'Nutzungsbedingungen / Disclaimer',
    subtitle: 'Wichtige Grenzen für die Nutzung von NutriFlow in dieser frühen Vorschau.',
    languageNote: 'Diese erste Fassung ist auf Englisch. Vollständig lokalisierte Rechtstexte werden mit der Produktreife ergänzt.',
    updated: 'Erste MVP-Version',
    privacy: 'Datenschutzhinweise',
  },
  fa: {
    back: 'بازگشت',
    title: 'شرایط / سلب مسئولیت',
    subtitle: 'محدودیت‌های مهم استفاده از NutriFlow در این پیش‌نمایش اولیه.',
    languageNote: 'این نسخه اولیه به انگلیسی ارائه شده است. متن حقوقی کاملاً بومی‌سازی‌شده در نسخه‌های بعدی تکمیل می‌شود.',
    updated: 'نسخه اولیه MVP',
    privacy: 'سیاست حریم خصوصی',
  },
};

const TERMS_SECTIONS = [
  {
    title: 'Educational and wellness use only',
    body:
      'NutriFlow helps you reflect on meals, symptoms, and wellness patterns. It is not intended to diagnose, treat, cure, prevent, or monitor a disease or medical condition.',
  },
  {
    title: 'Not medical advice, diagnosis, or treatment',
    body:
      'NutriFlow content is not medical advice and should not replace professional medical care. Do not use the app to decide whether a symptom is safe, to delay care, or to change prescribed treatment without a qualified clinician.',
  },
  {
    title: 'Red flags and emergencies',
    body:
      'If you have severe, unusual, worsening, or urgent symptoms, seek medical care. In Germany, call 112 for emergencies. Elsewhere, contact local emergency services or urgent care. The app may pause food analysis when red-flag symptoms are entered, but it cannot detect every urgent situation.',
  },
  {
    title: 'AI-generated analysis limitations',
    body:
      'AI-generated meal analysis can be inaccurate, incomplete, or misleading. It may misidentify foods, miss ingredients, misunderstand context, or produce estimates that do not fit your body. Treat scores and recommendations as educational estimates and look for patterns over time.',
  },
  {
    title: 'Food and symptom tracking limits',
    body:
      'Symptoms can have many causes, and not every symptom is caused by food. Tracking should not create fear, restriction, or pressure. Taking breaks from tracking is okay.',
  },
  {
    title: 'Data and account responsibilities',
    body:
      'You are responsible for the information you enter and for keeping account access secure. Guest mode is local-only where possible; signed-in use may sync app data through Supabase. You can use the data deletion option in Settings for app-owned records.',
  },
  {
    title: 'Third-party services and availability',
    body:
      'NutriFlow depends on third-party services such as Supabase, AI providers, food reference data providers, app tooling, hosting, and optional monitoring. These services may be unavailable, change behavior, or process data according to their own terms and policies.',
  },
  {
    title: 'No compliance or validation claims',
    body:
      'This MVP does not claim HIPAA compliance, MDR compliance, FDA clearance, clinical validation, or medical-device status.',
  },
];

export default function TermsDisclaimerScreen() {
  const [language, setLanguage] = useState<AppLanguage>('en');
  const copy = COPY[language];
  const isRtl = isRtlLanguage(language);

  useEffect(() => {
    AsyncStorage.getItem(APP_LANGUAGE_STORAGE_KEY)
      .then((storedLanguage) => setLanguage(parseStoredLanguage(storedLanguage)))
      .catch(console.warn);
  }, []);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <Head>
        <title>NutriFlow Terms and Disclaimer</title>
        <meta
          name="description"
          content="Initial NutriFlow terms and disclaimer for educational wellness use, AI limitations, emergencies, and no medical-device claims."
        />
      </Head>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Pressable onPress={() => router.back()} style={[styles.backButton, isRtl && styles.rtlRow]}>
          <Ionicons name={isRtl ? 'chevron-forward' : 'chevron-back'} size={18} color="#15212D" />
          <Text style={[styles.backText, isRtl && styles.rtlText]}>{copy.back}</Text>
        </Pressable>

        <View style={styles.header}>
          <Text style={[styles.kicker, isRtl && styles.rtlText]}>NutriFlow</Text>
          <Text style={[styles.title, isRtl && styles.rtlText]}>{copy.title}</Text>
          <Text style={[styles.subtitle, isRtl && styles.rtlText]}>{copy.subtitle}</Text>
          <Text style={[styles.note, isRtl && styles.rtlText]}>{copy.languageNote}</Text>
          <Text style={[styles.updated, isRtl && styles.rtlText]}>{copy.updated}</Text>
        </View>

        {TERMS_SECTIONS.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={[styles.sectionTitle, isRtl && styles.rtlText]}>{section.title}</Text>
            <Text style={[styles.sectionBody, isRtl && styles.rtlText]}>{section.body}</Text>
          </View>
        ))}

        <Pressable onPress={() => router.push('/privacy-policy' as never)} style={[styles.linkButton, isRtl && styles.rtlRow]}>
          <Ionicons name="shield-checkmark-outline" size={18} color="#276E3A" />
          <Text style={[styles.linkButtonText, isRtl && styles.rtlText]}>{copy.privacy}</Text>
        </Pressable>
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
    alignSelf: 'center',
    gap: 14,
    maxWidth: 860,
    padding: 20,
    paddingBottom: 44,
    width: '100%',
  },
  backButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderColor: '#D8E4DE',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  backText: {
    color: '#15212D',
    fontSize: 14,
    fontWeight: '800',
  },
  header: {
    backgroundColor: '#FFFFFF',
    borderColor: '#D8E4DE',
    borderRadius: 8,
    borderWidth: 1,
    padding: 22,
  },
  kicker: {
    color: '#4CAF50',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  title: {
    color: '#15212D',
    fontSize: 34,
    fontWeight: '900',
    lineHeight: 40,
    marginTop: 8,
  },
  subtitle: {
    color: '#53616D',
    fontSize: 16,
    lineHeight: 24,
    marginTop: 10,
  },
  note: {
    color: '#276E3A',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 21,
    marginTop: 14,
  },
  updated: {
    color: '#7B8790',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 10,
  },
  section: {
    backgroundColor: '#FFFFFF',
    borderColor: '#D8E4DE',
    borderRadius: 8,
    borderWidth: 1,
    padding: 18,
  },
  sectionTitle: {
    color: '#15212D',
    fontSize: 19,
    fontWeight: '900',
  },
  sectionBody: {
    color: '#53616D',
    fontSize: 15,
    lineHeight: 23,
    marginTop: 8,
  },
  linkButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#E8F5EC',
    borderColor: '#BFE5CB',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  linkButtonText: {
    color: '#276E3A',
    fontSize: 15,
    fontWeight: '900',
  },
  rtlText: {
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  rtlRow: {
    flexDirection: 'row-reverse',
  },
});
