-- ============================================
-- GutWell Full Database Schema Migration
-- Run this in Supabase Dashboard → SQL Editor
-- ============================================

-- 1. Drop the duplicate checkins table (keeping check_ins)
DROP TABLE IF EXISTS public.checkins;

-- 2. Create profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  onboarding_completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Update check_ins table — add user_id and extra fields
ALTER TABLE public.check_ins
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS bloating INTEGER CHECK (bloating BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS pain INTEGER CHECK (pain BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS energy INTEGER CHECK (energy BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS note TEXT;

-- 4. Update food_logs table — add user_id and extra fields
ALTER TABLE public.food_logs
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS meal_type TEXT CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'snack')),
  ADD COLUMN IF NOT EXISTS foods TEXT[],
  ADD COLUMN IF NOT EXISTS photo_url TEXT;

-- 5. Create symptoms table
CREATE TABLE IF NOT EXISTS public.symptoms (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symptom_type TEXT NOT NULL CHECK (symptom_type IN (
    'bloating', 'gas', 'cramps', 'nausea', 'heartburn',
    'fatigue', 'constipation', 'diarrhea', 'acid_reflux', 'other'
  )),
  severity INTEGER NOT NULL CHECK (severity BETWEEN 1 AND 5),
  note TEXT,
  logged_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Create reminders table
CREATE TABLE IF NOT EXISTS public.reminders (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reminder_type TEXT NOT NULL CHECK (reminder_type IN ('checkin', 'food', 'symptom')),
  time TIME NOT NULL,
  enabled BOOLEAN DEFAULT TRUE,
  days INTEGER[] DEFAULT '{1,2,3,4,5,6,7}', -- 1=Mon, 7=Sun
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Create gut_scores table
CREATE TABLE IF NOT EXISTS public.gut_scores (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  factors JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, date)
);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.check_ins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.food_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.symptoms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gut_scores ENABLE ROW LEVEL SECURITY;

-- Profiles: users can read/update their own profile
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Check-ins: users can CRUD their own
CREATE POLICY "Users can view own check_ins" ON public.check_ins
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own check_ins" ON public.check_ins
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own check_ins" ON public.check_ins
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own check_ins" ON public.check_ins
  FOR DELETE USING (auth.uid() = user_id);

-- Food logs: users can CRUD their own
CREATE POLICY "Users can view own food_logs" ON public.food_logs
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own food_logs" ON public.food_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own food_logs" ON public.food_logs
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own food_logs" ON public.food_logs
  FOR DELETE USING (auth.uid() = user_id);

-- Symptoms: users can CRUD their own
CREATE POLICY "Users can view own symptoms" ON public.symptoms
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own symptoms" ON public.symptoms
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own symptoms" ON public.symptoms
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own symptoms" ON public.symptoms
  FOR DELETE USING (auth.uid() = user_id);

-- Reminders: users can CRUD their own
CREATE POLICY "Users can view own reminders" ON public.reminders
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own reminders" ON public.reminders
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own reminders" ON public.reminders
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own reminders" ON public.reminders
  FOR DELETE USING (auth.uid() = user_id);

-- Gut scores: users can read their own, system inserts
CREATE POLICY "Users can view own gut_scores" ON public.gut_scores
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own gut_scores" ON public.gut_scores
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own gut_scores" ON public.gut_scores
  FOR UPDATE USING (auth.uid() = user_id);

-- ============================================
-- AUTO-CREATE PROFILE ON SIGNUP (trigger)
-- ============================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if exists, then create
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- INDEXES for performance
-- ============================================

CREATE INDEX IF NOT EXISTS idx_check_ins_user_id ON public.check_ins(user_id);
CREATE INDEX IF NOT EXISTS idx_check_ins_entry_date ON public.check_ins(entry_date);
CREATE INDEX IF NOT EXISTS idx_food_logs_user_id ON public.food_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_food_logs_logged_at ON public.food_logs(logged_at);
CREATE INDEX IF NOT EXISTS idx_symptoms_user_id ON public.symptoms(user_id);
CREATE INDEX IF NOT EXISTS idx_symptoms_logged_at ON public.symptoms(logged_at);
CREATE INDEX IF NOT EXISTS idx_gut_scores_user_date ON public.gut_scores(user_id, date);
CREATE INDEX IF NOT EXISTS idx_reminders_user_id ON public.reminders(user_id);
