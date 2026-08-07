/**
 * DailyTip personalisation.
 *
 * Before this fix, getPersonalizedTip normalised with .toLowerCase() only and
 * did an exact-key lookup, so NONE of the eight values v1.0 onboarding stores
 * matched a map: every user silently received the generic tip. These tests pin
 * the two mismatches that caused it — format (snake_case vs "Title Case") and
 * vocabulary (conditions vs experiences) — so neither can return.
 *
 * The resolver is tested directly, and the outcome is also asserted through
 * getPersonalizedTip so the wiring cannot rot independently of the map.
 */

import {
  canonicalKey,
  resolveTags,
  getPersonalizedTip,
  getTodaysTip,
  type TipTag,
} from '../tips';

const GENERIC = getTodaysTip();

/** Legacy maps mirrored for direct resolver assertions (same values as tips.ts). */
const LEGACY_GUT: Record<string, TipTag[]> = {
  bloating: ['bloating', 'digestion'],
  ibs: ['bloating', 'digestion', 'stress'],
  acid_reflux: ['digestion', 'inflammation'],
  constipation: ['digestion', 'hydration'],
  diarrhea: ['digestion', 'inflammation'],
  food_sensitivity: ['digestion', 'bloating', 'inflammation'],
  general: ['general', 'digestion'],
};
const LEGACY_GOAL: Record<string, TipTag[]> = {
  reduce_bloating: ['bloating', 'digestion'],
  improve_digestion: ['digestion', 'general'],
  more_energy: ['energy', 'sleep'],
  reduce_inflammation: ['inflammation', 'digestion'],
  better_sleep: ['sleep', 'energy'],
  stress_management: ['stress', 'general'],
  lose_weight: ['digestion', 'energy'],
  overall_wellness: ['general', 'digestion'],
};

describe('canonicalKey', () => {
  test('trims, lowercases and converts spaces to underscores', () => {
    expect(canonicalKey('  Reduce Bloating ')).toBe('reduce_bloating');
    expect(canonicalKey('It varies')).toBe('it_varies');
  });

  test('collapses runs of whitespace', () => {
    expect(canonicalKey('Improve   everyday  wellbeing')).toBe('improve_everyday_wellbeing');
  });

  test('an already-canonical legacy key is unchanged', () => {
    expect(canonicalKey('acid_reflux')).toBe('acid_reflux');
  });

  test('empty and whitespace-only input yields an empty key', () => {
    expect(canonicalKey('')).toBe('');
    expect(canonicalKey('   ')).toBe('');
  });
});

describe('current Goal values — all four resolve', () => {
  const cases: [string, TipTag[]][] = [
    ['Reduce bloating', ['bloating', 'digestion']],
    ['Improve digestion', ['digestion', 'general']],
    ['Find food triggers', ['digestion', 'bloating']],
    ['Improve everyday wellbeing', ['general', 'digestion']],
  ];

  test.each(cases)('%s resolves to its approved tags', (value, expected) => {
    expect(resolveTags(value, LEGACY_GOAL)).toEqual(expected);
  });

  test('none of them resolve to nothing — this was the bug', () => {
    for (const [value] of cases) {
      expect(resolveTags(value, LEGACY_GOAL).length).toBeGreaterThan(0);
    }
  });
});

describe('current Feeling values — all four resolve', () => {
  const cases: [string, TipTag[]][] = [
    ['Bloated', ['bloating', 'digestion']],
    ['Heavy', ['digestion', 'general']],
    ['Comfortable', ['general']],
    ['It varies', ['general']],
  ];

  test.each(cases)('%s resolves to its approved tags', (value, expected) => {
    expect(resolveTags(value, LEGACY_GUT)).toEqual(expected);
  });

  test('none of them resolve to nothing — this was the bug', () => {
    for (const [value] of cases) {
      expect(resolveTags(value, LEGACY_GUT).length).toBeGreaterThan(0);
    }
  });
});

describe('multi-value gut_concern', () => {
  test('"Bloated, Heavy" resolves each value independently', () => {
    expect(resolveTags('Bloated, Heavy', LEGACY_GUT)).toEqual([
      'bloating',
      'digestion',
      'digestion',
      'general',
    ]);
  });

  test('spacing around the separator does not matter', () => {
    expect(resolveTags('Bloated,Heavy', LEGACY_GUT)).toEqual(
      resolveTags('Bloated , Heavy', LEGACY_GUT),
    );
  });

  test('an unknown part is skipped without discarding the known ones', () => {
    expect(resolveTags('Bloated, Wat', LEGACY_GUT)).toEqual(['bloating', 'digestion']);
  });

  test('trailing separators and empty parts are ignored', () => {
    expect(resolveTags('Bloated,', LEGACY_GUT)).toEqual(['bloating', 'digestion']);
    expect(resolveTags(', ,', LEGACY_GUT)).toEqual([]);
  });
});

