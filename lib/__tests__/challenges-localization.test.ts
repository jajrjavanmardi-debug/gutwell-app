/**
 * Challenge catalog localization tests.
 *
 * Challenge titles and descriptions live in the Supabase `challenges` table:
 * `title`/`description` hold canonical English, `title_de`/`description_de`
 * hold German and are nullable. These tests pin the fallback rule that makes a
 * partially-translated catalog safe.
 */

import { localized } from '../challenges';

// lib/challenges imports the Supabase client at module scope; the fallback
// helper under test never touches it. babel-plugin-jest-hoist lifts this call
// above the import, so the mock is in place before the module is evaluated.
jest.mock('../supabase', () => ({ supabase: {} }));

describe('localized — challenge content fallback', () => {
  test('German reader gets the German value when one exists', () => {
    expect(localized('Hydration Week', 'Trinkwoche', 'de')).toBe('Trinkwoche');
  });

  test('English reader always gets English, even when German exists', () => {
    expect(localized('Hydration Week', 'Trinkwoche', 'en')).toBe('Hydration Week');
  });

  test('a NULL German column falls back to English rather than rendering blank', () => {
    expect(localized('Fiber Ramp', null, 'de')).toBe('Fiber Ramp');
  });

  test('an empty or whitespace-only German value falls back to English', () => {
    expect(localized('Fiber Ramp', '', 'de')).toBe('Fiber Ramp');
    expect(localized('Fiber Ramp', '   ', 'de')).toBe('Fiber Ramp');
  });

  test('an unsupported language falls back to English', () => {
    // Guards the removed Persian locale and anything else a stale client sends.
    expect(localized('Fiber Ramp', 'Ballaststoffe steigern', 'fa' as never)).toBe('Fiber Ramp');
    expect(localized('Fiber Ramp', 'Ballaststoffe steigern', 'fr' as never)).toBe('Fiber Ramp');
    expect(localized('Fiber Ramp', 'Ballaststoffe steigern', undefined as never)).toBe('Fiber Ramp');
  });

  test('an empty English source stays empty rather than throwing', () => {
    expect(localized('', null, 'en')).toBe('');
    expect(localized('', null, 'de')).toBe('');
  });

  test('German is preserved verbatim, including umlauts and sharp s', () => {
    expect(localized('14-Day No-Trigger Streak', '14 Tage ohne Auslöser', 'de')).toBe(
      '14 Tage ohne Auslöser'
    );
  });
});
