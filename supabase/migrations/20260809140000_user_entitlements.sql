-- ============================================================================
-- Server-owned subscription entitlement state
-- ============================================================================
--
-- WHY THIS TABLE EXISTS
-- Photo analysis is a Premium feature that costs real provider money. Gating it
-- in the app only decorates the button: any authenticated user can POST
-- mode:"meal_text" to the edge function directly. The server therefore needs
-- its own answer to "is this user Premium?", and it must come from somewhere
-- the user cannot write to.
--
-- TRUST CHAIN
--   RevenueCat / App Store -> RevenueCat webhook -> THIS TABLE
--   -> analyze-food enforcement -> photo quota -> Gemini
--
-- The client's CustomerInfo drives UX only. Nothing the client sends —
-- isPremium, an entitlement object, a header — is ever consulted.
--
-- WHY A TABLE RATHER THAN CALLING REVENUECAT PER REQUEST
-- A REST lookup on every photo request puts a third-party service on the
-- critical path: their latency becomes ours, and their outage becomes a choice
-- between blocking paying customers and opening the gate. Webhooks push state
-- to us instead, so the common path is a local index lookup. The REST fallback
-- (see is_stale below) exists only for the gaps webhooks legitimately leave:
-- a brand-new purchase whose webhook is still in flight, or a row that has gone
-- unrefreshed for a day.
--
-- Forward-only. Does not modify any applied migration.

