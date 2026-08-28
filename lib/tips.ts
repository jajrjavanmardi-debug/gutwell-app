import type { AppLanguage } from './language';

export type TipTag = 'bloating' | 'energy' | 'digestion' | 'general' | 'hydration' | 'inflammation' | 'stress' | 'sleep';

export type WellnessTip = {
  title: string;
  body: string;
  category: 'nutrition' | 'lifestyle' | 'science' | 'mindfulness';
  icon: string;
  tags: TipTag[];
};

const TIPS: WellnessTip[] = [
  {
    title: 'Chew slowly',
    body: 'Eating slowly and chewing thoroughly may help some people feel more comfortable after meals. Aim for 20-30 chews per bite.',
    category: 'nutrition',
    icon: 'time',
    tags: ['bloating', 'digestion', 'general'],
  },
  {
    title: 'Morning hydration',
    body: 'Drinking a glass of warm water first thing in the morning is a gentle way to wake up your digestive system.',
    category: 'lifestyle',
    icon: 'water',
    tags: ['hydration', 'digestion', 'general'],
  },
  {
    title: 'Fiber diversity',
    body: 'Eating a wide variety of plant foods across the week — around 30 different ones — is associated with greater gut microbiome diversity.',
    category: 'nutrition',
    icon: 'nutrition',
    tags: ['digestion', 'general'],
  },
  {
    title: 'Stress & your gut',
    body: 'The gut-brain axis describes how closely stress and digestion are linked. Even 5 minutes of deep breathing can be a calming pause.',
    category: 'science',
    icon: 'pulse-outline',
    tags: ['stress', 'digestion', 'general'],
  },
  {
    title: 'Fermented foods',
    body: 'Yogurt, kimchi, sauerkraut, and kefir introduce beneficial bacteria that strengthen your gut lining.',
    category: 'nutrition',
    icon: 'flask',
    tags: ['digestion', 'bloating', 'inflammation'],
  },
  {
    title: 'Sleep quality matters',
    body: 'Poor sleep disrupts your gut microbiome within 48 hours. Aim for 7-9 hours of consistent sleep.',
    category: 'lifestyle',
    icon: 'moon',
    tags: ['sleep', 'energy', 'general'],
  },
  {
    title: 'Walk after meals',
    body: 'A 10-15 minute walk after eating supports digestion — many people find it helps them feel lighter after meals.',
    category: 'lifestyle',
    icon: 'walk',
    tags: ['digestion', 'bloating', 'energy'],
  },
  {
    title: 'Prebiotic power',
    body: 'Garlic, onions, bananas, and oats are prebiotic foods, which may support the bacteria already living in your gut.',
    category: 'nutrition',
    icon: 'leaf',
    tags: ['digestion', 'general'],
  },
  {
    title: 'Mindful eating',
    body: 'Eating without distractions can make it easier to notice fullness, and some people find meals sit better that way.',
    category: 'mindfulness',
    icon: 'eye',
    tags: ['bloating', 'digestion', 'stress'],
  },
  {
    title: 'Gut barrier health',
    body: 'Zinc, vitamin D, and glutamine are nutrients associated with intestinal lining health. Bone broth is one natural source.',
    category: 'science',
    icon: 'shield',
    tags: ['inflammation', 'digestion', 'general'],
  },
  {
    title: 'Consistency is key',
    body: 'Regular meal times train your digestive system. Try to eat at roughly the same times each day.',
    category: 'lifestyle',
    icon: 'calendar',
    tags: ['digestion', 'bloating', 'general'],
  },
  {
    title: 'Limit processed foods',
    body: 'Artificial sweeteners and emulsifiers in ultra-processed foods can harm your gut microbiome.',
    category: 'nutrition',
    icon: 'warning',
    tags: ['inflammation', 'digestion', 'bloating'],
  },
  {
    title: 'Exercise helps',
    body: 'Regular moderate exercise is also linked to greater gut microbiome diversity.',
    category: 'lifestyle',
    icon: 'fitness',
    tags: ['energy', 'digestion', 'general'],
  },
  {
    title: 'Food journaling works',
    body: 'Consistent food tracking makes patterns much easier to spot — the more you log, the clearer your triggers become.',
    category: 'science',
    icon: 'journal',
    tags: ['digestion', 'bloating', 'general'],
  },
  {
    title: 'Polyphenol-rich foods',
    body: 'Dark chocolate, berries, green tea, and olive oil contain polyphenols that nourish gut bacteria.',
    category: 'nutrition',
    icon: 'color-palette',
    tags: ['inflammation', 'digestion', 'energy'],
  },
  {
    title: 'Antibiotics caution',
    body: "Antibiotics can affect your gut bacteria. If you're prescribed them, ask your doctor or pharmacist whether probiotics make sense for you.",
    category: 'science',
    icon: 'medical',
    tags: ['digestion', 'general'],
  },
  {
    title: 'Breathing for digestion',
    body: 'Box breathing (4-4-4-4) before meals activates your rest-and-digest nervous system.',
    category: 'mindfulness',
    icon: 'cloudy',
    tags: ['stress', 'digestion', 'bloating'],
  },
  {
    title: 'Reduce sugar intake',
    body: 'Diets high in added sugar are associated with shifts in gut microbial balance.',
    category: 'nutrition',
    icon: 'alert-circle',
    tags: ['inflammation', 'bloating', 'energy'],
  },
  {
    title: 'Cold exposure benefits',
    body: 'Some people find brief cold showers invigorating as part of a morning routine — listen to your body if you try them.',
    category: 'lifestyle',
    icon: 'snow',
    tags: ['inflammation', 'energy'],
  },
  {
    title: 'Omega-3 fatty acids',
    body: 'Fish, walnuts, and flaxseeds contain omega-3s, which may support a healthy inflammatory balance.',
    category: 'nutrition',
    icon: 'fish',
    tags: ['inflammation', 'digestion', 'general'],
  },
];

