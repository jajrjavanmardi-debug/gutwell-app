import { extractMealImpactScore, extractMealName, extractMealTitle, extractScoreReason } from '../photo-analysis-history';

// Sample of the NEW meal_revise emoji format produced by the analyze-food edge
// function (5 sections, emoji labels, score stated as X/10).
const NEW_FORMAT_EN = [
  'Sorry, I misread that — thanks for the correction.',
  '🍽️ MEAL',
  'Herbal peppermint tea, not cookies.',
  '📊 SCORE',
  'A gentle 8/10 for your current gut score.',
  '⚠️ POSSIBLE SENSITIVITY',
  'Plain herbal tea is usually easy on the gut.',
  '✅ BETTER OPTION',
  'Add a small piece of ginger if you want extra warmth.',
  '➡️ NEXT STEP',
  'Sip it slowly and notice how you feel in an hour.',
  'Important note: This analysis is for informational purposes only and does not replace a medical diagnosis.',
].join('\n');

const NEW_FORMAT_DE = [
  '🍽️ MEAL',
  'Pfefferminztee, keine Kekse.',
  '📊 SCORE',
  'Solide 7/10 für deinen aktuellen Darm-Score.',
  '⚠️ POSSIBLE SENSITIVITY',
  'Kräutertee ist meist gut verträglich.',
  '✅ BETTER OPTION',
  'Etwas frischer Ingwer kann zusätzlich beruhigen.',
  '➡️ NEXT STEP',
  'Trinke ihn langsam und beobachte dich danach.',
].join('\n');

// Old plain-text format still produced by the initial meal_text analysis.
const OLD_FORMAT = [
  'LIKELY MEAL: Oatmeal with banana',
  'MEAL IMPACT SCORE: 6/10',
  'How it may affect you: generally gentle.',
].join('\n');

describe('extractMealImpactScore (R1)', () => {
  it('reads X/10 from the new emoji SCORE section', () => {
    expect(extractMealImpactScore(NEW_FORMAT_EN)).toBe('8/10');
    expect(extractMealImpactScore(NEW_FORMAT_DE)).toBe('7/10');
  });

  it('still reads the old plain-text MEAL IMPACT SCORE format', () => {
    expect(extractMealImpactScore(OLD_FORMAT)).toBe('6/10');
  });

  it('matches an "out of 10" phrasing', () => {
    expect(extractMealImpactScore('Your meal scores about 5 out of 10 today.')).toBe('5/10');
  });

  it('returns null when no score is present', () => {
    expect(extractMealImpactScore('🍽️ MEAL\nHerbal tea, very gentle.')).toBeNull();
  });

  it('rejects out-of-range numbers', () => {
    expect(extractMealImpactScore('score 42/10')).toBeNull();
  });
});

describe('extractMealName (R2)', () => {
  it('reads the meal from the new emoji MEAL section, ignoring the apology line', () => {
    expect(extractMealName(NEW_FORMAT_EN)).toBe('Herbal peppermint tea, not cookies.');
  });

  it('reads the meal from the German emoji format', () => {
    expect(extractMealName(NEW_FORMAT_DE)).toBe('Pfefferminztee, keine Kekse.');
  });

  it('handles an inline "MEAL: value" label', () => {
    expect(extractMealName('🍽️ MEAL: Lentil soup\n📊 SCORE\n4/10')).toBe('Lentil soup');
  });

  it('still reads the old "LIKELY MEAL:" format', () => {
    expect(extractMealName(OLD_FORMAT)).toBe('Oatmeal with banana');
  });

  it('falls back to a default when nothing matches', () => {
    expect(extractMealName('')).toBe('Meal photo');
  });
});

