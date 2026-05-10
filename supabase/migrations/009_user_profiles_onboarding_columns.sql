ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS stool_frequency_baseline TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS stool_type_baseline TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS symptoms_baseline JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS diet_pattern_baseline TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS fiber_intake_baseline TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS stress_impact_baseline TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS sleep_quality_baseline TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS trigger_food_awareness TEXT NOT NULL DEFAULT '';
