import { useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '../../../lib/supabase';

type Question = {
  id: string;
  title: string;
  options: string[];
};

const QUESTIONS: Question[] = [
  { id: 'bowelFrequency', title: 'How often do you have a bowel movement?', options: ['2–3 per day', 'Once per day', 'Every 2–3 days', '< 3 per week'] },
  { id: 'stoolConsistency', title: 'How would you describe your stool consistency?', options: ['Too hard', 'Normal', 'Too loose', 'Varies'] },
  { id: 'symptoms', title: 'Which symptom shows up most often for you?', options: ['Bloating', 'Gas', 'Constipation', 'Diarrhea', 'Pain', 'None'] },
  { id: 'diet', title: 'How would you describe your current diet?', options: ['Very healthy', 'Mostly balanced', 'Inconsistent', 'Processed'] },
  { id: 'fiber', title: 'How would you rate your fiber intake?', options: ['High', 'Moderate', 'Low', "Don't know"] },
  { id: 'stress', title: 'How much does stress affect your digestion?', options: ['Not at all', 'A little', 'Moderately', 'Strongly'] },
  { id: 'sleep', title: 'How would you rate your sleep quality?', options: ['Excellent', 'Good', 'Fair', 'Poor'] },
  { id: 'triggers', title: 'Have you identified any trigger foods?', options: ['Yes clearly', 'Sometimes', 'Rarely', "Don't know"] },
  { id: 'goal', title: 'What is your main goal right now?', options: ['Reduce bloating', 'Improve regularity', 'Improve consistency', 'Identify triggers', 'General health'] },
];

const COLORS = {
  background: '#F8F6EE',
  card: '#FFFFFF',
  cardSelected: '#E6F3EC',
  textPrimary: '#15212D',
  textSecondary: '#4E5B66',
  accent: '#6FA987',
  border: '#DDE6DF',
};

function computeFocusAreas(answers: Record<string, string>) {
  const focus = new Set<string>();
  const mainGoal = answers.goal ?? 'General health';
  if (mainGoal === 'Reduce bloating') focus.add('Mindful eating');
  if (mainGoal === 'Improve regularity') focus.add('Hydration');
  if (mainGoal === 'Improve consistency') focus.add('Fiber balance');
  if (mainGoal === 'Identify triggers') focus.add('Food pattern tracking');
  if (mainGoal === 'General health') focus.add('Daily consistency');
  if (answers.stress === 'Moderately' || answers.stress === 'Strongly') focus.add('Stress support');
  if (answers.sleep === 'Fair' || answers.sleep === 'Poor') focus.add('Sleep routine');
  if (answers.fiber === 'Low' || answers.fiber === "Don't know") focus.add('Fiber quality');
  if (answers.triggers === 'Rarely' || answers.triggers === "Don't know") focus.add('Trigger discovery');
  return Array.from(focus).slice(0, 3);
}

function computeHabits(answers: Record<string, string>) {
  const habits = new Set<string>();
  habits.add('Start with one simple, repeatable meal routine each day.');
  if (answers.goal === 'Reduce bloating') habits.add('Eat more slowly and pause halfway through meals.');
  if (answers.goal === 'Improve regularity' || answers.fiber === 'Low') habits.add('Add one fiber-rich food and one extra glass of water daily.');
  if (answers.stress === 'Strongly' || answers.stress === 'Moderately') habits.add('Take a 5-minute breathing break before one meal.');
  if (answers.triggers !== 'Yes clearly') habits.add('Track meals and symptoms for 7 days to spot patterns.');
  return Array.from(habits).slice(0, 3);
}

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  const isSummary = step >= QUESTIONS.length;
  const currentQuestion = QUESTIONS[step];
  const currentAnswer = currentQuestion ? answers[currentQuestion.id] : undefined;
  const progressPercent = isSummary ? 100 : Math.round(((step + 1) / QUESTIONS.length) * 100);

  const summary = useMemo(() => ({
    mainGoal: answers.goal ?? 'General health',
    focusAreas: computeFocusAreas(answers),
    habits: computeHabits(answers),
  }), [answers]);

  const handleSelect = (value: string) => {
    if (!currentQuestion) return;
    setAnswers((prev) => ({ ...prev, [currentQuestion.id]: value }));
    setStep((prev) => Math.min(prev + 1, QUESTIONS.length));
  };

  const handleStartTracking = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (userData.user?.id) {
        await supabase.from('user_profiles').upsert({
          user_id: userData.user.id,
          onboarding_answers: answers,
          main_goal: answers.goal ?? 'General health',
          stool_frequency_baseline: answers.bowelFrequency ?? '',
          stool_type_baseline: answers.stoolConsistency ?? '',
          symptoms_baseline: answers.symptoms ? [answers.symptoms] : [],
          diet_pattern_baseline: answers.diet ?? '',
          fiber_intake_baseline: answers.fiber ?? '',
          stress_impact_baseline: answers.stress ?? '',
          sleep_quality_baseline: answers.sleep ?? '',
          trigger_food_awareness: answers.triggers ?? '',
          focus_areas: summary.focusAreas,
          first_habits: summary.habits,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });
      }
    } catch (error) {
      console.error('Failed to save onboarding profile:', error);
    } finally {
      setIsSaving(false);
    }

    router.replace('/(tabs)');
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.progressWrap}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
          </View>
          <Text style={styles.progressText}>{isSummary ? 'Your personalized summary' : `Question ${step + 1} of 9`}</Text>
        </View>

        {!isSummary ? (
          <>
            <View style={styles.card}>
              <Text style={styles.questionTitle}>{currentQuestion.title}</Text>
              <Text style={styles.questionSubtitle}>Tap one option to continue.</Text>
            </View>
            <View style={styles.optionList}>
              {currentQuestion.options.map((option) => {
                const selected = currentAnswer === option;
                return (
                  <Pressable key={option} onPress={() => handleSelect(option)} style={[styles.optionButton, selected && styles.optionButtonSelected]}>
                    <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{option}</Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : (
          <View style={styles.card}>
            <Text style={styles.summaryTitle}>Your GutWell starting plan</Text>
            <Text style={styles.sectionTitle}>Main goal</Text>
            <Text style={styles.sectionBody}>{summary.mainGoal}</Text>
            <Text style={styles.sectionTitle}>Focus areas</Text>
            {summary.focusAreas.map((area) => <Text key={area} style={styles.sectionBody}>{`\u2022 ${area}`}</Text>)}
            <Text style={styles.sectionTitle}>Suggested first habits</Text>
            {summary.habits.map((habit) => <Text key={habit} style={styles.sectionBody}>{`\u2022 ${habit}`}</Text>)}
            <Pressable onPress={handleStartTracking} disabled={isSaving} style={[styles.startButton, isSaving && styles.startButtonDisabled]}>
              <Text style={styles.startButtonText}>{isSaving ? 'Saving profile...' : 'Start tracking'}</Text>
            </Pressable>
          </View>
        )}

        {step > 0 && !isSummary ? (
          <Pressable onPress={() => setStep((prev) => Math.max(prev - 1, 0))} style={styles.backButton}>
            <Text style={styles.backButtonText}>Back</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 16, paddingBottom: 40, gap: 20 },
  progressWrap: { gap: 10 },
  progressTrack: { height: 10, borderRadius: 999, backgroundColor: '#E8EDE9', overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: COLORS.accent },
  progressText: { color: COLORS.textSecondary, fontSize: 15, fontWeight: '500' },
  card: { backgroundColor: COLORS.card, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border, padding: 20, gap: 10 },
  questionTitle: { color: COLORS.textPrimary, fontSize: 28, lineHeight: 34, fontWeight: '700' },
  questionSubtitle: { color: COLORS.textSecondary, fontSize: 16 },
  optionList: { gap: 12 },
  optionButton: { borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.card, paddingVertical: 16, paddingHorizontal: 18 },
  optionButtonSelected: { borderColor: COLORS.accent, backgroundColor: COLORS.cardSelected },
  optionText: { color: COLORS.textPrimary, fontSize: 18, fontWeight: '500' },
  optionTextSelected: { fontWeight: '600' },
  summaryTitle: { color: COLORS.textPrimary, fontSize: 30, lineHeight: 36, fontWeight: '700', marginBottom: 8 },
  sectionTitle: { color: COLORS.textPrimary, fontSize: 18, fontWeight: '700', marginTop: 8 },
  sectionBody: { color: COLORS.textSecondary, fontSize: 16, lineHeight: 22 },
  startButton: { marginTop: 12, borderRadius: 16, backgroundColor: COLORS.accent, paddingVertical: 14, alignItems: 'center' },
  startButtonDisabled: { opacity: 0.8 },
  startButtonText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  backButton: { borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, backgroundColor: '#FFFFFF', paddingVertical: 10, paddingHorizontal: 16, alignSelf: 'flex-start' },
  backButtonText: { color: COLORS.textPrimary, fontSize: 16, fontWeight: '600' },
});
