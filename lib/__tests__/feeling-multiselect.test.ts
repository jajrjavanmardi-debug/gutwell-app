/**
 * Feeling step — multi-select.
 *
 * The interaction rules are exported as pure functions from questions.tsx, so
 * they are exercised directly here rather than through the component. The data
 * contract either side of them — serialisation into profiles.gut_concern and
 * the split back into AI conditions — is asserted structurally, because both
 * live inside screens jest cannot render.
 *
 * The value that matters most: stored values are STABLE IDENTIFIERS
 * ('Comfortable', 'Bloated', 'Heavy', 'It varies'), never translated labels.
 * That is what makes EN/DE switching lossless.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { nextMultiSelect, asSelectionArray } from '../../app/(onboarding)/questions';
import { ONBOARDING_STEPS, type MultiSelectStep } from '../onboarding-config';
import { translations } from '../i18n';

const root = join(__dirname, '..', '..');
const read = (...p: string[]) => readFileSync(join(root, ...p), 'utf8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const feeling = ONBOARDING_STEPS[1] as MultiSelectStep;
const EXCLUSIVE = ['Comfortable', 'It varies'];

describe('step configuration', () => {
  test('the feeling step is multi-select and keeps its legacy key', () => {
    expect(feeling.id).toBe('after_meal_feeling');
    expect(feeling.type).toBe('multi-select');
    expect(feeling.field).toBe('meal_feeling');
  });

  test('at least one answer stays required', () => {
    // `optional` would let the user advance with nothing selected.
    expect(feeling.optional).toBeFalsy();
  });

  test('the card design is preserved', () => {
    expect(feeling.variant).toBe('card');
  });

  test('Comfortable and It varies are the exclusive values', () => {
    expect(feeling.exclusiveValues).toEqual(EXCLUSIVE);
  });

  test('the goal step is untouched and still single-select', () => {
    expect(ONBOARDING_STEPS[0].type).toBe('single-select');
  });

  test('avoid chips remain a separate optional field', () => {
    expect(feeling.chips?.field).toBe('avoid');
    expect(feeling.chips?.field).not.toBe(feeling.field);
  });
});

describe('interaction rules', () => {
  const tap = (current: string[], value: string) => nextMultiSelect(current, value, EXCLUSIVE);

  test('Bloated and Heavy coexist', () => {
    expect(tap(['Bloated'], 'Heavy')).toEqual(['Bloated', 'Heavy']);
  });

  test('Comfortable clears every other selection', () => {
    expect(tap(['Bloated', 'Heavy'], 'Comfortable')).toEqual(['Comfortable']);
  });

  test('selecting a symptom clears Comfortable', () => {
    expect(tap(['Comfortable'], 'Bloated')).toEqual(['Bloated']);
  });

  test('It varies clears every other selection', () => {
    expect(tap(['Bloated', 'Heavy'], 'It varies')).toEqual(['It varies']);
  });

  test('selecting another option clears It varies', () => {
    expect(tap(['It varies'], 'Heavy')).toEqual(['Heavy']);
  });

  test('the two exclusive values also exclude each other', () => {
    expect(tap(['Comfortable'], 'It varies')).toEqual(['It varies']);
    expect(tap(['It varies'], 'Comfortable')).toEqual(['Comfortable']);
  });

  test('re-tapping a selected exclusive value does nothing', () => {
    // It is already the entire answer — unpicking it could only leave an empty
    // selection and a disabled CTA.
    expect(tap(['Comfortable'], 'Comfortable')).toEqual(['Comfortable']);
    expect(tap(['It varies'], 'It varies')).toEqual(['It varies']);
  });

  test('an exclusive value is cleared by choosing something else, not by unpicking', () => {
    expect(tap(['Comfortable'], 'Comfortable')).toEqual(['Comfortable']);
    expect(tap(['Comfortable'], 'Bloated')).toEqual(['Bloated']);
  });

  test('non-exclusive symptoms still toggle off normally', () => {
    expect(tap(['Bloated', 'Heavy'], 'Bloated')).toEqual(['Heavy']);
    expect(tap(['Bloated'], 'Bloated')).toEqual([]);
  });

  test('order is stable, so the serialised string is deterministic', () => {
    expect(tap(tap([], 'Bloated'), 'Heavy')).toEqual(['Bloated', 'Heavy']);
  });

  test('with no exclusive values it behaves as a plain multi-select', () => {
    expect(nextMultiSelect(['a'], 'b')).toEqual(['a', 'b']);
  });
});

describe('legacy hydration', () => {
  test('a legacy scalar coerces to a single-element array', () => {
    expect(asSelectionArray('Bloated')).toEqual(['Bloated']);
  });

  test('an array passes through', () => {
    expect(asSelectionArray(['Bloated', 'Heavy'])).toEqual(['Bloated', 'Heavy']);
  });

  test('empty, missing and malformed values yield an empty selection, never a crash', () => {
    for (const junk of [undefined, '', [], 42 as never, {} as never]) {
      expect(asSelectionArray(junk)).toEqual([]);
    }
  });

  test('a legacy scalar still satisfies the "at least one answer" gate', () => {
    // canAdvance runs asSelectionArray, so a resuming user is not stranded on a
    // CTA that will not enable.
    expect(asSelectionArray('Comfortable').length).toBeGreaterThan(0);
  });

  test('a coerced legacy symptom can then be deselected like any other', () => {
    expect(nextMultiSelect(asSelectionArray('Bloated'), 'Bloated', EXCLUSIVE)).toEqual([]);
  });

  test('a coerced legacy exclusive value stays put when re-tapped', () => {
    expect(nextMultiSelect(asSelectionArray('Comfortable'), 'Comfortable', EXCLUSIVE)).toEqual([
      'Comfortable',
    ]);
  });
});

describe('serialisation into profiles.gut_concern', () => {
  const NOTIF = strip(read('app', '(onboarding)', 'notifications.tsx'));

  test('an array is joined into one comma-separated TEXT value', () => {
    expect(NOTIF).toContain("feelings.join(', ')");
    expect(NOTIF).toContain('gut_concern: gutConcern');
  });

  test('an empty selection writes null, not an empty string', () => {
    expect(NOTIF).toContain('feelings.length > 0 ? feelings.join(\', \') : null');
  });

  test('a legacy scalar is still accepted', () => {
    expect(NOTIF).toContain("typeof answers.meal_feeling === 'string'");
  });

  test('no migration was introduced', () => {
    expect(NOTIF).not.toContain('alter table');
    expect(NOTIF).not.toContain('ALTER TABLE');
  });
});

describe('AI conditions split', () => {
  const PHOTO = strip(read('app', 'photo-analysis.tsx'));

  test('a stored multi-value string is split into individual conditions', () => {
    expect(PHOTO).toContain("profile.gut_concern.split(',')");
    expect(PHOTO).toContain('conditions.add(condition)');
  });

  test('each part is trimmed and empties are dropped', () => {
    expect(PHOTO).toContain("part.trim().replace(/_/g, ' ')");
    expect(PHOTO).toContain('if (condition) conditions.add(condition)');
  });

  test('the analyze-food contract is unchanged — still the conditions Set', () => {
    expect(PHOTO).toContain('const conditions = new Set<string>()');
    expect(PHOTO).toContain('conditions: gutProfileContext.conditions');
  });
});

describe('language switching is lossless', () => {
  test('stored values are stable identifiers, not translated labels', () => {
    const values = feeling.options.map((o) => o.value);
    expect(values).toEqual(['Comfortable', 'Bloated', 'Heavy', 'It varies']);
    // 'Heavy' is the identifier; 'Heavy or sluggish' is only ever the EN label.
    expect(values).not.toContain('Heavy or sluggish');
  });

  test('both languages key their labels off the same identifiers', () => {
    for (const lang of [translations.en, translations.de]) {
      const opts = (lang.onboardingSteps.after_meal_feeling as any).options;
      for (const value of feeling.options.map((o) => o.value)) {
        expect(opts[value]).toBeDefined();
      }
    }
  });

  test('German labels differ from English while the values do not', () => {
    const en = (translations.en.onboardingSteps.after_meal_feeling as any).options;
    const de = (translations.de.onboardingSteps.after_meal_feeling as any).options;
    expect(de.Heavy.label).not.toBe(en.Heavy.label);
    expect(de.Bloated.label).not.toBe(en.Bloated.label);
  });
});

describe('accessibility', () => {
  const CARD = strip(read('components', 'ui', 'OptionCard.tsx'));
  const QUESTIONS = strip(read('app', '(onboarding)', 'questions.tsx'));

  test('a multi-select card announces as a checkbox, not a radio', () => {
    expect(CARD).toContain("accessibilityRole={multiSelect ? 'checkbox' : 'radio'}");
  });

  test('the affordance is not role-only — the indicator changes shape too', () => {
    expect(CARD).toContain('indicatorSquare');
  });

  test('the prop defaults false, so single-select callers are unaffected', () => {
    expect(CARD).toContain('multiSelect = false');
  });

  test('the feeling step passes multiSelect through', () => {
    expect(QUESTIONS).toContain('multiSelect');
    expect(QUESTIONS).toContain("step.variant === 'card'");
  });
});
