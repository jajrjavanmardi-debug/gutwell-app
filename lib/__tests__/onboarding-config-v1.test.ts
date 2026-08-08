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

describe('active flow shape', () => {
  test('is exactly two steps', () => {
    expect(ONBOARDING_STEPS).toHaveLength(2);
    expect(TOTAL_STEPS).toBe(2);
  });

  test('is goal then after-meal feeling, in that order', () => {
    expect(activeIds).toEqual(['main_goal', 'after_meal_feeling']);
  });

  test('every active step is an answerable question — no interstitials', () => {
    // Goal stays single-select; the feeling step became multi-select so
    // co-occurring post-meal experiences are not discarded. Neither is an
    // interstitial — both require an answer.
    for (const step of ONBOARDING_STEPS) {
      expect(['single-select', 'multi-select']).toContain(step.type);
      expect('field' in step && step.field).toBeTruthy();
    }
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

describe('optional avoid-food chips', () => {
  const feeling = ONBOARDING_STEPS[1] as SingleSelectStep;

  test('live on the feeling step, not a screen of their own', () => {
    expect(feeling.id).toBe('after_meal_feeling');
    expect(feeling.chips).toBeDefined();
  });

  test('store into the dedicated local-only "avoid" key', () => {
    // Local onboarding_answers only: no database column, no analyze-food field.
    expect(feeling.chips?.field).toBe('avoid');
  });

  test('offer the five approved options', () => {
    expect(feeling.chips?.options.map((o) => o.value)).toEqual([
      'Lactose',
      'Gluten',
      'Spicy foods',
      'High-fat foods',
      'Other',
    ]);
  });

  test('the goal step has no chips', () => {
    expect((ONBOARDING_STEPS[0] as SingleSelectStep).chips).toBeUndefined();
  });

  test('chips are never part of the step\'s own required answer', () => {
    // canAdvance() gates on step.field, which is meal_feeling — so skipping
    // every chip must still allow the user to continue.
    expect(feeling.field).toBe('meal_feeling');
    expect(feeling.field).not.toBe(feeling.chips?.field);
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
      const enCopy = en.onboardingSteps[step.id as keyof typeof en.onboardingSteps] as any;
      const deCopy = de.onboardingSteps[step.id as keyof typeof de.onboardingSteps] as any;
      for (const opt of step.options) {
        expect(enCopy.options[opt.value]).toBeDefined();
        expect(deCopy.options[opt.value]).toBeDefined();
      }
    }
  });

  test('every chip has a translation in both languages', () => {
    const feeling = ONBOARDING_STEPS[1] as SingleSelectStep;
    const enCopy = en.onboardingSteps.after_meal_feeling as any;
    const deCopy = de.onboardingSteps.after_meal_feeling as any;
    for (const chip of feeling.chips!.options) {
      expect(enCopy.chips[chip.value]).toBeDefined();
      expect(deCopy.chips[chip.value]).toBeDefined();
    }
    expect(deCopy.chipsOptional).toBeDefined();
    expect(deCopy.chipsTitle).toBeDefined();
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
