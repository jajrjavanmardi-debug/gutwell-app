/**
 * v1.0 active onboarding config tests.
 *
 * The redesign cut 21 steps to 2. These lock in the parts that are easy to
 * regress by editing lib/onboarding-config.ts: the step count, the legacy
 * answer keys that downstream code still reads, and the guarantee that the
 * removed questions cannot reappear in the active flow.
 */

import {
  LEGACY_ONBOARDING_STEPS,
  ONBOARDING_STEPS,
  TOTAL_STEPS,
  type SingleSelectStep,
} from '../onboarding-config';
import { translations } from '../i18n';

const en = translations.en;
const de = translations.de;

const activeIds = ONBOARDING_STEPS.map((s) => s.id);
const activeFields = ONBOARDING_STEPS.map((s) => ('field' in s ? s.field : undefined));

/**
 * The approved live sequence, as (id, type) pairs.
 *
 * This replaces the old `toHaveLength(2)` check. A length assertion only says
 * how many steps there are, so swapping a question for a different one — or
 * re-pointing the stepper at a two-step slice of the legacy array — would pass
 * it. Pinning ids AND types means any change to what the user is actually
 * asked has to be made here, deliberately, in the same commit.
 *
 * ── Why the TYPE is pinned, not just the id ─────────────────────────────────
 *
 * app/(onboarding)/questions.tsx renders step content with `key={step.id}`, so
 * every transition REMOUNTS the step. That is what lets each step replay its
 * entrance stagger, and it is harmless for the three live types: single-select
 * and multi-select keep their answer in the parent's `answers` map, and the
 * info step holds no state at all.
 *
 * It is NOT harmless for `wheel` or `ruler`. Those seed and hold their own
 * picker position internally, so a remount would reset the picker mid-flow.
 * Both types exist only in LEGACY_ONBOARDING_STEPS today.
 *
 * If you are here because you added a step and this test went red: adding a
 * stateful picker type to the live flow requires reviewing that remount
 * behaviour first. Updating this array is not sufficient on its own.
 */
const APPROVED_LIVE_FLOW = [
  { id: 'main_goal', type: 'single-select' },
  { id: 'after_meal_feeling', type: 'multi-select' },
  { id: 'context_interlude', type: 'info' },
] as const;

describe('active flow shape', () => {
  test('is exactly the approved sequence, in order, with the approved types', () => {
    expect(ONBOARDING_STEPS.map((s) => ({ id: s.id, type: s.type }))).toEqual(
      APPROVED_LIVE_FLOW.map((s) => ({ id: s.id, type: s.type })),
    );
    expect(TOTAL_STEPS).toBe(APPROVED_LIVE_FLOW.length);
  });

  test('exactly one step is a non-answerable interlude, and it is the last', () => {
    // The flow may contain interstitials now, but not silently and not many:
    // an onboarding that drifts back toward tap-through screens has to break
    // this test first. The interlude is last so it hands straight over to the
    // example analysis it describes.
    const interludes = ONBOARDING_STEPS.filter((s) => !('field' in s));
    expect(interludes.map((s) => s.id)).toEqual(['context_interlude']);
    expect(ONBOARDING_STEPS[ONBOARDING_STEPS.length - 1].id).toBe('context_interlude');
  });

  test('every other step is an answerable question that stores an answer', () => {
    // Goal stays single-select; the feeling step is multi-select so
    // co-occurring post-meal experiences are not discarded.
    for (const step of ONBOARDING_STEPS) {
      if (step.id === 'context_interlude') continue;
      expect(['single-select', 'multi-select']).toContain(step.type);
      expect('field' in step && step.field).toBeTruthy();
    }
  });

  test('the interlude collects nothing', () => {
    // The whole point of the step: no field means no answer, no
    // onboarding_answers key, and nothing for the profile write to pick up.
    const interlude = ONBOARDING_STEPS.find((s) => s.id === 'context_interlude')!;
    expect(interlude).toBeDefined();
    expect('field' in interlude).toBe(false);
    expect(activeFields.filter(Boolean)).toEqual(['goal', 'meal_feeling']);
  });

  test('the live flow collects exactly two answers and no more', () => {
    // Guards the direction this redesign is supposed to hold: adding a
    // question is a product decision, not a config tweak.
    expect(activeFields.filter(Boolean)).toHaveLength(2);
  });
});

