-- ============================================
-- Production security & integrity repair (2026-06-10 acquisition audit)
-- ============================================
-- 1. The live project carried four legacy "Public can ..." RLS policies on
--    check_ins and food_logs (qual/with_check = true, roles anon+authenticated).
--    They exist in NO repository migration — leftovers from the hand-built
--    dashboard era (see 000_baseline_schema.sql notes). Because permissive
--    policies OR together, they let ANY authenticated user read and insert
--    EVERY user's health data, silently bypassing the own-row policies.
-- 2. The (user_id, entry_date) unique constraint from migration 006 was
--    recorded as applied but absent from production, so the daily check-in
--    upsert (onConflict user_id,entry_date) failed with 42P10. Re-added
--    idempotently, preceded by 006's dedupe (no-op when no duplicates).

DROP POLICY IF EXISTS "Public can read check_ins" ON public.check_ins;
DROP POLICY IF EXISTS "Public can insert check_ins" ON public.check_ins;
DROP POLICY IF EXISTS "Public can read food_logs" ON public.food_logs;
DROP POLICY IF EXISTS "Public can insert food_logs" ON public.food_logs;

DELETE FROM public.check_ins a
USING public.check_ins b
WHERE a.id < b.id
  AND a.user_id = b.user_id
  AND a.entry_date = b.entry_date;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'check_ins_user_id_entry_date_key'
      AND conrelid = 'public.check_ins'::regclass
  ) THEN
    ALTER TABLE public.check_ins
      ADD CONSTRAINT check_ins_user_id_entry_date_key UNIQUE (user_id, entry_date);
  END IF;
END $$;
