export type WellnessTip = {
  title: string;
  body: string;
  category: 'nutrition' | 'lifestyle' | 'science' | 'mindfulness';
  icon: string;
};

const TIPS: WellnessTip[] = [
  {
    title: 'Chew slowly',
    body: 'Chewing food thoroughly reduces bloating and improves nutrient absorption. Aim for 20-30 chews per bite.',
    category: 'nutrition',
    icon: 'time',
  },
  {
    title: 'Morning hydration',
    body: 'Drinking a glass of warm water first thing helps stimulate your digestive system and flush toxins.',
    category: 'lifestyle',
    icon: 'water',
  },
  {
    title: 'Fiber diversity',
    body: 'Eating 30 different plant foods per week dramatically increases gut microbiome diversity.',
    category: 'nutrition',
    icon: 'nutrition',
  },
  {
    title: 'Stress & your gut',
    body: 'The gut-brain axis means stress directly impacts digestion. Even 5 minutes of deep breathing helps.',
    category: 'science',
    icon: 'brain',
  },
  {
    title: 'Fermented foods',
    body: 'Yogurt, kimchi, sauerkraut, and kefir introduce beneficial bacteria that strengthen your gut lining.',
    category: 'nutrition',
    icon: 'flask',
  },
  {
    title: 'Sleep quality matters',
    body: 'Poor sleep disrupts your gut microbiome within 48 hours. Aim for 7-9 hours of consistent sleep.',
    category: 'lifestyle',
    icon: 'moon',
  },
  {
    title: 'Walk after meals',
    body: 'A 10-15 minute walk after eating improves digestion and can reduce blood sugar spikes by 30%.',
    category: 'lifestyle',
    icon: 'walk',
  },
  {
    title: 'Prebiotic power',
    body: 'Garlic, onions, bananas, and oats feed your good bacteria. They are fuel for a healthy microbiome.',
    category: 'nutrition',
    icon: 'leaf',
  },
  {
    title: 'Mindful eating',
    body: 'Eating without distractions helps your body properly signal fullness and improves nutrient absorption.',
    category: 'mindfulness',
    icon: 'eye',
  },
  {
    title: 'Gut barrier health',
    body: 'Zinc, vitamin D, and glutamine support your intestinal lining. Consider bone broth as a natural source.',
    category: 'science',
    icon: 'shield',
  },
  {
    title: 'Consistency is key',
    body: 'Regular meal times train your digestive system. Try to eat at roughly the same times each day.',
    category: 'lifestyle',
    icon: 'calendar',
  },
  {
    title: 'Limit processed foods',
    body: 'Artificial sweeteners and emulsifiers in ultra-processed foods can harm your gut microbiome.',
    category: 'nutrition',
    icon: 'warning',
  },
  {
    title: 'Exercise helps',
    body: 'Regular moderate exercise increases gut microbiome diversity even more than diet alone.',
    category: 'lifestyle',
    icon: 'fitness',
  },
  {
    title: 'Food journaling works',
    body: 'People who track their food consistently are 2x more likely to identify their trigger foods.',
    category: 'science',
    icon: 'journal',
  },
  {
    title: 'Polyphenol-rich foods',
    body: 'Dark chocolate, berries, green tea, and olive oil contain polyphenols that nourish gut bacteria.',
    category: 'nutrition',
    icon: 'color-palette',
  },
  {
    title: 'Antibiotics caution',
    body: 'One course of antibiotics can reduce gut diversity for up to a year. Always follow with probiotics.',
    category: 'science',
    icon: 'medical',
  },
  {
    title: 'Breathing for digestion',
    body: 'Box breathing (4-4-4-4) before meals activates your rest-and-digest nervous system.',
    category: 'mindfulness',
    icon: 'cloudy',
  },
  {
    title: 'Reduce sugar intake',
    body: 'Excess sugar feeds harmful bacteria and yeast in your gut, disrupting microbial balance.',
    category: 'nutrition',
    icon: 'alert-circle',
  },
  {
    title: 'Cold exposure benefits',
    body: 'Brief cold showers may reduce gut inflammation and improve immune function over time.',
    category: 'lifestyle',
    icon: 'snow',
  },
  {
    title: 'Omega-3 fatty acids',
    body: 'Fish, walnuts, and flaxseeds contain omega-3s that reduce gut inflammation and support lining health.',
    category: 'nutrition',
    icon: 'fish',
  },
];

export function getTodaysTip(): WellnessTip {
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000
  );
  return TIPS[dayOfYear % TIPS.length];
}

export function getAllTips(): WellnessTip[] {
  return TIPS;
}
