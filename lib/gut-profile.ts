/**
 * lib/gut-profile.ts
 *
 * Turns the two live onboarding answers into the shape the Gut Profile Reveal
 * renders. Pure functions, no storage and no I/O, so the unit tests exercise
 * the same code the screen runs rather than a copy of it — the same reason
 * lib/routing.ts exists.
 *
 * ── What this is, and what it deliberately is not ───────────────────────────
 *
 * This is a RESTATEMENT of what the user already told us, not an inference
 * from it. Nothing here scores, ranks, weights, predicts or combines answers:
 * `goal` selects one line of copy and each selected `meal_feeling` selects
 * one more. That is the whole model.
 *
 * The restraint is the point. A screen that says "your profile" while quietly
 * deriving something the user did not say is how a wellness tracker starts
 * making claims it cannot support. Severity is never inferred, feelings are
 * never ordered by seriousness, and no answer is turned into a finding.
 *
 * Copy lives in i18n; this module only resolves KEYS, so the reveal reads the
 * same in English and German and neither language can drift into a claim the
 * other does not make.
 */
import { ONBOARDING_STEPS, type MultiSelectStep, type SingleSelectStep } from './onboarding-config';

/** Answer key written by the goal question → profiles.goal. */
export const GOAL_FIELD = 'goal';
/** Answer key written by the after-meal question → profiles.gut_concern. */
export const FEELING_FIELD = 'meal_feeling';

/**
 * The copy key used when an answer is missing, empty or unrecognised.
 *
 * Shared by both sections on purpose: a fallback that reads like a real answer
 * would be a small lie, so both resolve to copy that says what is actually
 * true — the profile starts general and fills in as the user logs.
 */
export const FALLBACK_KEY = 'fallback';

export type GutProfileSummary = {
  /** Copy key for the "Your focus" card. Never empty. */
  focusKey: string;
  /** Copy keys for the after-meal card, in config order. Never empty. */
  feelingKeys: string[];
  /** True when either section fell back, so the screen can soften its intro. */
  isGeneric: boolean;
};

function stepById<T>(id: string): T | undefined {
  return ONBOARDING_STEPS.find((s) => s.id === id) as T | undefined;
}

/**
 * Option values the live config actually offers.
 *
 * Read from ONBOARDING_STEPS rather than duplicated here, so adding or
 * renaming an option cannot leave this module mapping a value the
 * questionnaire no longer asks — or silently dropping one it does.
 */
export function knownGoalValues(): string[] {
  return stepById<SingleSelectStep>('main_goal')?.options.map((o) => o.value) ?? [];
}

export function knownFeelingValues(): string[] {
  return stepById<MultiSelectStep>('after_meal_feeling')?.options.map((o) => o.value) ?? [];
}

/**
 * Coerce whatever is in AsyncStorage into a list of strings.
 *
 * `meal_feeling` is an array since the step became multi-select, but blobs
 * written by an older build hold a bare string. Both are accepted; anything
 * else (number, object, null) yields an empty list rather than throwing.
 */
function asList(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
  if (typeof value === 'string' && value.length > 0) return [value];
  return [];
}

/**
 * Build the reveal's view model from a parsed `onboarding_answers` blob.
 *
 * Total by design: every input produces a renderable summary. A missing key,
 * a null blob, a value from a build that offered different options, a legacy
 * scalar — all resolve to the fallback rather than to an empty card or the
 * string "undefined" on screen.
 *
 * Only GOAL_FIELD and FEELING_FIELD are read. Any other key in the blob is
 * ignored, which is what keeps this screen honest: it can only show back what
 * the two live questions collected.
 */
export function buildGutProfile(answers: unknown): GutProfileSummary {
  const blob =
    answers && typeof answers === 'object' && !Array.isArray(answers)
      ? (answers as Record<string, unknown>)
      : {};

  const goals = knownGoalValues();
  const rawGoal = blob[GOAL_FIELD];
  const focusKey =
    typeof rawGoal === 'string' && goals.includes(rawGoal) ? rawGoal : FALLBACK_KEY;

  const feelings = knownFeelingValues();
  const selected = new Set(asList(blob[FEELING_FIELD]));
  // Config order, not selection order: the reveal should read the same way
  // every time it is opened, and selection order is not something the user
  // chose to communicate. Filtering through `feelings` also drops unknown
  // legacy values and de-duplicates in one pass.
  const feelingKeys = feelings.filter((v) => selected.has(v));

  return {
    focusKey,
    feelingKeys: feelingKeys.length > 0 ? feelingKeys : [FALLBACK_KEY],
    isGeneric: focusKey === FALLBACK_KEY || feelingKeys.length === 0,
  };
}

/**
 * Safely parse the raw AsyncStorage string.
 *
 * Kept here rather than in the screen so the corrupt-JSON path is covered by
 * the same tests as the mapping. A truncated or hand-edited blob returns null,
 * which buildGutProfile turns into the generic profile.
 */
export function parseAnswers(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
