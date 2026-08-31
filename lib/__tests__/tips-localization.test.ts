/**
 * lib/__tests__/tips-localization.test.ts
 *
 * Daily Insights shipped English-only, so a German user saw an English card on
 * the Home tab every day. Localization had to add German copy WITHOUT touching
 * the structure selection runs on: TIPS is still the single source of order,
 * category, icon and tags, and only the two visible strings are translated.
 *
 * These tests pin that separation. The structural fingerprint below is the
 * release contract — if it changes, personalisation changes with it, and that
 * is out of scope for a copy-only localization.
 */
import { getAllTips, getTipCopy, TIP_COPY, type WellnessTip } from '../tips';
import { translations } from '../i18n';
import { BANNED_CLAIMS as SHARED_BANNED_CLAIMS } from './banned-claims';

const TIPS = getAllTips();

describe('structure is untouched by localization', () => {
  test('there are exactly 20 tips', () => {
    expect(TIPS).toHaveLength(20);
  });

  test('the structural fingerprint of every tip is unchanged', () => {
    // category / icon / tags in exact order. Copy is deliberately excluded —
    // this is what selection depends on.
    const fingerprint = TIPS.map((t: WellnessTip) => `${t.category}|${t.icon}|${t.tags.join(',')}`);
    expect(fingerprint).toEqual([
      'nutrition|time|bloating,digestion,general',
      'lifestyle|water|hydration,digestion,general',
      'nutrition|nutrition|digestion,general',
      'science|pulse-outline|stress,digestion,general',
      'nutrition|flask|digestion,bloating,inflammation',
      'lifestyle|moon|sleep,energy,general',
      'lifestyle|walk|digestion,bloating,energy',
      'nutrition|leaf|digestion,general',
      'mindfulness|eye|bloating,digestion,stress',
      'science|shield|inflammation,digestion,general',
      'lifestyle|calendar|digestion,bloating,general',
      'nutrition|warning|inflammation,digestion,bloating',
      'lifestyle|fitness|energy,digestion,general',
      'science|journal|digestion,bloating,general',
      'nutrition|color-palette|inflammation,digestion,energy',
      'science|medical|digestion,general',
      'mindfulness|cloudy|stress,digestion,bloating',
      'nutrition|alert-circle|inflammation,bloating,energy',
      'lifestyle|snow|inflammation,energy',
      'nutrition|fish|inflammation,digestion,general',
    ]);
  });

  test('the four logical category values are unchanged', () => {
    expect([...new Set(TIPS.map((t) => t.category))].sort()).toEqual([
      'lifestyle',
      'mindfulness',
      'nutrition',
      'science',
    ]);
  });
});

describe('copy tables', () => {
  test('both languages have exactly 20 entries', () => {
    expect(TIP_COPY.en).toHaveLength(20);
    expect(TIP_COPY.de).toHaveLength(20);
  });

  test('English copy is the copy carried on TIPS, index for index', () => {
    // Derived, not restated — this proves the user-visible English is byte
    // identical to what shipped in Build 6.
    TIPS.forEach((tip, i) => {
      expect(TIP_COPY.en[i]).toEqual({ title: tip.title, body: tip.body });
    });
  });

  test('specific English strings are pinned', () => {
    // Re-pinned to the softened wording from the Stage 3B claim-safety pass.
    // Titles and tip ORDER are unchanged — only two bodies were reworded, so
    // the day-of-year selection still returns the same tip it always did.
    expect(TIP_COPY.en[0].title).toBe('Chew slowly');
    expect(TIP_COPY.en[0].body).toBe(
      'Eating slowly and chewing thoroughly may help some people feel more comfortable after meals. Aim for 20-30 chews per bite.',
    );
    expect(TIP_COPY.en[19].title).toBe('Omega-3 fatty acids');
    expect(TIP_COPY.en[19].body).toBe(
      'Fish, walnuts, and flaxseeds contain omega-3s, which may support a healthy inflammatory balance.',
    );
  });

  test('the causal phrasings replaced in Stage 3B cannot return', () => {
    // The point of the rewrite, asserted as absence rather than as equality —
    // an equality test only guards the one string it names, and these claims
    // could reappear on any tip.
    const RETIRED = [
      'reduces bloating',
      'reduce gut inflammation',
      'directly impacts digestion',
      'feeds harmful bacteria',
      'reduziert Blähungen',
      'wirkt sich Stress unmittelbar',
      'nährt schädliche Bakterien',
    ];
    for (const lang of ['en', 'de'] as const) {
      for (const copy of TIP_COPY[lang]) {
        for (const phrase of RETIRED) {
          expect(`${lang}: ${copy.body}`).not.toContain(phrase);
        }
      }
    }
  });

  test('no German entry is left as English', () => {
    TIP_COPY.de.forEach((copy, i) => {
      expect(`de[${i}].title`).toBeTruthy();
      expect(copy.title).not.toBe(TIP_COPY.en[i].title);
      expect(copy.body).not.toBe(TIP_COPY.en[i].body);
    });
  });

  test('no copy entry is empty', () => {
    for (const lang of ['en', 'de'] as const) {
      TIP_COPY[lang].forEach((copy) => {
        expect(copy.title.trim().length).toBeGreaterThan(0);
        expect(copy.body.trim().length).toBeGreaterThan(0);
      });
    }
  });

  test('German copy carries no Persian script', () => {
    TIP_COPY.de.forEach((copy) => {
      expect(`${copy.title} ${copy.body}`).not.toMatch(/[؀-ۿ]/);
    });
  });
});

