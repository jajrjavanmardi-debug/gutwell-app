import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';

/**
 * Config-driven onboarding engine for Gutwell.
 *
 * This mirrors Cal AI's onboarding (which is clearly config-driven): an ordered
 * array of step definitions walked by a single paginated stepper screen
 * (`app/(onboarding)/questions.tsx`). Each step declares its type, copy, the
 * options/picker config it needs, and which profile field its answer writes to.
 *
 * Adapted from weight-loss → gut health, in Gutwell's own dark-green theme.
 * Copy is original (same structure/intent as Cal AI, not verbatim).
 *
 * Persistence: answers are keyed by `step.field` and merged into the single
 * AsyncStorage blob `onboarding_answers` — the SAME store the existing
 * notifications screen reads when it writes the Supabase `profiles` row. The
 * historical keys `meal_feeling`, `bloating_frequency` and `goal` are preserved
 * so that mapping keeps working unchanged.
 */

type IoniconName = ComponentProps<typeof Ionicons>['name'];

export type SelectOption = {
  /** Stored value (also the human-readable label by default). */
  value: string;
  label: string;
  /** Secondary line under the label (Cal AI's small grey subtitle). */
  description?: string;
  icon?: IoniconName;
};

export type InfoBullet = {
  icon: IoniconName;
  text: string;
};

type BaseStep = {
  /** Stable id — also used for analytics + back/forward keying. */
  id: string;
  /** Big bold headline. */
  title: string;
  /** Grey supporting line under the title. */
  subtitle?: string;
};

export type SingleSelectStep = BaseStep & {
  type: 'single-select';
  /** Profile/answer key this step writes. */
  field: string;
  /** Larger goal-style cards vs. compact rows. */
  variant?: 'row' | 'card';
  options: SelectOption[];
};

export type MultiSelectStep = BaseStep & {
  type: 'multi-select';
  field: string;
  options: SelectOption[];
  /** Allow advancing with zero selections (e.g. "none of these"). */
  optional?: boolean;
};

export type WheelStep = BaseStep & {
  type: 'wheel';
  field: string;
  /** 'date' = month/day/year columns; 'number' = single labelled column. */
  mode: 'date' | 'number';
  /** For mode='number'. */
  min?: number;
  max?: number;
  unit?: string;
  /** Default selected value (number for 'number', ISO-ish for 'date'). */
  defaultValue?: number;
};

export type RulerStep = BaseStep & {
  type: 'ruler';
  field: string;
  min: number;
  max: number;
  step?: number;
  unit: string;
  defaultValue: number;
};

export type InfoStep = BaseStep & {
  type: 'info';
  /** Big icon shown in the illustration ring. */
  icon: IoniconName;
  /** Body paragraph under the headline. */
  body?: string;
  /** Optional supporting bullet rows (used by connect-health etc.). */
  bullets?: InfoBullet[];
  /** Variant tweaks the illustration (comparison bars, trend chart…). */
  illustration?: 'icon' | 'comparison' | 'trend' | 'transition' | 'rating';
  /** Footer caption (Cal AI's "Small daily actions…" line). */
  caption?: string;
  /** Secondary "Skip" affordance below the primary CTA. */
  skippable?: boolean;
  /** Override the primary CTA label. */
  cta?: string;
};

export type ReferralStep = BaseStep & {
  type: 'referral';
  field: string;
  icon: IoniconName;
  /** Allow continuing without entering a code. */
  optional?: boolean;
};

export type OnboardingStep =
  | SingleSelectStep
  | MultiSelectStep
  | WheelStep
  | RulerStep
  | InfoStep
  | ReferralStep;

/**
 * The ordered sequence. Indices map ~1:1 onto Cal AI's 31-shot onboarding,
 * remapped from weight-loss to gut health.
 */
