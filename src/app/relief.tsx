import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { APP_LANGUAGE_STORAGE_KEY, isRtlLanguage, parseStoredLanguage, type AppLanguage } from '../../lib/app-language';
import { detectRedFlagSymptoms, getRedFlagWarning, type RedFlagWarningCopy } from '../../lib/red-flag-triage';

const SAGE = '#B2AC88';
const SAGE_DARK = '#7E795D';
const SAGE_SOFT = '#F3F0E5';
const SLATE = '#4E5B66';
const NAVY = '#15212D';
const RADIUS = 15;

const RELIEF_COPY = {
  en: {
    help: 'Help',
    instantRelief: 'Comfort Support',
    commonSymptoms: 'Common Symptoms',
    title: 'What do you feel?',
    chooseSymptom: 'Choose a symptom',
    comfortIdeas: 'Simple comfort ideas for pattern tracking, not a diagnosis or medical advice.',
    quickTips: 'Your comfort tips',
    quickTipsFor: 'Comfort tips for',
    selectHint: 'Select a symptom above to see 3 gentle comfort ideas.',
    safetySymptomsTitle: 'Symptoms that need medical care',
    safetySymptomsHint: 'If any of these apply, NutriFlow will pause tips and show a medical-care message.',
    emergencyTitle: 'When to get medical help',
    emergencyGuidance:
      'If symptoms are severe, unusual, worsening, or include chest pain, fainting, blood, or trouble breathing, seek urgent medical care.',
  },
  de: {
    help: 'Hilfe',
    instantRelief: 'Sanfte Hilfe',
    commonSymptoms: 'Häufige Symptome',
    title: 'Was spürst du gerade?',
    chooseSymptom: 'Wähle ein Symptom',
    comfortIdeas: 'Einfache Komfortideen zur Musterbeobachtung, keine Diagnose oder medizinische Beratung.',
    quickTips: 'Sanfte Tipps',
    quickTipsFor: 'Sanfte Tipps bei',
    selectHint: 'Wähle oben ein Symptom aus, um drei sanfte Komfortideen zu sehen.',
    safetySymptomsTitle: 'Symptome für ärztliche Abklärung',
    safetySymptomsHint: 'Wenn eines davon zutrifft, pausiert NutriFlow die Tipps und zeigt einen medizinischen Sicherheitshinweis.',
    emergencyTitle: 'Wann medizinische Hilfe wichtig ist',
    emergencyGuidance:
      'Wenn Symptome stark, ungewöhnlich oder zunehmend sind oder Brustschmerz, Ohnmacht, Blut oder Atemnot auftreten, suche dringend medizinische Hilfe.',
  },
  fa: {
    help: 'کمک',
    instantRelief: 'راهنمای آرام‌سازی',
    commonSymptoms: 'علائم رایج',
    title: 'چه احساسی دارید؟',
    chooseSymptom: 'یک علامت انتخاب کنید',
    comfortIdeas: 'ایده‌های ساده برای آرام‌سازی و پیگیری الگوها؛ نه تشخیص یا توصیه پزشکی.',
    quickTips: 'نکات آرام‌سازی شما',
    quickTipsFor: 'نکات آرام‌سازی برای',
    selectHint: 'برای دیدن سه ایده ملایم، یک علامت را انتخاب کنید.',
    safetySymptomsTitle: 'علائمی که نیاز به بررسی پزشکی دارند',
    safetySymptomsHint: 'اگر هرکدام صدق می‌کند، NutriFlow نکات معمول را متوقف می‌کند و پیام مراقبت پزشکی نشان می‌دهد.',
    emergencyTitle: 'چه زمانی کمک پزشکی لازم است',
    emergencyGuidance:
      'اگر علائم شدید، غیرمعمول یا رو به بدتر شدن هستند، یا درد قفسه سینه، غش، خون‌ریزی یا تنگی نفس دارید، فوراً کمک پزشکی بگیرید.',
  },
} as const;