describe('order alignment between languages', () => {
  test('each German entry sits at the same index as its English counterpart', () => {
    // A swap is the failure this catches: same length, same content set,
    // wrong pairing. Topic anchors tie each index to its subject.
    const anchors: Array<[number, RegExp]> = [
      [0, /kauen/i],
      [1, /wasser/i],
      [4, /kimchi|fermentiert/i],
      [6, /spaziergang|gehen/i],
      [12, /bewegung/i],
      [15, /antibiotika/i],
      [19, /omega-3/i],
    ];
    for (const [index, pattern] of anchors) {
      const de = `${TIP_COPY.de[index].title} ${TIP_COPY.de[index].body}`;
      expect(`de[${index}]: ${de}`).toMatch(pattern);
    }
  });

  test('German titles are all distinct, so no entry was duplicated over another', () => {
    expect(new Set(TIP_COPY.de.map((c) => c.title)).size).toBe(20);
  });
});

describe('getTipCopy', () => {
  test('returns English for en and German for de', () => {
    const tip = TIPS[0];
    expect(getTipCopy(tip, 'en').title).toBe('Chew slowly');
    expect(getTipCopy(tip, 'de').title).toBe('Langsam kauen');
  });

  test('resolves every tip in both languages', () => {
    for (const lang of ['en', 'de'] as const) {
      TIPS.forEach((tip, i) => {
        expect(getTipCopy(tip, lang)).toEqual(TIP_COPY[lang][i]);
      });
    }
  });

  test('an unknown tip falls back to its own English rather than rendering blank', () => {
    const orphan: WellnessTip = {
      title: 'Not in TIPS',
      body: 'Body',
      category: 'science',
      icon: 'flask',
      tags: ['general'],
    };
    expect(getTipCopy(orphan, 'de')).toEqual({ title: 'Not in TIPS', body: 'Body' });
  });
});

describe('category display labels', () => {
  test('both languages label all four categories', () => {
    for (const lang of ['en', 'de'] as const) {
      const categories = translations[lang].components.dailyTip.categories;
      expect(Object.keys(categories).sort()).toEqual([
        'lifestyle',
        'mindfulness',
        'nutrition',
        'science',
      ]);
      for (const value of Object.values(categories)) {
        expect(value.trim().length).toBeGreaterThan(0);
      }
    }
  });

  test('every category used by a tip has a label in both languages', () => {
    for (const lang of ['en', 'de'] as const) {
      const categories = translations[lang].components.dailyTip.categories as Record<string, string>;
      for (const tip of TIPS) {
        expect(`${lang}:${tip.category}`).toBeTruthy();
        expect(categories[tip.category]).toBeTruthy();
      }
    }
  });

  test('English labels render as they did before, when the raw value was capitalized', () => {
    expect(translations.en.components.dailyTip.categories).toEqual({
      nutrition: 'Nutrition',
      lifestyle: 'Lifestyle',
      science: 'Science',
      mindfulness: 'Mindfulness',
    });
  });

  test('German labels are actually translated', () => {
    const de = translations.de.components.dailyTip.categories;
    const en = translations.en.components.dailyTip.categories;
    for (const key of ['nutrition', 'lifestyle', 'science', 'mindfulness'] as const) {
      expect(de[key]).not.toBe(en[key]);
    }
    expect(de.nutrition).toBe('Ernährung');
  });
});

describe('claim safety survives translation', () => {
  test('the two deliberately softened tips stay hedged in both languages', () => {
    // "Walk after meals" and "Cold exposure benefits" were softened once
    // already. Translation must not sharpen them back into causal claims.
    expect(TIP_COPY.en[6].body).toMatch(/many people find/i);
    expect(TIP_COPY.de[6].body).toMatch(/viele Menschen/i);

    expect(TIP_COPY.en[18].body).toMatch(/some people find/i);
    expect(TIP_COPY.en[18].body).toMatch(/listen to your body/i);
    expect(TIP_COPY.de[18].body).toMatch(/manche Menschen/i);
    expect(TIP_COPY.de[18].body).toMatch(/höre auf deinen Körper/i);
  });

  test('association wording is preserved, not upgraded to causation', () => {
    expect(TIP_COPY.en[2].body).toMatch(/associated with/i);
    expect(TIP_COPY.de[2].body).toMatch(/in Verbindung gebracht/i);
    expect(TIP_COPY.en[12].body).toMatch(/linked to/i);
    expect(TIP_COPY.de[12].body).toMatch(/in Verbindung gebracht/i);
  });

  /**
   * The shared list, not a private one.
   *
   * This suite used to carry five patterns of its own while i18n-coverage
   * carried twenty-two. Tips are the third copy surface to have had its own
   * weaker list, and the pattern each time is the same: the narrow list passes,
   * the broad one would not have. `SHARED_BANNED_CLAIMS` is now the same array
   * that guards i18n and the onboarding config — see banned-claims.ts.
   */
  test('no tip in either language makes a banned claim (shared list)', () => {
    for (const lang of ['en', 'de'] as const) {
      for (const copy of TIP_COPY[lang]) {
        for (const pattern of SHARED_BANNED_CLAIMS) {
          expect(`${lang} title: ${copy.title}`).not.toMatch(pattern);
          expect(`${lang} body: ${copy.body}`).not.toMatch(pattern);
        }
      }
    }
  });

  test('the original narrow tip patterns still hold', () => {
    // Kept as well as, not instead of: these were the tips-specific rules and
    // dropping them while widening coverage would be a net loss.
    const BANNED = [/guaranteed/i, /garantiert/i, /\bheilt\b/i, /\bcures?\b/i, /proven to/i];
    for (const lang of ['en', 'de'] as const) {
      for (const copy of TIP_COPY[lang]) {
        for (const pattern of BANNED) {
          expect(`${lang}: ${copy.title} ${copy.body}`).not.toMatch(pattern);
        }
      }
    }
  });
});
