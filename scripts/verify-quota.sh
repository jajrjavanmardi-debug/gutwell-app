#!/usr/bin/env bash
#
# scripts/verify-quota.sh
#
#   PGHOST=/tmp/gwpg PGPORT=55432 PGUSER=postgres ./scripts/verify-quota.sh
#
# Applies the REAL AI-cost-control migration to a scratch database on a REAL
# PostgreSQL server and exercises the quota functions — including a genuine
# multi-connection race.
#
# WHY A REAL SERVER
# An in-process engine (PGlite) can prove the semantics but has a single
# connection, so it can never demonstrate two transactions racing. The central
# safety claim here — "two simultaneous requests cannot both claim the same slot" —
# is a claim about concurrent connections. The only honest way to support it is
# to open concurrent connections, which is what phase 3 below does.
#
# Safe to run repeatedly: it creates and drops its own database and touches
# nothing else.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATIONS=(
  "$ROOT/supabase/migrations/20260808120000_ai_cost_control.sql"
  "$ROOT/supabase/migrations/20260809100000_ai_quota_lock_down_refunds.sql"
  "$ROOT/supabase/migrations/20260809140000_user_entitlements.sql"
  "$ROOT/supabase/migrations/20260918100000_ai_quota_tiering.sql"
  "$ROOT/supabase/migrations/20260920120000_ai_quota_batch4_free_limits.sql"
)
DB="gutwell_quota_verify_$$"
PSQL=(psql -v ON_ERROR_STOP=1 -qtA)

pass=0; fail=0
check() { # check <name> <actual> <expected>
  if [ "$2" = "$3" ]; then pass=$((pass+1)); echo "  PASS  $1";
  else fail=$((fail+1)); echo "  FAIL  $1 — expected '$3', got '$2'"; fi
}

cleanup() { "${PSQL[@]}" -d postgres -c "drop database if exists $DB (force);" >/dev/null 2>&1; }
trap cleanup EXIT

"${PSQL[@]}" -d postgres -c "create database $DB;" >/dev/null || { echo "cannot create database"; exit 2; }
Q=("${PSQL[@]}" -d "$DB")

# Minimal stand-ins for the Supabase surface the migration depends on.
"${Q[@]}" <<'SQL' >/dev/null
create schema if not exists auth;
-- created_at is the source of truth for the Free window (policy D), so the
-- stub must carry it. Default now() matches GoTrue.
create table auth.users (id uuid primary key, created_at timestamptz not null default now());
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('test.uid', true), '')::uuid
$$;
do $$
declare r text;
begin
  foreach r in array array['anon','authenticated','service_role'] loop
    if not exists (select 1 from pg_roles where rolname = r) then
      execute format('create role %I', r);
    end if;
  end loop;
end $$;
-- Reproduce the Supabase default that silently grants EXECUTE on every new
-- function to anon and authenticated. Without this the verification would not
-- see the privilege problem that reached production.
alter default privileges in schema public grant execute on functions to anon, authenticated;
SQL

for m in "${MIGRATIONS[@]}"; do
  "${Q[@]}" -f "$m" >/dev/null || { echo "MIGRATION FAILED: $m"; exit 1; }
done
echo "migration applied cleanly to real PostgreSQL $("${Q[@]}" -c 'show server_version;')"
echo

A=11111111-1111-1111-1111-111111111111
B=22222222-2222-2222-2222-222222222222
"${Q[@]}" -c "insert into auth.users (id) values ('$A'),('$B');" >/dev/null

rid() { printf 'aaaaaaaa-0000-4000-8000-%012d' "$1"; }
# Each call is its own connection, exactly like a separate edge invocation.
res() { "${Q[@]}" -c "set test.uid='$1'; select public.reserve_ai_${2}_quota('$3')::text;"; }
field() { python3 -c "import json,sys;print(json.loads(sys.stdin.read())['$1'])"; }

