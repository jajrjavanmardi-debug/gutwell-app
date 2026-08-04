-- Localized Challenge catalog content (English + German) for the v1.0 launch.
--
-- MODEL: additive nullable columns, NOT a rename.
--
--   public.challenges.title        → canonical ENGLISH (unchanged)
--   public.challenges.description  → canonical ENGLISH (unchanged)
--   public.challenges.title_de       → German, nullable
--   public.challenges.description_de → German, nullable
--
-- Why this shape:
--   * Nothing is renamed or dropped, so `select('*')` and every existing query
--     keep working unchanged.
--   * An older installed build that knows nothing about the new columns still
--     reads title/description and shows English.
--   * English is the fallback by construction: the client resolves
--     `title_de ?? title`, so a NULL German value degrades to English rather
--     than to an empty string.
--   * Rollback is `ALTER TABLE public.challenges DROP COLUMN title_de,
--     DROP COLUMN description_de;` — no data loss, since English never moved.
--
-- A separate challenge_translations table was considered and rejected: it would
-- add a table, RLS policies, grants and a second join inside the nested
-- `challenge:challenges(*)` select, for five rows of near-static content. That
-- model becomes the better choice at a third language.
--
-- Rows are matched by `slug`, which is NOT NULL UNIQUE and stable. Primary keys
-- are never touched, so public.user_challenges.challenge_id foreign keys, joined
-- challenges, progress_days, status and completed_at are all unaffected.

-- ── 1. Additive schema change ───────────────────────────────────────────────
ALTER TABLE public.challenges
  ADD COLUMN IF NOT EXISTS title_de TEXT,
  ADD COLUMN IF NOT EXISTS description_de TEXT;

COMMENT ON COLUMN public.challenges.title IS
  'Canonical English title. Also the fallback when a localized value is NULL.';
COMMENT ON COLUMN public.challenges.title_de IS
  'German title. NULL means "fall back to title" — the client resolves title_de ?? title.';
COMMENT ON COLUMN public.challenges.description_de IS
  'German description. NULL means "fall back to description".';

-- ── 2. Audit before writing ─────────────────────────────────────────────────
DO $$
DECLARE
  v_total INTEGER;
  v_missing_de INTEGER;
  v_participation INTEGER;
BEGIN
  SELECT count(*) INTO v_total FROM public.challenges;
  SELECT count(*) INTO v_missing_de FROM public.challenges WHERE title_de IS NULL;
  SELECT count(*) INTO v_participation FROM public.user_challenges;

  RAISE NOTICE '[022] AUDIT challenges rows: %', v_total;
  RAISE NOTICE '[022] AUDIT challenges without German title (before): %', v_missing_de;
  RAISE NOTICE '[022] AUDIT user_challenges participation rows (must not change): %', v_participation;
END $$;

-- ── 3. German copy, plus claim-safety corrections to the English source ─────
--
-- Three existing English descriptions asserted outcomes the product's
-- claim-safety rule forbids, so they are corrected here rather than translated
-- faithfully into a second language:
--
--   hydration-week   "eases bloating between meals"    → symptom-reduction claim
--   fiber-ramp       "without the bloat"               → symptom-reduction claim
--   low-fodmap-reset "find your true triggers"         → definitive trigger ID
--
-- Titles are unchanged; only the offending description clauses were softened.
-- German uses informal "du" throughout.

UPDATE public.challenges SET
  description = 'Go two weeks without logging a single trigger food. Spot the patterns in your own entries and build a personal safe-foods baseline.',
  title_de = '14 Tage ohne Auslöser',
  description_de = 'Zwei Wochen lang keinen einzigen Auslöser erfassen. Erkenne Muster in deinen eigenen Einträgen und baue dir eine persönliche Basis gut verträglicher Lebensmittel auf.'
WHERE slug = 'no-trigger-streak';

UPDATE public.challenges SET
  title_de = 'Tägliches Check-in',
  description_de = 'Erfasse eine Woche lang jeden Tag, wie es deinem Darm geht. Ein kurzes tägliches Check-in ist der schnellste Weg zu sehen, womit deine Symptome zusammenfallen.'
WHERE slug = 'daily-check-in';

UPDATE public.challenges SET
  description = 'Hit your water target for seven days straight. Keeping hydration steady is a simple habit to track alongside how your gut feels.',
  title_de = 'Trinkwoche',
  description_de = 'Erreiche sieben Tage in Folge dein Trinkziel. Gleichmäßig zu trinken ist eine einfache Gewohnheit, die du parallel zu deinem Darmgefühl verfolgen kannst.'
WHERE slug = 'hydration-week';

UPDATE public.challenges SET
  description = 'Add one extra serving of gut-friendly fiber each day for three weeks. Ramping up slowly lets you track how your gut responds along the way.',
  title_de = 'Ballaststoffe steigern',
  description_de = 'Füge drei Wochen lang täglich eine zusätzliche Portion darmfreundliche Ballaststoffe hinzu. Wenn du langsam steigerst, kannst du unterwegs verfolgen, wie dein Darm reagiert.'
WHERE slug = 'fiber-ramp';

UPDATE public.challenges SET
  description = 'A guided two-week low-FODMAP window. Reintroduce foods one at a time afterwards to see which ones you may react to. This is not medical advice — talk to a qualified professional before changing your diet.',
  title_de = 'Low-FODMAP-Reset',
  description_de = 'Ein begleitetes zweiwöchiges Low-FODMAP-Fenster. Führe Lebensmittel danach einzeln wieder ein, um zu sehen, auf welche du möglicherweise reagierst. Das ist keine medizinische Beratung — sprich mit einer qualifizierten Fachperson, bevor du deine Ernährung umstellst.'
WHERE slug = 'low-fodmap-reset';

-- ── 4. Verify ───────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_missing_title INTEGER;
  v_missing_desc  INTEGER;
  v_participation INTEGER;
BEGIN
  SELECT count(*) INTO v_missing_title FROM public.challenges WHERE title_de IS NULL OR title_de = '';
  SELECT count(*) INTO v_missing_desc  FROM public.challenges WHERE description_de IS NULL OR description_de = '';
  SELECT count(*) INTO v_participation FROM public.user_challenges;

  IF v_missing_title > 0 OR v_missing_desc > 0 THEN
    RAISE EXCEPTION '[022] VERIFY FAILED: % challenges without a German title, % without a German description',
      v_missing_title, v_missing_desc;
  END IF;

  RAISE NOTICE '[022] VERIFY OK: every challenge has a German title and description';
  RAISE NOTICE '[022] VERIFY user_challenges participation rows (after): %', v_participation;
END $$;
