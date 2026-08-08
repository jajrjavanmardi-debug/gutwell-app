/**
 * Photo Analysis step 2 — "How do you feel right now?" chips.
 *
 * These were a single `string | null` toggled like a radio button, so a second
 * symptom replaced the first and only one ever reached the analysis. The rules
 * are pure and exercised directly; the screen wiring either side of them is
 * asserted structurally, because photo-analysis.tsx pulls in the camera, the
 * image picker and speech recognition, none of which jest can load.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import {
  FEELING_FINE,
  nextSymptomSelection,
  serializeCurrentState,
  symptomWording,
  symptomsForRequest,
} from '../symptom-selection';
import { translations } from '../i18n';

const root = join(__dirname, '..', '..');
const read = (...p: string[]) => readFileSync(join(root, ...p), 'utf8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const PHOTO = strip(read('app', 'photo-analysis.tsx'));

/** The shipped keys, in the order the chips render. */
const KEYS = ['fine', 'bloating', 'pain', 'lowEnergy', 'nausea', 'reflux'];

const tapAll = (keys: string[]) => keys.reduce<string[]>(nextSymptomSelection, []);

describe('the six chips', () => {
  test('the shipped option keys are exactly these, in both languages', () => {
    for (const lang of ['en', 'de'] as const) {
      expect(Object.keys(translations[lang].photoAnalysis.stateOptions)).toEqual(KEYS);
    }
  });

  test('labels are translated but the keys — what gets stored — are not', () => {
    const en = translations.en.photoAnalysis.stateOptions;
    const de = translations.de.photoAnalysis.stateOptions;
    expect(de.pain).not.toBe(en.pain);
    expect(de.bloating).not.toBe(en.bloating);
    // A selection holds 'pain', never 'Stomach pain' or 'Magenschmerzen'.
    expect(nextSymptomSelection([], 'pain')).toEqual(['pain']);
  });
});

describe('symptoms accumulate', () => {
  test('Bloating + Stomach pain coexist', () => {
    expect(tapAll(['bloating', 'pain'])).toEqual(['bloating', 'pain']);
  });

  test('Bloating + Nausea coexist', () => {
    expect(tapAll(['bloating', 'nausea'])).toEqual(['bloating', 'nausea']);
  });

  test('Stomach pain + Reflux coexist', () => {
    expect(tapAll(['pain', 'reflux'])).toEqual(['pain', 'reflux']);
  });

  test('three coexist', () => {
    expect(tapAll(['bloating', 'pain', 'lowEnergy'])).toEqual(['bloating', 'pain', 'lowEnergy']);
  });

  test('every symptom can be on at once', () => {
    const all = KEYS.filter((k) => k !== FEELING_FINE);
    expect(tapAll(all)).toEqual(all);
  });

  test('order follows the taps, so the serialised request is reproducible', () => {
    expect(tapAll(['pain', 'bloating'])).toEqual(['pain', 'bloating']);
    expect(tapAll(['bloating', 'pain'])).toEqual(['bloating', 'pain']);
  });
});

describe('re-tap removes only itself', () => {
  test('one symptom out of three', () => {
    expect(nextSymptomSelection(['bloating', 'pain', 'nausea'], 'pain')).toEqual([
      'bloating',
      'nausea',
    ]);
  });

  test('the last one leaves an empty selection, which is valid here', () => {
    // Unlike onboarding, context on this screen is optional.
    expect(nextSymptomSelection(['bloating'], 'bloating')).toEqual([]);
  });
});

describe('Feeling fine is exclusive', () => {
  test('it clears every symptom', () => {
    expect(nextSymptomSelection(['bloating', 'pain', 'reflux'], 'fine')).toEqual(['fine']);
  });

  test('selecting a symptom clears it', () => {
    expect(nextSymptomSelection(['fine'], 'bloating')).toEqual(['bloating']);
    expect(nextSymptomSelection(['fine'], 'pain')).toEqual(['pain']);
  });

  test('it can be switched off again, leaving nothing selected', () => {
    expect(nextSymptomSelection(['fine'], 'fine')).toEqual([]);
  });

  test('it never ends up alongside a symptom, whatever the tap order', () => {
    for (const order of [
      ['fine', 'bloating', 'pain'],
      ['bloating', 'fine', 'pain'],
      ['bloating', 'pain', 'fine'],
    ]) {
      const result = tapAll(order);
      expect(result.includes(FEELING_FINE) && result.length > 1).toBe(false);
    }
  });
});

