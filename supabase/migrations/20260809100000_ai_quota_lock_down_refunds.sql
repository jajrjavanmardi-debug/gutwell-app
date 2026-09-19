-- ============================================================================
-- Close a quota bypass: refunds and telemetry must be server-only
-- ============================================================================
--
-- THE HOLE
-- 20260808120000 granted the reserve/release wrappers to `authenticated`,
-- because the edge function calls them with the caller's own JWT. Reserving
-- that way is harmless — the worst a user can do is spend their own quota.
-- RELEASING is not. Any authenticated user could:
--
--   1. run a real analysis (edge function reserves a slot, Gemini is billed)
--   2. call release_ai_photo_quota(<their own request id>) directly
--   3. repeat forever
--
-- Each cycle returned the counter to its previous value, so the daily ceiling
-- could be bypassed completely and provider spend was unbounded again. This was
-- caught by probing the deployed project, not by any local test — the earlier
-- verification asserted that the grants in the MIGRATION FILE were narrow, and
-- they were; what it could not see is that Supabase projects ship
-- `alter default privileges ... grant execute on functions to anon, authenticated`,
-- so every new function is granted to those roles EXPLICITLY. A
-- `revoke ... from public` does not remove an explicit grant, so the revokes in
-- that migration were inert.
--
-- THE FIX
--   * refunds and telemetry now take an explicit p_user_id and are executable
--     ONLY by service_role, which never reaches a user: it is a server secret
--     held by the edge function.
--   * every grant is revoked from anon and authenticated BY NAME, not via
--     PUBLIC, so the default-privileges grant is actually removed.
--   * reserving stays available to authenticated. It is self-limiting by
--     construction and keeps auth.uid() as the identity, so no user id has to
--     be trusted from a caller.
--
-- Forward-only: 20260808120000 is already applied and is not edited.

-- ---------------------------------------------------------------------------
-- 1. Refund — service_role only, explicit user
-- ---------------------------------------------------------------------------

-- The old signatures are removed outright rather than left revoked, so there is
-- no chance of a stale grant keeping them reachable.
drop function if exists public.release_ai_photo_quota(uuid);
drop function if exists public.release_ai_text_quota(uuid);
drop function if exists public.release_ai_revision_quota(uuid);
drop function if exists public._ai_release_quota(uuid, text);

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
  v_limit    integer := public.ai_quota_limit(p_kind);
  v_used     integer;
  v_released boolean;
begin
  if p_user_id is null then
    raise exception 'USER_REQUIRED' using errcode = '22004';
  end if;
  if v_limit is null then
    raise exception 'UNKNOWN_QUOTA_KIND' using errcode = '22023';
  end if;

  -- Deletes ONE exact reservation identity and decrements only if that row
  -- existed, so this can never reduce a counter that was not reserved.
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

create or replace function public.release_ai_photo_quota(p_user_id uuid, p_request_id uuid)
returns jsonb language sql security definer set search_path = public, pg_temp
as $$ select public._ai_release_quota(p_user_id, p_request_id, 'photo_analysis') $$;

create or replace function public.release_ai_text_quota(p_user_id uuid, p_request_id uuid)
returns jsonb language sql security definer set search_path = public, pg_temp
as $$ select public._ai_release_quota(p_user_id, p_request_id, 'text_analysis') $$;

create or replace function public.release_ai_revision_quota(p_user_id uuid, p_request_id uuid)
returns jsonb language sql security definer set search_path = public, pg_temp
as $$ select public._ai_release_quota(p_user_id, p_request_id, 'meal_revision') $$;

-- ---------------------------------------------------------------------------
-- 2. Telemetry — service_role only, explicit user
--
-- Previously any authenticated user could insert cost rows for themselves and
-- poison the spend figures the pricing decision will be based on.
-- ---------------------------------------------------------------------------

drop function if exists public.record_ai_usage(uuid, text, text, boolean, text, integer, integer, integer, integer, integer);

create or replace function public.record_ai_usage(
  p_user_id         uuid,
  p_request_id      uuid,
  p_mode            text,
  p_model           text,
  p_succeeded       boolean,
  p_failure_kind    text default null,
  p_prompt_tokens   integer default null,
  p_output_tokens   integer default null,
  p_thoughts_tokens integer default null,
  p_cached_tokens   integer default null,
  p_total_tokens    integer default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_user_id is null then
    raise exception 'USER_REQUIRED' using errcode = '22004';
  end if;
  insert into public.ai_usage_events (
    user_id, request_id, mode, model, succeeded, failure_kind,
    prompt_tokens, output_tokens, thoughts_tokens, cached_tokens, total_tokens
  ) values (
    p_user_id, p_request_id, left(coalesce(p_mode, 'unknown'), 40),
    left(coalesce(p_model, 'unknown'), 60), p_succeeded,
    -- Still clamped: no provider error text can reach the table.
    case when p_failure_kind in ('upstream', 'empty', 'error') then p_failure_kind else null end,
    p_prompt_tokens, p_output_tokens, p_thoughts_tokens, p_cached_tokens, p_total_tokens
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Grants — revoke from the roles BY NAME
--
-- `revoke ... from public` is not enough on a Supabase project: default
-- privileges grant EXECUTE to anon and authenticated explicitly, and an
-- explicit grant survives a revoke aimed at PUBLIC. That is what left the
-- refund primitive reachable.
-- ---------------------------------------------------------------------------

do $$
declare fn text;
begin
  foreach fn in array array[
    'public._ai_release_quota(uuid, uuid, text)',
    'public.release_ai_photo_quota(uuid, uuid)',
    'public.release_ai_text_quota(uuid, uuid)',
    'public.release_ai_revision_quota(uuid, uuid)',
    'public.record_ai_usage(uuid, uuid, text, text, boolean, text, integer, integer, integer, integer, integer)',
    'public._ai_reserve_quota(uuid, text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
  end loop;

  -- Server-side callers only.
  foreach fn in array array[
    'public._ai_release_quota(uuid, uuid, text)',
    'public.release_ai_photo_quota(uuid, uuid)',
    'public.release_ai_text_quota(uuid, uuid)',
    'public.release_ai_revision_quota(uuid, uuid)',
    'public.record_ai_usage(uuid, uuid, text, text, boolean, text, integer, integer, integer, integer, integer)'
  ] loop
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;

-- Reserving stays available to the caller's own JWT: it can only ever spend the
-- caller's own quota, and auth.uid() means no user id is trusted from input.
revoke all on function public.reserve_ai_photo_quota(uuid) from public, anon;
revoke all on function public.reserve_ai_text_quota(uuid) from public, anon;
revoke all on function public.reserve_ai_revision_quota(uuid) from public, anon;
grant execute on function public.reserve_ai_photo_quota(uuid) to authenticated, service_role;
grant execute on function public.reserve_ai_text_quota(uuid) to authenticated, service_role;
grant execute on function public.reserve_ai_revision_quota(uuid) to authenticated, service_role;

-- The tables were already read-own via RLS with no write policies; make the
-- absence of a write path explicit against anon as well.
revoke all on table public.ai_quota_reservations from anon;
revoke all on table public.ai_daily_usage        from anon;
revoke all on table public.ai_usage_events       from anon;
