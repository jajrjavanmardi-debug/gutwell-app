-- ============================================
-- GutWell Baseline Schema (reproducibility)
-- ============================================
-- WHY THIS EXISTS:
-- Migration 001_full_schema.sql only ALTERs `check_ins` and `food_logs`
-- (and even creates indexes on check_ins.entry_date / food_logs.logged_at)
-- without ever CREATEing those base tables — they were created by hand in the
-- Supabase dashboard and never captured in version control. As a result a clean
-- `supabase db reset` (fresh project) FAILS on 001. This migration creates the
-- missing base tables so the full 000..00N chain is reproducible from scratch.
--
-- SAFE ON PROD: every statement is IF NOT EXISTS, so running this against the
-- live database is a no-op (the tables already exist there).
--
-- ⚠️ RECONSTRUCTED, NOT INTROSPECTED. The GutWell Supabase project was not
-- reachable for live introspection when this was written. Column types here are
-- best-effort and align with how the app reads/writes these tables plus the
-- columns added by later migrations (001 adds user_id/bloating/pain/energy/note
-- to check_ins and user_id/meal_type/foods/photo_url to food_logs; 004 adds
-- check_ins.water_intake). The id columns use BIGSERIAL to match the app's other
-- tables (symptoms/reminders/gut_scores). To guarantee a byte-exact match with
-- production, run `supabase db pull` against the GutWell project and reconcile.
-- ============================================

-- Base check_ins table (later migrations add user_id, symptom scores, water_intake)
CREATE TABLE IF NOT EXISTS public.check_ins (
  id BIGSERIAL PRIMARY KEY,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  stool_type INTEGER CHECK (stool_type BETWEEN 1 AND 7),
  mood INTEGER CHECK (mood BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Base food_logs table (later migrations add user_id, meal_type, foods, photo_url)
CREATE TABLE IF NOT EXISTS public.food_logs (
  id BIGSERIAL PRIMARY KEY,
  meal_name TEXT,
  logged_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