const RELIEF_SYMPTOMS = {
  bloating: {
    label: { en: 'Bloating', de: 'Blähungen', fa: 'نفخ' },
    tips: {
      en: ['Try a 5-minute walk', 'Sip peppermint tea', 'Deep diaphragmatic breathing'],
      de: ['Mache einen 5-minütigen Spaziergang', 'Trinke langsam Pfefferminztee', 'Atme tief in den Bauch'],
      fa: ['۵ دقیقه آرام قدم بزنید', 'چای نعناع را آهسته بنوشید', 'تنفس عمیق دیافراگمی انجام دهید'],
    },
  },
  reflux: {
    label: { en: 'Reflux', de: 'Sodbrennen/Reflux', fa: 'ریفلاکس' },
    tips: {
      en: ['Sit upright for a while', 'Take small sips of water', 'Loosen tight waistbands'],
      de: ['Bleibe eine Weile aufrecht sitzen', 'Trinke Wasser in kleinen Schlucken', 'Lockere enge Kleidung am Bauch'],
      fa: ['مدتی صاف بنشینید', 'آب را جرعه‌جرعه بنوشید', 'لباس تنگ دور کمر را شل کنید'],
    },
  },
  cramps: {
    label: { en: 'Cramps', de: 'Krämpfe', fa: 'گرفتگی شکم' },
    tips: {
      en: ['Use a warm compress', 'Try slow belly breathing', 'Rest in a comfortable position'],
      de: ['Lege eine warme Kompresse auf', 'Atme langsam in den Bauch', 'Ruhe dich in einer bequemen Position aus'],
      fa: ['کمپرس گرم روی شکم بگذارید', 'تنفس آرام شکمی انجام دهید', 'در وضعیت راحت استراحت کنید'],
    },
  },
  nausea: {
    label: { en: 'Nausea', de: 'Übelkeit', fa: 'تهوع' },
    tips: {
      en: ['Sip ginger tea slowly', 'Try fresh air near a window', 'Eat bland food only if you feel ready'],
      de: ['Trinke Ingwertee langsam', 'Atme frische Luft am Fenster', 'Iss nur leichte Kost, wenn du dich bereit fühlst'],
      fa: ['چای زنجبیل را آرام بنوشید', 'کنار پنجره کمی هوای تازه بگیرید', 'فقط اگر آماده هستید غذای ساده بخورید'],
    },
  },
} as const;

const RED_FLAG_RELIEF_OPTIONS = [
  { key: 'bloodInStool', labels: { en: 'Blood in stool', de: 'Blut im Stuhl', fa: 'خون در مدفوع' } },
  { key: 'unexplainedWeightLoss', labels: { en: 'Unexplained weight loss', de: 'Unerklärlicher Gewichtsverlust', fa: 'کاهش وزن بی‌دلیل' } },
  { key: 'severePain', labels: { en: 'Severe abdominal pain', de: 'Starke Bauchschmerzen', fa: 'درد شدید شکم' } },
  { key: 'persistentFever', labels: { en: 'Persistent fever', de: 'Anhaltendes Fieber', fa: 'تب مداوم' } },
  { key: 'nighttimeDiarrhea', labels: { en: 'Nighttime diarrhea', de: 'Nächtlicher Durchfall', fa: 'اسهال شبانه' } },
  { key: 'repeatedVomiting', labels: { en: 'Repeated vomiting', de: 'Wiederholtes Erbrechen', fa: 'استفراغ مکرر' } },
  { key: 'allergicReaction', labels: { en: 'Severe allergic reaction', de: 'Schwere allergische Reaktion', fa: 'واکنش آلرژیک شدید' } },
  { key: 'troubleBreathing', labels: { en: 'Trouble breathing', de: 'Atemnot', fa: 'تنگی نفس' } },
  { key: 'faintingWeakness', labels: { en: 'Fainting or severe weakness', de: 'Ohnmacht oder starke Schwäche', fa: 'غش یا ضعف شدید' } },
] as const;

type ReliefSymptom = keyof typeof RELIEF_SYMPTOMS;
type RedFlagReliefSymptom = (typeof RED_FLAG_RELIEF_OPTIONS)[number];

