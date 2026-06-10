import { calculateStreakFromDates } from '../streaks';
import { getLocalDateKey, addDaysToLocalDateKey } from '../date';

// The streak calculator anchors "current" on the real today/yesterday, so the
// tests build date lists relative to the actual local date.
const today = getLocalDateKey();
const d = (offset: number) => addDaysToLocalDateKey(today, offset);

jest.mock('../supabase', () => ({ supabase: {} }));

describe('calculateStreakFromDates', () => {
  it('returns the empty streak for no check-ins', () => {
    expect(calculateStreakFromDates([])).toEqual({
      currentStreak: 0,
      bestStreak: 0,
      lastCheckInDate: null,
    });
  });

  it('counts a run ending today', () => {
    const result = calculateStreakFromDates([d(-2), d(-1), d(0)]);
    expect(result.currentStreak).toBe(3);
    expect(result.bestStreak).toBe(3);
    expect(result.lastCheckInDate).toBe(today);
  });

  it("keeps the streak alive when today's check-in hasn't happened yet", () => {
    const result = calculateStreakFromDates([d(-3), d(-2), d(-1)]);
    expect(result.currentStreak).toBe(3);
  });

  it('resets the current streak after a missed day, but remembers the best', () => {
    const result = calculateStreakFromDates([d(-10), d(-9), d(-8), d(-7), d(0)]);
    expect(result.currentStreak).toBe(1);
    expect(result.bestStreak).toBe(4);
  });

  it('zeroes the current streak when the last check-in is older than yesterday', () => {
    const result = calculateStreakFromDates([d(-5), d(-4), d(-3)]);
    expect(result.currentStreak).toBe(0);
    expect(result.bestStreak).toBe(3);
  });

  it('deduplicates multiple check-ins on the same day', () => {
    const result = calculateStreakFromDates([d(-1), d(-1), d(0), d(0)]);
    expect(result.currentStreak).toBe(2);
    expect(result.bestStreak).toBe(2);
  });

  it('handles unsorted input', () => {
    const result = calculateStreakFromDates([d(0), d(-2), d(-1)]);
    expect(result.currentStreak).toBe(3);
  });

  it('handles timestamped date strings by normalizing to the day', () => {
    const result = calculateStreakFromDates([`${d(-1)}T22:15:00`, `${d(0)}T07:00:00`]);
    expect(result.currentStreak).toBe(2);
  });
});
