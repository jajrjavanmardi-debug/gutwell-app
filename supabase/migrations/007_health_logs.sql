-- AI meal / health analysis logs (Groq photo narrative, Edge scan JSON, home-tab nutrients).
--
-- App ↔ column mapping (nothing named health_logs existed before):
--   Photo flow (Groq): mealImpactScore parsed as 1–10 → gut_score; aiText → analysis_content;
--                    extractMealName → food_name; nutrients often embedded in text → optional JSON in nutrients.
--   Scan (analyze-food): overall_score → gut_score; summary + foods[] → analysis_content / nutrients JSON.
--   Home recommendation: nutrients string[] → nutrients JSONB array.

CREATE TABLE IF NOT EXISTS public.health_logs (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  food_name TEXT NOT NULL DEFAULT '',
  gut_score INTEGER CHECK (gut_score IS NULL OR (gut_score >= 1 AND gut_score <= 10)),
  analysis_content TEXT NOT NULL DEFAULT '',
  nutrients JSONB NOT NULL DEFAULT '[]'::jsonb,
  language TEXT NOT NULL DEFAULT 'en'
);

CREATE INDEX IF NOT EXISTS idx_health_logs_user_created ON public.health_logs(user_id, created_at DESC);

ALTER TABLE public.health_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own health_logs"
  ON public.health_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own health_logs"
  ON public.health_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own health_logs"
  ON public.health_logs FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own health_logs"
  ON public.health_logs FOR DELETE
  USING (auth.uid() = user_id);

-- Include in account deletion (same definition as 003 + health_logs).
CREATE OR REPLACE FUNCTION public.delete_user_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID;
BEGIN
  uid := auth.uid();

  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  DELETE FROM public.check_ins WHERE user_id = uid;
  DELETE FROM public.food_logs WHERE user_id = uid;
  DELETE FROM public.symptoms WHERE user_id = uid;
  DELETE FROM public.gut_scores WHERE user_id = uid;
  DELETE FROM public.health_logs WHERE user_id = uid;
  DELETE FROM public.reminders WHERE user_id = uid;
  DELETE FROM public.water_logs WHERE user_id = uid;
  DELETE FROM public.favorites WHERE user_id = uid;
  DELETE FROM public.streaks WHERE user_id = uid;
  DELETE FROM public.profiles WHERE id = uid;

  DELETE FROM auth.users WHERE id = uid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_user_account() TO authenticated;
