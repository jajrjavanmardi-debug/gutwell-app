import { extractMealImpactScore, extractMealName } from '../photo-analysis-history';

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