describe('legacy answer keys survive the redesign', () => {
  // These are the only three onboarding answers that reach the database, via
  // the profile write in app/(onboarding)/notifications.tsx. Renaming a field
  // here silently breaks that write.
  test('goal question still writes the "goal" key (→ profiles.goal)', () => {
    expect(activeFields).toContain('goal');
  });

  test('feeling question still writes "meal_feeling" (→ profiles.gut_concern)', () => {
    // gut_concern is read by photo-analysis.tsx to build the AI `conditions`
    // list, so this key is load-bearing for the analysis, not just storage.
    expect(activeFields).toContain('meal_feeling');
  });

  test('the four goal options are the approved v1.0 set', () => {
    const goal = ONBOARDING_STEPS[0] as SingleSelectStep;
    expect(goal.options.map((o) => o.value)).toEqual([
      'Reduce bloating',
      'Improve digestion',
      'Find food triggers',
      'Improve everyday wellbeing',
    ]);
  });
});

describe('removed questions are unreachable', () => {
  const removed = [
    'sex',
    'tried_apps',
    'attribution',
    'care_team',
    'birthdate',
    'height',
    'weight',
    'barriers',
    'diet',
    'accomplish',
    'target_state',
    'target_promise',
    'comparison',
    'score_transition',
    'thank_you',
    'connect_health',
    'social_proof',
    'referral',
    'all_done',
  ];

  test('none of them appear in the active flow', () => {
    for (const id of removed) {
      expect(activeIds).not.toContain(id);
    }
  });

  test('body-measurement fields are gone from the active flow', () => {
    for (const field of ['height_cm', 'weight_kg', 'birthdate', 'sex']) {
      expect(activeFields).not.toContain(field);
    }
  });

  test('but their definitions are retained, not deleted', () => {
    // "Make unreachable first, delete later" — the legacy array must still
    // carry the full 21-step sequence for reference and rollback.
    expect(LEGACY_ONBOARDING_STEPS).toHaveLength(21);
    const legacyIds = LEGACY_ONBOARDING_STEPS.map((s) => s.id);
    for (const id of removed) {
      expect(legacyIds).toContain(id);
    }
  });
});

/**
 * The legacy sequence must stay a reference copy, never the live source.
 *
 * Re-pointing the stepper is a one-line edit in lib/onboarding-config.ts
 * (`export const ONBOARDING_STEPS = LEGACY_ONBOARDING_STEPS`), and the symptom
 * would be 21 screens of body measurements and interstitials shipping to
 * users. These assertions exist to make that edit fail loudly and immediately
 * rather than at QA.
 */
describe('the legacy flow cannot become the live flow', () => {
  test('the two arrays are distinct objects', () => {
    expect(ONBOARDING_STEPS).not.toBe(LEGACY_ONBOARDING_STEPS);
  });

  test('they share no step, by identity or by id', () => {
    const legacyIds = new Set(LEGACY_ONBOARDING_STEPS.map((s) => s.id));
    for (const step of ONBOARDING_STEPS) {
      expect(legacyIds.has(step.id)).toBe(false);
      expect(LEGACY_ONBOARDING_STEPS).not.toContain(step);
    }
  });

  test('the live flow is short, and stays short', () => {
    // A hard ceiling rather than an exact count, so this test survives an
    // approved addition but still fails the moment the 21-step array — or
    // anything like it — becomes the source.
    expect(ONBOARDING_STEPS.length).toBeLessThanOrEqual(4);
    expect(TOTAL_STEPS).toBe(ONBOARDING_STEPS.length);
  });

  test('TOTAL_STEPS is derived from the live array, not the legacy one', () => {
    // TOTAL_STEPS drives the progress bar. If it were ever computed from the
    // legacy array the bar would crawl in 1/21ths through a 3-step flow.
    expect(TOTAL_STEPS).not.toBe(LEGACY_ONBOARDING_STEPS.length);
  });
});

