-- ============================================================================
-- Tier-aware AI quota infrastructure (Free / Premium) + free-window policy
-- ============================================================================
--
-- WHAT THIS MIGRATION DOES
--   * makes the daily allowance depend on the caller's SERVER-OWNED entitlement
--   * adds the deterministic "first 14 days" window helpers (policy D)
--   * raises the Premium ceiling to 20/day for all three kinds
--
-- WHAT IT DELIBERATELY DOES NOT DO
--   Free allowances are UNCHANGED at 5 text/day and 5 revisions/day, and the
--   14-day window does NOT yet reduce or expire anything. The window helpers
--   are wired into ai_quota_limit so the code path runs in production before it
--   can matter, but BOTH branches return the same number — see FREE_* below.
--   Turning the product limits on is a separate migration that edits only those
--   constants. Shipping the mechanism dark, then flipping numbers, keeps the
--   risky change and the behavioural change apart.
--
-- WHY THE TIER IS NOT A PARAMETER
--   ai_quota_limit takes a user id, never a tier. It resolves the entitlement
--   itself through get_premium_state. There is no argument, header or body
--   field through which a client can select its own limit. The public surface
--   remains the per-kind wrappers, which take only a request id and read the
--   user from the JWT.
--
-- GRANTS — READ THIS BEFORE ADDING ANY FUNCTION HERE
--   Supabase projects ship
--     alter default privileges ... grant execute on functions to anon, authenticated
--   so EVERY new function is granted to those roles the moment it is created,
--   and `revoke ... from public` does NOT remove an explicit grant. That is
--   exactly what made the revokes in 20260808120000 inert and opened the refund
--   hole closed by 20260809100000. Every function below is therefore revoked
--   from public, anon AND authenticated BY NAME.
--
-- ---------------------------------------------------------------------------
-- 1. Policy constants — immutable, auditable, and deliberately NOT now()
-- ---------------------------------------------------------------------------
-- These are baked values, not wall-clock reads. Re-running this migration, a
-- restore, or a replica rebuild must never move a user's window. That is what
-- "deterministic and auditable server-side" requires.

create or replace function public.ai_free_window_days()
returns integer language sql immutable
as $$ select 14 $$;

comment on function public.ai_free_window_days() is
  'Length of the Free AI-analysis window in days. Policy constant.';

-- GutWell AI 1.0.0 went live on the US/DE App Store on 2026-09-16.
create or replace function public.ai_public_launch_at()
returns timestamptz language sql immutable
as $$ select timestamptz '2026-09-16 00:00:00+00' $$;

comment on function public.ai_public_launch_at() is
  'Public App Store launch of GutWell AI 1.0.0. Accounts older than this are '
  'pre-launch testers and are handled by policy D in ai_free_window_start().';

-- The activation instant of THIS migration, written as a literal on purpose.
create or replace function public.ai_tiering_activated_at()
returns timestamptz language sql immutable
as $$ select timestamptz '2026-09-18 00:00:00+00' $$;

comment on function public.ai_tiering_activated_at() is
  'Fixed activation timestamp of the tiering migration. Pre-launch accounts '
  'measure their free window from here, so the rule is reproducible.';

-- ---------------------------------------------------------------------------
-- 2. Free-window start — POLICY D
-- ---------------------------------------------------------------------------
-- Source of truth is auth.users.created_at:
--   * set by GoTrue at signup
--   * the auth schema is not exposed to the Data API, so no client can write it
--   * survives reinstall, logout, local-storage wipe and device change
--
-- public.profiles.created_at was rejected as the source: 010_auth_profile_
-- persistence grants the user UPDATE on their own profile row, so a modified
-- client could push that timestamp forward and extend its own window.
--
-- Policy D: accounts created on or after launch measure from their own signup;
-- pre-launch (TestFlight / internal) accounts measure from activation, so the
-- people who tested the app are not cut off the moment this lands.

