-- Waitlist table for GutWell website
-- RLS: no public SELECT, INSERT only via service-role Edge Function

CREATE TABLE IF NOT EXISTS public.waitlist (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT waitlist_email_unique UNIQUE (email),
  CONSTRAINT waitlist_email_format CHECK (email ~* '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$')
);

-- No public access at all — Edge Function uses service role
ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;

-- Explicitly deny all access to anon and authenticated roles.
-- The table was originally created directly against production, so these
-- policies may already exist. CREATE POLICY has no IF NOT EXISTS, so drop
-- first — inside the migration's transaction there is no exposure window,
-- and the recreated policies are identical.
DROP POLICY IF EXISTS "deny_all_select" ON public.waitlist;
CREATE POLICY "deny_all_select" ON public.waitlist
  FOR SELECT USING (false);

DROP POLICY IF EXISTS "deny_all_insert" ON public.waitlist;
CREATE POLICY "deny_all_insert" ON public.waitlist
  FOR INSERT WITH CHECK (false);

-- Index for admin queries
CREATE INDEX IF NOT EXISTS idx_waitlist_created_at
  ON public.waitlist (created_at DESC);

COMMENT ON TABLE public.waitlist IS
  'Website waitlist emails. Access only via waitlist-signup Edge Function using service role.';
