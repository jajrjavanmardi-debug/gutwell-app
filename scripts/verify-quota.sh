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
# safety claim here — "two simultaneous requests cannot both become the fifth" —
# is a claim about concurrent connections. The only honest way to support it is
# to open concurrent connections, which is what phase 3 below does.
#
# Safe to run repeatedly: it creates and drops its own database and touches
# nothing else.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATION="$ROOT/supabase/migrations/20260808120000_ai_cost_control.sql"
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
create table auth.users (id uuid primary key);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('test.uid', true), '')::uuid
$$;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated;
  end if;
end $$;
SQL

"${Q[@]}" -f "$MIGRATION" >/dev/null || { echo "MIGRATION FAILED TO APPLY"; exit 1; }
echo "migration applied cleanly to real PostgreSQL $("${Q[@]}" -c 'show server_version;')"
echo

A=11111111-1111-1111-1111-111111111111
B=22222222-2222-2222-2222-222222222222
"${Q[@]}" -c "insert into auth.users (id) values ('$A'),('$B');" >/dev/null

rid() { printf 'aaaaaaaa-0000-4000-8000-%012d' "$1"; }
# Each call is its own connection, exactly like a separate edge invocation.
res() { "${Q[@]}" -c "set test.uid='$1'; select public.reserve_ai_${2}_quota('$3')::text;"; }
field() { python3 -c "import json,sys;print(json.loads(sys.stdin.read())['$1'])"; }

echo "=== 1. limits are the approved v1 safety defaults ==="
for pair in photo_analysis:5 text_analysis:5 meal_revision:5; do
  k="${pair%%:*}"; v="${pair##*:}"
  check "$k limit is $v" "$("${Q[@]}" -c "select public.ai_quota_limit('$k');")" "$v"
done
check "unknown kind returns null" "$("${Q[@]}" -c "select coalesce(public.ai_quota_limit('free_money')::text,'NULL');")" "NULL"

echo
echo "=== 2. each kind exhausts independently at its own limit ==="
for kind in photo text revision; do
  n=0
  for i in $(seq 1 5); do
    [ "$(res "$A" "$kind" "$(rid $((1000 + i)))" | field allowed)" = "True" ] && n=$((n+1))
  done
  check "$kind: 5 reservations allowed" "$n" "5"
  check "$kind: 6th rejected" "$(res "$A" "$kind" "$(rid 1006)" | field allowed)" "False"
done
check "three independent counters exist" \
  "$("${Q[@]}" -c "select count(*) from public.ai_daily_usage where user_id='$A';")" "3"
check "no counter exceeded its limit" \
  "$("${Q[@]}" -c "select count(*) from public.ai_daily_usage where used > 5;")" "0"

echo
echo "=== 3. TRUE CONCURRENCY: 30 simultaneous connections, one fresh user ==="
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
check "exactly 5 of 30 concurrent reservations allowed" "$allowed" "5"
check "each winner got a distinct slot 1..5" "$slots" "1,2,3,4,5"
check "counter landed exactly on the limit" \
  "$("${Q[@]}" -c "select used from public.ai_daily_usage where user_id='$B' and kind='photo_analysis';")" "5"

echo
echo "=== 4. idempotency, cross-kind isolation, day reset ==="
"${Q[@]}" -c "delete from public.ai_daily_usage; delete from public.ai_quota_reservations;" >/dev/null
S=$(rid 3000)
check "first reservation consumes" "$(res "$A" text "$S" | field used)" "1"
check "same id retried is a duplicate" "$(res "$A" text "$S" | field duplicate)" "True"
check "same id retried still shows used=1" "$(res "$A" text "$S" | field used)" "1"
check "same id on ANOTHER kind consumes separately" "$(res "$A" photo "$S" | field duplicate)" "False"
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
check "authenticated cannot execute the kind-taking reserve" \
  "$("${Q[@]}" -c "select has_function_privilege('authenticated','public._ai_reserve_quota(uuid,text)','execute');")" "f"
check "authenticated cannot execute the kind-taking release" \
  "$("${Q[@]}" -c "select has_function_privilege('authenticated','public._ai_release_quota(uuid,text)','execute');")" "f"
check "authenticated CAN execute the narrow text wrapper" \
  "$("${Q[@]}" -c "select has_function_privilege('authenticated','public.reserve_ai_text_quota(uuid)','execute');")" "t"
check "telemetry has no content-bearing column" \
  "$("${Q[@]}" -c "select count(*) from information_schema.columns where table_name='ai_usage_events' and column_name ~ 'prompt_text|image|response|meal|symptom|description';")" "0"
"${Q[@]}" -c "set test.uid='$A'; select public.record_ai_usage('$(rid 9000)','meal_text_only','gemini-2.5-flash',true,'Gemini said: your pizza failed',10,20,5,0,35);" >/dev/null
check "arbitrary failure text is discarded, not stored" \
  "$("${Q[@]}" -c "select coalesce(failure_kind,'NULL') from public.ai_usage_events order by id desc limit 1;")" "NULL"
check "token counts are stored" \
  "$("${Q[@]}" -c "select prompt_tokens||'/'||output_tokens||'/'||thoughts_tokens from public.ai_usage_events order by id desc limit 1;")" "10/20/5"

echo
echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
