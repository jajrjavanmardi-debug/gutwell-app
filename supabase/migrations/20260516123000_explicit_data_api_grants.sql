-- Explicit Data API grants for the upcoming Supabase public-schema default change.
--
-- All tables below are user-owned app data protected by existing RLS policies.
-- Guest/demo mode stores data locally, so no public table access is intentionally
-- exposed to anon. No service_role table grants are added here because the app
-- and the current edge function do not use service_role for Data API table access.

GRANT USAGE ON SCHEMA public TO authenticated;

-- Core profile/auth flow.
GRANT SELECT, INSERT, UPDATE ON TABLE public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_profiles TO authenticated;

-- Check-ins, symptoms, meal logs, scores, and persisted analysis history.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.check_ins TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.food_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.symptoms TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.gut_scores TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.health_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.streaks TO authenticated;

-- User-owned feature tables created by existing migrations and protected by RLS.
GRANT SELECT, INSERT, DELETE ON TABLE public.water_logs TO authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.favorites TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.reminders TO authenticated;

-- Guest/public table access is not intentional for these user-owned tables.
REVOKE ALL PRIVILEGES ON TABLE public.profiles FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.user_profiles FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.check_ins FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.food_logs FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.symptoms FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.gut_scores FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.health_logs FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.streaks FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.water_logs FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.favorites FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.reminders FROM anon;

-- Bigserial inserts need sequence access. Grant only sequences owned by the
-- explicitly listed tables, and keep anon off those sequences.
DO $$
DECLARE
  table_name TEXT;
  sequence_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'check_ins',
    'food_logs',
    'symptoms',
    'gut_scores',
    'health_logs',
    'streaks',
    'water_logs',
    'favorites',
    'reminders'
  ]
  LOOP
    sequence_name := pg_get_serial_sequence(format('public.%I', table_name), 'id');

    IF sequence_name IS NOT NULL THEN
      EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO authenticated', sequence_name);
      EXECUTE format('REVOKE ALL PRIVILEGES ON SEQUENCE %s FROM anon', sequence_name);
    END IF;
  END LOOP;
END $$;