describe('everything selected reaches the analysis request', () => {
  test('keys become plain English, so the prompt does not read an identifier', () => {
    expect(symptomWording('lowEnergy')).toBe('low energy');
    expect(symptomWording('pain')).toBe('stomach pain');
    expect(symptomsForRequest(['bloating', 'pain'])).toEqual(['bloating', 'stomach pain']);
  });

  test('the Edge Function string carries every selected symptom', () => {
    expect(serializeCurrentState(['bloating', 'pain'])).toBe('bloating, stomach pain');
    expect(serializeCurrentState(['bloating', 'pain', 'lowEnergy'])).toBe(
      'bloating, stomach pain, low energy',
    );
  });

  test('nothing selected sends nothing, rather than an empty string', () => {
    expect(serializeCurrentState([])).toBeUndefined();
  });

  test('the screen serialises rather than sending the first value only', () => {
    expect(PHOTO).toContain('currentState: serializeCurrentState(currentStateKeys)');
    expect(PHOTO).toContain('currentStateKeys.length > 0 || afterMealActivity');
  });

  test('the selected symptoms also join the symptoms array sent for analysis', () => {
    expect(PHOTO).toContain('...selectedStateSymptoms');
    expect(PHOTO).toContain('symptoms: currentSymptoms');
  });

  test('the scalar state is gone — no path can collapse the selection again', () => {
    expect(PHOTO).not.toContain('currentStateContext');
    expect(PHOTO).toContain('useState<string[]>([])');
  });
});

describe('the existing pain-aware path still fires', () => {
  // Read from source so the test cannot drift from the shipped matcher.
  const RAW = read('app', 'photo-analysis.tsx');
  const body = RAW.slice(RAW.indexOf('function hasPainText'), RAW.indexOf('function getVoiceLocale'));
  // eslint-disable-next-line no-new-func
  const hasPainText = new Function(
    `${body.replace('(value: string): boolean', '(value)')}; return hasPainText;`,
  )() as (v: string) => boolean;

  test('Stomach pain selected with another symptom still activates it', () => {
    const selection = tapAll(['bloating', 'pain']);
    const symptoms = symptomsForRequest(selection.filter((k) => k !== FEELING_FINE));
    expect(symptoms).toEqual(['bloating', 'stomach pain']);
    expect(symptoms.some(hasPainText)).toBe(true);
  });

  test('it fires regardless of the order the two were tapped', () => {
    for (const order of [['bloating', 'pain'], ['pain', 'bloating']]) {
      expect(symptomsForRequest(tapAll(order)).some(hasPainText)).toBe(true);
    }
  });

  test('a selection without pain does not activate it', () => {
    expect(symptomsForRequest(tapAll(['bloating', 'nausea'])).some(hasPainText)).toBe(false);
  });

  test('no second pain system was introduced', () => {
    // One matcher, one call site pattern.
    expect(PHOTO.match(/function hasPainText/g)).toHaveLength(1);
    expect(PHOTO).toContain('hasPainText(symptom)');
  });
});

describe('the activity row below is untouched', () => {
  test('"what will you do after eating" stays a single choice', () => {
    // A plan, not a symptom: one answer is correct there, so it keeps its
    // scalar state and its radio-style toggle.
    expect(PHOTO).toContain('const [afterMealActivity, setAfterMealActivity] = useState<string | null>(null)');
    expect(PHOTO).toContain('setAfterMealActivity(afterMealActivity === key ? null : key)');
  });

  test('its eight options are unchanged', () => {
    expect(Object.keys(translations.en.photoAnalysis.activityOptions)).toEqual([
      'rest',
      'work',
      'driving',
      'walking',
      'exercise',
      'competition',
      'sleep',
      'social',
    ]);
  });

  test('it still reaches the request on its own key', () => {
    expect(PHOTO).toContain('afterMealActivity: afterMealActivity ?? undefined');
  });
});

describe('accessibility', () => {
  test('a symptom chip announces as a checkbox, not a button', () => {
    const panel = PHOTO.slice(PHOTO.indexOf('stateOptions'), PHOTO.indexOf('afterActivityLabel'));
    expect(panel).toContain('accessibilityRole="checkbox"');
    expect(panel).toContain('accessibilityState={{ checked: currentStateKeys.includes(key) }}');
  });
});
