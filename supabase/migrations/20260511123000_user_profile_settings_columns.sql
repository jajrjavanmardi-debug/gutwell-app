-- Ensure mobile profile settings columns are present in deployed databases.
-- Earlier local migrations used short numeric prefixes, so this timestamped
-- migration keeps remote Supabase projects from missing app-required columns.

CREATE TABLE IF NOT EXISTS public.user_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  onboarding_answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  main_goal TEXT NOT NULL DEFAULT '',
  focus_areas JSONB NOT NULL DEFAULT '[]'::jsonb,
  first_habits JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS medical_conditions JSONB,
  ADD COLUMN IF NOT EXISTS preferred_language TEXT,
  ADD COLUMN IF NOT EXISTS stool_frequency_baseline TEXT,
  ADD COLUMN IF NOT EXISTS stool_type_baseline TEXT,
  ADD COLUMN IF NOT EXISTS symptoms_baseline JSONB,
  ADD COLUMN IF NOT EXISTS diet_pattern_baseline TEXT,
  ADD COLUMN IF NOT EXISTS fiber_intake_baseline TEXT,
  ADD COLUMN IF NOT EXISTS stress_impact_baseline TEXT,
  ADD COLUMN IF NOT EXISTS sleep_quality_baseline TEXT,
  ADD COLUMN IF NOT EXISTS trigger_food_awareness TEXT;

UPDATE public.user_profiles
SET medical_conditions = '[]'::jsonb
WHERE medical_conditions IS NULL;

UPDATE public.user_profiles
SET preferred_language = 'en'
WHERE preferred_language IS NULL
  OR preferred_language NOT IN ('en', 'de', 'fa');

UPDATE public.user_profiles
SET symptoms_baseline = '[]'::jsonb
WHERE symptoms_baseline IS NULL;

UPDATE public.user_profiles
SET
  stool_frequency_baseline = COALESCE(stool_frequency_baseline, ''),
  stool_type_baseline = COALESCE(stool_type_baseline, ''),
  diet_pattern_baseline = COALESCE(diet_pattern_baseline, ''),
  fiber_intake_baseline = COALESCE(fiber_intake_baseline, ''),
  stress_impact_baseline = COALESCE(stress_impact_baseline, ''),
  sleep_quality_baseline = COALESCE(sleep_quality_baseline, ''),
  trigger_food_awareness = COALESCE(trigger_food_awareness, '');

ALTER TABLE public.user_profiles
  ALTER COLUMN medical_conditions SET DEFAULT '[]'::jsonb,
  ALTER COLUMN medical_conditions SET NOT NULL,
  ALTER COLUMN preferred_language SET DEFAULT 'en',
  ALTER COLUMN preferred_language SET NOT NULL,
  ALTER COLUMN stool_frequency_baseline SET DEFAULT '',
  ALTER COLUMN stool_frequency_baseline SET NOT NULL,
  ALTER COLUMN stool_type_baseline SET DEFAULT '',
  ALTER COLUMN stool_type_baseline SET NOT NULL,
  ALTER COLUMN symptoms_baseline SET DEFAULT '[]'::jsonb,
  ALTER COLUMN symptoms_baseline SET NOT NULL,
  ALTER COLUMN diet_pattern_baseline SET DEFAULT '',
  ALTER COLUMN diet_pattern_baseline SET NOT NULL,
  ALTER COLUMN fiber_intake_baseline SET DEFAULT '',
  ALTER COLUMN fiber_intake_baseline SET NOT NULL,
  ALTER COLUMN stress_impact_baseline SET DEFAULT '',
  ALTER COLUMN stress_impact_baseline SET NOT NULL,
  ALTER COLUMN sleep_quality_baseline SET DEFAULT '',
  ALTER COLUMN sleep_quality_baseline SET NOT NULL,
  ALTER COLUMN trigger_food_awareness SET DEFAULT '',
  ALTER COLUMN trigger_food_awareness SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_profiles_preferred_language_check'
      AND conrelid = 'public.user_profiles'::regclass
  ) THEN
    ALTER TABLE public.user_profiles
      ADD CONSTRAINT user_profiles_preferred_language_check
      CHECK (preferred_language IN ('en', 'de', 'fa'));
  END IF;
END $$;

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
