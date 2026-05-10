import type { AppLanguage } from '../contexts/LanguageContext';

export type OnboardingQuestionKey =
  | 'meal_feeling'
  | 'bloating_frequency'
  | 'social_impact'
  | 'energy_after_lunch'
  | 'sleep_quality'
  | 'food_knowledge'
  | 'goal';

export type OnboardingProfileKey =
  | 'reactive'
  | 'sensitive'
  | 'energyDepleted'
  | 'optimisation';

export type OnboardingOption = {
  value: string;
  label: string;
  emoji: string;
};

export type OnboardingQuestion = {
  key: OnboardingQuestionKey;
  question: string;
  subtitle: string | null;
  options: OnboardingOption[];
};

type FeatureIcon =
  | 'analytics-outline'
  | 'restaurant-outline'
  | 'trending-up-outline'
  | 'shield-checkmark-outline';

export const ONBOARDING_COPY = {
  en: {
    welcome: {
      languageTitle: 'Choose your language',
      languageSubtitle: 'Your onboarding will update instantly.',
      taglines: [
        'Understand your gut.',
        'Find your triggers.',
        'Reduce symptoms.',
        'Track what matters.',
        'Feel your best.',
      ],
      primaryButton: 'Build My Gut Plan',
      signInPrompt: 'Already have an account? ',
      signInLink: 'Sign in',
    },
    features: {
      continue: 'Continue',
      finalButton: "Let's Personalise",
      slides: [
        {
          icon: 'analytics-outline' as FeatureIcon,
          title: 'Your Daily Gut Score',
          description:
            'Every check-in generates a personal gut score. Watch it climb as you learn what works for your body.',
        },
        {
          icon: 'restaurant-outline' as FeatureIcon,
          title: 'Connect Food & Symptoms',
          description:
            'Log meals and discover which foods trigger discomfort and which ones make you thrive — with real data.',
        },
        {
          icon: 'trending-up-outline' as FeatureIcon,
          title: 'Spot Patterns Instantly',
          description:
            'Our engine connects the dots between your food, mood, sleep, and symptoms so you never have to guess again.',
        },
        {
          icon: 'shield-checkmark-outline' as FeatureIcon,
          title: 'Your Privacy, Protected',
          description:
            'Your gut data is sensitive. It stays encrypted, on your terms. We never sell your health information.',
        },
      ],
    },
    about: {
      label: 'ABOUT YOU',
      title: 'What should we\ncall you?',
      subtitle: "We'll personalise your gut health journey\naround you.",
      placeholder: 'Your first name',
      continue: 'Continue',
    },
    questions: {
      count: (current: number, total: number) => `Question ${current} of ${total}`,
      items: [
        {
          key: 'meal_feeling',
          question: 'How do you feel after most meals?',
          subtitle: 'Be honest — think about your last 7 days.',
          options: [
            { value: 'bloated_uncomfortable', label: 'Bloated or uncomfortable', emoji: '😩' },
            { value: 'unpredictable', label: 'Unpredictable — sometimes fine, sometimes not', emoji: '😕' },
            { value: 'mostly_okay', label: 'Mostly okay, occasionally off', emoji: '😐' },
            { value: 'comfortable', label: 'Generally comfortable', emoji: '😊' },
          ],
        },
        {
          key: 'bloating_frequency',
          question: 'How often do you deal with bloating or gas?',
          subtitle: null,
          options: [
            { value: 'daily', label: 'Every single day', emoji: '😮‍💨' },
            { value: 'few_times_week', label: 'A few times a week', emoji: '😤' },
            { value: 'occasionally', label: 'Occasionally', emoji: '🤷' },
            { value: 'rarely', label: 'Rarely or never', emoji: '✅' },
          ],
        },
        {
          key: 'social_impact',
          question: 'Has your gut ever held you back from enjoying something?',
          subtitle: 'A meal out, travel, a social event — anything.',
          options: [
            { value: 'regularly', label: 'Yes, it affects my life regularly', emoji: '😔' },
            { value: 'plan_around', label: 'Sometimes I plan around it', emoji: '🗓️' },
            { value: 'once_twice', label: 'Once or twice', emoji: '🤔' },
            { value: 'not_really', label: 'Not really', emoji: '👋' },
          ],
        },
        {
          key: 'energy_after_lunch',
          question: 'How do you feel 1–2 hours after eating?',
          subtitle: 'Your digestion directly impacts your energy levels.',
          options: [
            { value: 'crash', label: 'I crash — need caffeine or a rest', emoji: '😴' },
            { value: 'slump', label: 'Noticeable slump but I push through', emoji: '😪' },
            { value: 'slight_dip', label: 'Slight dip, nothing major', emoji: '😑' },
            { value: 'energised', label: 'I feel energised and clear', emoji: '⚡' },
          ],
        },
        {
          key: 'sleep_quality',
          question: 'How well do you sleep most nights?',
          subtitle: 'Poor gut health is one of the leading causes of disrupted sleep.',
          options: [
            { value: 'poor', label: 'Poorly — I wake up or feel unrested', emoji: '🌙' },
            { value: 'broken', label: 'Light or broken sleep', emoji: '😶' },
            { value: 'decent', label: 'Decent, with some off nights', emoji: '🙂' },
            { value: 'well', label: 'I sleep well consistently', emoji: '💤' },
          ],
        },
        {
          key: 'food_knowledge',
          question: 'Do you know which specific foods trigger your symptoms?',
          subtitle: 'Most people with gut issues have no idea — yet.',
          options: [
            { value: 'no_idea', label: 'I have no idea', emoji: '❓' },
            { value: 'suspect', label: "I suspect a few but can't be sure", emoji: '🔍' },
            { value: 'narrowed', label: "I've narrowed it down somewhat", emoji: '📋' },
            { value: 'know', label: 'I know my triggers well', emoji: '✅' },
          ],
        },
        {
          key: 'goal',
          question: 'What matters most to you right now?',
          subtitle: "We'll personalise your plan around this.",
          options: [
            { value: 'eat_freely', label: 'Eat freely without fear or consequences', emoji: '🍽️' },
            { value: 'identify_triggers', label: 'Finally identify my food triggers', emoji: '🎯' },
            { value: 'consistent_energy', label: 'Have consistent energy all day', emoji: '⚡' },
            { value: 'gut_habits', label: 'Build better gut health habits', emoji: '🌿' },
          ],
        },
      ] as OnboardingQuestion[],
    },
    analysing: {
      title: 'Analysing your answers',
      steps: [
        'Reviewing your gut profile...',
        'Identifying your symptom patterns...',
        'Mapping your food-energy connections...',
        'Building your personalised plan...',
      ],
    },
    results: {
      profileLabel: 'YOUR GUT HEALTH PROFILE',
      nextTitle: 'WHAT HAPPENS NEXT',
      goalPrefix: 'Your goal: ',
      cta: "I'm Ready to Start",
      profiles: {
        reactive: {
          type: 'Reactive Gut',
          description:
            'Your gut reacts strongly to food and stress — often leaving you drained. The good news: reactive guts respond fast to the right changes.',
        },
        sensitive: {
          type: 'Sensitive Gut',
          description:
            "Your gut is sensitive, but without knowing your triggers you're flying blind. Just 14 days of tracking will change everything.",
        },
        energyDepleted: {
          type: 'Energy-Depleted',
          description:
            'Your gut-energy connection is disrupted. What you eat is directly affecting how you feel and perform. NutriFlow will show you exactly how.',
        },
        optimisation: {
          type: 'Optimisation Mode',
          description:
            "Your gut is in decent shape — you're here to fine-tune, eliminate subtle triggers, and operate at your peak. Smart move.",
        },
      },
      nextSteps: [
        'Your gut score recalculates with every check-in',
        'Food-symptom patterns emerge after 7 days',
        "Weekly digests show what's changing and why",
      ],
    },
    notifications: {
      title: 'Never miss your\ngut check-in',
      subtitle:
        'Daily reminders keep your streak alive and your data accurate — 60 seconds a day, every day.',
      allow: 'Enable Notifications',
      skip: 'Skip for now',
      celebrationTitle: "You're all set!",
      celebrationSubtitle: 'Your gut health journey starts now',
      benefits: [
        { icon: 'time-outline' as const, text: 'Daily check-in reminder at your chosen time' },
        { icon: 'flame-outline' as const, text: 'Streak alerts so you never lose progress' },
        { icon: 'trending-up-outline' as const, text: 'Weekly digest delivered every Sunday' },
      ],
    },
  },
  de: {
    welcome: {
      languageTitle: 'Sprache wählen',
      languageSubtitle: 'Das Onboarding aktualisiert sich sofort.',
      taglines: [
        'Verstehe deinen Darm.',
        'Finde deine Trigger.',
        'Reduziere Symptome.',
        'Tracke, was zählt.',
        'Fühl dich besser.',
      ],
      primaryButton: 'Meinen Darmplan erstellen',
      signInPrompt: 'Du hast schon ein Konto? ',
      signInLink: 'Einloggen',
    },
    features: {
      continue: 'Weiter',
      finalButton: 'Personalisieren',
      slides: [
        {
          icon: 'analytics-outline' as FeatureIcon,
          title: 'Dein täglicher Darm-Score',
          description:
            'Jeder Check-in erstellt deinen persönlichen Darm-Score. Sieh, wie er steigt, während du lernst, was deinem Körper hilft.',
        },
        {
          icon: 'restaurant-outline' as FeatureIcon,
          title: 'Essen & Symptome verbinden',
          description:
            'Logge Mahlzeiten und erkenne mit echten Daten, welche Lebensmittel Beschwerden auslösen und welche dir guttun.',
        },
        {
          icon: 'trending-up-outline' as FeatureIcon,
          title: 'Muster sofort erkennen',
          description:
            'Unsere Logik verbindet Essen, Stimmung, Schlaf und Symptome, damit du nicht länger raten musst.',
        },
        {
          icon: 'shield-checkmark-outline' as FeatureIcon,
          title: 'Deine Daten bleiben privat',
          description:
            'Darmdaten sind sensibel. Sie bleiben geschützt und unter deiner Kontrolle. Wir verkaufen keine Gesundheitsdaten.',
        },
      ],
    },
    about: {
      label: 'ÜBER DICH',
      title: 'Wie dürfen wir\ndich nennen?',
      subtitle: 'Wir personalisieren deine Darmgesundheitsreise\nrund um dich.',
      placeholder: 'Dein Vorname',
      continue: 'Weiter',
    },
    questions: {
      count: (current: number, total: number) => `Frage ${current} von ${total}`,
      items: [
        {
          key: 'meal_feeling',
          question: 'Wie fühlst du dich nach den meisten Mahlzeiten?',
          subtitle: 'Sei ehrlich — denk an die letzten 7 Tage.',
          options: [
            { value: 'bloated_uncomfortable', label: 'Aufgebläht oder unwohl', emoji: '😩' },
            { value: 'unpredictable', label: 'Unberechenbar — manchmal gut, manchmal nicht', emoji: '😕' },
            { value: 'mostly_okay', label: 'Meist okay, gelegentlich daneben', emoji: '😐' },
            { value: 'comfortable', label: 'Meistens angenehm', emoji: '😊' },
          ],
        },
        {
          key: 'bloating_frequency',
          question: 'Wie oft hast du Blähungen oder Gas?',
          subtitle: null,
          options: [
            { value: 'daily', label: 'Jeden einzelnen Tag', emoji: '😮‍💨' },
            { value: 'few_times_week', label: 'Mehrmals pro Woche', emoji: '😤' },
            { value: 'occasionally', label: 'Gelegentlich', emoji: '🤷' },
            { value: 'rarely', label: 'Selten oder nie', emoji: '✅' },
          ],
        },
        {
          key: 'social_impact',
          question: 'Hat dein Darm dich schon davon abgehalten, etwas zu genießen?',
          subtitle: 'Essen gehen, Reisen, ein Treffen — alles zählt.',
          options: [
            { value: 'regularly', label: 'Ja, es beeinflusst mein Leben regelmäßig', emoji: '😔' },
            { value: 'plan_around', label: 'Manchmal plane ich darum herum', emoji: '🗓️' },
            { value: 'once_twice', label: 'Ein- oder zweimal', emoji: '🤔' },
            { value: 'not_really', label: 'Eher nicht', emoji: '👋' },
          ],
        },
        {
          key: 'energy_after_lunch',
          question: 'Wie fühlst du dich 1–2 Stunden nach dem Essen?',
          subtitle: 'Deine Verdauung beeinflusst direkt dein Energielevel.',
          options: [
            { value: 'crash', label: 'Ich breche ein — brauche Kaffee oder Pause', emoji: '😴' },
            { value: 'slump', label: 'Deutliches Tief, aber ich mache weiter', emoji: '😪' },
            { value: 'slight_dip', label: 'Leichter Dip, nichts Großes', emoji: '😑' },
            { value: 'energised', label: 'Ich fühle mich energiegeladen und klar', emoji: '⚡' },
          ],
        },
        {
          key: 'sleep_quality',
          question: 'Wie gut schläfst du meistens?',
          subtitle: 'Eine belastete Darmgesundheit kann Schlaf stark stören.',
          options: [
            { value: 'poor', label: 'Schlecht — ich wache auf oder bin nicht erholt', emoji: '🌙' },
            { value: 'broken', label: 'Leichter oder unterbrochener Schlaf', emoji: '😶' },
            { value: 'decent', label: 'Ordentlich, mit einigen schlechten Nächten', emoji: '🙂' },
            { value: 'well', label: 'Ich schlafe konstant gut', emoji: '💤' },
          ],
        },
        {
          key: 'food_knowledge',
          question: 'Weißt du, welche Lebensmittel deine Symptome auslösen?',
          subtitle: 'Die meisten mit Darmproblemen wissen es noch nicht — noch.',
          options: [
            { value: 'no_idea', label: 'Ich habe keine Ahnung', emoji: '❓' },
            { value: 'suspect', label: 'Ich vermute ein paar, bin aber nicht sicher', emoji: '🔍' },
            { value: 'narrowed', label: 'Ich habe es etwas eingegrenzt', emoji: '📋' },
            { value: 'know', label: 'Ich kenne meine Trigger gut', emoji: '✅' },
          ],
        },
        {
          key: 'goal',
          question: 'Was ist dir gerade am wichtigsten?',
          subtitle: 'Wir richten deinen Plan danach aus.',
          options: [
            { value: 'eat_freely', label: 'Frei essen ohne Angst vor Folgen', emoji: '🍽️' },
            { value: 'identify_triggers', label: 'Endlich meine Food-Trigger finden', emoji: '🎯' },
            { value: 'consistent_energy', label: 'Den ganzen Tag konstante Energie haben', emoji: '⚡' },
            { value: 'gut_habits', label: 'Bessere Darmgewohnheiten aufbauen', emoji: '🌿' },
          ],
        },
      ] as OnboardingQuestion[],
    },
    analysing: {
      title: 'Deine Antworten werden analysiert',
      steps: [
        'Dein Darmprofil wird geprüft...',
        'Symptommuster werden erkannt...',
        'Essen und Energie werden verknüpft...',
        'Dein persönlicher Plan entsteht...',
      ],
    },
    results: {
      profileLabel: 'DEIN DARMGESUNDHEITSPROFIL',
      nextTitle: 'WAS ALS NÄCHSTES PASSIERT',
      goalPrefix: 'Dein Ziel: ',
      cta: 'Ich bin bereit',
      profiles: {
        reactive: {
          type: 'Reaktiver Darm',
          description:
            'Dein Darm reagiert stark auf Essen und Stress — oft fühlst du dich danach erschöpft. Die gute Nachricht: reaktive Därme reagieren schnell auf die richtigen Änderungen.',
        },
        sensitive: {
          type: 'Sensibler Darm',
          description:
            'Dein Darm ist sensibel, aber ohne deine Trigger zu kennen tappst du im Dunkeln. 14 Tage Tracking können alles verändern.',
        },
        energyDepleted: {
          type: 'Energie erschöpft',
          description:
            'Deine Darm-Energie-Verbindung ist gestört. Was du isst, beeinflusst direkt, wie du dich fühlst und leistest. NutriFlow zeigt dir genau wie.',
        },
        optimisation: {
          type: 'Optimierungsmodus',
          description:
            'Dein Darm ist schon recht stabil — du bist hier, um fein abzustimmen, subtile Trigger zu entfernen und dein Bestes herauszuholen.',
        },
      },
      nextSteps: [
        'Dein Darm-Score wird mit jedem Check-in neu berechnet',
        'Essen-Symptom-Muster zeigen sich nach 7 Tagen',
        'Wöchentliche Digests zeigen, was sich verändert und warum',
      ],
    },
    notifications: {
      title: 'Verpasse keinen\nDarm-Check-in',
      subtitle:
        'Tägliche Erinnerungen halten deine Serie am Leben und deine Daten genau — 60 Sekunden am Tag.',
      allow: 'Benachrichtigungen aktivieren',
      skip: 'Jetzt überspringen',
      celebrationTitle: 'Alles eingerichtet!',
      celebrationSubtitle: 'Deine Darmgesundheitsreise beginnt jetzt',
      benefits: [
        { icon: 'time-outline' as const, text: 'Tägliche Check-in-Erinnerung zu deiner Wunschzeit' },
        { icon: 'flame-outline' as const, text: 'Serien-Hinweise, damit du dranbleibst' },
        { icon: 'trending-up-outline' as const, text: 'Wöchentlicher Digest jeden Sonntag' },
      ],
    },
  },
  fa: {
    welcome: {
      languageTitle: 'زبان را انتخاب کنید',
      languageSubtitle: 'متن‌های شروع برنامه بلافاصله تغییر می‌کنند.',
      taglines: [
        'روده‌ات را بهتر بشناس.',
        'محرک‌هایت را پیدا کن.',
        'نشانه‌ها را کمتر کن.',
        'چیزهای مهم را پیگیری کن.',
        'حال بهتری داشته باش.',
      ],
      primaryButton: 'برنامه روده من را بساز',
      signInPrompt: 'حساب کاربری داری؟ ',
      signInLink: 'ورود',
    },
    features: {
      continue: 'ادامه',
      finalButton: 'شخصی‌سازی کن',
      slides: [
        {
          icon: 'analytics-outline' as FeatureIcon,
          title: 'امتیاز روزانه روده',
          description:
            'هر ثبت روزانه یک امتیاز شخصی برای روده می‌سازد. وقتی یاد می‌گیری چه چیزی برای بدنت بهتر است، روند بهتر شدن را می‌بینی.',
        },
        {
          icon: 'restaurant-outline' as FeatureIcon,
          title: 'ارتباط غذا و نشانه‌ها',
          description:
            'وعده‌ها را ثبت کن و با داده واقعی بفهم کدام غذاها ناراحتی ایجاد می‌کنند و کدام‌ها به تو کمک می‌کنند.',
        },
        {
          icon: 'trending-up-outline' as FeatureIcon,
          title: 'الگوها را سریع ببین',
          description:
            'NutriFlow بین غذا، حال روحی، خواب و نشانه‌ها ارتباط پیدا می‌کند تا دیگر مجبور نباشی حدس بزنی.',
        },
        {
          icon: 'shield-checkmark-outline' as FeatureIcon,
          title: 'حریم خصوصی تو محفوظ است',
          description:
            'داده‌های روده حساس‌اند. اطلاعاتت امن می‌ماند و تحت کنترل خودت است. ما داده سلامت تو را نمی‌فروشیم.',
        },
      ],
    },
    about: {
      label: 'درباره تو',
      title: 'چه اسمی صدایت\nکنیم؟',
      subtitle: 'مسیر سلامت روده را بر اساس خودت\nشخصی‌سازی می‌کنیم.',
      placeholder: 'نام کوچک تو',
      continue: 'ادامه',
    },
    questions: {
      count: (current: number, total: number) => `سؤال ${current} از ${total}`,
      items: [
        {
          key: 'meal_feeling',
          question: 'بعد از بیشتر وعده‌ها چه حسی داری؟',
          subtitle: 'صادقانه جواب بده — به ۷ روز گذشته فکر کن.',
          options: [
            { value: 'bloated_uncomfortable', label: 'نفخ یا ناراحتی دارم', emoji: '😩' },
            { value: 'unpredictable', label: 'قابل پیش‌بینی نیست — گاهی خوبم، گاهی نه', emoji: '😕' },
            { value: 'mostly_okay', label: 'اغلب خوبم، گاهی به هم می‌ریزد', emoji: '😐' },
            { value: 'comfortable', label: 'معمولاً راحت هستم', emoji: '😊' },
          ],
        },
        {
          key: 'bloating_frequency',
          question: 'چند وقت یک‌بار نفخ یا گاز داری؟',
          subtitle: null,
          options: [
            { value: 'daily', label: 'هر روز', emoji: '😮‍💨' },
            { value: 'few_times_week', label: 'چند بار در هفته', emoji: '😤' },
            { value: 'occasionally', label: 'گاهی اوقات', emoji: '🤷' },
            { value: 'rarely', label: 'به ندرت یا هرگز', emoji: '✅' },
          ],
        },
        {
          key: 'social_impact',
          question: 'تا حالا روده‌ات مانع لذت بردن از چیزی شده؟',
          subtitle: 'غذا خوردن بیرون، سفر، جمع دوستانه — هر چیزی.',
          options: [
            { value: 'regularly', label: 'بله، مرتب روی زندگی‌ام اثر می‌گذارد', emoji: '😔' },
            { value: 'plan_around', label: 'گاهی برنامه‌ام را با آن تنظیم می‌کنم', emoji: '🗓️' },
            { value: 'once_twice', label: 'یکی دو بار', emoji: '🤔' },
            { value: 'not_really', label: 'نه خیلی', emoji: '👋' },
          ],
        },
        {
          key: 'energy_after_lunch',
          question: '۱ تا ۲ ساعت بعد از غذا چه حسی داری؟',
          subtitle: 'هضم غذا مستقیماً روی انرژی تو اثر می‌گذارد.',
          options: [
            { value: 'crash', label: 'انرژی‌ام می‌افتد — قهوه یا استراحت لازم دارم', emoji: '😴' },
            { value: 'slump', label: 'افت انرژی واضح دارم ولی ادامه می‌دهم', emoji: '😪' },
            { value: 'slight_dip', label: 'کمی افت می‌کنم، اما جدی نیست', emoji: '😑' },
            { value: 'energised', label: 'پر انرژی و شفاف هستم', emoji: '⚡' },
          ],
        },
        {
          key: 'sleep_quality',
          question: 'بیشتر شب‌ها چقدر خوب می‌خوابی؟',
          subtitle: 'سلامت نامتعادل روده می‌تواند خواب را مختل کند.',
          options: [
            { value: 'poor', label: 'بد — بیدار می‌شوم یا خسته می‌مانم', emoji: '🌙' },
            { value: 'broken', label: 'خواب سبک یا تکه‌تکه', emoji: '😶' },
            { value: 'decent', label: 'قابل قبول، با چند شب بد', emoji: '🙂' },
            { value: 'well', label: 'معمولاً خوب و پیوسته می‌خوابم', emoji: '💤' },
          ],
        },
        {
          key: 'food_knowledge',
          question: 'می‌دانی کدام غذاها نشانه‌هایت را تحریک می‌کنند؟',
          subtitle: 'بیشتر افراد با مشکلات روده هنوز نمی‌دانند — فعلاً.',
          options: [
            { value: 'no_idea', label: 'هیچ ایده‌ای ندارم', emoji: '❓' },
            { value: 'suspect', label: 'به چند مورد شک دارم اما مطمئن نیستم', emoji: '🔍' },
            { value: 'narrowed', label: 'تا حدی محدودش کرده‌ام', emoji: '📋' },
            { value: 'know', label: 'محرک‌هایم را خوب می‌شناسم', emoji: '✅' },
          ],
        },
        {
          key: 'goal',
          question: 'الان چه چیزی برایت مهم‌تر است؟',
          subtitle: 'برنامه‌ات را بر اساس همین شخصی‌سازی می‌کنیم.',
          options: [
            { value: 'eat_freely', label: 'بدون ترس از پیامدها آزادانه غذا بخورم', emoji: '🍽️' },
            { value: 'identify_triggers', label: 'بالاخره محرک‌های غذایی‌ام را پیدا کنم', emoji: '🎯' },
            { value: 'consistent_energy', label: 'تمام روز انرژی پایدار داشته باشم', emoji: '⚡' },
            { value: 'gut_habits', label: 'عادت‌های بهتر برای روده بسازم', emoji: '🌿' },
          ],
        },
      ] as OnboardingQuestion[],
    },
    analysing: {
      title: 'پاسخ‌هایت در حال تحلیل است',
      steps: [
        'پروفایل روده‌ات بررسی می‌شود...',
        'الگوهای نشانه‌ها پیدا می‌شوند...',
        'ارتباط غذا و انرژی بررسی می‌شود...',
        'برنامه شخصی تو ساخته می‌شود...',
      ],
    },
    results: {
      profileLabel: 'پروفایل سلامت روده تو',
      nextTitle: 'بعد چه اتفاقی می‌افتد',
      goalPrefix: 'هدف تو: ',
      cta: 'برای شروع آماده‌ام',
      profiles: {
        reactive: {
          type: 'روده واکنش‌پذیر',
          description:
            'روده تو به غذا و استرس واکنش قوی نشان می‌دهد و گاهی انرژی‌ات را می‌گیرد. خبر خوب: روده‌های واکنش‌پذیر با تغییرات درست سریع‌تر بهتر جواب می‌دهند.',
        },
        sensitive: {
          type: 'روده حساس',
          description:
            'روده‌ات حساس است، اما بدون شناخت محرک‌ها مسیر مبهم می‌شود. فقط ۱۴ روز پیگیری می‌تواند تصویر را روشن کند.',
        },
        energyDepleted: {
          type: 'کمبود انرژی',
          description:
            'ارتباط روده و انرژی تو به هم ریخته است. چیزی که می‌خوری مستقیماً روی حس و عملکردت اثر دارد. NutriFlow دقیقاً نشان می‌دهد چطور.',
        },
        optimisation: {
          type: 'حالت بهینه‌سازی',
          description:
            'روده‌ات وضعیت نسبتاً خوبی دارد — اینجا هستی تا دقیق‌تر تنظیمش کنی، محرک‌های پنهان را حذف کنی و بهترین حالتت را بسازی.',
        },
      },
      nextSteps: [
        'امتیاز روده با هر ثبت روزانه دوباره محاسبه می‌شود',
        'الگوهای غذا و نشانه‌ها بعد از ۷ روز ظاهر می‌شوند',
        'گزارش‌های هفتگی نشان می‌دهند چه چیزی تغییر کرده و چرا',
      ],
    },
    notifications: {
      title: 'هیچ چک‌این روده‌ای\nرا از دست نده',
      subtitle:
        'یادآوری‌های روزانه کمک می‌کنند روندت حفظ شود و داده‌هایت دقیق بمانند — روزی فقط ۶۰ ثانیه.',
      allow: 'فعال کردن اعلان‌ها',
      skip: 'فعلاً رد کن',
      celebrationTitle: 'همه چیز آماده است!',
      celebrationSubtitle: 'مسیر سلامت روده تو از همین حالا شروع می‌شود',
      benefits: [
        { icon: 'time-outline' as const, text: 'یادآوری روزانه در زمان دلخواه تو' },
        { icon: 'flame-outline' as const, text: 'هشدار روند پیوسته تا پیشرفتت قطع نشود' },
        { icon: 'trending-up-outline' as const, text: 'گزارش هفتگی هر یکشنبه' },
      ],
    },
  },
} as const;

export function getOnboardingQuestion(
  language: AppLanguage,
  index: number
): OnboardingQuestion {
  return ONBOARDING_COPY[language].questions.items[index];
}

export function getOnboardingAnswerLabel(
  language: AppLanguage,
  questionKey: OnboardingQuestionKey,
  value: string
): string {
  const question = ONBOARDING_COPY[language].questions.items.find((item) => item.key === questionKey);
  return question?.options.find((option) => option.value === value)?.label ?? value;
}
