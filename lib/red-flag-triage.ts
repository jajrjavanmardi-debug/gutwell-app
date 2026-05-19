import { type AppLanguage } from './app-language';

export type RedFlagWarningCopy = {
  title: string;
  message: string;
  actionLabel: string;
};

export type RedFlagTriageResult = {
  hasRedFlag: boolean;
  matchedFlags: string[];
};

const WARNING_COPY: Record<AppLanguage, RedFlagWarningCopy> = {
  en: {
    title: 'Medical care is the safer next step',
    message:
      'NutriFlow is not appropriate for this situation, so normal food analysis and tips are paused. These symptoms may need medical assessment. If symptoms are severe, worsening, or feel urgent, seek medical care now. In Germany, call 112 for emergencies; elsewhere contact local emergency services or urgent care.',
    actionLabel: 'Understood',
  },
  de: {
    title: 'Medizinische Hilfe ist jetzt sicherer',
    message:
      'NutriFlow ist für diese Situation nicht geeignet, daher sind normale Essensanalysen und Tipps pausiert. Diese Symptome sollten medizinisch abgeklärt werden. Wenn die Beschwerden stark sind, zunehmen oder dringend wirken, suche jetzt medizinische Hilfe. In Deutschland rufe im Notfall 112 an; außerhalb Deutschlands kontaktiere den örtlichen Notruf oder eine Notfallpraxis.',
    actionLabel: 'Verstanden',
  },
  fa: {
    title: 'کمک پزشکی گزینه امن‌تری است',
    message:
      'NutriFlow برای این وضعیت مناسب نیست، بنابراین تحلیل معمول غذا و نکات عادی متوقف می‌شود. این علائم ممکن است نیاز به بررسی پزشکی داشته باشند. اگر علائم شدید، رو به بدتر شدن یا فوری به نظر می‌رسند، همین حالا کمک پزشکی بگیرید. در آلمان برای وضعیت اورژانسی با 112 تماس بگیرید؛ در کشورهای دیگر با اورژانس محلی یا مرکز درمان فوری تماس بگیرید.',
    actionLabel: 'متوجه شدم',
  },
};