echo "=== 1. limits are the FINAL batch 4 allowances ==="
# Free (no entitlement row), inside the 14-day window: one text analysis and
# one revision per UTC day; photo is 0 because it is Premium-only.
for pair in photo_analysis:0 text_analysis:1 meal_revision:1; do
  k="${pair%%:*}"; v="${pair##*:}"
  check "$k Free limit is $v" "$("${Q[@]}" -c "select public.ai_quota_limit('$k','$A');")" "$v"
done
check "unknown kind returns null" "$("${Q[@]}" -c "select coalesce(public.ai_quota_limit('free_money','$A')::text,'NULL');")" "NULL"

echo
echo "=== 2. each kind exhausts independently at its own limit ==="
for pair in text:1 revision:1 photo:0; do
  kind="${pair%%:*}"; lim="${pair##*:}"
  n=0
  # Three attempts against every kind, so a limit of 1 and a limit of 0 are
  # both distinguished from "the loop simply ran out of iterations".
  for i in $(seq 1 3); do
    [ "$(res "$A" "$kind" "$(rid $((1000 + i)))" | field allowed)" = "True" ] && n=$((n+1))
  done
  check "$kind: exactly $lim of 3 reservations allowed" "$n" "$lim"
  check "$kind: the next request is still rejected" "$(res "$A" "$kind" "$(rid 1009)" | field allowed)" "False"
done
# A zero allowance returns on `v_limit < 1` BEFORE either insert, so it must
# leave no trace at all. This is the property that makes FREE_PHOTO := 0 safe:
# a blocked user does not accumulate reservation rows.
check "a zero allowance writes no usage row" \
  "$("${Q[@]}" -c "select count(*) from public.ai_daily_usage where user_id='$A' and kind='photo_analysis';")" "0"
check "a zero allowance writes no reservation row" \
  "$("${Q[@]}" -c "select count(*) from public.ai_quota_reservations where user_id='$A' and kind='photo_analysis';")" "0"
check "the two non-zero Free counters are independent" \
  "$("${Q[@]}" -c "select count(*) from public.ai_daily_usage where user_id='$A';")" "2"
# Stronger than the old `used > 5`: every row is compared against the limit its
# OWN user and kind resolve to, so this keeps working whatever the constants are.
check "no counter exceeded its own resolved limit" \
  "$("${Q[@]}" -c "select count(*) from public.ai_daily_usage u where u.used > public.ai_quota_limit(u.kind, u.user_id);")" "0"

echo
echo "=== 3. TRUE CONCURRENCY: 30 simultaneous connections, one fresh user ==="
# B is made Premium for this phase ON PURPOSE. The property under test is that
# concurrent connections cannot both claim the same slot, and a ceiling of 20
# exercises the atomic increment 20 times; batch 4 sets the Free photo
# allowance to 0, and a race against an allowance of 0 would prove only that
# the pre-insert short-circuit fires. The Free side of the race is covered by
# phase 3c below, at the tightest possible limit.
"${Q[@]}" -c "select public.apply_entitlement_event('$B',true,now()+interval '30 days',null,null,null,null);" >/dev/null
"${Q[@]}" -c "delete from public.ai_daily_usage; delete from public.ai_quota_reservations;" >/dev/null
OUT=$(mktemp -d)
for i in $(seq 1 30); do
  ( "${Q[@]}" -c "set test.uid='$B'; select public.reserve_ai_photo_quota('$(rid $((2000 + i)))')::text;" \
      > "$OUT/$i.json" 2>/dev/null ) &