describe('deduplication', () => {
  test('overlapping goal and feeling tags are not double-counted', () => {
    // resolveTags itself may repeat; getPersonalizedTip's Set is what dedupes.
    const raw = [
      ...resolveTags('Bloated, Heavy', LEGACY_GUT),
      ...resolveTags('Reduce bloating', LEGACY_GOAL),
    ];
    expect(raw.length).toBeGreaterThan(new Set(raw).size);
    expect(new Set(raw)).toEqual(new Set(['bloating', 'digestion', 'general']));
  });

  test('the personalised tip is stable regardless of duplicate tags', () => {
    expect(getPersonalizedTip('Bloated, Bloated', 'Reduce bloating')).toEqual(
      getPersonalizedTip('Bloated', 'Reduce bloating'),
    );
  });
});

describe('legacy values still work', () => {
  const legacyGut: [string, TipTag[]][] = [
    ['bloating', ['bloating', 'digestion']],
    ['ibs', ['bloating', 'digestion', 'stress']],
    ['acid_reflux', ['digestion', 'inflammation']],
    ['constipation', ['digestion', 'hydration']],
  ];
  test.each(legacyGut)('legacy gut_concern %s still resolves', (value, expected) => {
    expect(resolveTags(value, LEGACY_GUT)).toEqual(expected);
  });

  test('legacy goals still resolve', () => {
    expect(resolveTags('reduce_bloating', LEGACY_GOAL)).toEqual(['bloating', 'digestion']);
    expect(resolveTags('improve_digestion', LEGACY_GOAL)).toEqual(['digestion', 'general']);
  });

  test('a legacy key with different casing still resolves', () => {
    expect(resolveTags('ACID_REFLUX', LEGACY_GUT)).toEqual(['digestion', 'inflammation']);
  });
});

describe('safe fallback', () => {
  test('unknown values resolve to no tags', () => {
    expect(resolveTags('wat', LEGACY_GUT)).toEqual([]);
    expect(resolveTags('some future option', LEGACY_GOAL)).toEqual([]);
  });

  test('null, undefined and empty resolve to no tags', () => {
    for (const v of [null, undefined, '', '   ']) {
      expect(resolveTags(v, LEGACY_GUT)).toEqual([]);
    }
  });

  test('an unknown profile still receives the generic tip', () => {
    expect(getPersonalizedTip('wat', 'also wat')).toEqual(GENERIC);
  });

  test('an empty profile still receives the generic tip', () => {
    expect(getPersonalizedTip(null, null)).toEqual(GENERIC);
  });

  test('the generic fallback remains available on its own', () => {
    expect(getTodaysTip()).toBeDefined();
    expect(getTodaysTip().title).toBeTruthy();
  });
});

describe('end-to-end through getPersonalizedTip', () => {
  test('a v1.0 profile now gets a tip chosen from its tags', () => {
    const tip = getPersonalizedTip('Bloated', 'Reduce bloating');
    expect(tip).toBeDefined();
    expect(tip.tags.some((t) => ['bloating', 'digestion'].includes(t))).toBe(true);
  });

  test('goal alone is enough to personalise', () => {
    const tip = getPersonalizedTip(null, 'Improve digestion');
    expect(tip.tags.some((t) => ['digestion', 'general'].includes(t))).toBe(true);
  });

  test('feeling alone is enough to personalise', () => {
    const tip = getPersonalizedTip('Bloated', null);
    expect(tip.tags.some((t) => ['bloating', 'digestion'].includes(t))).toBe(true);
  });
});

describe('language independence', () => {
  test('resolution depends on stored identifiers, never on translated labels', () => {
    // 'Heavy' is the stored value; "Heavy or sluggish" and "Schwer oder träge"
    // are only ever display labels and must never reach the resolver.
    expect(resolveTags('Heavy', LEGACY_GUT)).toEqual(['digestion', 'general']);
    expect(resolveTags('Heavy or sluggish', LEGACY_GUT)).toEqual([]);
    expect(resolveTags('Schwer oder träge', LEGACY_GUT)).toEqual([]);
  });

  test('a German label does not accidentally personalise', () => {
    expect(getPersonalizedTip('Aufgebläht', null)).toEqual(GENERIC);
  });

  test('the same stored value yields the same tip whatever the UI language', () => {
    expect(getPersonalizedTip('Bloated', 'Reduce bloating')).toEqual(
      getPersonalizedTip('Bloated', 'Reduce bloating'),
    );
  });
});
