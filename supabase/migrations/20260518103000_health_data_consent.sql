-- Store explicit health-data consent for signed-in account sync.
-- Guest/demo consent is stored locally on the device/browser.

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS health_data_consent_accepted BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS health_data_consent_accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS health_data_consent_version TEXT NOT NULL DEFAULT '2026-05-18';

UPDATE public.user_profiles
SET health_data_consent_version = '2026-05-18'
WHERE health_data_consent_version IS NULL
   OR health_data_consent_version = '';

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_profiles TO authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.user_profiles FROM anon;