export default function ReliefScreen() {
  const [language, setLanguage] = useState<AppLanguage>('en');
  const [selectedSymptom, setSelectedSymptom] = useState<ReliefSymptom | null>(null);
  const [redFlagWarning, setRedFlagWarning] = useState<RedFlagWarningCopy | null>(null);
  const isRtl = isRtlLanguage(language);
  const copy = RELIEF_COPY[language];

  useFocusEffect(useCallback(() => {
    let isActive = true;

    AsyncStorage.getItem(APP_LANGUAGE_STORAGE_KEY)
      .then((storedLanguage) => {
        if (isActive) setLanguage(parseStoredLanguage(storedLanguage));
      })
      .catch(console.warn);

    return () => {
      isActive = false;
    };
  }, []));

  const handleComfortSymptomSelect = (symptom: ReliefSymptom) => {
    setRedFlagWarning(null);
    setSelectedSymptom(symptom);
  };

  const handleRedFlagSymptomSelect = (symptom: RedFlagReliefSymptom) => {
    const triage = detectRedFlagSymptoms([symptom.key, symptom.labels[language]]);
    const warning = getRedFlagWarning(language);
    setSelectedSymptom(null);
    setRedFlagWarning(warning);
    if (triage.hasRedFlag) {
      // Keep the shared detector on the path so SOS uses the same triage layer as analysis screens.
      Alert.alert(warning.title, warning.message, [{ text: warning.actionLabel }]);
    }
  };

  const selectedSymptomConfig = selectedSymptom ? RELIEF_SYMPTOMS[selectedSymptom] : null;
  const selectedSymptomLabel = selectedSymptomConfig?.label[language] ?? '';
  const tips = selectedSymptomConfig?.tips[language] ?? [];

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.header, isRtl && styles.rtlRow]}>
          <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backButton}>
            <Ionicons name={isRtl ? 'chevron-forward' : 'chevron-back'} size={22} color={NAVY} />
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

          <View style={styles.buttonGrid}>
            {(Object.keys(RELIEF_SYMPTOMS) as ReliefSymptom[]).map((symptom) => {
              const isSelected = selectedSymptom === symptom;
              const symptomLabel = RELIEF_SYMPTOMS[symptom].label[language];
              return (
                <Pressable
                  key={symptom}
                  onPress={() => handleComfortSymptomSelect(symptom)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  style={({ pressed }) => [
                    styles.symptomButton,
                    isRtl && styles.rtlSymptomButton,
                    isSelected && styles.symptomButtonSelected,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={[styles.symptomButtonText, isSelected && styles.symptomButtonTextSelected, isRtl && styles.rtlText]}>
                    {symptomLabel}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={[styles.cardKicker, isRtl && styles.rtlText]}>{copy.safetySymptomsTitle}</Text>
          <Text style={[styles.cardSubtitle, isRtl && styles.rtlText]}>{copy.safetySymptomsHint}</Text>
          <View style={styles.buttonGrid}>
            {RED_FLAG_RELIEF_OPTIONS.map((symptom) => (
              <Pressable
                key={symptom.key}
                onPress={() => handleRedFlagSymptomSelect(symptom)}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.redFlagButton,
                  isRtl && styles.rtlSymptomButton,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.redFlagButtonText, isRtl && styles.rtlText]}>{symptom.labels[language]}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {redFlagWarning ? (
          <View style={[styles.safetyCard, isRtl && styles.rtlRow]}>
            <View style={styles.safetyIcon}>
              <Ionicons name="medical-outline" size={18} color="#9A3412" />
            </View>
            <View style={styles.emergencyCopy}>
              <Text style={[styles.safetyTitle, isRtl && styles.rtlText]}>{redFlagWarning.title}</Text>
              <Text style={[styles.safetyText, isRtl && styles.rtlText]}>{redFlagWarning.message}</Text>
            </View>
          </View>
        ) : null}

        {!redFlagWarning ? (
        <View style={styles.tipsCard}>
          <Text style={[styles.cardTitle, isRtl && styles.rtlText]}>
            {selectedSymptom ? `${copy.quickTipsFor} ${selectedSymptomLabel}` : copy.quickTips}
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
        ) : null}

        <View style={[styles.emergencyCard, isRtl && styles.rtlRow]}>
          <View style={styles.emergencyIcon}>
            <Ionicons name="medkit" size={18} color={SAGE_DARK} />
          </View>
          <View style={styles.emergencyCopy}>
            <Text style={[styles.emergencyTitle, isRtl && styles.rtlText]}>{copy.emergencyTitle}</Text>
            <Text style={[styles.emergencyGuidance, isRtl && styles.rtlText]}>{copy.emergencyGuidance}</Text>
          </View>
        </View>
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
    textAlign: 'center',
  },
  symptomButtonTextSelected: {
    color: '#FFFFFF',
  },
  redFlagButton: {
    backgroundColor: '#FFF7ED',
    borderColor: '#FDBA74',
    borderRadius: RADIUS,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  redFlagButtonText: {
    color: '#9A3412',
    fontSize: 14,
    fontWeight: '800',
  },
  safetyCard: {
    alignItems: 'flex-start',
    backgroundColor: '#FFF7ED',
    borderColor: '#FDBA74',
    borderRadius: RADIUS,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 18,
  },
  safetyIcon: {
    alignItems: 'center',
    backgroundColor: '#FED7AA',
    borderRadius: RADIUS,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  safetyTitle: {
    color: '#7C2D12',
    fontSize: 17,
    fontWeight: '800',
  },
  safetyText: {
    color: '#7C2D12',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 5,
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
  emergencyCard: {
    alignItems: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E0D2',
    borderRadius: RADIUS,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 16,
  },
  emergencyIcon: {
    alignItems: 'center',
    backgroundColor: SAGE_SOFT,
    borderRadius: 14,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  emergencyCopy: {
    flex: 1,
  },
  emergencyTitle: {
    color: NAVY,
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 20,
  },
  emergencyGuidance: {
    color: SLATE,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 4,
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
  rtlSymptomButton: {
    alignItems: 'flex-end',
  },
});
