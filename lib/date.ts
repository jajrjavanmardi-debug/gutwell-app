export function getLocalDateKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function localDateKeyToDate(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1, 0, 0, 0, 0);
}

export function addDaysToLocalDateKey(dateKey: string, days: number): string {
  const date = localDateKeyToDate(dateKey);
  date.setDate(date.getDate() + days);
  return getLocalDateKey(date);
}

export function getLocalDayIsoRange(dateKey: string): { startIso: string; endIso: string } {
  const start = localDateKeyToDate(dateKey);
  const end = new Date(start);
  end.setDate(start.getDate() + 1);
  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
}
