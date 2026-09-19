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

// ─── Time of day ────────────────────────────────────────────────────────────

export type DayPart = 'morning' | 'afternoon' | 'evening';

/**
 * Which part of the user's day it is, from the DEVICE clock.
 *
 * Boundaries: 05:00–11:59 morning · 12:00–17:59 afternoon · 18:00–04:59
 * evening. Evening deliberately wraps past midnight — 01:00 is still "evening"
 * to the person awake at 01:00, and "Good morning" at that hour reads as a bug.
 *
 * Local, never UTC, and never server time: a greeting is about where the user
 * is standing. Because it reads `getHours()` it follows the OS through DST
 * automatically — there is no offset arithmetic here to get wrong.
 *
 * Pure and date-injectable so the six boundary cases are unit-tested rather
 * than reasoned about.
 */
export function getDayPart(date = new Date()): DayPart {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  return 'evening';
}

/**
 * Placeholder names that must never be greeted.
 *
 * A greeting is the most personal line on the screen, so "Good morning, User"
 * is worse than no name at all — it advertises that the app does not know who
 * it is talking to. These are the values that realistically end up in
 * display_name: seed/demo accounts, an untranslated default, or a literal
 * written by a form that stringified a null.
 */
const PLACEHOLDER_NAMES = new Set([
  'user',
  'nutzer',
  'test',
  'testuser',
  'demo',
  'guest',
  'gast',
  'null',
  'undefined',
  'nan',
  'none',
  'name',
  'anonymous',
  'anonym',
]);

/**
 * The display name to greet with, or null when there isn't a usable one.
 *
 * Deliberately conservative: anything that is not clearly a real name returns
 * null and the greeting renders without one, which always reads correctly.
 *
 * An email address (or anything containing '@') is rejected outright rather
 * than being split on '@' — showing someone their own email handle as a first
 * name is exactly the "malformed placeholder" case, and deriving a name from
 * an email is not something this app should do at all.
 */
export function usableDisplayName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  // Long enough to be a name, short enough not to be a pasted sentence.
  if (trimmed.length > 40) return null;
  if (trimmed.includes('@')) return null;
  if (PLACEHOLDER_NAMES.has(trimmed.toLowerCase())) return null;
  // Must contain at least one letter — "123" and "---" are not names.
  if (!/\p{L}/u.test(trimmed)) return null;
  return trimmed;
}
