/**
 * lib/onboarding-stage.ts
 *
 * Where an unfinished onboarding should resume.
 *
 * The v1.0 flow creates the account partway through (screen 5 of 7), so a user
 * can be authenticated with `onboarding_completed = false` and no way to tell
 * how far they got. Without a stage, lib/routing.ts sent every such user back
 * to the questionnaire — re-asking answered questions and never returning them
 * to the meal analysis they abandoned.
 *
 * Two stores, because before signup there is no user row to write to:
 *
 *   goal · feeling · example              AsyncStorage only
 *   signup · analysis · notifications ·   AsyncStorage AND
 *   completed                             public.profiles.onboarding_stage
 *
 * After authentication the server wins: it survives reinstall and follows the
 * account across devices. Local is the fallback when the profile has not
 * loaded yet or the column is still NULL.
 *
 * `onboarding_completed` remains the single source of truth for "is onboarding
 * done". This module only answers "where should an unfinished user resume", and
 * a stale stage can never override a completed flag — see resolveStage.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export const ONBOARDING_STAGE_KEY = 'onboarding_stage';

export type OnboardingStage =
  | 'goal'
  | 'feeling'
  | 'example'
  | 'signup'
  | 'analysis'
  | 'notifications'
  | 'completed';

/** Declaration order is flow order — do not reorder without checking callers. */
export const ONBOARDING_STAGES: readonly OnboardingStage[] = [
  'goal',
  'feeling',
  'example',
  'signup',
  'analysis',
  'notifications',
  'completed',
] as const;

/** Stages reachable before an account exists, so they can only live locally. */
export const PRE_SIGNUP_STAGES: readonly OnboardingStage[] = ['goal', 'feeling', 'example'] as const;

export function isPreSignupStage(stage: OnboardingStage | null): boolean {
  return stage !== null && PRE_SIGNUP_STAGES.includes(stage);
}

/**
 * Narrow unknown input to a stage.
 *
 * Everything that is not an exact known stage — a value from a newer build, a
 * truncated write, a hand-edited profile row — becomes null and is treated as
 * "no information", never as a stage. Callers then fall back to their safe
 * default rather than routing somewhere that may not exist.
 */
export function asOnboardingStage(value: unknown): OnboardingStage | null {
  if (typeof value !== 'string') return null;
  return (ONBOARDING_STAGES as readonly string[]).includes(value)
    ? (value as OnboardingStage)
    : null;
}

/** Minimal surface of AsyncStorage, so tests can inject a fake. */
export type StageStore = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

const defaultStore: StageStore = AsyncStorage;

/** Read the locally stored stage. Never throws: storage failure reads as null. */
export async function loadLocalStage(store: StageStore = defaultStore): Promise<OnboardingStage | null> {
  try {
    return asOnboardingStage(await store.getItem(ONBOARDING_STAGE_KEY));
  } catch {
    return null;
  }
}

/** Persist the stage locally. Never throws — routing must not fail on a write. */
export async function saveLocalStage(
  stage: OnboardingStage,
  store: StageStore = defaultStore,
): Promise<void> {
  try {
    await store.setItem(ONBOARDING_STAGE_KEY, stage);
  } catch {
    /* best effort — the server copy or the safe default covers this */
  }
}

export async function clearLocalStage(store: StageStore = defaultStore): Promise<void> {
  try {
    await store.removeItem(ONBOARDING_STAGE_KEY);
  } catch {
    /* best effort */
  }
}

/**
 * Combine the two stores into the stage that should drive routing.
 *
 * - Unauthenticated: only local can be meaningful; a server value cannot exist.
 * - Authenticated: server wins when it is a valid stage, otherwise local.
 * - Authenticated but resolved to a pre-signup stage: contradictory, because
 *   the account already exists. Returned as-is; indexDecision decides what a
 *   contradiction means, so the rule lives in one place rather than two.
 */
export function resolveStage(params: {
  authenticated: boolean;
  serverStage: unknown;
  localStage: unknown;
}): OnboardingStage | null {
  const local = asOnboardingStage(params.localStage);
  if (!params.authenticated) return local;
  return asOnboardingStage(params.serverStage) ?? local;
}

/* ──────────────────────────────────────────────────────────────────────────
 * Durable persistence (post-signup)
 * ────────────────────────────────────────────────────────────────────────── */

/** Injected in tests; in the app this patches public.profiles. */
export type ServerWriter = (
  userId: string,
  patch: Record<string, unknown>,
) => Promise<{ error: unknown }>;

/**
 * Deliberately requires supabase lazily rather than importing it at module
 * scope. lib/supabase.ts throws on load when env config is absent, and this
 * module is imported by lib/routing.ts — i.e. by the app's entry decision. A
 * top-level import would make routing untestable without mocks and would tie a
 * pure resume-state module to network configuration it does not need until a
 * write actually happens.
 */
const defaultServerWriter: ServerWriter = async (userId, patch) => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { supabase } = require('./supabase') as typeof import('./supabase');
  const { error } = await supabase.from('profiles').update(patch).eq('id', userId);
  return { error };
};

export type PersistResult = { localOk: boolean; serverOk: boolean };

/**
 * Write the stage locally and, when a user id is known, to the profile.
 *
 * Local is written FIRST and is the one that matters for resuming on this
 * device; the server copy is the backup that survives reinstall. Neither write
 * can throw: a failed stage write must never cost the user their session or
 * block navigation, so callers get a result object instead of an exception.
 *
 * This only ever writes `onboarding_stage`, never `onboarding_completed`. That
 * is what makes a late or stale write harmless — indexDecision checks the
 * completed flag before it looks at the stage, so a straggling 'analysis' write
 * arriving after completion cannot pull a finished user back into onboarding.
 */
export async function persistStage(
  stage: OnboardingStage,
  userId?: string | null,
  opts?: { store?: StageStore; serverWriter?: ServerWriter },
): Promise<PersistResult> {
  const store = opts?.store ?? defaultStore;
  const writer = opts?.serverWriter ?? defaultServerWriter;

  let localOk = true;
  try {
    await store.setItem(ONBOARDING_STAGE_KEY, stage);
  } catch {
    localOk = false;
  }

  if (!userId) return { localOk, serverOk: false };

  let serverOk = false;
  try {
    const { error } = await writer(userId, { onboarding_stage: stage });
    serverOk = !error;
  } catch {
    serverOk = false;
  }
  return { localOk, serverOk };
}

/**
 * Mark onboarding finished.
 *
 * Sets the completed flag and the terminal stage together so the two can never
 * disagree. Used by "Skip for now" after repeated genuine analysis failures —
 * the user keeps their account and lands on Home rather than being trapped in a
 * loop they cannot exit.
 */
export async function completeOnboarding(
  userId?: string | null,
  opts?: { store?: StageStore; serverWriter?: ServerWriter },
): Promise<PersistResult> {
  const store = opts?.store ?? defaultStore;
  const writer = opts?.serverWriter ?? defaultServerWriter;

  let localOk = true;
  try {
    await store.setItem(ONBOARDING_STAGE_KEY, 'completed');
  } catch {
    localOk = false;
  }

  if (!userId) return { localOk, serverOk: false };

  let serverOk = false;
  try {
    const { error } = await writer(userId, {
      onboarding_completed: true,
      onboarding_stage: 'completed',
    });
    serverOk = !error;
  } catch {
    serverOk = false;
  }
  return { localOk, serverOk };
}
