-- ============================================
-- GutWell Feature Expansion Migration
-- New: mood tracking, water logs, favorites,
--      level system, onboarding questionnaire
-- ============================================

-- 1. Add mood to check_ins
ALTER TABLE public.check_ins
  ADD COLUMN IF NOT EXISTS mood INTEGER CHECK (mood BETWEEN 1 AND 5);

-- 2. Create water_logs table
CREATE TABLE IF NOT EXISTS public.water_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount_ml INTEGER NOT NULL DEFAULT 250,
  logged_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.water_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own water_logs" ON public.water_logs
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own water_logs" ON public.water_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own water_logs" ON public.water_logs
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_water_logs_user_id ON public.water_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_water_logs_logged_at ON public.water_logs(logged_at);

-- 3. Create favorites table
CREATE TABLE IF NOT EXISTS public.favorites (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  meal_name TEXT NOT NULL,
  meal_type TEXT CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'snack')),
  foods TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, meal_name)
);

ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own favorites" ON public.favorites
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own favorites" ON public.favorites
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own favorites" ON public.favorites
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON public.favorites(user_id);

-- 4. Add level system columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS total_points INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS level TEXT DEFAULT 'beginner';

-- 5. Add onboarding questionnaire columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS gut_concern TEXT,
  ADD COLUMN IF NOT EXISTS symptom_frequency TEXT,
  ADD COLUMN IF NOT EXISTS goal TEXT;

-- 6. Add note column to food_logs if missing
ALTER TABLE public.food_logs
  ADD COLUMN IF NOT EXISTS note TEXT;
