/**
 * Curated source registry for the health information GutWell presents.
 *
 * App Store Guideline 1.4.1 requires that health and medical information carry
 * citations that are easy for the user to find. This module is the single place
 * those citations live.
 *
 * HARD RULES — these are the point of the file:
 *
 * 1. STATIC AND CURATED. Every entry below is written by a human, reviewed, and
 *    committed. Nothing here is generated at runtime.
 *
 * 2. NEVER AI-GENERATED. A language model asked to cite will invent plausible
 *    DOIs and author lists. A fabricated citation in a health app is worse than
 *    no citation at all, so the model is never asked for one. See
 *    lib/analysis-sections.ts, whose sentence splitter also assumes the model
 *    writes plain prose — a citation inside AI output would truncate it.
 *
 * 3. SOURCES ARE NOT METHODOLOGY. Entries here back EXTERNAL health information
 *    only. GutWell's own scores and pattern analysis have no external source
 *    because we invented them; they are described under Methodology on the
 *    Sources screen instead. Attaching a citation to a proprietary score would
 *    be a fabricated appeal to authority.
 *
 * 4. INSTITUTIONAL FIRST. NHS / NICE / Monash / BDA are preferred over journal
 *    DOIs: stable URLs, plain language, and obviously authoritative to a
 *    reviewer and a reader alike.
 *
 * Every URL here was checked to resolve at the time of writing. If one rots,
 * replace or remove the entry — do not leave a dead citation in place.
 */

export type SourceCategory =
  | 'stool_form'
  | 'fermentable_carbs'
  | 'reflux_and_timing'
  | 'activity_and_digestion'
  | 'gut_brain_axis'
  | 'diet_diversity'
  | 'sleep'
  | 'general_wellness';

export type Source = {
  /** Stable id. Referenced by tips and by the Sources screen; never renumbered. */
  id: string;
  category: SourceCategory;
  title: string;
  /** Publishing body, or authors for a journal article. */
  organization: string;
  /** Publication year. Omitted for continuously-updated institutional pages. */
  year?: number;
  url: string;
  /**
   * Plain-language note: what KIND of information this source supports. Not a
   * summary of the source's findings — GutWell does not restate conclusions it
   * has not verified.
   */
  note: string;
};