describe('extractMealTitle', () => {
  it('strips "You had" preamble and keeps only the dish', () => {
    // Was "Fried fish with a dip and a Coca-Cola" — a sentence, not a title.
    expect(extractMealTitle('You had fried fish with a dip and a Coca-Cola.')).toBe('Fried fish');
  });

  it('is only ever the meal, never an explanation', () => {
    const cases: [string, string][] = [
      ['You had some pizza with cheese and tomato, which is quite rich.', 'Pizza'],
      ['This is a Mediterranean bowl with hummus, falafel and pickles.', 'Mediterranean bowl'],
      ['It looks like you enjoyed a chicken salad.', 'Chicken salad'],
      ['The meal shows grilled salmon, served with new potatoes.', 'Grilled salmon'],
      // A composite meal keeps its components when they fit — still a name,
      // not an explanation. The em-dash aside is what gets dropped.
      ['You ate a croissant and a latte — a light breakfast.', 'Croissant and a latte'],
      ['This appears to be pizza that is topped with pepperoni.', 'Pizza'],
    ];
    for (const [input, expected] of cases) {
      expect(`${input} -> ${extractMealTitle(input)}`).toBe(`${input} -> ${expected}`);
    }
  });

  it('never ends on a dangling article or conjunction', () => {
    for (const input of [
      'You had fried fish with a dip and a Coca-Cola.',
      'A very long meal description that exceeds the limit and then some',
      'You had bread and',
    ]) {
      expect(extractMealTitle(input)).not.toMatch(/\b(a|an|the|and|or|with|of|plus)$/i);
    }
  });

  it('never carries symptom or explanation text into the title', () => {
    const title = extractMealTitle(
      'You had a cheese pizza, which may cause bloating and discomfort for you.',
    );
    expect(title).toBe('Cheese pizza');
    expect(title).not.toMatch(/bloating|discomfort|may cause/i);
  });

  it('strips "This looks like a meal of" preamble', () => {
    expect(extractMealTitle('This looks like a meal of grilled chicken and rice.')).toBe('Grilled chicken and rice');
  });

  it('returns short title unchanged when already short', () => {
    expect(extractMealTitle('Grilled fish and salad')).toBe('Grilled fish and salad');
  });

  it('truncates at word boundary when over 40 chars', () => {
    const result = extractMealTitle('A very long meal description that exceeds forty characters easily');
    expect(result.length).toBeLessThanOrEqual(40);
  });

  it('returns "Meal analysis" for non-food response', () => {
    expect(extractMealTitle('I cannot identify a meal or food in this image.')).toBe('Meal analysis');
  });

  it('returns "Meal analysis" for empty string', () => {
    expect(extractMealTitle('')).toBe('Meal analysis');
  });
});

describe('extractScoreReason', () => {
  it('extracts reason from SCORE section', () => {
    const text = '🍽️ MEAL\nFried fish\n📊 SCORE\nThis meal gets a 4/10 for gut impact.\n⚠️ POSSIBLE SENSITIVITY';
    expect(extractScoreReason(text)).toBe('This meal gets a 4/10 for gut impact.');
  });

  it('returns empty string when no SCORE section', () => {
    expect(extractScoreReason('No score here')).toBe('');
  });

  it('returns empty string for non-food response', () => {
    expect(extractScoreReason('I cannot identify a meal or food in this image.')).toBe('');
  });
});