create or replace function public.ai_free_window_start(p_user_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
           when u.created_at < public.ai_public_launch_at()
             then public.ai_tiering_activated_at()
           else u.created_at
         end
    from auth.users u
   where u.id = p_user_id
$$;

comment on function public.ai_free_window_start(uuid) is
  'POLICY D. Start of the Free AI window: auth.users.created_at for accounts '
  'created at or after public launch, ai_tiering_activated_at() for pre-launch '
  'accounts. NULL for an unknown user.';

-- Unknown user -> false. An account we cannot find is not given free inference.
create or replace function public.ai_free_window_active(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    now() < public.ai_free_window_start(p_user_id)
            + (public.ai_free_window_days() || ' days')::interval,
    false)
$$;

comment on function public.ai_free_window_active(uuid) is
  'True while the account is inside its Free AI window. Not yet used to reduce '
  'any allowance — see the header note.';

-- ---------------------------------------------------------------------------
-- 3. The allowance — SINGLE SOURCE OF TRUTH
-- ---------------------------------------------------------------------------
-- Replaces the 1-arg immutable version. It must be STABLE, not IMMUTABLE: it
-- reads user_entitlements and auth.users. SECURITY DEFINER because those are
-- not readable by the calling role.

drop function if exists public.ai_photo_daily_limit();
drop function if exists public.ai_quota_limit(text);

create or replace function public.ai_quota_limit(p_kind text, p_user_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  -- Premium abuse ceiling. Not a product limit: 20 analyses in a day is far
  -- beyond genuine use, and the edge function's burst limiter still applies.
  PREMIUM_LIMIT   constant integer := 20;

  -- ── BATCH 4 EDITS ONLY THESE FOUR CONSTANTS ──────────────────────────────
  -- Today both window branches are 5, so this migration reduces and expires
  -- nothing. Batch 4 sets IN_WINDOW to 1 and EXPIRED to 0.
  FREE_TEXT_IN_WINDOW     constant integer := 5;
  FREE_TEXT_EXPIRED       constant integer := 5;
  FREE_REVISION_IN_WINDOW constant integer := 5;
  FREE_REVISION_EXPIRED   constant integer := 5;
  -- Photo is gated by entitlement in the edge function, which returns
  -- PREMIUM_REQUIRED before any reservation is attempted, so a Free user never
  -- reaches this number. Left at 5 rather than 0 so this migration changes no
  -- observable behaviour; batch 4 sets it to 0 as defence in depth.
  FREE_PHOTO              constant integer := 5;
  -- ─────────────────────────────────────────────────────────────────────────

  v_premium  boolean;
  v_eligible boolean;
begin
  -- Whitelist first: an unknown kind is rejected before any lookup.
  if p_kind is null or p_kind not in ('photo_analysis', 'text_analysis', 'meal_revision') then
    return null;
  end if;
  if p_user_id is null then
    raise exception 'USER_REQUIRED' using errcode = '22004';
  end if;

  v_premium := coalesce((public.get_premium_state(p_user_id) ->> 'active')::boolean, false);

  -- Premium: no window, one ceiling, every kind.
  if v_premium then
    return PREMIUM_LIMIT;
  end if;

  v_eligible := public.ai_free_window_active(p_user_id);

  return case p_kind
           when 'photo_analysis' then FREE_PHOTO
           when 'text_analysis'  then
             case when v_eligible then FREE_TEXT_IN_WINDOW else FREE_TEXT_EXPIRED end
           when 'meal_revision'  then
             case when v_eligible then FREE_REVISION_IN_WINDOW else FREE_REVISION_EXPIRED end
         end;
end;
$$;

comment on function public.ai_quota_limit(text, uuid) is
  'SINGLE SOURCE OF TRUTH for per-user-per-day AI allowances. Resolves the '
  'entitlement itself; the tier is never a parameter. Unknown kinds return '
  'NULL and are rejected by the reservation function.';

-- ---------------------------------------------------------------------------
-- 4. Reservation — repointed at the 2-arg allowance
-- ---------------------------------------------------------------------------
-- Only two things change from 20260808120000: the limit is resolved AFTER the
-- authentication check (it now needs the user id, and resolving it in DECLARE
-- would report UNKNOWN_QUOTA_KIND for an unauthenticated caller instead of
-- UNAUTHENTICATED), and it is resolved per user. The atomic claim, the
-- idempotency key, the refund-on-full path and the returned shape are byte-for-
-- byte the previous behaviour.

create or replace function public._ai_reserve_quota(p_request_id uuid, p_kind text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user     uuid := auth.uid();
  v_date     date := (now() at time zone 'utc')::date;
  v_limit    integer;
  v_used     integer;
  v_reserved boolean;
  v_reset    timestamptz := ((v_date + 1)::timestamp at time zone 'utc');
begin
  -- The user is taken from the JWT, never from an argument. A caller cannot
  -- spend, or inspect, another account's quota.
  if v_user is null then
    raise exception 'UNAUTHENTICATED' using errcode = '28000';
  end if;
  if p_request_id is null then
    raise exception 'REQUEST_ID_REQUIRED' using errcode = '22004';
  end if;

  v_limit := public.ai_quota_limit(p_kind, v_user);

  -- Unknown kind: ai_quota_limit whitelists, so this is the rejection path.
  if v_limit is null then
    raise exception 'UNKNOWN_QUOTA_KIND' using errcode = '22023';
  end if;
  if v_limit < 1 then
    return jsonb_build_object(
      'allowed', false, 'duplicate', false, 'kind', p_kind, 'limit', v_limit,
      'used', 0, 'remaining', 0, 'reset_at', v_reset
    );
  end if;

  insert into public.ai_quota_reservations (user_id, request_id, usage_date, kind)
  values (v_user, p_request_id, v_date, p_kind)
  on conflict (user_id, request_id, usage_date, kind) do nothing;
  v_reserved := found;

  if not v_reserved then
    -- Same request, same kind, same day: a retry of work already paid for.
    select used into v_used from public.ai_daily_usage
     where user_id = v_user and usage_date = v_date and kind = p_kind;
    return jsonb_build_object(
      'allowed', true, 'duplicate', true, 'kind', p_kind, 'limit', v_limit,
      'used', coalesce(v_used, 0),
      'remaining', greatest(v_limit - coalesce(v_used, 0), 0),
      'reset_at', v_reset
    );
  end if;

  -- Atomic claim. One statement, so two concurrent callers cannot both win.
  insert into public.ai_daily_usage (user_id, usage_date, kind, used)
  values (v_user, v_date, p_kind, 1)
  on conflict (user_id, usage_date, kind) do update
     set used = ai_daily_usage.used + 1, updated_at = now()
   where ai_daily_usage.used < v_limit
  returning used into v_used;

  if v_used is null then
    -- The conditional update did not fire: the day is already full. Drop the
    -- reservation so this request_id is not permanently marked as paid.
    delete from public.ai_quota_reservations
     where user_id = v_user and request_id = p_request_id
       and usage_date = v_date and kind = p_kind;
    select used into v_used from public.ai_daily_usage
     where user_id = v_user and usage_date = v_date and kind = p_kind;
    return jsonb_build_object(
      'allowed', false, 'duplicate', false, 'kind', p_kind, 'limit', v_limit,
      'used', coalesce(v_used, v_limit), 'remaining', 0, 'reset_at', v_reset
    );
  end if;

  return jsonb_build_object(
    'allowed', true, 'duplicate', false, 'kind', p_kind, 'limit', v_limit,
    'used', v_used, 'remaining', greatest(v_limit - v_used, 0), 'reset_at', v_reset
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Refund — repointed, semantics untouched
-- ---------------------------------------------------------------------------
-- Still service_role-only, still takes an explicit p_user_id, still decrements
-- only when a matching reservation existed. The allowance is read here purely
-- to reject an unknown kind, exactly as before.

create or replace function public._ai_release_quota(
  p_user_id uuid,
  p_request_id uuid,
  p_kind text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_date     date := (now() at time zone 'utc')::date;
  v_limit    integer;
  v_used     integer;
  v_released boolean;
begin
  if p_user_id is null then
    raise exception 'USER_REQUIRED' using errcode = '22004';
  end if;

  v_limit := public.ai_quota_limit(p_kind, p_user_id);
  if v_limit is null then
    raise exception 'UNKNOWN_QUOTA_KIND' using errcode = '22023';
  end if;

  delete from public.ai_quota_reservations
   where user_id = p_user_id and request_id = p_request_id
     and usage_date = v_date and kind = p_kind;
  v_released := found;

  if v_released then
    update public.ai_daily_usage
       set used = greatest(used - 1, 0), updated_at = now()
     where user_id = p_user_id and usage_date = v_date and kind = p_kind;
  end if;

  select used into v_used from public.ai_daily_usage
   where user_id = p_user_id and usage_date = v_date and kind = p_kind;

  return jsonb_build_object(
    'released', v_released, 'kind', p_kind, 'limit', v_limit,
    'used', coalesce(v_used, 0),
    'remaining', greatest(v_limit - coalesce(v_used, 0), 0)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Grants — revoked from the roles BY NAME
-- ---------------------------------------------------------------------------
-- None of these is part of the client API. ai_quota_limit and the window
-- helpers all take a user id, so granting them to `authenticated` would let any
-- signed-in caller read another account's tier and signup date. The reservation
-- wrappers (unchanged, still granted to authenticated) remain the only public
-- surface, and they take a request id and read the user from the JWT.

revoke all on function public.ai_free_window_days()            from public, anon, authenticated;
revoke all on function public.ai_public_launch_at()            from public, anon, authenticated;
revoke all on function public.ai_tiering_activated_at()        from public, anon, authenticated;
revoke all on function public.ai_free_window_start(uuid)       from public, anon, authenticated;
revoke all on function public.ai_free_window_active(uuid)      from public, anon, authenticated;
revoke all on function public.ai_quota_limit(text, uuid)       from public, anon, authenticated;
revoke all on function public._ai_reserve_quota(uuid, text)    from public, anon, authenticated;
revoke all on function public._ai_release_quota(uuid, uuid, text) from public, anon, authenticated;

-- service_role is the edge function's own credential and never reaches a user.
grant execute on function public.ai_free_window_days()            to service_role;
grant execute on function public.ai_public_launch_at()            to service_role;
grant execute on function public.ai_tiering_activated_at()        to service_role;
grant execute on function public.ai_free_window_start(uuid)       to service_role;
grant execute on function public.ai_free_window_active(uuid)      to service_role;
grant execute on function public.ai_quota_limit(text, uuid)       to service_role;
grant execute on function public._ai_release_quota(uuid, uuid, text) to service_role;

-- The per-kind reserve wrappers are unchanged and keep their existing grants:
-- authenticated + service_role. They are re-asserted here rather than assumed,
-- because a dropped-and-recreated dependency can silently lose a grant.
grant execute on function public.reserve_ai_photo_quota(uuid)    to authenticated, service_role;
grant execute on function public.reserve_ai_text_quota(uuid)     to authenticated, service_role;
grant execute on function public.reserve_ai_revision_quota(uuid) to authenticated, service_role;
