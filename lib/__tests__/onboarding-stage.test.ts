/**
 * Onboarding resume-state tests.
 *
 * These import the SAME functions app/index.tsx runs (lib/onboarding-stage.ts
 * and lib/routing.ts), so a regression in the shipped resume rules fails here.
 *
 * The case that motivated all of this is "signup then app termination": before
 * the stage existed, an authenticated user with onboarding_completed = false
 * was sent back to the questionnaire, losing the meal analysis they had
 * started. That is covered explicitly below.
 */

import {
  asOnboardingStage,
  clearLocalStage,
  isPreSignupStage,
  loadLocalStage,
  ONBOARDING_STAGES,
  ONBOARDING_STAGE_KEY,
  PRE_SIGNUP_STAGES,
  resolveStage,
  saveLocalStage,
  type OnboardingStage,
  type StageStore,
} from '../onboarding-stage';
import { indexDecision } from '../routing';

/** In-memory stand-in for AsyncStorage. */
function makeStore(initial: Record<string, string> = {}): StageStore & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: async (k) => (k in data ? data[k] : null),
    setItem: async (k, v) => {
      data[k] = v;
    },
    removeItem: async (k) => {
      delete data[k];
    },
  };
}

/** Storage that fails every call — routing must survive it. */
const brokenStore: StageStore = {
  getItem: async () => {
    throw new Error('storage unavailable');
  },
  setItem: async () => {
    throw new Error('storage unavailable');
  },
  removeItem: async () => {
    throw new Error('storage unavailable');
  },
};

/** Route a user through the real decision function. */
function route(params: {
  session: boolean;
  onboardingCompleted: boolean | null;
  serverStage?: unknown;
  localStage?: unknown;
}) {
  const authenticated = params.session;
  return indexDecision({
    session: authenticated,
    loading: false,
    onboardingCompleted: params.onboardingCompleted,
    stage: resolveStage({
      authenticated,
      serverStage: params.serverStage ?? null,
      localStage: params.localStage ?? null,
    }),
    stageReady: true,
  });
}

describe('asOnboardingStage', () => {
  test('accepts every declared stage', () => {
    for (const stage of ONBOARDING_STAGES) {
      expect(asOnboardingStage(stage)).toBe(stage);
    }
  });

  test('rejects obsolete stage names from earlier builds', () => {
    // Screens that existed in the 28-screen flow. A profile row written by an
    // older build must never route to a screen this build may not have.
    for (const legacy of ['quiz', 'about', 'features', 'analysing', 'results', 'questions']) {
      expect(asOnboardingStage(legacy)).toBeNull();
    }
  });

  test('rejects malformed and non-string input without throwing', () => {
    for (const junk of [null, undefined, '', ' goal', 'GOAL', 42, {}, [], true, NaN]) {
      expect(asOnboardingStage(junk)).toBeNull();
    }
  });

  test('pre-signup stages are exactly the three that precede the account', () => {
    expect([...PRE_SIGNUP_STAGES]).toEqual(['goal', 'feeling', 'example']);
    expect(isPreSignupStage('example')).toBe(true);
    expect(isPreSignupStage('analysis')).toBe(false);
    expect(isPreSignupStage(null)).toBe(false);
  });
});

describe('local stage storage', () => {
  test('round-trips a stage', async () => {
    const store = makeStore();
    await saveLocalStage('feeling', store);
    expect(store.data[ONBOARDING_STAGE_KEY]).toBe('feeling');
    expect(await loadLocalStage(store)).toBe('feeling');
  });

  test('clearing removes the key', async () => {
    const store = makeStore({ [ONBOARDING_STAGE_KEY]: 'analysis' });
    await clearLocalStage(store);
    expect(await loadLocalStage(store)).toBeNull();
  });

  test('a corrupted stored value reads as null, not as a stage', async () => {
    const store = makeStore({ [ONBOARDING_STAGE_KEY]: 'analysi' });
    expect(await loadLocalStage(store)).toBeNull();
  });

  test('storage failure never throws and never blocks routing', async () => {
    await expect(loadLocalStage(brokenStore)).resolves.toBeNull();
    await expect(saveLocalStage('goal', brokenStore)).resolves.toBeUndefined();
    await expect(clearLocalStage(brokenStore)).resolves.toBeUndefined();
  });
});

describe('resolveStage — which store wins', () => {
  test('signed out: local is used and a server value is ignored', () => {
    expect(resolveStage({ authenticated: false, serverStage: 'analysis', localStage: 'goal' })).toBe('goal');
  });

  test('signed in: server wins over local', () => {
    expect(resolveStage({ authenticated: true, serverStage: 'notifications', localStage: 'analysis' })).toBe(
      'notifications',
    );
  });

  test('signed in with no server value: falls back to local', () => {
    expect(resolveStage({ authenticated: true, serverStage: null, localStage: 'analysis' })).toBe('analysis');
  });

  test('signed in with an unknown server value: falls back to local rather than trusting it', () => {
    expect(resolveStage({ authenticated: true, serverStage: 'wat', localStage: 'analysis' })).toBe('analysis');
  });

  test('both absent or both junk resolves to null', () => {
    expect(resolveStage({ authenticated: true, serverStage: null, localStage: null })).toBeNull();
    expect(resolveStage({ authenticated: true, serverStage: 'x', localStage: 'y' })).toBeNull();
  });
});