done
wait
allowed=$(cat "$OUT"/*.json 2>/dev/null | python3 -c "
import sys,json
n=0
for l in sys.stdin:
    l=l.strip()
    if l:
        try: n += 1 if json.loads(l)['allowed'] else 0
        except Exception: pass
print(n)")
slots=$(cat "$OUT"/*.json 2>/dev/null | python3 -c "
import sys,json
u=[]
for l in sys.stdin:
    l=l.strip()
    if l:
        try:
            d=json.loads(l)
            if d['allowed']: u.append(d['used'])
        except Exception: pass
print(','.join(map(str,sorted(u))))")
rm -rf "$OUT"
check "exactly 20 of 30 concurrent reservations allowed" "$allowed" "20"
# `seq -s,` leaves a trailing separator on BSD seq, so the expected string is
# built the same way the actual one is.
check "each winner got a distinct slot 1..20" "$slots" "$(seq 1 20 | paste -sd, -)"
check "counter landed exactly on the limit" \
  "$("${Q[@]}" -c "select used from public.ai_daily_usage where user_id='$B' and kind='photo_analysis';")" "20"

echo
echo "=== 3b. CONCURRENT DUPLICATE IDs: same request id, 30 connections at once ==="
# A retry storm sends the SAME id many times simultaneously. Every one must
# collapse onto a single reservation — otherwise a burst of retries would be
# billed as a burst of new scans.
"${Q[@]}" -c "delete from public.ai_daily_usage; delete from public.ai_quota_reservations;" >/dev/null
DUP=$(rid 4242)
OUT=$(mktemp -d)
for i in $(seq 1 30); do
  ( "${Q[@]}" -c "set test.uid='$B'; select public.reserve_ai_photo_quota('$DUP')::text;" \
      > "$OUT/$i.json" 2>/dev/null ) &
done
wait
dupAllowed=$(cat "$OUT"/*.json 2>/dev/null | python3 -c "
import sys,json
n=0
for l in sys.stdin:
    l=l.strip()
    if l:
        try: n += 1 if json.loads(l)['allowed'] else 0
        except Exception: pass
print(n)")
maxUsed=$(cat "$OUT"/*.json 2>/dev/null | python3 -c "
import sys,json
m=0
for l in sys.stdin:
    l=l.strip()
    if l:
        try: m=max(m, json.loads(l)['used'])
        except Exception: pass
print(m)")
rm -rf "$OUT"
check "all 30 duplicate-id calls are allowed" "$dupAllowed" "30"
check "but the counter only ever reaches 1" "$maxUsed" "1"
check "exactly one slot consumed for 30 identical retries" \
  "$("${Q[@]}" -c "select used from public.ai_daily_usage where user_id='$B' and kind='photo_analysis';")" "1"
check "exactly one reservation row exists" \
  "$("${Q[@]}" -c "select count(*) from public.ai_quota_reservations where user_id='$B';")" "1"

echo
echo "=== 3c. THE FREE RACE: 30 connections against an allowance of exactly 1 ==="
# The tightest form of the claim batch 4 depends on: if two taps land in the
# same millisecond, the Free user must still spend exactly one analysis.
R=99999999-9999-9999-9999-999999999999
"${Q[@]}" -c "insert into auth.users (id) values ('$R');" >/dev/null
OUT=$(mktemp -d)
for i in $(seq 1 30); do
  ( "${Q[@]}" -c "set test.uid='$R'; select public.reserve_ai_text_quota('$(rid $((5000 + i)))')::text;" \
      > "$OUT/$i.json" 2>/dev/null ) &
done
wait
freeAllowed=$(cat "$OUT"/*.json 2>/dev/null | python3 -c "
import sys,json
n=0
for l in sys.stdin:
    l=l.strip()
    if l:
        try: n += 1 if json.loads(l)['allowed'] else 0
        except Exception: pass
print(n)")
rm -rf "$OUT"
check "exactly 1 of 30 concurrent Free text reservations allowed" "$freeAllowed" "1"
check "the Free counter landed exactly on 1" \
  "$("${Q[@]}" -c "select used from public.ai_daily_usage where user_id='$R' and kind='text_analysis';")" "1"
check "exactly one reservation row survived the race" \
  "$("${Q[@]}" -c "select count(*) from public.ai_quota_reservations where user_id='$R' and kind='text_analysis';")" "1"

echo
echo "=== 4. idempotency, cross-kind isolation, day reset ==="
"${Q[@]}" -c "delete from public.ai_daily_usage; delete from public.ai_quota_reservations;" >/dev/null
S=$(rid 3000)
check "first reservation consumes" "$(res "$A" text "$S" | field used)" "1"
check "same id retried is a duplicate" "$(res "$A" text "$S" | field duplicate)" "True"
check "same id retried still shows used=1" "$(res "$A" text "$S" | field used)" "1"
# meal_revision, not photo: batch 4 puts the Free photo allowance at 0, and a
# REJECTED call also reports duplicate=false — so asserting that against photo
# would pass without the cross-kind property holding at all.
CROSS=$(res "$A" revision "$S")
check "same id on ANOTHER kind consumes separately" "$(echo "$CROSS" | field duplicate)" "False"
check "...and that other kind really did consume a slot" "$(echo "$CROSS" | field used)" "1"
# Ageing every row by a day is equivalent to the clock rolling over.
"${Q[@]}" -c "update public.ai_daily_usage set usage_date = usage_date - 1;
              update public.ai_quota_reservations set usage_date = usage_date - 1;" >/dev/null
# One call proves both properties at once: replaying YESTERDAY's id today is not
# treated as a duplicate (so the free-replay hole is closed) and it starts the
# new day's counter at 1. A second call here would be a same-day retry of THIS
# reservation and would correctly report duplicate — which is not the property
# under test.
REPLAY=$(res "$A" text "$S")
check "yesterday's id replayed today costs a slot" "$(echo "$REPLAY" | field duplicate)" "False"
check "next UTC day resets to 1" "$(echo "$REPLAY" | field used)" "1"

echo
echo "=== 5. security posture ==="
check "no INSERT/UPDATE/DELETE policy on any ai_ table" \
  "$("${Q[@]}" -c "select count(*) from pg_policies where schemaname='public' and tablename like 'ai\\_%' and cmd <> 'SELECT';")" "0"
# Refunds must be server-only. A user-callable refund lets anyone spend a slot
# on a real analysis and hand it straight back, bypassing the ceiling.
for role in anon authenticated; do
  check "$role cannot execute the kind-taking reserve" \
    "$("${Q[@]}" -c "select has_function_privilege('$role','public._ai_reserve_quota(uuid,text)','execute');")" "f"
  check "$role cannot REFUND a photo slot" \
    "$("${Q[@]}" -c "select has_function_privilege('$role','public.release_ai_photo_quota(uuid,uuid)','execute');")" "f"
  check "$role cannot REFUND a text slot" \
    "$("${Q[@]}" -c "select has_function_privilege('$role','public.release_ai_text_quota(uuid,uuid)','execute');")" "f"
  check "$role cannot write telemetry" \
    "$("${Q[@]}" -c "select has_function_privilege('$role','public.record_ai_usage(uuid,uuid,text,text,boolean,text,integer,integer,integer,integer,integer)','execute');")" "f"
done
check "anon cannot even reserve" \
  "$("${Q[@]}" -c "select has_function_privilege('anon','public.reserve_ai_photo_quota(uuid)','execute');")" "f"
check "authenticated CAN execute the narrow text wrapper (self-limiting)" \
  "$("${Q[@]}" -c "select has_function_privilege('authenticated','public.reserve_ai_text_quota(uuid)','execute');")" "t"
check "service_role CAN refund" \
  "$("${Q[@]}" -c "select has_function_privilege('service_role','public.release_ai_photo_quota(uuid,uuid)','execute');")" "t"
check "no user-callable 1-arg release signature survives" \
  "$("${Q[@]}" -c "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'release_ai%' and p.pronargs=1;")" "0"
check "telemetry has no content-bearing column" \
  "$("${Q[@]}" -c "select count(*) from information_schema.columns where table_name='ai_usage_events' and column_name ~ 'prompt_text|image|response|meal|symptom|description';")" "0"
"${Q[@]}" -c "select public.record_ai_usage('$A','$(rid 9000)','meal_text_only','gemini-2.5-flash',true,'Gemini said: your pizza failed',10,20,5,0,35);" >/dev/null
check "arbitrary failure text is discarded, not stored" \
  "$("${Q[@]}" -c "select coalesce(failure_kind,'NULL') from public.ai_usage_events order by id desc limit 1;")" "NULL"
check "token counts are stored" \
  "$("${Q[@]}" -c "select prompt_tokens||'/'||output_tokens||'/'||thoughts_tokens from public.ai_usage_events order by id desc limit 1;")" "10/20/5"


echo
echo "=== 6. TIERING: the limit follows server-owned entitlement, never the client ==="
# A Premium account is one with an active row in user_entitlements. Nothing the
# caller sends can produce this state.
P=33333333-3333-3333-3333-333333333333
"${Q[@]}" -c "insert into auth.users (id) values ('$P');" >/dev/null
"${Q[@]}" -c "select public.apply_entitlement_event('$P',true,now()+interval '30 days',null,null,null,null);" >/dev/null
for k in photo_analysis text_analysis meal_revision; do
  check "Premium $k ceiling is 20" "$("${Q[@]}" -c "select public.ai_quota_limit('$k','$P');")" "20"
done
check "Premium actually reserves past the Free ceiling of 1 (slot 6 allowed)" \
  "$(for i in $(seq 1 6); do res "$P" text "$(rid $((7100+i)))" >/dev/null; done; \
     "${Q[@]}" -c "select used from public.ai_daily_usage where user_id='$P' and kind='text_analysis';")" "6"
# An EXPIRED entitlement is not Premium, however the row is flagged.
E=44444444-4444-4444-4444-444444444444
"${Q[@]}" -c "insert into auth.users (id) values ('$E');" >/dev/null
"${Q[@]}" -c "select public.apply_entitlement_event('$E',true,now()-interval '1 day',null,null,null,null);" >/dev/null
check "lapsed subscription falls back to the Free limit" \
  "$("${Q[@]}" -c "select public.ai_quota_limit('text_analysis','$E');")" "1"

echo
echo "=== 7. POLICY D: the free window is deterministic and account-anchored ==="
NEW=55555555-5555-5555-5555-555555555555   # signed up after public launch
OLD=66666666-6666-6666-6666-666666666666   # pre-launch TestFlight account
"${Q[@]}" -c "insert into auth.users (id,created_at) values ('$NEW', timestamptz '2026-09-17 12:00:00+00');" >/dev/null
"${Q[@]}" -c "insert into auth.users (id,created_at) values ('$OLD', timestamptz '2026-08-01 12:00:00+00');" >/dev/null
check "post-launch account measures from its own signup" \
  "$("${Q[@]}" -c "select public.ai_free_window_start('$NEW') = timestamptz '2026-09-17 12:00:00+00';")" "t"
check "pre-launch account measures from activation, not signup" \
  "$("${Q[@]}" -c "select public.ai_free_window_start('$OLD') = public.ai_tiering_activated_at();")" "t"
check "window start is stable across calls (no now() drift)" \
  "$("${Q[@]}" -c "select public.ai_free_window_start('$OLD') = public.ai_free_window_start('$OLD');")" "t"
check "unknown user is not inside a free window" \
  "$("${Q[@]}" -c "select public.ai_free_window_active('77777777-7777-7777-7777-777777777777');")" "f"
check "a post-launch account is currently inside its window" \
  "$("${Q[@]}" -c "select public.ai_free_window_active('$NEW');")" "t"
check "the window ends exactly start + ai_free_window_days()" \
  "$("${Q[@]}" -c "select public.ai_free_window_start('$NEW') + (public.ai_free_window_days()||' days')::interval = timestamptz '2026-10-01 12:00:00+00';")" "t"
# The deployed constants, read back from the live function body rather than
# from the migration file — this is what the database will actually run.
check "BATCH 4: the five Free constants are 1 / 0 / 1 / 0 / 0" \
  "$("${Q[@]}" -c "select (pg_get_functiondef(p.oid) ~ 'FREE_TEXT_IN_WINDOW\s+constant integer := 1;')
                       and (pg_get_functiondef(p.oid) ~ 'FREE_TEXT_EXPIRED\s+constant integer := 0;')
                       and (pg_get_functiondef(p.oid) ~ 'FREE_REVISION_IN_WINDOW\s+constant integer := 1;')
                       and (pg_get_functiondef(p.oid) ~ 'FREE_REVISION_EXPIRED\s+constant integer := 0;')
                       and (pg_get_functiondef(p.oid) ~ 'FREE_PHOTO\s+constant integer := 0;')
                     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                    where n.nspname='public' and p.proname='ai_quota_limit';")" "t"
check "BATCH 4: the Premium ceiling is untouched at 20" \
  "$("${Q[@]}" -c "select (pg_get_functiondef(p.oid) ~ 'PREMIUM_LIMIT\s+constant integer := 20;')
                     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                    where n.nspname='public' and p.proname='ai_quota_limit';")" "t"

# THE EXPIRED BRANCH, EXERCISED FOR REAL.
#
# With the shipped constants no account can have an expired window before
# 2026-09-30: policy D anchors every pre-launch account at activation
# (2026-09-18) and the earliest post-launch signup is 2026-09-16, so
# start + 14 days is always in the future today. Rather than leave the 0s
# untested until that date, the WINDOW LENGTH is shortened in this scratch
# database only, which drives the same arithmetic through ai_free_window_active
# without touching the allowance constants under test.
"${Q[@]}" -c "create or replace function public.ai_free_window_days() returns integer language sql immutable as \$\$ select 1 \$\$;" >/dev/null
check "SIM: with a 1-day window the post-launch account is expired" \
  "$("${Q[@]}" -c "select public.ai_free_window_active('$NEW');")" "f"
check "SIM: expired Free text allowance is 0" \
  "$("${Q[@]}" -c "select public.ai_quota_limit('text_analysis','$NEW');")" "0"
check "SIM: expired Free revision allowance is 0" \
  "$("${Q[@]}" -c "select public.ai_quota_limit('meal_revision','$NEW');")" "0"
check "SIM: expired Free photo allowance is 0" \
  "$("${Q[@]}" -c "select public.ai_quota_limit('photo_analysis','$NEW');")" "0"
check "SIM: an expired account's reservation is refused" \
  "$(res "$NEW" text "$(rid 6001)" | field allowed)" "False"
check "SIM: ...and the refusal reports limit 0, which is what the edge function turns into FREE_WINDOW_ENDED" \
  "$(res "$NEW" text "$(rid 6002)" | field limit)" "0"
check "SIM: an expired account writes no usage row" \
  "$("${Q[@]}" -c "select count(*) from public.ai_daily_usage where user_id='$NEW';")" "0"
# Premium is not governed by the window at all, so shortening it must not move
# the Premium ceiling by a single slot.
check "SIM: Premium is unaffected by an expired window" \
  "$("${Q[@]}" -c "select public.ai_quota_limit('text_analysis','$P');")" "20"
"${Q[@]}" -c "create or replace function public.ai_free_window_days() returns integer language sql immutable as \$\$ select 14 \$\$;" >/dev/null
check "window length restored to the shipped 14 days" \
  "$("${Q[@]}" -c "select public.ai_free_window_days();")" "14"
check "...and the same account is in-window again, allowance 1" \
  "$("${Q[@]}" -c "select public.ai_quota_limit('text_analysis','$NEW');")" "1"
check "a pre-launch account is also in-window (policy D protects testers)" \
  "$("${Q[@]}" -c "select public.ai_free_window_active('$OLD');")" "t"

echo
echo "=== 8. the new helpers are not reachable by any user role ==="
for role in anon authenticated; do
  for fn in "public.ai_quota_limit(text,uuid)" "public.ai_free_window_start(uuid)" \
            "public.ai_free_window_active(uuid)" "public.ai_tiering_activated_at()" \
            "public.ai_public_launch_at()" "public.ai_free_window_days()"; do
    check "$role cannot execute $fn" \
      "$("${Q[@]}" -c "select has_function_privilege('$role','$fn','execute');")" "f"
  done
done
check "the 1-arg ai_quota_limit is gone (no untiered path survives)" \
  "$("${Q[@]}" -c "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='ai_quota_limit' and p.pronargs=1;")" "0"
check "ai_photo_daily_limit is gone (it hardcoded the untiered number)" \
  "$("${Q[@]}" -c "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='ai_photo_daily_limit';")" "0"
check "reserve wrappers kept their grant through the dependency rebuild" \
  "$("${Q[@]}" -c "select has_function_privilege('authenticated','public.reserve_ai_revision_quota(uuid)','execute');")" "t"
# Batch 4 replaces ai_quota_limit. `create or replace` preserves privileges, and
# the migration re-asserts them anyway; this proves the end state either way.
check "service_role kept EXECUTE on the replaced ai_quota_limit" \
  "$("${Q[@]}" -c "select has_function_privilege('service_role','public.ai_quota_limit(text,uuid)','execute');")" "t"
check "batch 4 did not add a second ai_quota_limit overload" \
  "$("${Q[@]}" -c "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='ai_quota_limit';")" "1"
check "ai_quota_limit is still SECURITY DEFINER and STABLE" \
  "$("${Q[@]}" -c "select p.prosecdef and p.provolatile='s' from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='ai_quota_limit';")" "t"
check "ai_quota_limit still pins its search_path" \
  "$("${Q[@]}" -c "select coalesce(array_to_string(p.proconfig,','),'') from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='ai_quota_limit';")" "search_path=public, pg_temp"


echo
echo "=== 9. ACCOUNT DELETION: auth.users cascade leaves zero user rows ==="
# delete_user_account() explicitly deletes the older tables and then removes the
# auth.users row; everything added since relies on ON DELETE CASCADE. This
# proves the cascade half — the half no migration re-states and no test covered.
D=88888888-8888-8888-8888-888888888888
"${Q[@]}" -c "insert into auth.users (id) values ('$D');" >/dev/null
"${Q[@]}" -c "select public.apply_entitlement_event('$D',true,now()+interval '30 days',null,null,null,null);" >/dev/null
"${Q[@]}" -c "set test.uid='$D'; select public.reserve_ai_text_quota('$(rid 9100)');" >/dev/null
"${Q[@]}" -c "set test.uid='$D'; select public.reserve_ai_photo_quota('$(rid 9101)');" >/dev/null
"${Q[@]}" -c "select public.record_ai_usage('$D','$(rid 9102)','meal_text_only','gemini-2.5-flash',true,null,10,20,5,0,35);" >/dev/null
for tbl in ai_quota_reservations ai_daily_usage ai_usage_events user_entitlements; do
  check "$tbl has rows before deletion" \
    "$("${Q[@]}" -c "select (count(*) > 0) from public.$tbl where user_id='$D';")" "t"
done
"${Q[@]}" -c "delete from auth.users where id='$D';" >/dev/null
for tbl in ai_quota_reservations ai_daily_usage ai_usage_events user_entitlements; do
  check "$tbl is EMPTY after the auth.users delete" \
    "$("${Q[@]}" -c "select count(*) from public.$tbl where user_id='$D';")" "0"
done
check "no user-owned table still references the deleted account" \
  "$("${Q[@]}" -c "select count(*) from (
        select 1 from public.ai_quota_reservations where user_id='$D'
        union all select 1 from public.ai_daily_usage        where user_id='$D'
        union all select 1 from public.ai_usage_events       where user_id='$D'
        union all select 1 from public.user_entitlements     where user_id='$D') x;")" "0"
# Every FK pointing at auth.users must cascade, or a future table silently
# blocks deletion (FK violation) or orphans rows (SET NULL / NO ACTION).
check "every FK to auth.users is ON DELETE CASCADE" \
  "$("${Q[@]}" -c "select count(*) from pg_constraint c
                     join pg_class t on t.oid = c.conrelid
                     join pg_class rt on rt.oid = c.confrelid
                     join pg_namespace rn on rn.oid = rt.relnamespace
                    where c.contype='f' and rn.nspname='auth' and rt.relname='users'
                      and c.confdeltype <> 'c';")" "0"

echo
echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
