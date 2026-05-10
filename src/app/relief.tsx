import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { APP_LANGUAGE_STORAGE_KEY, isRtlLanguage, parseStoredLanguage, type AppLanguage } from '../../lib/app-language';

const SAGE = '#B2AC88';
const SAGE_DARK = '#7E795D';
const SAGE_SOFT = '#F3F0E5';
const CREAM = '#FAF8F1';
const SLATE = '#4E5B66';
const NAVY = '#15212D';
const RADIUS = 15;

const RELIEF_COPY = {
  en: {
    help: 'Help',
    instantRelief: 'Instant Relief',
    commonSymptoms: 'Common Symptoms',
    title: 'What do you feel?',
    chooseSymptom: 'Choose a symptom',
    comfortIdeas: 'These are simple comfort ideas, not medical advice.',
    quickTips: 'Your quick tips',
    selectHint: 'Select a symptom above to see 3 quick comfort tips.',
    footer: 'If symptoms are severe, unusual, or worsening, seek medical care.',
  },
  de: {
    help: 'Hilfe',
    instantRelief: 'Soforthilfe',
    commonSymptoms: 'Häufige Symptome',
    title: 'Was fühlst du?',
    chooseSymptom: 'Wähle ein Symptom',
    comfortIdeas: 'Dies sind einfache Linderungsideen, keine medizinische Beratung.',
    quickTips: 'Deine schnellen Tipps',
    selectHint: 'Wähle oben ein Symptom aus, um 3 schnelle Tipps zu sehen.',
    footer: 'Bei starken, ungewöhnlichen oder zunehmenden Symptomen medizinische Hilfe suchen.',
  },
  fa: {
    help: 'کمک',
    instantRelief: 'تسکین فوری',
    commonSymptoms: 'علائم رایج',
    title: 'چه احساسی دارید؟',
    chooseSymptom: 'یک علامت انتخاب کنید',
    comfortIdeas: 'این ها فقط پیشنهادهای ساده برای آرامش هستند و توصیه پزشکی نیستند.',
    quickTips: 'نکات سریع شما',
    selectHint: 'برای دیدن ۳ نکته سریع، یک علامت را انتخاب کنید.',
    footer: 'اگر علائم شدید، غیرمعمول یا رو به بدتر شدن هستند، به پزشک مراجعه کنید.',
  },
} as const;

const RELIEF_TIPS = {
  Bloating: ['Try a 5-minute walk', 'Sip peppermint tea', 'Deep diaphragmatic breathing'],
  Reflux: ['Sit upright for a while', 'Take small sips of water', 'Loosen tight waistbands'],
  Cramps: ['Use a warm compress', 'Try slow belly breathing', 'Rest in a comfortable position'],
  Nausea: ['Sip ginger tea slowly', 'Try fresh air near a window', 'Eat bland food only if you feel ready'],
} as const;

type ReliefSymptom = keyof typeof RELIEF_TIPS;

export default function ReliefScreen() {
  const [language, setLanguage] = useState<AppLanguage>('en');
  const [selectedSymptom, setSelectedSymptom] = useState<ReliefSymptom | null>(null);
  const isRtl = isRtlLanguage(language);
  const copy = RELIEF_COPY[language];

  useEffect(() => {
    AsyncStorage.getItem(APP_LANGUAGE_STORAGE_KEY)
      .then((storedLanguage) => setLanguage(parseStoredLanguage(storedLanguage)))
      .catch(console.warn);
  }, []);

  const tips = selectedSymptom ? RELIEF_TIPS[selectedSymptom] : [];

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.header, isRtl && styles.rtlRow]}>
          <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backButton}>
            <Ionicons name="chevron-back" size={22} color={NAVY} />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={[styles.kicker, isRtl && styles.rtlText]}>{copy.instantRelief}</Text>
            <Text style={[styles.title, isRtl && styles.rtlText]}>{copy.title}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={[styles.cardKicker, isRtl && styles.rtlText]}>{`${copy.help} • ${copy.commonSymptoms}`}</Text>
          <Text style={[styles.cardTitle, isRtl && styles.rtlText]}>{copy.chooseSymptom}</Text>
          <Text style={[styles.cardSubtitle, isRtl && styles.rtlText]}>{copy.comfortIdeas}</Text>

          <View style={[styles.buttonGrid, isRtl && styles.rtlRow]}>
            {(Object.keys(RELIEF_TIPS) as ReliefSymptom[]).map((symptom) => {
              const isSelected = selectedSymptom === symptom;
              return (
                <Pressable
                  key={symptom}
                  onPress={() => setSelectedSymptom(symptom)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  style={({ pressed }) => [
                    styles.symptomButton,
                    isRtl && styles.rtlRow,
                    isSelected && styles.symptomButtonSelected,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={[styles.symptomButtonText, isSelected && styles.symptomButtonTextSelected, isRtl && styles.rtlText]}>
                    {symptom}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.tipsCard}>
          <Text style={[styles.cardTitle, isRtl && styles.rtlText]}>
            {selectedSymptom ? `${selectedSymptom} ${copy.quickTips}` : copy.quickTips}
          </Text>
          {selectedSymptom ? (
            tips.map((tip, index) => (
              <View key={tip} style={[styles.tipRow, isRtl && styles.rtlRow]}>
                <View style={styles.tipNumber}>
                  <Text style={styles.tipNumberText}>{index + 1}</Text>
                </View>
                <Text style={[styles.tipText, isRtl && styles.rtlText]}>{tip}</Text>
              </View>
            ))
          ) : (
            <Text style={[styles.cardSubtitle, isRtl && styles.rtlText]}>{copy.selectHint}</Text>
          )}
        </View>

        <Text style={[styles.footerNote, isRtl && styles.rtlText]}>{copy.footer}</Text>
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
    padding: 20,
    paddingBottom: 44,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14,
  },
  backButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E0D2',
    borderRadius: RADIUS,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  headerCopy: {
    flex: 1,
  },
  kicker: {
    color: SAGE_DARK,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  title: {
    color: NAVY,
    fontSize: 32,
    fontWeight: '800',
    marginTop: 2,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E0D2',
    borderRadius: RADIUS,
    borderWidth: 1,
    padding: 20,
  },
  tipsCard: {
    backgroundColor: SAGE_SOFT,
    borderColor: '#D8D1B6',
    borderRadius: RADIUS,
    borderWidth: 1,
    padding: 20,
  },
  cardTitle: {
    color: NAVY,
    fontSize: 19,
    fontWeight: '800',
  },
  cardKicker: {
    color: SAGE_DARK,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  cardSubtitle: {
    color: SLATE,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 6,
  },
  buttonGrid: {
    gap: 12,
    marginTop: 18,
  },
  symptomButton: {
    alignItems: 'center',
    backgroundColor: SAGE,
    borderColor: '#A39D7B',
    borderRadius: RADIUS,
    borderWidth: 1,
    minHeight: 64,
    justifyContent: 'center',
    padding: 20,
  },
  symptomButtonSelected: {
    backgroundColor: SAGE_DARK,
  },
  symptomButtonText: {
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '800',
  },
  symptomButtonTextSelected: {
    color: '#FFFFFF',
  },
  tipRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    marginTop: 14,
  },
  tipNumber: {
    alignItems: 'center',
    backgroundColor: SAGE,
    borderRadius: 15,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  tipNumberText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  tipText: {
    color: NAVY,
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
  },
  footerNote: {
    color: SLATE,
    fontSize: 13,
    lineHeight: 20,
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
