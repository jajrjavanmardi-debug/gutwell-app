import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

export default function HomeScreen() {
  const [gutScore, setGutScore] = useState(50);
  const [trendMessage, setTrendMessage] = useState('Stable ➖');
  const [recommendationMessage, setRecommendationMessage] = useState('Keep tracking to see clearer patterns ➖');
  const [correlationMessage, setCorrelationMessage] = useState('');
  const [mealInput, setMealInput] = useState('');
  const [feelingInput, setFeelingInput] = useState('');
  const [meals, setMeals] = useState<string[]>([]);
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [recentLogs, setRecentLogs] = useState<
    Array<{ id: string; type: 'meal' | 'symptom'; value: string }>
  >([]);
  const trimmedMealInput = useMemo(() => mealInput.trim(), [mealInput]);
  const trimmedSymptomInput = useMemo(() => feelingInput.trim(), [feelingInput]);
  const canAddMeal = trimmedMealInput.length > 0;
  const canAddSymptom = trimmedSymptomInput.length > 0;

  useEffect(() => {
    setGutScore((prevScore) => {
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      let weightedMealCount = 0;
      let weightedSymptomCount = 0;

      recentLogs.forEach((log) => {
        const logDate = getLogDate(log.id);
        if (!logDate) return;

        const startOfLogDay = new Date(logDate.getFullYear(), logDate.getMonth(), logDate.getDate());
        const dayDiff = Math.round((startOfToday.getTime() - startOfLogDay.getTime()) / 86400000);
        if (dayDiff < 0 || dayDiff > 2) return;

        const weight = dayDiff === 0 ? 1 : dayDiff === 1 ? 0.7 : 0.4;
        if (log.type === 'meal') {
          weightedMealCount += weight;
        } else {
          weightedSymptomCount += weight;
        }
      });

      const nextScore = Math.max(
        0,
        Math.min(100, Math.round(50 + weightedMealCount * 2 - weightedSymptomCount * 3))
      );

      if (weightedSymptomCount > weightedMealCount) {
        setRecommendationMessage('Recent symptoms may be affecting your score ⚠️');
      } else if (weightedMealCount > weightedSymptomCount) {
        setRecommendationMessage('Your recent meals are improving your score 👍');
      } else {
        setRecommendationMessage('Keep tracking to see clearer patterns ➖');
      }

      if (nextScore > prevScore) {
        setTrendMessage("You're improving 📈");
      } else if (nextScore < prevScore) {
        setTrendMessage("You're declining 📉");
      } else {
        setTrendMessage('Stable ➖');
      }

      return nextScore;
    });
  }, [recentLogs]);

  useEffect(() => {
    const recentWindow = recentLogs.slice(0, 30);
    const chronological = [...recentWindow].reverse();
    const pairCounts: Record<string, number> = {};

    for (let i = 0; i < chronological.length; i++) {
      const entry = chronological[i];
      if (entry.type !== 'symptom') continue;

      for (let j = i - 1; j >= Math.max(0, i - 5); j--) {
        const prior = chronological[j];
        if (prior.type !== 'meal') continue;

        const key = `${prior.value.toLowerCase()}|||${entry.value.toLowerCase()}`;
        pairCounts[key] = (pairCounts[key] || 0) + 1;
        break;
      }
    }

    const mostFrequentPair = Object.entries(pairCounts).reduce<
      [string, number] | null
    >((best, current) => {
      if (!best) return current;
      if (current[1] > best[1]) return current;
      if (current[1] === best[1] && current[0] < best[0]) return current;
      return best;
    }, null);

    if (mostFrequentPair && mostFrequentPair[1] >= 2) {
      const [meal, symptom] = mostFrequentPair[0].split('|||');
      const occurrences = mostFrequentPair[1];
      setCorrelationMessage(
        `${meal.charAt(0).toUpperCase() + meal.slice(1)} may be linked to ${symptom} (seen ${occurrences} times) ⚠️`
      );
    } else {
      setCorrelationMessage('');
    }
  }, [recentLogs]);

  const getLogDate = (logId: string): Date | null => {
    const timestampPart = logId.split('-')[0];
    const timestamp = Number(timestampPart);
    if (!Number.isFinite(timestamp)) return null;
    return new Date(timestamp);
  };

  const getDayLabel = (date: Date): string => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diffDays = Math.round((startOfToday.getTime() - startOfDate.getTime()) / 86400000);

    if (diffDays === 1) return 'Yesterday';
    if (diffDays === 2) return 'Day before';
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  const previousDaysGroups = recentLogs
    .map((log) => {
      const date = getLogDate(log.id);
      return date ? { ...log, date } : null;
    })
    .filter((log): log is { id: string; type: 'meal' | 'symptom'; value: string; date: Date } => {
      if (!log) return false;
      const now = new Date();
      return log.date.toDateString() !== now.toDateString();
    })
    .reduce<Record<string, Array<{ id: string; type: 'meal' | 'symptom'; value: string }>>>((acc, log) => {
      const label = getDayLabel(log.date);
      if (!acc[label]) acc[label] = [];
      acc[label].push({ id: log.id, type: log.type, value: log.value });
      return acc;
    }, {});

  const handleAddMeal = () => {
    if (!trimmedMealInput) {
      return;
    }

    setMeals((prevMeals) => [trimmedMealInput, ...prevMeals]);
    setRecentLogs((prevLogs) => [
      { id: `${Date.now()}-meal`, type: 'meal', value: trimmedMealInput },
      ...prevLogs,
    ]);
    setMealInput('');
  };

  const handleAddSymptom = () => {
    if (!trimmedSymptomInput) {
      return;
    }

    setSymptoms((prevSymptoms) => [trimmedSymptomInput, ...prevSymptoms]);
    setRecentLogs((prevLogs) => [
      { id: `${Date.now()}-symptom`, type: 'symptom', value: trimmedSymptomInput },
      ...prevLogs,
    ]);
    setFeelingInput('');
  };

  const handleLogCheckIn = () => {
    setGutScore((prevScore) => prevScore);
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Welcome</Text>

      <View style={styles.scoreCard}>
        <Text style={styles.scoreLabel}>Gut Score</Text>
        <Text style={styles.scoreValue}>{gutScore}</Text>
        <Text style={styles.trendMessage}>{trendMessage}</Text>
        {recommendationMessage ? (
          <Text style={styles.recommendationMessage}>{recommendationMessage}</Text>
        ) : null}
        {correlationMessage ? (
          <Text style={styles.correlationMessage}>{correlationMessage}</Text>
        ) : null}
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>What did you eat?</Text>
        <TextInput
          value={mealInput}
          onChangeText={setMealInput}
          placeholder="Add a meal..."
          style={styles.input}
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>How do you feel?</Text>
        <TextInput
          value={feelingInput}
          onChangeText={setFeelingInput}
          placeholder="Add a symptom or feeling..."
          style={styles.input}
        />
      </View>

      <Pressable
        style={[styles.button, !canAddMeal && styles.buttonDisabled]}
        onPress={handleAddMeal}
        disabled={!canAddMeal}
      >
        <Text style={styles.buttonText}>Add Meal</Text>
      </Pressable>

      <Pressable
        style={[styles.button, !canAddSymptom && styles.buttonDisabled]}
        onPress={handleAddSymptom}
        disabled={!canAddSymptom}
      >
        <Text style={styles.buttonText}>Add Symptom</Text>
      </Pressable>

      <Pressable style={styles.primaryButton} onPress={handleLogCheckIn}>
        <Text style={styles.primaryButtonText}>Log Check-in</Text>
      </Pressable>

      <View style={styles.todaySummarySection}>
        <Text style={styles.inputLabel}>Today</Text>

        <View style={styles.todayGroup}>
          <Text style={styles.todayGroupTitle}>Meals eaten today</Text>
          {meals.length > 0 ? (
            meals.slice(0, 7).map((meal, index) => (
              <Text key={`today-meal-${index}`} style={styles.todayItem} numberOfLines={1}>
                • {meal}
              </Text>
            ))
          ) : (
            <Text style={styles.todayEmpty}>No meals logged yet.</Text>
          )}
        </View>

        <View style={styles.todayGroup}>
          <Text style={styles.todayGroupTitle}>Symptoms experienced today</Text>
          {symptoms.length > 0 ? (
            symptoms.slice(0, 7).map((symptom, index) => (
              <Text key={`today-symptom-${index}`} style={styles.todayItem} numberOfLines={1}>
                • {symptom}
              </Text>
            ))
          ) : (
            <Text style={styles.todayEmpty}>No symptoms logged yet.</Text>
          )}
        </View>
      </View>

      <View style={styles.previousDaysSection}>
        <Text style={styles.inputLabel}>Previous days</Text>
        {Object.keys(previousDaysGroups).length > 0 ? (
          Object.entries(previousDaysGroups).map(([dayLabel, items]) => (
            <View key={dayLabel} style={styles.previousDayGroup}>
              <Text style={styles.todayGroupTitle}>{dayLabel}</Text>
              {items.map((item) => (
                <Text key={item.id} style={styles.todayItem} numberOfLines={1}>
                  • {item.type === 'meal' ? 'Meal' : 'Symptom'}: {item.value}
                </Text>
              ))}
            </View>
          ))
        ) : (
          <Text style={styles.todayEmpty}>No previous-day logs yet.</Text>
        )}
      </View>

      <View style={styles.logListSection}>
        <Text style={styles.inputLabel}>Last 7 logs</Text>
        {recentLogs.slice(0, 7).length > 0 ? (
          <View style={styles.logList}>
            {recentLogs.slice(0, 7).map((item) => (
              <View key={item.id} style={styles.logListRow}>
                <Text style={styles.logType}>
                  {item.type === 'meal' ? 'Meal' : 'Symptom'}
                </Text>
                <Text style={styles.logValue} numberOfLines={1}>
                  {item.value}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.logEmpty}>No logs yet.</Text>
        )}
      </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 20,
  },
  scoreCard: {
    backgroundColor: '#F0FDF4',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    padding: 20,
    marginBottom: 20,
    alignItems: 'center',
  },
  scoreLabel: {
    fontSize: 14,
    color: '#166534',
    marginBottom: 6,
  },
  scoreValue: {
    fontSize: 56,
    lineHeight: 64,
    fontWeight: '700',
    color: '#15803D',
  },
  trendMessage: {
    marginTop: 6,
    fontSize: 14,
    color: '#166534',
  },
  recommendationMessage: {
    marginTop: 4,
    fontSize: 13,
    color: '#14532D',
    textAlign: 'center',
  },
  correlationMessage: {
    marginTop: 4,
    fontSize: 13,
    color: '#92400E',
    textAlign: 'center',
  },
  inputGroup: {
    marginBottom: 14,
  },
  todaySummarySection: {
    marginBottom: 12,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
  },
  previousDaysSection: {
    marginBottom: 12,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
  },
  previousDayGroup: {
    marginTop: 6,
  },
  todayGroup: {
    marginTop: 6,
  },
  todayGroupTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 4,
  },
  todayItem: {
    fontSize: 13,
    color: '#111827',
    marginBottom: 2,
  },
  todayEmpty: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 2,
  },
  logListSection: {
    marginBottom: 6,
  },
  logList: {
    gap: 6,
  },
  logListRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  logType: {
    fontSize: 12,
    fontWeight: '700',
    color: '#374151',
    marginRight: 10,
    minWidth: 58,
  },
  logValue: {
    flex: 1,
    fontSize: 14,
    color: '#111827',
  },
  logEmpty: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 4,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#111827',
    backgroundColor: '#FFFFFF',
  },
  button: {
    backgroundColor: '#E5E7EB',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  primaryButton: {
    backgroundColor: '#16A34A',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