export const ONBOARDING_STEPS: OnboardingStep[] = [
  // Screen 1 — Binary: are you symptomatic or proactive?
  {
    id: 'gut_intent',
    type: 'single-select',
    field: 'goal',
    title: 'Are you dealing with gut symptoms right now?',
    subtitle: 'There are no wrong answers.',
    options: [
      {
        value: 'Reduce symptoms',
        label: 'Yes — I have bloating, pain, or digestive issues',
        icon: 'alert-circle-outline',
      },
      {
        value: 'Improve awareness',
        label: 'Not really — I want to understand how food affects me',
        icon: 'bulb-outline',
      },
    ],
  },

  // Screen 2 — Symptom multi-select (proactive chip mutually exclusive)
  {
    id: 'gut_symptoms',
    type: 'multi-select',
    field: 'gut_concern',
    title: 'Which of these do you experience?',
    subtitle: 'Select all that apply.',
    options: [
      { value: 'bloating',            label: 'Bloating',                          icon: 'fitness-outline' },
      { value: 'stomach_pain',        label: 'Stomach pain or cramping',          icon: 'flash-outline' },
      { value: 'reflux',              label: 'Reflux or heartburn',               icon: 'flame-outline' },
      { value: 'gas',                 label: 'Gas',                               icon: 'cloud-outline' },
      { value: 'fatigue',             label: 'Fatigue after eating',              icon: 'battery-dead-outline' },
      { value: 'nausea',              label: 'Nausea',                            icon: 'medical-outline' },
      { value: 'diagnosed_condition', label: 'I have a diagnosed digestive condition', icon: 'document-text-outline' },
      { value: 'proactive',           label: 'None of these — I\'m being proactive', icon: 'checkmark-circle-outline' },
    ],
  },

  // Screen 3 — Daily life context (optional)
  {
    id: 'daily_context',
    type: 'multi-select',
    field: 'daily_context',
    title: "GutWell considers what you\'re doing after eating, not just what you ate.",
    subtitle: "What\'s usually in your day?",
    options: [
      { value: 'work_study',  label: 'Work or study',               icon: 'briefcase-outline' },
      { value: 'driving',     label: 'Commuting or driving',        icon: 'car-outline' },
      { value: 'exercise',    label: 'Active or exercising',        icon: 'barbell-outline' },
      { value: 'caregiving',  label: 'Caring for others',           icon: 'people-outline' },
      { value: 'shift_work',  label: 'Shift work or irregular schedule', icon: 'moon-outline' },
      { value: 'travel',      label: 'Frequent travel',             icon: 'airplane-outline' },
      { value: 'eating_out',  label: 'Eating out often',            icon: 'restaurant-outline' },
    ],
  },
];

export const TOTAL_STEPS = ONBOARDING_STEPS.length;

export function getStep(id: string): OnboardingStep | undefined {
  return ONBOARDING_STEPS.find((s) => s.id === id);
}

// ---------------------------------------------------------------------------
// Profile summary builder — used by results.tsx (Screen 4).
// Only restates information the user explicitly provided.
// Never invents correlations, severity, causes, or expected outcomes.
// ---------------------------------------------------------------------------

const SYMPTOM_LABELS: Record<string, string> = {
  bloating:            'Bloating',
  stomach_pain:        'Stomach pain',
  reflux:              'Reflux',
  gas:                 'Gas',
  fatigue:             'Fatigue after eating',
  nausea:              'Nausea',
  diagnosed_condition: 'a diagnosed digestive condition',
};

const CONTEXT_LABELS: Record<string, string> = {
  work_study:  'your workday',
  driving:     'your driving schedule',
  exercise:    'your exercise routine',
  caregiving:  'your caregiving schedule',
  shift_work:  'your irregular schedule',
  travel:      'your travel schedule',
  eating_out:  'your eating-out habits',
};

function joinList(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  if (items.length <= 4) {
    return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
  }
  // 5+ symptoms: first three + "and other symptoms"
  return `${items.slice(0, 3).join(', ')}, and other symptoms`;
}

export function buildProfileSummary(answers: Record<string, unknown>): {
  body: string;
  hasDiagnosis: boolean;
} {
  const rawSymptoms = answers.gut_concern;
  const rawContext = answers.daily_context;

  const selectedSymptoms: string[] = Array.isArray(rawSymptoms)
    ? (rawSymptoms as string[]).filter((v) => v !== 'proactive' && v !== 'diagnosed_condition')
    : typeof rawSymptoms === 'string' && rawSymptoms !== 'proactive' && rawSymptoms !== 'diagnosed_condition'
      ? [rawSymptoms]
      : [];

  const hasDiagnosis = Array.isArray(rawSymptoms)
    ? (rawSymptoms as string[]).includes('diagnosed_condition')
    : rawSymptoms === 'diagnosed_condition';

  const isProactive =
    selectedSymptoms.length === 0 && !hasDiagnosis;

  const selectedContext: string[] = Array.isArray(rawContext)
    ? (rawContext as string[]).filter((v) => CONTEXT_LABELS[v])
    : [];

  const symptomLabels = selectedSymptoms
    .filter((v) => SYMPTOM_LABELS[v])
    .map((v) => SYMPTOM_LABELS[v]);

  const contextLabels = selectedContext.map((v) => CONTEXT_LABELS[v]);

  // Build symptom sentence
  let symptomSentence: string;
  if (isProactive) {
    symptomSentence =
      "We\'ll start by building a picture of your gut patterns over time.";
  } else if (hasDiagnosis && symptomLabels.length === 0) {
    symptomSentence =
      "We\'ll start by building a picture of your gut patterns over time.";
  } else {
    symptomSentence = `${joinList(symptomLabels)} ${symptomLabels.length === 1 ? 'is' : 'are'} where we\'ll start.`;
  }

  // Build context sentence
  let contextSentence = '';
  if (contextLabels.length > 0) {
    contextSentence = `GutWell can also consider ${joinList(contextLabels)} when giving guidance.`;
  } else if (!isProactive) {
    contextSentence =
      'You can add more context at any time from the meal scan screen.';
  }

  // Build diagnosis note
  const diagnosisSentence = hasDiagnosis
    ? 'GutWell supports tracking and pattern awareness alongside your medical care.'
    : '';

  const parts = [symptomSentence, contextSentence, diagnosisSentence].filter(Boolean);
  return { body: parts.join(' '), hasDiagnosis };
}