create table if not exists public.user_entitlements (
  -- The RevenueCat App User ID is set to the Supabase user id by
  -- Purchases.logIn(userId), so the two are the same value by construction.
  user_id       uuid primary key references auth.users(id) on delete cascade,
  entitlement   text not null default 'premium',
  is_active     boolean not null default false,
  product_id    text,
  -- When the current period ends. Kept even when is_active is false so an
  -- expiry in the future can still be honoured during a provider outage.
  expires_at    timestamptz,
  store         text,
  -- RevenueCat's event id and timestamp. `last_event_at` is what makes
  -- out-of-order delivery safe: an older event can never overwrite newer state.
  last_event_id text,
  last_event_at timestamptz,
  -- When the server last had authoritative confirmation, by webhook or REST.
  -- Drives the staleness decision.
  last_synced_at timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.user_entitlements is
  'Server-owned subscription state. Written ONLY by service_role via the '
  'RevenueCat webhook or the server REST fallback. Never writable by a user: '
  'this is the sole trusted answer to "is this account Premium?".';

create index if not exists user_entitlements_active_idx
  on public.user_entitlements (is_active, expires_at);

-- ---------------------------------------------------------------------------
-- RLS: read-own only, and no write policy exists at all.
--
-- Mutation happens exclusively through the SECURITY DEFINER functions below,
-- which are granted to service_role. A user cannot insert a row, flip
-- is_active, extend expires_at, or delete a lapsed subscription to re-trigger a
-- trial.
-- ---------------------------------------------------------------------------

alter table public.user_entitlements enable row level security;

drop policy if exists "user_entitlements_select_own" on public.user_entitlements;
create policy "user_entitlements_select_own" on public.user_entitlements
  for select to authenticated using (user_id = (select auth.uid()));

revoke all on table public.user_entitlements from public, anon, authenticated;
grant select on table public.user_entitlements to authenticated;

-- ---------------------------------------------------------------------------
-- How long a synced row is trusted before the server re-checks with RevenueCat.
--
-- This is the worst-case window in which a revocation that never arrived as a
-- webhook can leave someone with access they no longer pay for. Webhooks
-- normally land within seconds, so the REST fallback should almost never fire
-- and the threshold only matters when a delivery fails silently.
--
-- 6 hours rather than a day: the fallback costs one lookup on a row that is
-- missing or stale, which is cheap, while a full day of unearned access is not.
-- Shortening it trades a small number of extra RevenueCat calls — only for
-- users who go quiet for more than six hours and then return — against a 4x
-- smaller exposure window. At this scale the exposure argument wins.
-- ---------------------------------------------------------------------------

create or replace function public.entitlement_stale_after()
returns interval language sql immutable as $$ select interval '6 hours' $$;

-- ---------------------------------------------------------------------------
-- get_premium_state — the ONLY read the enforcement path performs
--
-- Returns what the caller needs to decide, and nothing else. No transaction
-- ids, no store metadata. `needs_refresh` is the server's cue to spend one
-- RevenueCat REST call; `active` is the answer when it does not.
-- ---------------------------------------------------------------------------

create or replace function public.get_premium_state(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  r public.user_entitlements%rowtype;
begin
  if p_user_id is null then
    raise exception 'USER_REQUIRED' using errcode = '22004';
  end if;

  select * into r from public.user_entitlements where user_id = p_user_id;

  if not found then
    -- Never seen this account. Not evidence of Free — evidence of nothing —
    -- so the caller is told to verify rather than to reject.
    return jsonb_build_object(
      'active', false, 'known', false, 'needs_refresh', true,
      'expires_at', null, 'last_synced_at', null
    );
  end if;

  -- An entitlement whose period has ended is not active regardless of the
  -- stored flag: a "cancelled but paid through" subscription stays usable to
  -- its expiry, and a lapsed one stops even if no expiry webhook arrived.
  return jsonb_build_object(
    'active', r.is_active and (r.expires_at is null or r.expires_at > now()),
    'known', true,
    'needs_refresh',
      r.last_synced_at < now() - public.entitlement_stale_after()
      or (r.is_active and r.expires_at is not null and r.expires_at <= now()),
    'expires_at', r.expires_at,
    'last_synced_at', r.last_synced_at
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- apply_entitlement_event — the single write path
--
-- Used by BOTH the webhook and the REST fallback, so there is one place where
-- entitlement state can change and one definition of "newer".
--
-- Out-of-order safety: RevenueCat does not guarantee ordering and retries on
-- failure, so an EXPIRATION delivered late must not cancel a RENEWAL that
-- already landed. A write is applied only when its event timestamp is at least
-- as new as the stored one. Repeated delivery of the same event id is a no-op,
-- which is what makes the endpoint idempotent.
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
  v_event_at timestamptz := coalesce(p_event_at, now());
begin
  if p_user_id is null then
    raise exception 'USER_REQUIRED' using errcode = '22004';
  end if;

  select * into existing from public.user_entitlements where user_id = p_user_id for update;

  if found then
    -- Same event redelivered: refresh only the sync clock so the row stops
    -- looking stale, and change nothing else.
    if p_event_id is not null and existing.last_event_id = p_event_id then
      update public.user_entitlements
         set last_synced_at = now(), updated_at = now()
       where user_id = p_user_id;
      return jsonb_build_object('applied', false, 'reason', 'duplicate_event');
    end if;

    -- Strictly older event: ignore the state, but the lookup still counts as a
    -- successful sync.
    if existing.last_event_at is not null and v_event_at < existing.last_event_at then
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
         last_event_at = excluded.last_event_at,
         last_synced_at = now(),
         updated_at    = now();

  return jsonb_build_object('applied', true, 'active', coalesce(p_is_active, false));
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
--
-- Revoked from anon and authenticated BY NAME: a Supabase project grants
-- EXECUTE on new functions to those roles through default privileges, and an
-- explicit grant is not removed by a revoke aimed at PUBLIC. Getting this wrong
-- is how a refund primitive was once left publicly callable.
-- ---------------------------------------------------------------------------

revoke all on function public.apply_entitlement_event(uuid, boolean, timestamptz, text, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.apply_entitlement_event(uuid, boolean, timestamptz, text, text, text, timestamptz)
  to service_role;

-- Reading own state is harmless and lets the client reconcile after a purchase.
revoke all on function public.get_premium_state(uuid) from public, anon;
grant execute on function public.get_premium_state(uuid) to authenticated, service_role;

revoke all on function public.entitlement_stale_after() from public, anon;
grant execute on function public.entitlement_stale_after() to authenticated, service_role;
