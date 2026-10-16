-- ============================================================================
-- Entitlement ordering: only a real event may order events
-- ============================================================================
--
-- THE BUG THIS FIXES
-- A first-time subscriber's genuine INITIAL_PURCHASE webhook was rejected as
-- `stale_event`, leaving the row with null product_id, store and last_event_id
-- — no purchase provenance at all, and no event id to make redelivery
-- idempotent.
--
-- The two writers of this table disagree about what a timestamp means:
--
--   revenuecat-webhook  passes RevenueCat's event_timestamp_ms — when the
--                       purchase actually happened.
--   analyze-food        (the REST fallback) passes p_event_at => null, and
--                       says why at the call site: "left null so this can
--                       never win against a real webhook event".
--
-- `v_event_at := coalesce(p_event_at, now())` defeated exactly that intent. The
-- fallback's null became now() and was written to last_event_at, so the row
-- claimed to have seen an event at hydration time. A purchase webhook arriving
-- afterwards carries the REAL purchase time, which is necessarily EARLIER, and
-- the out-of-order guard correctly refused it.
--
-- Observed 2026-08-16: fallback hydrated at 16:55:47, the retried
-- INITIAL_PURCHASE (purchased 11:29:49) was refused at 20:07:16 with
-- `result: "stale_event"`. Entitlement state was right; provenance was lost.
-- It would repeat for every first-time subscriber whose purchase webhook lands
-- after their first photo analysis — the exact case the fallback exists for.
--
-- THE INVARIANT
-- last_event_at means "the timestamp of the newest REAL event applied". A
-- writer with no event timestamp has no place in the ordering: it may refresh
-- state it verified (is_active, expires_at, last_synced_at) but must neither
-- write nor advance last_event_at, and must never make a later real event look
-- stale.
--
-- Three changes, all inside apply_entitlement_event. No schema change, no new
-- column, no change to either edge function — the call sites were already
-- expressing the right intent.
--
-- Forward-only. Does not modify any applied migration and touches no rows.
-- ---------------------------------------------------------------------------

create or replace function public.apply_entitlement_event(
  p_user_id     uuid,
  p_is_active   boolean,
  p_expires_at  timestamptz default null,
  p_product_id  text default null,
  p_store       text default null,
  p_event_id    text default null,
  p_event_at    timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  existing public.user_entitlements%rowtype;
  -- (1) No coalesce to now(). A caller without a real event timestamp stays
  -- null all the way through, which is what keeps it out of the ordering.
  v_event_at timestamptz := p_event_at;
begin
  if p_user_id is null then
    raise exception 'USER_REQUIRED' using errcode = '22004';
  end if;

  select * into existing from public.user_entitlements where user_id = p_user_id for update;

  if found then
    -- Same event redelivered: refresh only the sync clock so the row stops
    -- looking stale, and change nothing else. Unchanged — the fallback passes
    -- no event id, so it never reaches this branch.
    if p_event_id is not null and existing.last_event_id = p_event_id then
      update public.user_entitlements
         set last_synced_at = now(), updated_at = now()
       where user_id = p_user_id;
      return jsonb_build_object('applied', false, 'reason', 'duplicate_event');
    end if;

    -- Strictly older event: ignore the state, but the lookup still counts as a
    -- successful sync.
    --
    -- (2) Ordering is now decided between two REAL events only. A caller with
    -- no event timestamp cannot be stale, because it is making no claim about
    -- when anything happened — and, per (3), it leaves no timestamp behind for
    -- a later real event to be measured against.
    if v_event_at is not null
       and existing.last_event_at is not null
       and v_event_at < existing.last_event_at then
      update public.user_entitlements
         set last_synced_at = now(), updated_at = now()
       where user_id = p_user_id;
      return jsonb_build_object('applied', false, 'reason', 'stale_event');
    end if;
  end if;

  insert into public.user_entitlements as ue (
    user_id, entitlement, is_active, product_id, expires_at, store,
    last_event_id, last_event_at, last_synced_at, updated_at
  ) values (
    p_user_id, 'premium', coalesce(p_is_active, false), p_product_id, p_expires_at,
    p_store, p_event_id, v_event_at, now(), now()
  )
  on conflict (user_id) do update
     set is_active     = excluded.is_active,
         product_id    = coalesce(excluded.product_id, ue.product_id),
         expires_at    = excluded.expires_at,
         store         = coalesce(excluded.store, ue.store),
         last_event_id = coalesce(excluded.last_event_id, ue.last_event_id),
         -- (3) last_event_at now preserves like the other provenance fields
         -- rather than overwriting. This is what stops the fallback from
         -- stamping the row with a time no event ever happened at.
         last_event_at = coalesce(excluded.last_event_at, ue.last_event_at),
         last_synced_at = now(),
         updated_at    = now();

  return jsonb_build_object('applied', true, 'active', coalesce(p_is_active, false));
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
--
-- `create or replace function` keeps existing privileges, so this repeats the
-- original grants rather than relying on that. Restated by name for the same
-- reason the original migration does: a Supabase project hands EXECUTE on new
-- functions to anon/authenticated through default privileges, and a revoke
-- aimed at PUBLIC does not take an explicit grant away.
-- ---------------------------------------------------------------------------

revoke all on function public.apply_entitlement_event(uuid, boolean, timestamptz, text, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.apply_entitlement_event(uuid, boolean, timestamptz, text, text, text, timestamptz)
  to service_role;
