-- ============================================================================
-- AI cost control: durable per-user daily photo-analysis quota + cost telemetry
-- ============================================================================
--
-- WHY
-- The analyze-food edge function calls Gemini on every meal photo. Before this
-- migration the only protection was an in-memory, IP-keyed limiter of 10
-- req/min inside the function. That is not a spend control:
--   * edge instances do not share memory, so the counter resets constantly;
--   * IPs are shared behind NAT and trivially rotated by an attacker;
--   * nothing bounded the TOTAL number of paid inferences a single account
--     could trigger in a day.
-- A compromised account, a retry storm, or a script could therefore generate
-- unbounded provider spend.
--
-- WHAT
-- A hard server-side ceiling of 5 NEW meal-photo analyses per authenticated
-- user per UTC day, enforced in the database so it survives app restarts,
-- reinstalls, multiple devices and edge-instance recycling.
--
-- ── Why the limit is not a function parameter ───────────────────────────────
-- It is returned by ai_photo_daily_limit() and read inside the reservation
-- function. If the caller passed it, a hand-crafted RPC call could ask for a
-- limit of 999. The client cannot influence it at all.
--
-- ── Why reservations are keyed by day ───────────────────────────────────────
-- The idempotency key is (user_id, request_id, usage_date), NOT
-- (user_id, request_id). Dropping usage_date would let an attacker replay one
-- captured request_id every day forever and be told "already reserved" without
-- ever consuming a slot — unlimited free inference. Including the date means a
-- same-day retry is free (correct) and a next-day replay costs a slot
-- (correct).
--
-- ── Why the counter is a single conditional UPSERT ──────────────────────────
-- `insert ... on conflict do update ... where used < limit` is one statement.
-- Postgres takes a row lock on conflict, so two concurrent callers serialise:
-- the second sees the first's committed value. A read-then-write pair would
-- let both see "4 used" and both become the fifth. `used` can never exceed the
-- limit, whatever the concurrency.
--
-- Forward-only. Does not modify any existing migration.

-- ---------------------------------------------------------------------------
-- The limits themselves
--
-- A whitelist, not a lookup table: an unknown kind returns NULL and the
-- reservation raises. There is deliberately no row anywhere a user could
-- INSERT to invent a new kind, and no parameter through which a limit can be
-- supplied. Changing a number requires a migration, which is correct for a
-- spend control.
-- ---------------------------------------------------------------------------

-- THIS FUNCTION IS THE SINGLE SOURCE OF TRUTH FOR AI ALLOWANCES.
--
-- When entitlements arrive, the Free/Premium split belongs HERE — one function
-- taking the caller's tier — and nowhere else. Scattering allowance decisions
-- across screens is how a paywall ends up enforced in three places and
-- bypassable in two of them. The edge function and the client both read the
-- limit back from the reservation result; neither hardcodes a number.
--
-- v1 pre-RevenueCat safety defaults are deliberately conservative and uniform.
create or replace function public.ai_quota_limit(p_kind text)
returns integer
language sql
immutable
as $$
  select case p_kind
    -- A meal photo. Becomes the Premium-gated path; 5/day is the eventual
    -- Premium ceiling as well as today's safety default.
    when 'photo_analysis' then 5
    -- Typed meal description. The permanent fallback, and the only analysis a
    -- Free user will get once photo is gated. Target after RevenueCat:
    -- 5 Free / 20 Premium — a tier argument here, not a new mechanism.
    when 'text_analysis'  then 5
    -- Corrections to an existing analysis.
    when 'meal_revision'  then 5
    else null
  end
$$;

comment on function public.ai_quota_limit(text) is
  'SINGLE SOURCE OF TRUTH for per-user-per-UTC-day AI allowances. Unknown kinds '
  'return NULL and are rejected. Free/Premium tiering belongs in this function '
  'and nowhere else. Changing a value requires a migration by design.';

-- Kept as a thin alias so existing callers and tests keep working.
create or replace function public.ai_photo_daily_limit()
returns integer
language sql
immutable
as $$ select public.ai_quota_limit('photo_analysis') $$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- One row per logical analysis request that reserved a slot. Existence of a
-- row is what makes a retry free.
-- `kind` is in the key on purpose. Without it, reusing a photo request id for a
-- revision would conflict, be reported as "already reserved", and hand the
-- caller a free revision.
create table if not exists public.ai_quota_reservations (
  user_id    uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  usage_date date not null,
  kind       text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, request_id, usage_date, kind)
);

