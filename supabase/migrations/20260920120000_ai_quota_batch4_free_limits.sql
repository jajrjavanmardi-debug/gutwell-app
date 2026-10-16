-- ============================================================================
-- BATCH 4 — activate the final Free AI allowances
-- ============================================================================
--
-- 20260918100000_ai_quota_tiering.sql shipped the whole tiering mechanism
-- "dark": the entitlement lookup, the 14-day window helpers and both window
-- branches were live in production, but every Free constant was 5, so the new
-- code path changed nothing a user could observe. That was deliberate — it put
-- the risky structural change and the behavioural change in different
-- migrations. This is the behavioural one.
--
-- WHAT THIS MIGRATION DOES
--   Replaces public.ai_quota_limit with a body that is byte-for-byte the
--   deployed one except for five constants:
--
--     FREE_TEXT_IN_WINDOW      5 -> 1
--     FREE_TEXT_EXPIRED        5 -> 0
--     FREE_REVISION_IN_WINDOW  5 -> 1
--     FREE_REVISION_EXPIRED    5 -> 0
--     FREE_PHOTO               5 -> 0
--     PREMIUM_LIMIT           20 -> 20   (unchanged)
--
-- WHAT IT DELIBERATELY DOES NOT DO
--   * It does not edit 20260918100000. That migration is already applied in
--     production; rewriting applied history would make the repo disagree with
--     every deployed database and with the CLI's migration ledger.
--   * No data migration, no backfill, no deletion. public.ai_daily_usage,
--     public.ai_quota_reservations and public.ai_usage_events are untouched, so
--     a user who already spent slots today keeps that history. Their counter is
--     simply measured against the new allowance from the next reservation on.
--   * No signature change, so every caller — the three per-kind wrappers,
--     _ai_reserve_quota and _ai_release_quota — keeps resolving to this
--     function with no repointing.
--   * No change to window semantics. ai_free_window_days(),
--     ai_public_launch_at(), ai_tiering_activated_at(), ai_free_window_start()
--     and ai_free_window_active() are not redefined here. The UTC-day reset in
--     _ai_reserve_quota is likewise untouched; a local-calendar-day reset is a
--     separate decision and is not smuggled in behind a number change.
--
-- WHY A ZERO IS SAFE
--   _ai_reserve_quota returns {allowed:false, limit:0} on `v_limit < 1`
--   BEFORE it inserts anything, so an expired Free account writes no
--   reservation row and no usage row. The edge function turns that exact shape
--   — Free, limit 0, text_analysis or meal_revision — into FREE_WINDOW_ENDED,
--   which the released 1.0.1 client already renders as "the free period is
--   over" rather than "try again tomorrow".
--
-- WHY FREE_PHOTO IS 0 AND NOT SIMPLY LEFT AT 5
--   Photo analysis is gated by entitlement in analyze-food, which answers
--   PREMIUM_REQUIRED before any reservation is attempted, so a Free user never
--   reaches this number. 0 is defence in depth: if that gate were ever removed
--   or bypassed, the allowance behind it must not be a working free photo
--   entitlement. This does NOT create a second photo path — it closes one.
--
-- GRANTS — SEE THE HEADER OF 20260918100000 BEFORE CHANGING ANYTHING HERE
--   `create or replace function` preserves existing privileges, so the revokes
--   from 20260918100000 survive this migration on their own. They are re-issued
--   below anyway, BY NAME against public, anon AND authenticated, because they
--   are idempotent and because "the previous migration probably still covers
--   it" is exactly the assumption that left the 20260808120000 revokes inert.
--
-- ---------------------------------------------------------------------------

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

  -- ── BATCH 4: THE FINAL FREE ALLOWANCES ───────────────────────────────────
  -- In-window is the product offer: one AI analysis and one correction of it
  -- per UTC day. Expired is 0 for every kind — the free window does not decay
  -- into a smaller allowance, it ends, and the client is told so explicitly
  -- rather than being left to promise a tomorrow that never refills.
  FREE_TEXT_IN_WINDOW     constant integer := 1;
  FREE_TEXT_EXPIRED       constant integer := 0;
  FREE_REVISION_IN_WINDOW constant integer := 1;
  FREE_REVISION_EXPIRED   constant integer := 0;
  -- Unreachable by construction (analyze-food answers PREMIUM_REQUIRED first);
  -- 0 so that the allowance behind the gate is not itself a free photo plan.
  FREE_PHOTO              constant integer := 0;
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
  'NULL and are rejected by the reservation function. BATCH 4 values: Free '
  'in-window 1 text + 1 revision per UTC day, Free expired 0, Free photo 0, '
  'Premium 20 for every kind.';

-- ---------------------------------------------------------------------------
-- Grants — re-asserted, not assumed
-- ---------------------------------------------------------------------------
-- ai_quota_limit takes a user id, so granting it to `authenticated` would let
-- any signed-in client read another account's allowance. It stays service-role
-- only; the narrow per-kind reserve wrappers remain the public surface and are
-- not touched by this migration.

revoke all on function public.ai_quota_limit(text, uuid) from public, anon, authenticated;
grant execute on function public.ai_quota_limit(text, uuid) to service_role;
