-- Challenges / Streaks feature (replaces the Cal AI "Groups" community tab with
-- solo gut-health challenges). Two tables:
--   * challenges       — catalog of available challenges. Public read.
--   * user_challenges  — a user's joined challenges + progress. Owner-only RLS.

-- ─── challenges (public catalog) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  duration_days INTEGER NOT NULL DEFAULT 7,
  type TEXT NOT NULL DEFAULT 'streak',
  icon TEXT NOT NULL DEFAULT 'flame-outline',
  participants_count INTEGER NOT NULL DEFAULT 0,
  is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.challenges ENABLE ROW LEVEL SECURITY;

-- The catalog is public marketing data: any visitor (authenticated or anon) may read.
CREATE POLICY "Challenges are publicly readable"
  ON public.challenges FOR SELECT
  USING (true);

CREATE INDEX IF NOT EXISTS idx_challenges_featured ON public.challenges(is_featured);

GRANT SELECT ON TABLE public.challenges TO authenticated, anon;

-- ─── user_challenges (per-user, owner-only) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  challenge_id UUID NOT NULL REFERENCES public.challenges(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  progress_days INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  completed_at TIMESTAMPTZ,
  UNIQUE (user_id, challenge_id)
);

CREATE INDEX IF NOT EXISTS idx_user_challenges_user ON public.user_challenges(user_id);

ALTER TABLE public.user_challenges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own user_challenges"
  ON public.user_challenges FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own user_challenges"
  ON public.user_challenges FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own user_challenges"
  ON public.user_challenges FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own user_challenges"
  ON public.user_challenges FOR DELETE
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_challenges TO authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.user_challenges FROM anon;

-- ─── Seed challenges (gut-health, original copy) ────────────────────────────
INSERT INTO public.challenges (slug, title, description, duration_days, type, icon, participants_count, is_featured)
VALUES
  (
    'no-trigger-streak',
    '14-Day No-Trigger Streak',
    'Go two weeks without logging a single trigger food. Spot the patterns that keep your gut calm and build a personal safe-foods baseline.',
    14, 'streak', 'shield-checkmark-outline', 4820, TRUE
  ),
  (
    'daily-check-in',
    'Daily Check-in Challenge',
    'Log how your gut feels every day for a week. A short daily check-in is the fastest way to see what your symptoms are really tracking with.',
    7, 'check-in', 'checkmark-done-outline', 9130, FALSE
  ),
  (
    'hydration-week',
    'Hydration Week',
    'Hit your water target for seven days straight. Steady hydration keeps digestion moving and eases bloating between meals.',
    7, 'habit', 'water-outline', 6275, FALSE
  ),
  (
    'fiber-ramp',
    'Fiber Ramp',
    'Add one extra serving of gut-friendly fiber each day for three weeks. Ramp up slowly to feed your microbiome without the bloat.',
    21, 'habit', 'nutrition-outline', 3410, FALSE
  ),
  (
    'low-fodmap-reset',
    'Low-FODMAP Reset',
    'A guided two-week low-FODMAP elimination window. Calm a reactive gut, then reintroduce foods one at a time to find your true triggers.',
    14, 'reset', 'leaf-outline', 2580, TRUE
  )
ON CONFLICT (slug) DO NOTHING;
