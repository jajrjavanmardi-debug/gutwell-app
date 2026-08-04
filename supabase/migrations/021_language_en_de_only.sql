-- v1.0 launch scope: English and German only.
--
-- Persian ('fa') was previously selectable in the app and permitted by the
-- user_profiles CHECK constraint. This migration performs the smallest safe
-- cleanup:
--
--   1. Audits and reports what exists before anything changes.
--   2. Rewrites every stored language PREFERENCE of 'fa' (and any other
--      unsupported value) to 'en'.
--   3. Narrows the CHECK constraint so only 'en' and 'de' are accepted.
--
-- Deliberately NOT changed:
--
--   * public.health_logs.language — this is not a preference. It records the
--     language a past AI analysis was actually generated in, alongside the
--     analysis text itself in the same row. Rewriting 'fa' to 'en' there would
--     mislabel Persian content as English and corrupt the user's own history.
--     The column default is already 'en' and the app now only ever sends
--     'en' or 'de', so no new 'fa' rows can be written. Existing rows are left
--     intact as historical records.
--
--   * No tables or columns are dropped. No user-generated text is deleted.

-- ── 1. Audit (reported via NOTICE in the migration output) ──────────────────
DO $$
DECLARE
  v_profiles_fa        INTEGER;
  v_profiles_other     INTEGER;
  v_profiles_total     INTEGER;
  v_health_logs_fa     INTEGER;
BEGIN
  SELECT count(*) INTO v_profiles_total FROM public.user_profiles;

  SELECT count(*) INTO v_profiles_fa
  FROM public.user_profiles
  WHERE preferred_language = 'fa';

  SELECT count(*) INTO v_profiles_other
  FROM public.user_profiles
  WHERE preferred_language IS NULL
     OR preferred_language NOT IN ('en', 'de', 'fa');

  SELECT count(*) INTO v_health_logs_fa
  FROM public.health_logs
  WHERE language = 'fa';

  RAISE NOTICE '[021] AUDIT user_profiles total rows: %', v_profiles_total;
  RAISE NOTICE '[021] AUDIT user_profiles.preferred_language = fa: %', v_profiles_fa;
  RAISE NOTICE '[021] AUDIT user_profiles.preferred_language null/unsupported: %', v_profiles_other;
  RAISE NOTICE '[021] AUDIT health_logs.language = fa (left unchanged, historical): %', v_health_logs_fa;
END $$;

-- ── 2. Migrate stored preferences ───────────────────────────────────────────
DO $$
DECLARE
  v_changed INTEGER;
BEGIN
  UPDATE public.user_profiles
  SET preferred_language = 'en'
  WHERE preferred_language IS NULL
     OR preferred_language NOT IN ('en', 'de');

  GET DIAGNOSTICS v_changed = ROW_COUNT;
  RAISE NOTICE '[021] MIGRATED user_profiles rows changed to en: %', v_changed;
END $$;

-- ── 3. Narrow the constraint so 'fa' can never be stored again ──────────────
ALTER TABLE public.user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_preferred_language_check;

ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_preferred_language_check
  CHECK (preferred_language IN ('en', 'de'));

-- Default was already 'en'; restated so the intent is explicit and the column
-- cannot drift back to an unsupported default.
ALTER TABLE public.user_profiles
  ALTER COLUMN preferred_language SET DEFAULT 'en';

-- ── 4. Verify ───────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_remaining INTEGER;
BEGIN
  SELECT count(*) INTO v_remaining
  FROM public.user_profiles
  WHERE preferred_language NOT IN ('en', 'de');

  IF v_remaining > 0 THEN
    RAISE EXCEPTION '[021] VERIFY FAILED: % user_profiles rows still hold an unsupported language', v_remaining;
  END IF;

  RAISE NOTICE '[021] VERIFY OK: every user_profiles.preferred_language is en or de';
END $$;

COMMENT ON COLUMN public.user_profiles.preferred_language IS
  'App UI and AI response language. v1.0 accepts en or de only; enforced by user_profiles_preferred_language_check.';
