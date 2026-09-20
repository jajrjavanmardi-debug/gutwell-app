/**
 * lib/symptom-selection.ts
 *
 * The "How do you feel right now?" chips on Photo Analysis step 2.
 *
 * These are current-state symptoms, and they genuinely co-occur — bloating with
 * stomach pain, reflux with nausea. The screen held a single `string | null`
 * and toggled it like a radio button, so choosing a second symptom silently
 * discarded the first and only one ever reached the analysis.
 *
 * Pure and separate from the screen so the rules can be tested directly:
 * photo-analysis.tsx pulls in the camera, the picker and speech recognition,
 * none of which jest can load.
 *
 * ── Values ──────────────────────────────────────────────────────────────────
 * Selections are the stable keys from t.photoAnalysis.stateOptions
 * ('bloating', 'pain', …), never the translated labels, so switching language
 * cannot change or lose what was chosen. They are mapped to plain English only
 * at the point the request is built.
 */

/** 'fine' is a statement that nothing else applies, so it cannot coexist. */
export const FEELING_FINE = 'fine';

/**
 * Next selection after tapping `key`.
 *
 * Same rules the onboarding feeling step uses, deliberately: two screens that
 * ask about symptoms should not behave differently. Duplicated rather than
 * shared because the other implementation lives inside an onboarding screen
 * module, and importing that here would drag the whole questions flow into the
 * analysis screen's bundle.
 *
 *   - tapping a selected symptom removes only that symptom
 *   - tapping an unselected symptom adds it, dropping 'fine' if it was set
 *   - tapping 'fine' replaces the whole selection
 *   - tapping 'fine' when it is already the selection clears it, so the chip
 *     stays un-pickable rather than stuck: unlike onboarding, an empty answer
 *     here is valid — context is optional on this screen.
 */
export function nextSymptomSelection(current: readonly string[], key: string): string[] {
  if (key === FEELING_FINE) {
    return current.includes(FEELING_FINE) ? [] : [FEELING_FINE];
  }
  if (current.includes(key)) return current.filter((v) => v !== key);
  return [...current.filter((v) => v !== FEELING_FINE), key];
}

/**
 * Plain-English wording for each key, for the analysis prompt.
 *
 * The Edge Function renders `currentState` straight into a sentence — "User's
 * current state: …" — so it must read as English rather than as an identifier.
 * Without this the model would be told the user's state was "lowEnergy".
 */
const REQUEST_WORDING: Record<string, string> = {
  fine: 'feeling fine',
  bloating: 'bloating',
  pain: 'stomach pain',
  lowEnergy: 'low energy',
  nausea: 'nausea',
  reflux: 'reflux',
};

/** One symptom as the analysis should read it. Unknown keys pass through. */
export function symptomWording(key: string): string {
  return REQUEST_WORDING[key] ?? key;
}

/**
 * Every selected symptom, in plain English.
 *
 * Order follows the selection, so the same taps always produce the same string
 * and the request is reproducible.
 */
export function symptomsForRequest(selection: readonly string[]): string[] {
  return selection.map(symptomWording);
}

/**
 * The `mealContext.currentState` string the Edge Function expects.
 *
 * The API contract is a single string, so several symptoms are joined rather
 * than restructured — no Edge Function change, and the prompt reads naturally
 * as "User's current state: bloating, stomach pain."
 */
export function serializeCurrentState(selection: readonly string[]): string | undefined {
  if (selection.length === 0) return undefined;
  return symptomsForRequest(selection).join(', ');
}
