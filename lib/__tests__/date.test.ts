import {
  getLocalDateKey,
  localDateKeyToDate,
  addDaysToLocalDateKey,
  getLocalDayIsoRange,
} from '../date';

describe('getLocalDateKey', () => {
  it('formats a date as YYYY-MM-DD in local time', () => {
    expect(getLocalDateKey(new Date(2026, 5, 10, 13, 45))).toBe('2026-06-10');
  });

  it('keeps late-evening local times on the same local day (no UTC shift)', () => {
    // 11pm local: a UTC-based key would roll into tomorrow anywhere west of UTC.
    expect(getLocalDateKey(new Date(2026, 0, 31, 23, 0))).toBe('2026-01-31');
  });

  it('pads single-digit months and days', () => {
    expect(getLocalDateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('addDaysToLocalDateKey', () => {
  it('adds days within a month', () => {
    expect(addDaysToLocalDateKey('2026-06-10', 5)).toBe('2026-06-15');
  });

  it('subtracts days across a month boundary', () => {
    expect(addDaysToLocalDateKey('2026-06-01', -1)).toBe('2026-05-31');
  });

  it('crosses a year boundary', () => {
    expect(addDaysToLocalDateKey('2025-12-31', 1)).toBe('2026-01-01');
  });

  it('handles leap years', () => {
    expect(addDaysToLocalDateKey('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDaysToLocalDateKey('2026-02-28', 1)).toBe('2026-03-01');
  });
});

describe('localDateKeyToDate', () => {
  it('round-trips with getLocalDateKey', () => {
    const date = localDateKeyToDate('2026-06-10');
    expect(getLocalDateKey(date)).toBe('2026-06-10');
  });
});

describe('getLocalDayIsoRange', () => {
  it('returns a start before its end and both parse as valid dates', () => {
    const { startIso, endIso } = getLocalDayIsoRange('2026-06-10');
    expect(new Date(startIso).getTime()).toBeLessThan(new Date(endIso).getTime());
  });

  it('spans exactly one day', () => {
    const { startIso, endIso } = getLocalDayIsoRange('2026-06-10');
    expect(new Date(endIso).getTime() - new Date(startIso).getTime()).toBe(24 * 60 * 60 * 1000);
  });
});