const RED_FLAG_PATTERNS: { key: string; patterns: RegExp[] }[] = [
  {
    key: 'bloodInStool',
    patterns: [
      /\bblood(?:y)?\s+(?:in|with|on)?\s*(?:the\s*)?(?:stool|poop|bowel|faeces|feces)\b/,
      /\brectal\s+bleeding\b/,
      /\bblack\s+(?:tarry\s+)?stool\b/,
      /\bblut\s+(?:im|in|am)\s+stuhl\b/,
      /\bblutiger\s+stuhl\b/,
      /\bteerstuhl\b/,
      /خون\s*(?:در|توی|تو|داخل)?\s*مدفوع/,
      /مدفوع\s*خونی/,
      /خونریزی\s*مقعد/,
      /مدفوع\s*سیاه/,
    ],
  },
  {
    key: 'unexplainedWeightLoss',
    patterns: [
      /\b(?:unexplained|unintentional|without\s+trying)\s+weight\s+loss\b/,
      /\bweight\s+loss\s+(?:without\s+trying|for\s+no\s+reason)\b/,
      /\b(?:unerklärlicher|unerklaerlicher|ungewollter|unbeabsichtigter)\s+gewichtsverlust\b/,
      /کاهش\s*وزن\s*(?:بیدلیل|بی دلیل|بدون دلیل|ناخواسته|غیرعمدی)/,
    ],
  },
  {
    key: 'severeAbdominalPain',
    patterns: [
      /\b(?:severe|intense|unbearable|worst)\s+(?:abdominal|stomach|belly)\s+pain\b/,
      /\b(?:abdominal|stomach|belly)\s+pain\s+(?:is\s+)?(?:severe|intense|unbearable)\b/,
      /\b(?:starke|sehr\s+starke|unerträgliche|unertraegliche)\s+(?:bauchschmerzen|magenschmerzen)\b/,
      /درد\s*شدید\s*(?:شکم|معده)/,
      /شکم\s*درد\s*شدید/,
      /دل\s*درد\s*شدید/,
    ],
  },
  {
    key: 'persistentFever',
    patterns: [
      /\b(?:persistent|ongoing|lasting|high)\s+fever\b/,
      /\bfever\s+(?:for\s+days|that\s+won'?t\s+go\s+away|keeps\s+coming\s+back)\b/,
      /\b(?:anhaltendes|dauerhaftes|hohes)\s+fieber\b/,
      /تب\s*(?:مداوم|پایدار|طولانی|شدید)/,
    ],
  },
  {
    key: 'nighttimeDiarrhea',
    patterns: [
      /\b(?:nighttime|night-time|nocturnal)\s+diarrh(?:ea|oea)\b/,
      /\bdiarrh(?:ea|oea)\s+(?:at\s+night|overnight|during\s+the\s+night)\b/,
      /\b(?:nächtlicher|naechtlicher)\s+durchfall\b/,
      /\bdurchfall\s+(?:nachts|in\s+der\s+nacht)\b/,
      /اسهال\s*(?:شبانه|در شب|نیمه شب)/,
    ],
  },
  {
    key: 'repeatedVomiting',
    patterns: [
      /\b(?:repeated|repeatedly|constant|persistent)\s+vomit(?:ing)?\b/,
      /\bvomit(?:ing|ed)?\s+(?:repeatedly|again\s+and\s+again|many\s+times)\b/,
      /\b(?:can'?t|cannot)\s+keep\s+(?:water|fluids|liquids)\s+down\b/,
      /\b(?:wiederholtes|ständiges|staendiges|anhaltendes)\s+erbrechen\b/,
      /\bmehrmals\s+erbrochen\b/,
      /استفراغ\s*(?:مکرر|پیاپی|شدید|مدام)/,
      /بالا\s*آوردن\s*(?:مکرر|پیاپی|مدام)/,
      /نمی\s*توانم\s*(?:آب|مایعات)\s*(?:را)?\s*نگه\s*دارم/,
    ],
  },
  {
    key: 'severeAllergicReaction',
    patterns: [
      /\b(?:severe\s+)?allergic\s+reaction\b/,
      /\banaphylaxis\b/,
      /\bswelling\s+(?:of\s+)?(?:lips|tongue|throat|face)\b/,
      /\b(?:schwere\s+)?allergische\s+reaktion\b/,
      /\banaphylaxie\b/,
      /\b(?:geschwollene|schwellung)\s+(?:lippen|zunge|hals|rachen|gesicht)\b/,
      /واکنش\s*آلرژیک\s*شدید/,
      /آنافیلاکسی/,
      /تورم\s*(?:لب|زبان|گلو|صورت)/,
    ],
  },
  {
    key: 'troubleBreathing',
    patterns: [
      /\b(?:trouble|difficulty|hard\s+time)\s+breathing\b/,
      /\bshortness\s+of\s+breath\b/,
      /\bcan'?t\s+breathe\b/,
      /\batemnot\b/,
      /\b(?:probleme|schwierigkeiten)\s+beim\s+atmen\b/,
      /تنگی\s*نفس/,
      /نفس\s*تنگی/,
      /مشکل\s*(?:در)?\s*تنفس/,
      /نمی\s*توانم\s*نفس\s*بکشم/,
    ],
  },
  {
    key: 'faintingOrSevereWeakness',
    patterns: [
      /\bfaint(?:ing|ed)?\b/,
      /\bpass(?:ed|ing)?\s+out\b/,
      /\bsevere\s+weakness\b/,
      /\bohnmacht\b/,
      /\bbewusstlos(?:igkeit)?\b/,
      /\bstarke\s+schwäche\b/,
      /\bstarke\s+schwaeche\b/,
      /غش/,
      /بیهوشی/,
      /ضعف\s*شدید/,
    ],
  },
  {
    key: 'redFlagOption',
    patterns: [/red[_ -]?flag/, /urgent[_ -]?symptom/, /medical[_ -]?care[_ -]?symptom/],
  },
];

function normalizeRedFlagText(input: string): string {
  return input
    .toLocaleLowerCase()
    .normalize('NFKC')
    .replace(/[ً-ٰٟ]/g, '')
    .replace(/[‌‎‏]/g, '')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/ۀ/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim();
}

function stringifyTriageInput(input: string | readonly (string | null | undefined)[] | null | undefined): string {
  if (!input) return '';
  if (typeof input === 'string') return input;
  return input.filter(Boolean).join(' ');
}

export function detectRedFlagSymptoms(
  input: string | readonly (string | null | undefined)[] | null | undefined,
): RedFlagTriageResult {
  const normalized = normalizeRedFlagText(stringifyTriageInput(input));
  if (!normalized) return { hasRedFlag: false, matchedFlags: [] };

  const matchedFlags = RED_FLAG_PATTERNS
    .filter(({ patterns }) => patterns.some((pattern) => pattern.test(normalized)))
    .map(({ key }) => key);

  return {
    hasRedFlag: matchedFlags.length > 0,
    matchedFlags,
  };
}

export function getRedFlagWarning(language: AppLanguage): RedFlagWarningCopy {
  return WARNING_COPY[language] ?? WARNING_COPY.en;
}

export class RedFlagTriageError extends Error {
  readonly triage: RedFlagTriageResult;

  constructor(language: AppLanguage, triage: RedFlagTriageResult) {
    super(getRedFlagWarning(language).message);
    this.name = 'RedFlagTriageError';
    this.triage = triage;
  }
}