describe('a headline is a food name, never conversational scaffolding', () => {
  /**
   * Guards the malformed title seen on device in Build 1.0.0 (3): the body
   * correctly identified Yogi Tea "Morgen Energie", while the largest text on
   * the screen read "It looks like you're".
   *
   * Two defects produced it. TITLE_PREAMBLE matched "it looks like you had"
   * but not the "you're" contraction, so the opener survived; the 24-character
   * word-boundary cut then manufactured the fragment out of it. The regex is
   * how a title is recovered — safeTitle() is what keeps scaffolding out.
   */
  const SCAFFOLDING = [
    "It looks like you're having a warming cup of Yogi Tea Morgen Energie",
    "It looks like you're enjoying a herbal tea",
    "It seems you're drinking a green smoothie",
    'Based on the image, this is a chicken salad',
    'I think this is a bowl of oatmeal with berries',
    'It appears to be a plate of pasta',
    'Here is a bowl of tomato soup',
  ];

  it('never returns a conversational opener as the title', () => {
    for (const input of SCAFFOLDING) {
      const title = extractMealTitle(input);
      expect(`${input} -> ${title}`).not.toMatch(
        /-> (It|This|That|Here|There|I|You|We|Based|Looks|Seems|Appears|Maybe|Perhaps|Probably)\b/,
      );
    }
  });

  it('recovers the actual food name from the reported case', () => {
    expect(
      extractMealTitle("It looks like you're having a warming cup of Yogi Tea Morgen Energie"),
    ).toBe('Yogi Tea Morgen Energie');
  });

  it('recovers the dish from every scaffolding shape', () => {
    const cases: [string, string][] = [
      ["It looks like you're enjoying a herbal tea", 'Herbal tea'],
      ["It seems you're drinking a green smoothie", 'Green smoothie'],
      ['Based on the image, this is a chicken salad', 'Chicken salad'],
      ['I think this is a bowl of oatmeal with berries', 'Oatmeal with berries'],
    ];
    for (const [input, expected] of cases) {
      expect(`${input} -> ${extractMealTitle(input)}`).toBe(`${input} -> ${expected}`);
    }
  });

  it('a title is never a grammatical fragment left by truncation', () => {
    for (const input of SCAFFOLDING) {
      const title = extractMealTitle(input);
      // Nothing may end on a preposition, article, conjunction or contraction.
      expect(`${input} -> ${title}`).not.toMatch(/\b(a|an|the|and|or|with|of|for|you're|is|are)$/i);
      expect(title.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('a real food name is never mistaken for scaffolding', () => {
    // The guard is word-bounded, so names that merely start with those letters
    // survive. "Iced tea" is not "I".
    for (const [input, expected] of [
      ['Iced tea', 'Iced tea'],
      ['Yogi Tea Morning Energy', 'Yogi Tea Morning Energy'],
      ['Grilled chicken and rice', 'Grilled chicken and rice'],
      ['Italian sausage', 'Italian sausage'],
    ] as [string, string][]) {
      expect(`${input} -> ${extractMealTitle(input)}`).toBe(`${input} -> ${expected}`);
    }
  });

  it('falls back in the caller language, not hardcoded English', () => {
    const de = 'Analyse der Mahlzeit';
    expect(extractMealTitle('', de)).toBe(de);
    expect(extractMealTitle("It looks like you're", de)).toBe(de);
    expect(extractMealTitle('I cannot identify a meal or food in this image.', de)).toBe(de);
    // And the name extractor takes one too, so saved history is not English-only.
    expect(extractMealName('', 'Mahlzeit (Foto)')).toBe('Mahlzeit (Foto)');
  });

  it('catches openers the preamble does not know about', () => {
    // The point of the post-condition. None of these are in TITLE_PREAMBLE, so
    // without safeTitle() they truncate into "You seem to have", "That would
    // appear", "Probably a chicken wrap" and "We can see a plate" — the same
    // class of failure as the reported bug, from openers nobody enumerated.
    //
    // The trade is deliberate: "Probably a chicken wrap of some kind" falls
    // back rather than yielding "Chicken wrap". A neutral title is better than
    // a confident one the model hedged, and the body still carries the hedge.
    for (const input of [
      'You seem to have picked up a large iced coffee drink today',
      'That would appear to be a portion of lasagne',
      'Probably a chicken wrap of some kind',
      'We can see a plate of scrambled eggs here',
    ]) {
      expect(`${input} -> ${extractMealTitle(input)}`).toBe(`${input} -> Meal analysis`);
    }
  });

  it('handles a German analysis opener', () => {
    expect(extractMealTitle('Es sieht so aus, als ob du einen Kräutertee trinkst')).toBe('Kräutertee');
  });

  it('states no diagnosis or treatment in a fallback', () => {
    for (const fallback of [extractMealTitle(''), extractMealTitle('', 'Analyse der Mahlzeit')]) {
      expect(fallback).not.toMatch(/diagnos|treat|cure|prevent|disease|krank|heil/i);
    }
  });
});