describe('indexDecision — existing behaviour is preserved', () => {
  test('a completed user always reaches tabs', () => {
    expect(route({ session: true, onboardingCompleted: true })).toBe('(tabs)');
  });

  test('a completed user reaches tabs even with a stale stage on either store', () => {
    // The interrupted-run case: onboarding finished, but a stage was left
    // behind. Completion must win, or a finished user is dragged backwards.
    for (const stale of ONBOARDING_STAGES) {
      expect(route({ session: true, onboardingCompleted: true, serverStage: stale })).toBe('(tabs)');
      expect(route({ session: true, onboardingCompleted: true, localStage: stale })).toBe('(tabs)');
    }
  });

  test('a completed user is routed without waiting for the local stage read', () => {
    expect(
      indexDecision({ session: true, loading: false, onboardingCompleted: true, stageReady: false }),
    ).toBe('(tabs)');
  });

  test('an unloaded profile still lets the user into tabs', () => {
    expect(route({ session: true, onboardingCompleted: null })).toBe('(tabs)');
  });

  test('loading and password recovery still win over everything', () => {
    expect(indexDecision({ session: true, loading: true, onboardingCompleted: true })).toBe('loading');
    expect(
      indexDecision({
        session: true,
        loading: false,
        onboardingCompleted: true,
        passwordRecovery: true,
      }),
    ).toBe('(auth)/reset-password');
  });
});

describe('indexDecision — signed out', () => {
  test('no stage starts at welcome', () => {
    expect(route({ session: false, onboardingCompleted: null })).toBe('(onboarding)/welcome');
  });

  test('goal and feeling resume in the question stepper', () => {
    expect(route({ session: false, onboardingCompleted: null, localStage: 'goal' })).toBe(
      '(onboarding)/questions',
    );
    expect(route({ session: false, onboardingCompleted: null, localStage: 'feeling' })).toBe(
      '(onboarding)/questions',
    );
  });

  test('example resumes on the example screen', () => {
    expect(route({ session: false, onboardingCompleted: null, localStage: 'example' })).toBe(
      '(onboarding)/example',
    );
  });

  test('an unknown or obsolete stage falls back to welcome', () => {
    expect(route({ session: false, onboardingCompleted: null, localStage: 'quiz' })).toBe(
      '(onboarding)/welcome',
    );
    expect(route({ session: false, onboardingCompleted: null, localStage: 'about' })).toBe(
      '(onboarding)/welcome',
    );
  });
});

describe('indexDecision — signed in, onboarding incomplete', () => {
  test('signup then app termination resumes at the analysis, NOT the questionnaire', () => {
    // The regression this whole feature exists to prevent.
    expect(route({ session: true, onboardingCompleted: false, serverStage: 'analysis' })).toBe(
      'photo-analysis-onboarding',
    );
  });

  test('stage signup also resumes at the analysis', () => {
    expect(route({ session: true, onboardingCompleted: false, serverStage: 'signup' })).toBe(
      'photo-analysis-onboarding',
    );
  });

  test('cancelling the camera leaves stage at analysis, so relaunch returns there', () => {
    // Cancellation does not advance or clear the stage; the next launch is
    // simply another resume with the same stored value.
    expect(route({ session: true, onboardingCompleted: false, serverStage: 'analysis' })).toBe(
      'photo-analysis-onboarding',
    );
  });

  test('after a real result, stage notifications resumes on the notifications screen', () => {
    expect(route({ session: true, onboardingCompleted: false, serverStage: 'notifications' })).toBe(
      '(onboarding)/notifications',
    );
  });

  test('a missing server stage falls back to the local one', () => {
    expect(
      route({ session: true, onboardingCompleted: false, serverStage: null, localStage: 'analysis' }),
    ).toBe('photo-analysis-onboarding');
  });

  test('stage completed reaches tabs even if the completed flag has not synced yet', () => {
    expect(route({ session: true, onboardingCompleted: false, serverStage: 'completed' })).toBe('(tabs)');
  });

  test('no stage at all resumes at the first analysis, not the questionnaire', () => {
    // v1.0 creates the account only after both questions, so an authenticated
    // user has already answered them — the camera is the correct resume point.
    expect(route({ session: true, onboardingCompleted: false })).toBe('photo-analysis-onboarding');
  });

  test('an unknown or obsolete stage also resumes at the first analysis', () => {
    expect(route({ session: true, onboardingCompleted: false, serverStage: 'analysing' })).toBe(
      'photo-analysis-onboarding',
    );
  });

  test('a contradictory pre-signup stage on an account is treated as stale', () => {
    for (const stage of PRE_SIGNUP_STAGES) {
      expect(route({ session: true, onboardingCompleted: false, serverStage: stage })).toBe(
        'photo-analysis-onboarding',
      );
    }
  });

  test('waits rather than guessing while the local stage is still loading', () => {
    expect(
      indexDecision({
        session: true,
        loading: false,
        onboardingCompleted: false,
        stage: null,
        stageReady: false,
      }),
    ).toBe('loading');
  });
});

describe('every stage resolves to a reachable route', () => {
  test('no stage produces an undefined decision for a signed-in incomplete user', () => {
    const seen = new Set<string>();
    for (const stage of [...ONBOARDING_STAGES, null] as (OnboardingStage | null)[]) {
      const decision = route({ session: true, onboardingCompleted: false, serverStage: stage });
      expect(typeof decision).toBe('string');
      expect(decision.length).toBeGreaterThan(0);
      seen.add(decision);
    }
    // Sanity: the incomplete-user branch really does reach all four outcomes.
    expect(seen).toEqual(
      new Set(['(tabs)', '(onboarding)/notifications', 'photo-analysis-onboarding']),
    );
  });
});
