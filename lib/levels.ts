export type GutLevel = {
  name: string;
  key: string;
  minPoints: number;
  icon: string;
};

export const GUT_LEVELS: GutLevel[] = [
  { name: 'Beginner', key: 'beginner', minPoints: 0, icon: 'leaf' },
  { name: 'Explorer', key: 'explorer', minPoints: 50, icon: 'compass' },
  { name: 'Tracker', key: 'tracker', minPoints: 150, icon: 'analytics' },
  { name: 'Specialist', key: 'specialist', minPoints: 400, icon: 'shield-checkmark' },
  { name: 'Gut Guru', key: 'guru', minPoints: 1000, icon: 'star' },
];

export function calculateLevel(totalPoints: number): GutLevel {
  for (let i = GUT_LEVELS.length - 1; i >= 0; i--) {
    if (totalPoints >= GUT_LEVELS[i].minPoints) {
      return GUT_LEVELS[i];
    }
  }
  return GUT_LEVELS[0];
}

export function getNextLevel(totalPoints: number): GutLevel | null {
  const current = calculateLevel(totalPoints);
  const idx = GUT_LEVELS.findIndex(l => l.key === current.key);
  if (idx < GUT_LEVELS.length - 1) return GUT_LEVELS[idx + 1];
  return null;
}

export function getLevelProgress(totalPoints: number): number {
  const current = calculateLevel(totalPoints);
  const next = getNextLevel(totalPoints);
  if (!next) return 1;
  const range = next.minPoints - current.minPoints;
  const progress = totalPoints - current.minPoints;
  return Math.min(progress / range, 1);
}

/**
 * Calculate points earned from activities.
 * - Check-in: 5 points
 * - Food log: 3 points
 * - Symptom log: 2 points
 * - Streak bonus: streak * 2 per day
 * - Weekly completion (7 consecutive): 20 bonus
 */
export function calculatePoints(stats: {
  checkIns: number;
  foodLogs: number;
  symptomLogs: number;
  currentStreak: number;
}): number {
  return (
    stats.checkIns * 5 +
    stats.foodLogs * 3 +
    stats.symptomLogs * 2 +
    Math.min(stats.currentStreak, 30) * 2 +
    Math.floor(stats.currentStreak / 7) * 20
  );
}
