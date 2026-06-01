-- ============================================
-- Offline-sync idempotency for food_logs and symptoms
-- ============================================
-- The offline queue (lib/offline-queue.ts) flushes food_logs and symptoms via
-- plain INSERT with no server-side dedupe. A partial flush (row written but the
-- response lost / app killed mid-flush) or a re-enqueue could create duplicate
-- rows. check_ins is already protected by migration 006's (user_id, entry_date)
-- unique constraint + upsert; this does the equivalent for the two remaining
-- offline-synced tables using a stable client-generated key.
--
-- The client attaches `client_uuid` (the queue item id, generated once at
-- enqueue time) and upserts ON CONFLICT (user_id, client_uuid). Online inserts
-- leave client_uuid NULL; Postgres treats NULLs as distinct in a unique index,
-- so existing rows and normal online writes are unaffected.

ALTER TABLE public.food_logs ADD COLUMN IF NOT EXISTS client_uuid TEXT;
ALTER TABLE public.symptoms  ADD COLUMN IF NOT EXISTS client_uuid TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_food_logs_user_client_uuid
  ON public.food_logs (user_id, client_uuid);

CREATE UNIQUE INDEX IF NOT EXISTS uq_symptoms_user_client_uuid
  ON public.symptoms (user_id, client_uuid);