// ─── Mapping from profile values to tip tags ─────────────────────────────────

const GUT_CONCERN_TAG_MAP: Record<string, TipTag[]> = {
  bloating: ['bloating', 'digestion'],
  ibs: ['bloating', 'digestion', 'stress'],
  acid_reflux: ['digestion', 'inflammation'],
  constipation: ['digestion', 'hydration'],
  diarrhea: ['digestion', 'inflammation'],
  food_sensitivity: ['digestion', 'bloating', 'inflammation'],
  general: ['general', 'digestion'],
};

const GOAL_TAG_MAP: Record<string, TipTag[]> = {
  reduce_bloating: ['bloating', 'digestion'],
  improve_digestion: ['digestion', 'general'],
  more_energy: ['energy', 'sleep'],
  reduce_inflammation: ['inflammation', 'digestion'],
  better_sleep: ['sleep', 'energy'],
  stress_management: ['stress', 'general'],
  lose_weight: ['digestion', 'energy'],
  overall_wellness: ['general', 'digestion'],
};

function getDayOfYear(): number {
  return Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * Canonical value resolution
 *
 * The two maps above were written for an older onboarding whose stored values
 * were snake_case clinical terms ("bloating", "ibs", "reduce_bloating"). The
 * v1.0 flow stores Title Case option identifiers instead ("Bloated",
 * "Reduce bloating"), so an exact lookup matched NOTHING: every user fell
 * through to the generic tip and personalisation was silently dead.
 *
 * Two separate mismatches had to be fixed, not one:
 *   format     — snake_case keys vs "Title Case with spaces"
 *   vocabulary — the maps describe CONDITIONS (ibs, acid_reflux) while the
 *                feeling step records EXPERIENCES (Bloated, Heavy)
 *
 * Normalising alone recovers only the two goals that happen to land on an
 * existing key, so the canonical map below carries the shipped vocabulary and
 * is consulted first. The legacy maps remain the fallback, so any older row
 * keeps working untouched — this is a read-time fix with no migration, no
 * backfill and no change to persisted data.
 * ────────────────────────────────────────────────────────────────────────── */

/** Trim, lowercase, spaces to underscores. Safe on any string. */
export function canonicalKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '_');
}

/**
 * The values v1.0 onboarding actually stores, mapped to tip tags.
 *
 * Keys are the stable option identifiers, never the translated labels — 'Heavy'
 * renders as "Heavy or sluggish" in English and "Schwer oder träge" in German,
 * but the stored value is the same either way. Personalisation is therefore
 * identical in both languages.
 */