export const SOURCES: readonly Source[] = [
  {
    id: 'bristol-1997',
    category: 'stool_form',
    title: 'Stool form scale as a useful guide to intestinal transit time',
    organization: 'Lewis SJ, Heaton KW — Scandinavian Journal of Gastroenterology',
    year: 1997,
    url: 'https://pubmed.ncbi.nlm.nih.gov/9299672/',
    note: 'The original description of the Bristol Stool Form Scale, the seven-type chart GutWell uses in the daily check-in.',
  },
  {
    id: 'nhs-constipation',
    category: 'stool_form',
    title: 'Constipation',
    organization: 'NHS',
    url: 'https://www.nhs.uk/conditions/constipation/',
    note: 'General plain-language information on bowel habit changes.',
  },
  {
    id: 'monash-fodmap',
    category: 'fermentable_carbs',
    title: 'About FODMAPs and IBS',
    organization: 'Monash University',
    url: 'https://www.monashfodmap.com/about-fodmap-and-ibs/',
    note: 'Background on fermentable carbohydrates, which informs the general comfort suggestions GutWell may mention for gas-forming foods.',
  },
  {
    id: 'nice-cg61',
    category: 'fermentable_carbs',
    title: 'Irritable bowel syndrome in adults: diagnosis and management (CG61)',
    organization: 'National Institute for Health and Care Excellence (NICE)',
    url: 'https://www.nice.org.uk/guidance/cg61',
    note: 'Clinical guidance on diet and symptom management. GutWell is not a clinical tool; this is background for the general dietary comfort language it uses.',
  },
  {
    id: 'nhs-bloating',
    category: 'fermentable_carbs',
    title: 'Bloating',
    organization: 'NHS',
    url: 'https://www.nhs.uk/conditions/bloating/',
    note: 'General information on bloating and everyday factors associated with it.',
  },
  {
    id: 'nhs-heartburn',
    category: 'reflux_and_timing',
    title: 'Heartburn and acid reflux',
    organization: 'NHS',
    url: 'https://www.nhs.uk/conditions/heartburn-and-acid-reflux/',
    note: 'Background on meal size, timing and lying down after eating, which informs GutWell context suggestions about evening meals.',
  },
  {
    id: 'nhs-exercise',
    category: 'activity_and_digestion',
    title: 'Physical activity guidelines for adults',
    organization: 'NHS',
    url: 'https://www.nhs.uk/live-well/exercise/exercise-guidelines/physical-activity-guidelines-for-adults-aged-19-to-64/',
    note: 'General activity guidance. GutWell references movement after eating only as a comfort suggestion, never as treatment.',
  },
  {
    id: 'mayer-2011',
    category: 'gut_brain_axis',
    title: 'Gut feelings: the emerging biology of gut–brain communication',
    organization: 'Mayer EA — Nature Reviews Neuroscience',
    year: 2011,
    url: 'https://pubmed.ncbi.nlm.nih.gov/21750565/',
    note: 'Review of the gut–brain axis. Background for why GutWell records mood alongside digestive symptoms.',
  },
  {
    id: 'american-gut-2018',
    category: 'diet_diversity',
    title: 'American Gut: an Open Platform for Citizen Science Microbiome Research',
    organization: 'McDonald D et al. — mSystems',
    year: 2018,
    url: 'https://pubmed.ncbi.nlm.nih.gov/29795809/',
    note: 'Large observational study reporting an association between the number of different plant foods eaten and gut microbiome diversity.',
  },
  {
    id: 'bda-ibs-diet',
    category: 'general_wellness',
    title: 'Irritable Bowel Syndrome and Diet — Food Fact Sheet',
    organization: 'British Dietetic Association (BDA)',
    url: 'https://www.bda.uk.com/resource/irritable-bowel-syndrome-diet.html',
    note: 'Dietitian-reviewed overview of everyday eating patterns and digestive comfort.',
  },
  {
    id: 'nhs-eat-well',
    category: 'general_wellness',
    title: 'Eat well',
    organization: 'NHS',
    url: 'https://www.nhs.uk/live-well/eat-well/',
    note: 'General everyday eating guidance, including variety and fibre.',
  },
  {
    id: 'exercise-microbiome-2014',
    category: 'activity_and_digestion',
    title: 'Exercise and associated dietary extremes impact on gut microbial diversity',
    organization: 'Clarke SF et al. — Gut',
    year: 2014,
    url: 'https://pubmed.ncbi.nlm.nih.gov/25021423/',
    note: 'Study reporting an association between exercise and gut microbial diversity. An association, not a demonstrated cause.',
  },
  {
    id: 'sleep-microbiome-2019',
    category: 'sleep',
    title: 'Gut microbiome diversity is associated with sleep physiology in humans',
    organization: 'Smith RP et al. — PLOS ONE',
    year: 2019,
    url: 'https://pubmed.ncbi.nlm.nih.gov/31589627/',
    note: 'Observational study reporting an association between sleep measures and gut microbiome diversity. An association, not a demonstrated cause.',
  },
  {
    id: 'nhs-sleep',
    category: 'sleep',
    title: 'Sleep and tiredness',
    organization: 'NHS',
    url: 'https://www.nhs.uk/live-well/sleep-and-tiredness/',
    note: 'General sleep guidance. GutWell records sleep-related context but makes no claim about its effect on digestion.',
  },
] as const;

export type SourceId = (typeof SOURCES)[number]['id'];

/** All sources in a category, in registry order. */
export function sourcesByCategory(category: SourceCategory): Source[] {
  return SOURCES.filter((s) => s.category === category);
}

/** Look up one source by id. Returns null rather than throwing on a bad id. */
export function sourceById(id: string): Source | null {
  return SOURCES.find((s) => s.id === id) ?? null;
}

/** Category display order on the Sources screen. */
export const SOURCE_CATEGORY_ORDER: readonly SourceCategory[] = [
  'stool_form',
  'fermentable_carbs',
  'reflux_and_timing',
  'activity_and_digestion',
  'diet_diversity',
  'sleep',
  'gut_brain_axis',
  'general_wellness',
] as const;
