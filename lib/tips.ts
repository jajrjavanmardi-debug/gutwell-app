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
    body: 'Chewing food thoroughly reduces bloating and improves nutrient absorption. Aim for 20-30 chews per bite.',
    category: 'nutrition',
    icon: 'time',
    tags: ['bloating', 'digestion', 'general'],
  },
  {
    title: 'Morning hydration',
    body: 'Drinking a glass of warm water first thing helps stimulate your digestive system and flush toxins.',
    category: 'lifestyle',
    icon: 'water',
    tags: ['hydration', 'digestion', 'general'],
  },
  {
    title: 'Fiber diversity',
    body: 'Eating 30 different plant foods per week dramatically increases gut microbiome diversity.',
    category: 'nutrition',
    icon: 'nutrition',
    tags: ['digestion', 'general'],
  },
  {
    title: 'Stress & your gut',
    body: 'The gut-brain axis means stress directly impacts digestion. Even 5 minutes of deep breathing helps.',
    category: 'science',
    icon: 'brain',
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
    body: 'A 10-15 minute walk after eating improves digestion and can reduce blood sugar spikes by 30%.',
    category: 'lifestyle',
    icon: 'walk',
    tags: ['digestion', 'bloating', 'energy'],
  },
  {
    title: 'Prebiotic power',
    body: 'Garlic, onions, bananas, and oats feed your good bacteria. They are fuel for a healthy microbiome.',
    category: 'nutrition',
    icon: 'leaf',
    tags: ['digestion', 'general'],
  },
  {
    title: 'Mindful eating',
    body: 'Eating without distractions helps your body properly signal fullness and improves nutrient absorption.',
    category: 'mindfulness',
    icon: 'eye',
    tags: ['bloating', 'digestion', 'stress'],
  },
  {
    title: 'Gut barrier health',
    body: 'Zinc, vitamin D, and glutamine support your intestinal lining. Consider bone broth as a natural source.',
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
    body: 'Regular moderate exercise increases gut microbiome diversity even more than diet alone.',
    category: 'lifestyle',
    icon: 'fitness',
    tags: ['energy', 'digestion', 'general'],
  },
  {
    title: 'Food journaling works',
    body: 'People who track their food consistently are 2x more likely to identify their trigger foods.',
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
    body: 'One course of antibiotics can reduce gut diversity for up to a year. Always follow with probiotics.',
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
    body: 'Excess sugar feeds harmful bacteria and yeast in your gut, disrupting microbial balance.',
    category: 'nutrition',
    icon: 'alert-circle',
    tags: ['inflammation', 'bloating', 'energy'],
  },
  {
    title: 'Cold exposure benefits',
    body: 'Brief cold showers may reduce gut inflammation and improve immune function over time.',
    category: 'lifestyle',
    icon: 'snow',
    tags: ['inflammation', 'energy'],
  },
  {
    title: 'Omega-3 fatty acids',
    body: 'Fish, walnuts, and flaxseeds contain omega-3s that reduce gut inflammation and support lining health.',
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

  if (gutConcern) {
    const tags = GUT_CONCERN_TAG_MAP[gutConcern.toLowerCase()];
    tags?.forEach(t => relevantTags.add(t));
  }

  if (goal) {
    const tags = GOAL_TAG_MAP[goal.toLowerCase()];
    tags?.forEach(t => relevantTags.add(t));
  }

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