const CANONICAL_TAG_MAP: Record<string, TipTag[]> = {
  // Goal step
  reduce_bloating: ['bloating', 'digestion'],
  improve_digestion: ['digestion', 'general'],
  find_food_triggers: ['digestion', 'bloating'],
  improve_everyday_wellbeing: ['general', 'digestion'],
  // After-meal feeling step
  bloated: ['bloating', 'digestion'],
  heavy: ['digestion', 'general'],
  // Existing non-diagnostic tags only. Deliberately NOT mapped to anything
  // that would read as treating pain — the tip library is general wellness
  // content, and a pain-specific tag would imply advice this product does not
  // give. Without this entry resolveTags would silently skip "Pain" and the
  // user would get the untargeted fallback tip.
  pain: ['digestion', 'general'],
  comfortable: ['general'],
  it_varies: ['general'],
};

/**
 * Resolve one stored field to tip tags.
 *
 * gut_concern may hold several comma-separated feelings since the feeling step
 * became multi-select ("Bloated, Heavy"), so each part is resolved
 * independently — the same treatment photo-analysis.tsx already gives it.
 * Unknown parts contribute nothing rather than guessing.
 */
export function resolveTags(
  raw: string | null | undefined,
  legacyMap: Record<string, TipTag[]>,
): TipTag[] {
  if (!raw) return [];
  const resolved: TipTag[] = [];
  for (const part of raw.split(',')) {
    const key = canonicalKey(part);
    if (!key) continue;
    const tags = CANONICAL_TAG_MAP[key] ?? legacyMap[key];
    if (tags) resolved.push(...tags);
  }
  return resolved;
}

export function getTodaysTip(): WellnessTip {
  const dayOfYear = getDayOfYear();
  return TIPS[dayOfYear % TIPS.length];
}

export function getPersonalizedTip(
  gutConcern?: string | null,
  goal?: string | null,
): WellnessTip {
  // Build set of relevant tags from profile data
  const relevantTags = new Set<TipTag>();

  // The Set deduplicates: a user whose goal is "Reduce bloating" and whose
  // feeling is "Bloated" resolves the same tags twice, which must not skew
  // which tips are eligible.
  resolveTags(gutConcern, GUT_CONCERN_TAG_MAP).forEach(t => relevantTags.add(t));
  resolveTags(goal, GOAL_TAG_MAP).forEach(t => relevantTags.add(t));

  // No profile data or no matching mappings — fall back
  if (relevantTags.size === 0) {
    return getTodaysTip();
  }

  // Filter tips that have at least one matching tag
  const filtered = TIPS.filter(tip =>
    tip.tags.some(tag => relevantTags.has(tag)),
  );

  if (filtered.length === 0) {
    return getTodaysTip();
  }

  const dayOfYear = getDayOfYear();
  return filtered[dayOfYear % filtered.length];
}

export function getAllTips(): WellnessTip[] {
  return TIPS;
}

// ─── Localized copy ──────────────────────────────────────────────────────────
//
// TIPS above stays the single structural source of truth: order, category,
// icon and tags are what selection runs on, and none of it is translated.
// Only the two user-visible strings are localized, in a sidecar keyed by the
// SAME index, so a tip's identity never depends on its wording.
//
// English is derived from TIPS rather than restated, which makes it impossible
// for the English a user reads to drift from the English the selection tests
// assert against.

export type TipCopy = { title: string; body: string };

/** German copy, index-aligned with TIPS. Hedged wording is deliberate: these
 *  mirror the English hedging and must not be sharpened into causal claims. */