describe('the avoid-food chips are gone', () => {
  /**
   * They used to hang off the feeling step and write an `avoid` array into
   * onboarding_answers. Nothing read it: no profile column, no analyze-food
   * field, no screen. Collecting dietary information and discarding it is
   * friction with no product behind it, so the row was removed.
   *
   * These replace the tests that asserted the chips existed. They are the
   * stronger direction: the old ones pinned five option labels, these pin the
   * rule that no live step may collect an answer nothing consumes.
   */
  test('no live step carries a chip row', () => {
    for (const step of ONBOARDING_STEPS) {
      expect((step as SingleSelectStep).chips).toBeUndefined();
    }
  });

  test('the "avoid" key is not written by any live step', () => {
    expect(activeFields).not.toContain('avoid');
    const chipFields = (ONBOARDING_STEPS as SingleSelectStep[])
      .map((s) => s.chips?.field)
      .filter(Boolean);
    expect(chipFields).toHaveLength(0);
  });

  test('every live answer key has a downstream consumer', () => {
    // The reason the chips went. `goal` → profiles.goal and `meal_feeling` →
    // profiles.gut_concern are both written by the profile update in
    // app/(onboarding)/notifications.tsx, and gut_concern is read back by
    // app/photo-analysis.tsx to build the AI conditions list. Any new key
    // added here must be able to name where it is read.
    const CONSUMED_KEYS = ['goal', 'meal_feeling'];
    for (const field of activeFields.filter(Boolean)) {
      expect(CONSUMED_KEYS).toContain(field);
    }
  });

  test('the feeling step still stores its own answer under meal_feeling', () => {
    const feeling = ONBOARDING_STEPS[1] as SingleSelectStep;
    expect(feeling.id).toBe('after_meal_feeling');
    expect(feeling.field).toBe('meal_feeling');
  });
});

describe('localization', () => {
  test('both active steps have EN and DE copy', () => {
    for (const id of activeIds) {
      expect(en.onboardingSteps[id as keyof typeof en.onboardingSteps]).toBeDefined();
      expect(de.onboardingSteps[id as keyof typeof de.onboardingSteps]).toBeDefined();
    }
  });

  test('every active option value has a translation in both languages', () => {
    for (const step of ONBOARDING_STEPS as SingleSelectStep[]) {
      // The interlude has no options; skip rather than crash on undefined.
      if (!step.options) continue;
      const enCopy = en.onboardingSteps[step.id as keyof typeof en.onboardingSteps] as any;
      const deCopy = de.onboardingSteps[step.id as keyof typeof de.onboardingSteps] as any;
      for (const opt of step.options) {
        expect(enCopy.options[opt.value]).toBeDefined();
        expect(deCopy.options[opt.value]).toBeDefined();
      }
    }
  });

  test('the retired chip translations are gone from both languages', () => {
    // Removed with the chip row. Left behind they would be dead keys that the
    // i18n parity test still has to carry.
    for (const resource of [en, de]) {
      const feeling = resource.onboardingSteps.after_meal_feeling as any;
      expect(feeling.chips).toBeUndefined();
      expect(feeling.chipsTitle).toBeUndefined();
      expect(feeling.chipsOptional).toBeUndefined();
    }
  });

  test('the interlude has translated title and body in both languages', () => {
    // It renders through stepCopy() like every question, so a missing DE key
    // would silently show English inside an otherwise German flow.
    const enCopy = en.onboardingSteps.context_interlude as any;
    const deCopy = de.onboardingSteps.context_interlude as any;
    for (const copy of [enCopy, deCopy]) {
      expect(copy?.title).toBeTruthy();
      expect(copy?.body).toBeTruthy();
    }
    expect(deCopy.title).not.toBe(enCopy.title);
    expect(deCopy.body).not.toBe(enCopy.body);
  });

  test('German copy is genuinely translated, not copied English', () => {
    const enG = en.onboardingSteps.main_goal as any;
    const deG = de.onboardingSteps.main_goal as any;
    expect(deG.title).not.toBe(enG.title);
    expect(deG.options['Reduce bloating']).not.toBe(enG.options['Reduce bloating']);
  });

  test('welcome carries four translated story frames in both languages', () => {
    // Replaces the three value points, which the Story Experience absorbed.
    expect(en.welcome.story.frames).toHaveLength(4);
    expect(de.welcome.story.frames).toHaveLength(4);
    expect(de.welcome.story.frames[0].title).not.toBe(en.welcome.story.frames[0].title);
  });
});