-- The authoritative counter. One row per user per day per kind.
create table if not exists public.ai_daily_usage (
  user_id    uuid not null references auth.users(id) on delete cascade,
  usage_date date not null,
  kind       text not null,
  used       integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, usage_date, kind),
  constraint ai_daily_usage_used_nonneg check (used >= 0)
);

-- Cost telemetry. Deliberately carries NO content: no image, no prompt, no
-- meal description, no symptoms, no model output. Token counts and identifiers
-- only, so real provider spend can be measured and re-priced later without ever
-- holding health data for analytics purposes.
create table if not exists public.ai_usage_events (
  id              bigint generated always as identity primary key,
  user_id         uuid not null references auth.users(id) on delete cascade,
  request_id      uuid,
  mode            text not null,
  model           text not null,
  succeeded       boolean not null,
  -- Coarse class only ('upstream' | 'empty' | 'error'). Never the provider's
  -- error text, which can echo request content.
  failure_kind    text,
  prompt_tokens   integer,
  output_tokens   integer,
  thoughts_tokens integer,
  cached_tokens   integer,
  total_tokens    integer,
  created_at      timestamptz not null default now()
);

create index if not exists ai_usage_events_created_at_idx
  on public.ai_usage_events (created_at desc);
create index if not exists ai_usage_events_user_created_idx
  on public.ai_usage_events (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Row level security
--
-- Read-own only. There is deliberately NO insert/update/delete policy on any of
-- these tables: every write goes through the SECURITY DEFINER functions below,
-- which bypass RLS as the definer. A user therefore cannot raise their limit,
-- forge usage, or delete usage rows to win back scans.
-- ---------------------------------------------------------------------------

alter table public.ai_quota_reservations enable row level security;
alter table public.ai_daily_usage        enable row level security;
alter table public.ai_usage_events       enable row level security;

drop policy if exists "ai_quota_reservations_select_own" on public.ai_quota_reservations;
create policy "ai_quota_reservations_select_own" on public.ai_quota_reservations
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "ai_daily_usage_select_own" on public.ai_daily_usage;
create policy "ai_daily_usage_select_own" on public.ai_daily_usage
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "ai_usage_events_select_own" on public.ai_usage_events;
create policy "ai_usage_events_select_own" on public.ai_usage_events
  for select to authenticated using (user_id = (select auth.uid()));

-- SELECT only. No INSERT/UPDATE/DELETE grant exists for these tables.
grant usage on schema public to authenticated;
grant select on table public.ai_quota_reservations to authenticated;
grant select on table public.ai_daily_usage        to authenticated;
grant select on table public.ai_usage_events       to authenticated;

-- ---------------------------------------------------------------------------
-- Atomic reservation — INTERNAL
--
-- Not granted to anyone. It takes a `kind`, so exposing it publicly would let a
-- caller aim a reservation (or a refund) at a counter of their choosing. The
-- public surface is the per-kind wrappers below, each of which hardcodes its
-- own kind and can touch nothing else.
-- ---------------------------------------------------------------------------

create or replace function public._ai_reserve_quota(p_request_id uuid, p_kind text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user     uuid := auth.uid();
  v_date     date := (now() at time zone 'utc')::date;
  v_limit    integer := public.ai_quota_limit(p_kind);
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

  -- Atomic claim. See the header note on why this is one statement.
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
-- Refund — INTERNAL
--
-- Deletes one exact reservation identity (user, request, day, kind) and
-- decrements only if that row existed. It cannot decrement a counter without a
-- matching reservation, so there is no primitive for arbitrarily reducing a
-- user's usage.
-- ---------------------------------------------------------------------------

create or replace function public._ai_release_quota(p_request_id uuid, p_kind text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user     uuid := auth.uid();
  v_date     date := (now() at time zone 'utc')::date;
  v_limit    integer := public.ai_quota_limit(p_kind);
  v_used     integer;
  v_released boolean;
begin
  if v_user is null then
    raise exception 'UNAUTHENTICATED' using errcode = '28000';
  end if;
  if v_limit is null then
    raise exception 'UNKNOWN_QUOTA_KIND' using errcode = '22023';
  end if;

  delete from public.ai_quota_reservations
   where user_id = v_user and request_id = p_request_id
     and usage_date = v_date and kind = p_kind;
  v_released := found;

  if v_released then
    -- greatest(...) keeps the counter non-negative even if a release is
    -- somehow delivered twice.
    update public.ai_daily_usage
       set used = greatest(used - 1, 0), updated_at = now()
     where user_id = v_user and usage_date = v_date and kind = p_kind;
  end if;

  select used into v_used from public.ai_daily_usage
   where user_id = v_user and usage_date = v_date and kind = p_kind;

  return jsonb_build_object(
    'released', v_released, 'kind', p_kind, 'limit', v_limit,
    'used', coalesce(v_used, 0),
    'remaining', greatest(v_limit - coalesce(v_used, 0), 0)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Public API — one wrapper pair per kind, each hardcoding its own kind
-- ---------------------------------------------------------------------------

create or replace function public.reserve_ai_photo_quota(p_request_id uuid)
returns jsonb language sql security definer set search_path = public, pg_temp
as $$ select public._ai_reserve_quota(p_request_id, 'photo_analysis') $$;

create or replace function public.release_ai_photo_quota(p_request_id uuid)
returns jsonb language sql security definer set search_path = public, pg_temp
as $$ select public._ai_release_quota(p_request_id, 'photo_analysis') $$;

create or replace function public.reserve_ai_text_quota(p_request_id uuid)
returns jsonb language sql security definer set search_path = public, pg_temp
as $$ select public._ai_reserve_quota(p_request_id, 'text_analysis') $$;

create or replace function public.release_ai_text_quota(p_request_id uuid)
returns jsonb language sql security definer set search_path = public, pg_temp
as $$ select public._ai_release_quota(p_request_id, 'text_analysis') $$;

create or replace function public.reserve_ai_revision_quota(p_request_id uuid)
returns jsonb language sql security definer set search_path = public, pg_temp
as $$ select public._ai_reserve_quota(p_request_id, 'meal_revision') $$;

create or replace function public.release_ai_revision_quota(p_request_id uuid)
returns jsonb language sql security definer set search_path = public, pg_temp
as $$ select public._ai_release_quota(p_request_id, 'meal_revision') $$;

-- ---------------------------------------------------------------------------
-- record_ai_usage — cost telemetry
--
-- Token counts only. The signature has no parameter capable of carrying prompt
-- text, image data or model output, so content cannot be logged here even by
-- mistake.
-- ---------------------------------------------------------------------------

create or replace function public.record_ai_usage(
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
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'UNAUTHENTICATED' using errcode = '28000';
  end if;

  insert into public.ai_usage_events (
    user_id, request_id, mode, model, succeeded, failure_kind,
    prompt_tokens, output_tokens, thoughts_tokens, cached_tokens, total_tokens
  ) values (
    v_user, p_request_id, left(coalesce(p_mode, 'unknown'), 40),
    left(coalesce(p_model, 'unknown'), 60), p_succeeded,
    -- Clamped to the three known classes so no provider error text can reach
    -- the table through this column.
    case when p_failure_kind in ('upstream', 'empty', 'error') then p_failure_kind else null end,
    p_prompt_tokens, p_output_tokens, p_thoughts_tokens, p_cached_tokens, p_total_tokens
  );
end;
$$;

-- Execution is granted to authenticated because the edge function calls these
-- with the caller's JWT. That is safe by construction: the limit is not a
-- parameter, the user is taken from the JWT, and the worst a hand-crafted call
-- can do is spend the caller's own quota.
revoke all on function public.reserve_ai_photo_quota(uuid) from public;
revoke all on function public.release_ai_photo_quota(uuid) from public;
revoke all on function public.reserve_ai_text_quota(uuid) from public;
revoke all on function public.release_ai_text_quota(uuid) from public;
revoke all on function public.reserve_ai_revision_quota(uuid) from public;
revoke all on function public.release_ai_revision_quota(uuid) from public;
revoke all on function public.record_ai_usage(uuid, text, text, boolean, text, integer, integer, integer, integer, integer) from public;

-- The kind-taking implementation is NOT part of the public API. Granting it
-- would let a caller aim a reservation, or a refund, at any counter.
revoke all on function public._ai_reserve_quota(uuid, text) from public;
revoke all on function public._ai_release_quota(uuid, text) from public;
revoke all on function public._ai_reserve_quota(uuid, text) from authenticated;
revoke all on function public._ai_release_quota(uuid, text) from authenticated;

grant execute on function public.reserve_ai_photo_quota(uuid) to authenticated;
grant execute on function public.release_ai_photo_quota(uuid) to authenticated;
grant execute on function public.reserve_ai_text_quota(uuid) to authenticated;
grant execute on function public.release_ai_text_quota(uuid) to authenticated;
grant execute on function public.reserve_ai_revision_quota(uuid) to authenticated;
grant execute on function public.release_ai_revision_quota(uuid) to authenticated;
grant execute on function public.record_ai_usage(uuid, text, text, boolean, text, integer, integer, integer, integer, integer) to authenticated;
