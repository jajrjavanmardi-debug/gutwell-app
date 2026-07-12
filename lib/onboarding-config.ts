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
  // 02 — Choose your sex
  {
    id: 'sex',
    type: 'single-select',
    field: 'sex',
    title: 'Which best describes you?',
    subtitle: 'This helps us tailor your gut-health plan.',
    options: [
      { value: 'Female', label: 'Female', icon: 'female-outline' },
      { value: 'Male', label: 'Male', icon: 'male-outline' },
      { value: 'Other', label: 'Other', icon: 'transgender-outline' },
      { value: 'Prefer not to say', label: 'Prefer not to say', icon: 'remove-circle-outline' },
    ],
  },

  // 03 — Have you tried other apps?
  {
    id: 'tried_apps',
    type: 'single-select',
    field: 'tried_apps',
    title: 'Have you tried other gut-health apps?',
    subtitle: 'No judgement — it helps us meet you where you are.',
    options: [
      { value: 'No', label: 'No, this is my first', icon: 'sparkles-outline' },
      { value: 'Yes, briefly', label: 'Yes, but I gave up', icon: 'hourglass-outline' },
      { value: 'Yes, several', label: 'Yes, several of them', icon: 'albums-outline' },
    ],
  },

  // 04/05 — Workout frequency → digestive-issue frequency
  {
    id: 'symptom_frequency',
    type: 'single-select',
    field: 'bloating_frequency', // preserved key (notifications maps this)
    title: 'How often do digestive issues hit you?',
    subtitle: 'Bloating, cramps, irregularity — a typical week.',
    options: [
      { value: '0-2', label: '0–2 days', description: 'Mostly smooth sailing', icon: 'happy-outline' },
      { value: '3-5', label: '3–5 days', description: 'A few rough days a week', icon: 'pulse-outline' },
      { value: '6+', label: '6+ days', description: 'Nearly every day', icon: 'alert-circle-outline' },
    ],
  },

  // 06 — Attribution / where did you hear about us
  {
    id: 'attribution',
    type: 'single-select',
    field: 'attribution',
    title: 'Where did you hear about Gutwell?',
    options: [
      { value: 'Instagram', label: 'Instagram', icon: 'logo-instagram' },
      { value: 'TikTok', label: 'TikTok', icon: 'logo-tiktok' },
      { value: 'Friend or family', label: 'Friend or family', icon: 'people-outline' },
      { value: 'App Store', label: 'App Store', icon: 'logo-apple-appstore' },
      { value: 'Google', label: 'Web search', icon: 'search-outline' },
      { value: 'Other', label: 'Somewhere else', icon: 'ellipsis-horizontal-outline' },
    ],
  },

  // 07 — Work with a trainer/dietitian → doctor / GI / dietitian
  {
    id: 'care_team',
    type: 'single-select',
    field: 'care_team',
    title: 'Do you work with a health professional?',
    subtitle: 'Gutwell complements care — it never replaces it.',
    options: [
      { value: 'None', label: 'Not right now', icon: 'person-outline' },
      { value: 'GP', label: 'My GP / doctor', icon: 'medkit-outline' },
      { value: 'Gastroenterologist', label: 'A gastroenterologist', icon: 'fitness-outline' },
      { value: 'Dietitian', label: 'A dietitian or nutritionist', icon: 'nutrition-outline' },
    ],
  },

  // 08 — Birthdate wheel
  {
    id: 'birthdate',
    type: 'wheel',
    field: 'birthdate',
    mode: 'date',
    title: 'When were you born?',
    subtitle: 'Age helps us calibrate your baseline gut score.',
  },

  // 09 — Height wheel
  {
    id: 'height',
    type: 'wheel',
    field: 'height_cm',
    mode: 'number',
    min: 120,
    max: 220,
    unit: 'cm',
    defaultValue: 170,
    title: 'How tall are you?',
    subtitle: 'Optional — used for portioning guidance.',
  },

  // 10 — Weight ruler
  {
    id: 'weight',
    type: 'ruler',
    field: 'weight_kg',
    min: 35,
    max: 200,
    step: 0.5,
    unit: 'kg',
    defaultValue: 70,
    title: 'What is your weight?',
    subtitle: 'Optional — helps us personalise meal sizing.',
  },

  // 11 — Goal select (cards)
  {
    id: 'goal',
    type: 'single-select',
    field: 'goal', // preserved key
    variant: 'card',
    title: 'What is your main gut goal?',
    subtitle: "We'll build your plan around this.",
    options: [
      { value: 'Reduce bloating', label: 'Reduce bloating', description: 'Calmer, flatter days', icon: 'remove-circle-outline' },
      { value: 'Improve regularity', label: 'Improve regularity', description: 'A predictable rhythm', icon: 'repeat-outline' },
      { value: 'Boost energy', label: 'Boost energy', description: 'Fewer post-meal slumps', icon: 'flash-outline' },
      { value: 'Less discomfort', label: 'Ease discomfort', description: 'Less cramping and pain', icon: 'medkit-outline' },
      { value: 'Identify triggers', label: 'Identify my triggers', description: 'Know what sets you off', icon: 'search-outline' },
    ],
  },

  // 12 — Desired weight → target symptom state
  {
    id: 'target_state',
    type: 'single-select',
    field: 'target_state',
    title: 'Where do you want to be in 12 weeks?',
    subtitle: 'Pick the outcome that would change the most.',
    options: [
      { value: 'Symptom-free most days', label: 'Symptom-free most days', icon: 'sunny-outline' },
      { value: 'Eat out without fear', label: 'Eat out without worry', icon: 'restaurant-outline' },
      { value: 'Steady daily energy', label: 'Steady energy all day', icon: 'battery-charging-outline' },
      { value: 'Know my safe foods', label: 'Confident in my food', icon: 'checkmark-circle-outline' },
    ],
  },

  // 13 — Plan-intro / target promise (info)
  {
    id: 'target_promise',
    type: 'info',
    icon: 'trending-down-outline',
    illustration: 'trend',
    title: 'Your symptoms can trend down',
    body: 'People who track consistently with Gutwell tend to notice their flare-up days dropping within the first few weeks.',
    caption: 'Steady tracking reveals what actually helps.',
  },

  // 15 — With/without comparison (info)
  {
    id: 'comparison',
    type: 'info',
    icon: 'git-compare-outline',
    illustration: 'comparison',
    title: 'A clearer path to feeling good',
    body: 'Guesswork keeps you stuck. Gutwell connects your meals, mood, and symptoms so the pattern finally shows itself.',
    caption: 'Small daily check-ins add up to real answers.',
  },

  // 16 — Barriers (multi-select)
  {
    id: 'barriers',
    type: 'multi-select',
    field: 'barriers',
    title: "What's getting in your way?",
    subtitle: 'Select all that apply.',
    options: [
      { value: 'Cant find triggers', label: "I can't pin down my triggers", icon: 'help-circle-outline' },
      { value: 'Inconsistent', label: 'I struggle to stay consistent', icon: 'calendar-outline' },
      { value: 'Conflicting advice', label: 'Too much conflicting advice', icon: 'swap-horizontal-outline' },
      { value: 'Stress', label: 'Stress makes it worse', icon: 'thunderstorm-outline' },
      { value: 'Eating out', label: 'Eating out is hard', icon: 'restaurant-outline' },
    ],
  },

  // 17 — Diet select
  {
    id: 'diet',
    type: 'single-select',
    field: 'diet',
    title: 'Do you follow a specific diet?',
    subtitle: 'We tune your suggestions to fit.',
    options: [
      { value: 'Balanced', label: 'Balanced / no restrictions', icon: 'restaurant-outline' },
      { value: 'Low-FODMAP', label: 'Low-FODMAP', icon: 'leaf-outline' },
      { value: 'Gluten-free', label: 'Gluten-free', icon: 'close-circle-outline' },
      { value: 'Dairy-free', label: 'Dairy-free', icon: 'water-outline' },
      { value: 'Vegetarian', label: 'Vegetarian', icon: 'flower-outline' },
      { value: 'Vegan', label: 'Vegan', icon: 'nutrition-outline' },
    ],
  },

  // 18 — What you want to accomplish (single)
  {
    id: 'accomplish',
    type: 'single-select',
    field: 'meal_feeling', // preserved key (notifications maps this → gut_concern)
    title: 'What matters most to you right now?',
    subtitle: "We'll lead with this in your plan.",
    options: [
      { value: 'Feel comfortable after eating', label: 'Feel comfortable after eating', icon: 'happy-outline' },
      { value: 'Understand my body', label: 'Finally understand my body', icon: 'bulb-outline' },
      { value: 'Build lasting habits', label: 'Build habits that stick', icon: 'leaf-outline' },
      { value: 'Take back control', label: 'Take back control', icon: 'shield-checkmark-outline' },
    ],
  },

  // 20 — Gut-score transition chart (info)
  {
    id: 'score_transition',
    type: 'info',
    icon: 'analytics-outline',
    illustration: 'transition',
    title: 'Watch your Gut Score climb',
    body: 'Every check-in nudges your personal Gut Score. As your patterns improve, you can literally see the line rise.',
    caption: 'Your score updates with each day you log.',
  },

  // 21 — Thank you for trusting us (info)
  {
    id: 'thank_you',
    type: 'info',
    icon: 'heart-outline',
    illustration: 'icon',
    title: 'Thank you for trusting us',
    body: 'Your gut data is personal. We treat it that way — encrypted, private, and never sold. You stay in control.',
    caption: "Let's set up the last few details.",
  },

  // 22 — Connect Apple Health (info + skip)
  {
    id: 'connect_health',
    type: 'info',
    icon: 'pulse-outline',
    illustration: 'icon',
    title: 'Connect to Apple Health',
    body: 'Sync activity, sleep, and more so Gutwell can connect the dots between your day and your gut.',
    bullets: [
      { icon: 'walk-outline', text: 'Activity and steps' },
      { icon: 'moon-outline', text: 'Sleep quality' },
      { icon: 'heart-outline', text: 'Heart-rate trends' },
    ],
    skippable: true,
    cta: 'Connect',
  },

  // 25 — Social proof + rating prompt (info)
  {
    id: 'social_proof',
    type: 'info',
    icon: 'star-outline',
    illustration: 'rating',
    title: 'Join thousands feeling better',
    body: 'Gutwell members rate us highly for one reason: it helps them finally make sense of their symptoms.',
    caption: 'Give us a rating to help others find Gutwell.',
    skippable: true,
    cta: 'Rate Gutwell',
  },

  // 26 — Referral code
  {
    id: 'referral',
    type: 'referral',
    field: 'referral_code',
    icon: 'gift-outline',
    title: 'Have a referral code?',
    subtitle: 'Enter it to unlock your friend a reward.',
    optional: true,
  },

  // 27 — All done / generate plan (info)
  {
    id: 'all_done',
    type: 'info',
    icon: 'checkmark-done-outline',
    illustration: 'icon',
    title: 'All done — time to build your plan',
    body: "We've got everything we need. Let's turn your answers into a plan made for your gut.",
    cta: 'Generate My Plan',
  },
];

