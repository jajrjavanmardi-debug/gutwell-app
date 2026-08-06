/**
 * Phase 4 — signup → first real analysis handoff.
 *
 * Two halves:
 *
 *   1. persistStage / completeOnboarding, exercised directly with injected
 *      stores and server writers. These are the writes the whole resume system
 *      depends on, and they must never throw.
 *
 *   2. Source assertions over signup.tsx and photo-analysis.tsx. The screens
 *      are far too entangled to render in jest, but the properties that matter
 *      here are structural — which branch is guarded by `isOnboarding`, what
 *      fires only after a result exists, and above all that the NORMAL analysis
 *      path is untouched. A source check catches the regression that would
 *      actually hurt: an onboarding conditional leaking into the production
 *      flow.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import {
  completeOnboarding,
  persistStage,
  ONBOARDING_STAGE_KEY,
  type ServerWriter,
  type StageStore,
} from '../onboarding-stage';
import { Events } from '../analytics';

function makeStore(): StageStore & { data: Record<string, string> } {
  const data: Record<string, string> = {};
  return {
    data,
    getItem: async (k) => data[k] ?? null,
    setItem: async (k, v) => {
      data[k] = v;
    },
    removeItem: async (k) => {
      delete data[k];
    },
  };
}

const okWriter = (): { writer: ServerWriter; calls: any[] } => {
  const calls: any[] = [];
  return {
    calls,
    writer: async (userId, patch) => {
      calls.push({ userId, patch });
      return { error: null };
    },
  };
};

const failWriter: ServerWriter = async () => ({ error: new Error('network') });
const throwWriter: ServerWriter = async () => {
  throw new Error('offline');
};
const brokenStore: StageStore = {
  getItem: async () => null,
  setItem: async () => {
    throw new Error('storage full');
  },
  removeItem: async () => {},
};

const SIGNUP = readFileSync(join(__dirname, '..', '..', 'app', '(auth)', 'signup.tsx'), 'utf8');
const PHOTO = readFileSync(join(__dirname, '..', '..', 'app', 'photo-analysis.tsx'), 'utf8');

describe('persistStage', () => {
  test('writes the stage locally and to the profile', async () => {
    const store = makeStore();
    const { writer, calls } = okWriter();
    const res = await persistStage('analysis', 'user-1', { store, serverWriter: writer });
    expect(store.data[ONBOARDING_STAGE_KEY]).toBe('analysis');
    expect(calls).toEqual([{ userId: 'user-1', patch: { onboarding_stage: 'analysis' } }]);
    expect(res).toEqual({ localOk: true, serverOk: true });
  });

  test('never writes onboarding_completed — a stale stage cannot un-complete a user', async () => {
    const { writer, calls } = okWriter();
    await persistStage('analysis', 'user-1', { store: makeStore(), serverWriter: writer });
    expect(calls[0].patch).not.toHaveProperty('onboarding_completed');
  });

  test('a failed server write still keeps the local stage and does not throw', async () => {
    const store = makeStore();
    const res = await persistStage('analysis', 'user-1', { store, serverWriter: failWriter });
    expect(store.data[ONBOARDING_STAGE_KEY]).toBe('analysis');
    expect(res).toEqual({ localOk: true, serverOk: false });
  });

  test('a throwing server write is contained', async () => {
    const store = makeStore();
    await expect(
      persistStage('analysis', 'user-1', { store, serverWriter: throwWriter }),
    ).resolves.toEqual({ localOk: true, serverOk: false });
  });

  test('a failed local write does not throw either', async () => {
    const { writer } = okWriter();
    const res = await persistStage('analysis', 'user-1', { store: brokenStore, serverWriter: writer });
    expect(res.localOk).toBe(false);
    expect(res.serverOk).toBe(true);
  });

  test('with no user id it writes locally only — no server call attempted', async () => {
    const store = makeStore();
    const { writer, calls } = okWriter();
    const res = await persistStage('goal', null, { store, serverWriter: writer });
    expect(store.data[ONBOARDING_STAGE_KEY]).toBe('goal');
    expect(calls).toHaveLength(0);
    expect(res.serverOk).toBe(false);
  });
});

describe('completeOnboarding', () => {
  test('sets the completed flag and the terminal stage together', async () => {
    const store = makeStore();
    const { writer, calls } = okWriter();
    await completeOnboarding('user-1', { store, serverWriter: writer });
    expect(store.data[ONBOARDING_STAGE_KEY]).toBe('completed');
    expect(calls[0].patch).toEqual({ onboarding_completed: true, onboarding_stage: 'completed' });
  });

  test('survives a failing or throwing server write', async () => {
    await expect(
      completeOnboarding('user-1', { store: makeStore(), serverWriter: failWriter }),
    ).resolves.toEqual({ localOk: true, serverOk: false });
    await expect(
      completeOnboarding('user-1', { store: makeStore(), serverWriter: throwWriter }),
    ).resolves.toEqual({ localOk: true, serverOk: false });
  });
});

describe('signup handoff', () => {
  test('routes to the onboarding analysis, not notifications', () => {
    expect(SIGNUP).toContain("router.replace('/photo-analysis?onboarding=1')");
    expect(SIGNUP).not.toContain("router.replace('/(onboarding)/notifications')");
  });

  test('writes stage analysis before navigating', () => {
    expect(SIGNUP).toContain("persistStage('analysis'");
    expect(SIGNUP.indexOf("persistStage('analysis'")).toBeLessThan(
      SIGNUP.indexOf("router.replace('/photo-analysis?onboarding=1')"),
    );
  });

  test('never marks onboarding completed', () => {
    expect(SIGNUP).not.toContain('onboarding_completed');
    expect(SIGNUP).not.toContain('completeOnboarding');
  });

  test('preserves display_name creation and email/password auth', () => {
    expect(SIGNUP).toContain('signUp(email.trim(), password, name.trim())');
  });

  test('adds no Apple or Google authentication', () => {
    expect(SIGNUP).not.toMatch(/signInWithOAuth|AppleAuthentication|GoogleSignin/);
  });
});

describe('photo-analysis onboarding mode', () => {
  test('mode is detected exactly once, from the approved param', () => {
    expect(PHOTO).toContain("const isOnboarding = params.onboarding === '1';");
    expect(PHOTO.match(/params\.onboarding === '1'/g)).toHaveLength(1);
  });

  test('the describe requirement is relaxed only in onboarding mode', () => {
    expect(PHOTO).toContain('if (!narrative && !isOnboarding) {');
    // The button gate derives from the same flag, so the two cannot drift.
    expect(PHOTO).toContain("(!isOnboarding && !mealDescription.trim())");
  });

  test('the success event fires only in onboarding mode and only after a result', () => {
    expect(PHOTO).toContain('if (isOnboarding) track(Events.FIRST_ANALYSIS_COMPLETED);');
    const resultAt = PHOTO.indexOf('setAnalysis(rawResult);');
    const eventAt = PHOTO.indexOf('FIRST_ANALYSIS_COMPLETED');
    expect(resultAt).toBeGreaterThan(-1);
    expect(eventAt).toBeGreaterThan(resultAt);
  });

  test('the event name is registered and payload-free', () => {
    expect(Events.FIRST_ANALYSIS_COMPLETED).toBe('first_analysis_completed');
    expect(PHOTO).toContain('track(Events.FIRST_ANALYSIS_COMPLETED);');
    expect(PHOTO).not.toMatch(/FIRST_ANALYSIS_COMPLETED,\s*\{/);
  });

  test('failures are counted only from the analysis catch block', () => {
    expect(PHOTO).toContain('if (isOnboarding) setOnboardingFailures((n) => n + 1);');
    expect(PHOTO.match(/setOnboardingFailures/g)).toHaveLength(2); // declaration + one increment
  });

  test('the escape hatch appears only after two genuine failures', () => {
    expect(PHOTO).toContain('isOnboarding && onboardingFailures >= 2');
  });

  test('skip-for-now completes onboarding and routes Home, bypassing notifications', () => {
    const fn = PHOTO.slice(
      PHOTO.indexOf('const handleOnboardingSkipForNow'),
      PHOTO.indexOf('const handleGenerateAnalysis'),
    );
    expect(fn).toContain('completeOnboarding(');
    expect(fn).toContain("router.replace('/(tabs)')");
    expect(fn).not.toContain('notifications');
    expect(fn).not.toContain('FIRST_ANALYSIS_COMPLETED');
    expect(fn).not.toContain('savePhotoAnalysisHistoryItem');
    expect(fn).not.toContain('setAnalysis');
  });

  test('the successful exit writes stage notifications, then routes there', () => {
    const fn = PHOTO.slice(
      PHOTO.indexOf('const handleOnboardingContinue'),
      PHOTO.indexOf('const handleOnboardingSkipForNow'),
    );
    expect(fn).toContain("persistStage('notifications'");
    expect(fn).toContain("router.replace('/(onboarding)/notifications')");
    expect(fn.indexOf('persistStage')).toBeLessThan(fn.indexOf('router.replace'));
  });

  test('the onboarding exit never uses router.back()', () => {
    const fn = PHOTO.slice(
      PHOTO.indexOf('const handleOnboardingContinue'),
      PHOTO.indexOf('const handleGenerateAnalysis'),
    );
    expect(fn).not.toContain('router.back()');
  });
});

describe('normal photo-analysis path is unchanged', () => {
  test('the description is still required when not onboarding', () => {
    // The guard only adds `&& !isOnboarding`; the Alert and early return that
    // block a normal empty-description analysis are intact.
    expect(PHOTO).toContain('t.photoAnalysis.feelingsRequiredTitle');
    expect(PHOTO).toContain('t.photoAnalysis.feelingsRequiredMessage');
  });

  test('normal success side effects are untouched', () => {
    expect(PHOTO).toContain('track(Events.FOOD_SCANNED);');
    expect(PHOTO).toContain('await savePhotoAnalysisHistoryItem({');
    expect(PHOTO).toContain('recordTriggerFeedback({');
    expect(PHOTO).toContain('await analyzeMealPhoto(');
  });

  test('the existing back behaviour still uses router.back()', () => {
    expect(PHOTO).toContain('const handleBack = () => {');
    expect(PHOTO).toContain('router.back();');
  });

  test('every onboarding stage write is behind the mode flag or its own handler', () => {
    // persistStage/completeOnboarding appear only inside the two onboarding
    // handlers — never on a path a normal analysis can reach.
    const before = PHOTO.slice(0, PHOTO.indexOf('const handleOnboardingContinue'));
    expect(before).not.toContain('persistStage(');
    expect(before).not.toContain('completeOnboarding(');
  });

  test('onboarding UI is gated on the flag in every render branch', () => {
    for (const marker of [
      'isOnboarding && onboardingFailures >= 2',
      '{isOnboarding ? (',
      'isOnboarding && !mealDescription.trim()',
    ]) {
      expect(PHOTO).toContain(marker);
    }
  });
});