const TIPS_DE: TipCopy[] = [
  {
    title: 'Langsam kauen',
    body: 'Langsam essen und gründlich kauen kann manchen Menschen helfen, sich nach dem Essen wohler zu fühlen. Ziel sind 20–30 Kaubewegungen pro Bissen.',
  },
  {
    title: 'Wasser am Morgen',
    body: 'Ein Glas warmes Wasser direkt nach dem Aufstehen ist eine sanfte Art, deine Verdauung in Gang zu bringen.',
  },
  {
    title: 'Ballaststoff-Vielfalt',
    body: 'Eine große Bandbreite pflanzlicher Lebensmittel über die Woche — etwa 30 verschiedene — wird mit einer vielfältigeren Darmflora in Verbindung gebracht.',
  },
  {
    title: 'Stress & dein Darm',
    body: 'Die Darm-Hirn-Achse beschreibt, wie eng Stress und Verdauung zusammenhängen. Schon 5 Minuten tiefes Atmen können eine ruhige Pause sein.',
  },
  {
    title: 'Fermentierte Lebensmittel',
    body: 'Joghurt, Kimchi, Sauerkraut und Kefir bringen nützliche Bakterien mit, die deine Darmschleimhaut stärken.',
  },
  {
    title: 'Schlafqualität zählt',
    body: 'Schlechter Schlaf bringt die Darmflora schon innerhalb von 48 Stunden aus dem Gleichgewicht. Ziel sind 7–9 Stunden regelmäßiger Schlaf.',
  },
  {
    title: 'Nach dem Essen gehen',
    body: 'Ein Spaziergang von 10–15 Minuten nach dem Essen unterstützt die Verdauung — viele Menschen fühlen sich danach leichter.',
  },
  {
    title: 'Präbiotika',
    body: 'Knoblauch, Zwiebeln, Bananen und Hafer sind präbiotische Lebensmittel, die die Bakterien in deinem Darm unterstützen können.',
  },
  {
    title: 'Achtsam essen',
    body: 'Essen ohne Ablenkung kann es leichter machen, Sättigung wahrzunehmen — manche Menschen vertragen Mahlzeiten so besser.',
  },
  {
    title: 'Gesunde Darmbarriere',
    body: 'Zink, Vitamin D und Glutamin sind Nährstoffe, die mit der Gesundheit der Darmschleimhaut in Verbindung gebracht werden. Knochenbrühe ist eine natürliche Quelle.',
  },
  {
    title: 'Regelmäßigkeit hilft',
    body: 'Feste Essenszeiten trainieren deine Verdauung. Versuche, jeden Tag etwa zur gleichen Zeit zu essen.',
  },
  {
    title: 'Verarbeitetes reduzieren',
    body: 'Süßstoffe und Emulgatoren in stark verarbeiteten Lebensmitteln können deiner Darmflora schaden.',
  },
  {
    title: 'Bewegung hilft',
    body: 'Regelmäßige moderate Bewegung wird ebenfalls mit einer vielfältigeren Darmflora in Verbindung gebracht.',
  },
  {
    title: 'Ernährungstagebuch wirkt',
    body: 'Regelmäßiges Eintragen macht Muster deutlich leichter erkennbar — je mehr du erfasst, desto klarer treten deine Auslöser hervor.',
  },
  {
    title: 'Polyphenolreiche Lebensmittel',
    body: 'Zartbitterschokolade, Beeren, grüner Tee und Olivenöl enthalten Polyphenole, die deine Darmbakterien nähren.',
  },
  {
    title: 'Vorsicht bei Antibiotika',
    body: 'Antibiotika können deine Darmbakterien beeinflussen. Wenn dir welche verschrieben werden, frage deine Ärztin, deinen Arzt oder die Apotheke, ob Probiotika für dich sinnvoll sind.',
  },
  {
    title: 'Atmen für die Verdauung',
    body: 'Box-Atmung (4-4-4-4) vor dem Essen aktiviert dein Ruhe- und Verdauungsnervensystem.',
  },
  {
    title: 'Weniger Zucker',
    body: 'Eine Ernährung mit viel zugesetztem Zucker wird mit Veränderungen im mikrobiellen Gleichgewicht des Darms in Verbindung gebracht.',
  },
  {
    title: 'Kältereize',
    body: 'Manche Menschen empfinden kurze kalte Duschen als belebenden Teil ihrer Morgenroutine — höre auf deinen Körper, wenn du es ausprobierst.',
  },
  {
    title: 'Omega-3-Fettsäuren',
    body: 'Fisch, Walnüsse und Leinsamen enthalten Omega-3-Fettsäuren, die eine ausgewogene Entzündungsreaktion unterstützen können.',
  },
];

/** Both languages, index-aligned with TIPS. */
export const TIP_COPY: Record<AppLanguage, TipCopy[]> = {
  en: TIPS.map((tip) => ({ title: tip.title, body: tip.body })),
  de: TIPS_DE,
};

/**
 * The displayable copy for a tip in the given language.
 *
 * Selection returns elements of TIPS by reference, so the tip's position is
 * recoverable with indexOf — no id field, and no change to any selection
 * signature. An unknown tip or a short copy table falls back to the English
 * carried on the tip itself, so a missing translation degrades to readable
 * text rather than an empty card.
 */
export function getTipCopy(tip: WellnessTip, language: AppLanguage): TipCopy {
  const index = TIPS.indexOf(tip);
  const copy = index >= 0 ? TIP_COPY[language]?.[index] : undefined;
  return copy ?? { title: tip.title, body: tip.body };
}