/** Steps that count toward the visible progress bar (selects/pickers/info). */
export const TOTAL_STEPS = ONBOARDING_STEPS.length;

/** Look up a step by id (handy for analytics + tests). */
export function getStep(id: string): OnboardingStep | undefined {
  return ONBOARDING_STEPS.find((s) => s.id === id);
}

// ─── Plan result helpers (drives the results screen) ────────────────────────

export type PlanFocusArea = {
  icon: IoniconName;
  title: string;
};

/**
 * Derive a target Gut Score + focus areas from the collected answers.
 * Deterministic so the results screen and any tests agree.
 */
export function computePlan(answers: Record<string, unknown>): {
  targetScore: number;
  focusAreas: PlanFocusArea[];
} {
  const freq = String(answers.bloating_frequency ?? '');
  const goal = String(answers.goal ?? '');

  // Heavier symptom load → more headroom, so a slightly higher target.
  let targetScore = 82;
  if (freq === '6+') targetScore = 88;
  else if (freq === '3-5') targetScore = 85;

  const focusAreas: PlanFocusArea[] = [
    { icon: 'restaurant-outline', title: 'Log meals to spot patterns' },
    { icon: 'pulse-outline', title: 'Track symptoms daily' },
  ];

  if (goal === 'Identify triggers') {
    focusAreas.push({ icon: 'search-outline', title: 'Run a guided trigger test' });
  } else if (goal === 'Improve regularity') {
    focusAreas.push({ icon: 'repeat-outline', title: 'Build a steady routine' });
  } else {
    focusAreas.push({ icon: 'trending-up-outline', title: 'Grow your Gut Score weekly' });
  }

  return { targetScore, focusAreas };
}
