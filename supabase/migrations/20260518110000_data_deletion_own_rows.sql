-- Support the Settings/Profile "Delete my data" flow without broadening access.
-- These tables already store user-owned records; this adds missing own-row
-- DELETE policies and matching Data API grants for score/streak data only.

GRANT DELETE ON TABLE public.gut_scores TO authenticated;
GRANT DELETE ON TABLE public.streaks TO authenticated;

DROP POLICY IF EXISTS "Users can delete own gut_scores" ON public.gut_scores;
CREATE POLICY "Users can delete own gut_scores"
  ON public.gut_scores FOR DELETE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own streaks" ON public.streaks;
CREATE POLICY "Users can delete own streaks"
  ON public.streaks FOR DELETE
  USING (auth.uid() = user_id);
