-- 023_onboarding_stage.sql
--
-- Durable resume point for the v1.0 onboarding flow.
--
-- Onboarding creates the account partway through (screen 5 of 7), so a user can
-- end up authenticated with onboarding_completed = false and no way to tell how
-- far they got. Before this column, lib/routing.ts sent every such user back to
-- the questionnaire, re-asking questions they had already answered and never
-- returning them to the first meal analysis they abandoned.
--
-- Stages, in order:
--   goal · feeling · example        (pre-signup — AsyncStorage only, no user row yet)
--   signup · analysis · notifications · completed   (post-signup — here and in AsyncStorage)
--
-- Deliberately unconstrained:
--   nullable      — every existing row stays NULL, which reads as "legacy"
--   no default    — a NULL must not be mistaken for a real stage
--   no CHECK      — adding a stage later must not require a migration
--   no backfill   — all 8 existing profiles have onboarding_completed = true and
--                   are routed by that flag alone; the stage is never consulted
--                   for them
--
-- onboarding_completed remains the single source of truth for "is onboarding
-- done". This column only answers "where should an unfinished user resume".
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_stage TEXT;

COMMENT ON COLUMN public.profiles.onboarding_stage IS
  'Resume point for unfinished onboarding: goal|feeling|example|signup|analysis|notifications|completed. NULL = legacy or not started. Never authoritative for completion — see onboarding_completed.';
