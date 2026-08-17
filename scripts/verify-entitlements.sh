#!/usr/bin/env bash
#
# scripts/verify-entitlements.sh
#
#   PGHOST=/tmp/gwpg PGPORT=55432 PGUSER=postgres ./scripts/verify-entitlements.sh
#
# Applies the REAL entitlement migration to a scratch database on a REAL
# PostgreSQL server and exercises the trust chain that decides whether an
# account may run photo analysis.
#
# The properties under test are the ones an attacker or a flaky webhook would
# probe: can a user write their own entitlement, can a replayed event double
# apply, can a late EXPIRATION undo a RENEWAL that already landed, does a
# cancelled-but-paid subscription keep working to its expiry.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Applied in order, exactly as a fresh environment would. The second migration
# corrects how a writer without a real event timestamp participates in event
# ordering; section 11 is what holds it in place.
MIGRATIONS=(
  "$ROOT/supabase/migrations/20260809140000_user_entitlements.sql"
  "$ROOT/supabase/migrations/20260816210000_entitlement_event_ordering.sql"
)
DB="gutwell_ent_verify_$$"
PSQL=(psql -v ON_ERROR_STOP=1 -qtA)

pass=0; fail=0
check() { if [ "$2" = "$3" ]; then pass=$((pass+1)); echo "  PASS  $1"; else fail=$((fail+1)); echo "  FAIL  $1 — expected '$3', got '$2'"; fi; }

cleanup() { "${PSQL[@]}" -d postgres -c "drop database if exists $DB (force);" >/dev/null 2>&1; }
trap cleanup EXIT

"${PSQL[@]}" -d postgres -c "create database $DB;" >/dev/null || { echo "cannot create database"; exit 2; }
Q=("${PSQL[@]}" -d "$DB")

"${Q[@]}" <<'SQL' >/dev/null
create schema if not exists auth;
create table auth.users (id uuid primary key);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('test.uid', true), '')::uuid $$;
do $$ declare r text; begin
  foreach r in array array['anon','authenticated','service_role'] loop
    if not exists (select 1 from pg_roles where rolname=r) then execute format('create role %I', r); end if;
  end loop; end $$;
-- The Supabase default that silently grants EXECUTE on new functions.
alter default privileges in schema public grant execute on functions to anon, authenticated;
SQL

for m in "${MIGRATIONS[@]}"; do
  "${Q[@]}" -f "$m" >/dev/null || { echo "MIGRATION FAILED: $(basename "$m")"; exit 1; }
done
echo "${#MIGRATIONS[@]} migrations applied to real PostgreSQL $("${Q[@]}" -c 'show server_version;')"
echo

U=11111111-1111-1111-1111-111111111111
"${Q[@]}" -c "insert into auth.users values ('$U');" >/dev/null
state() { "${Q[@]}" -c "select public.get_premium_state('$U')::text;" | python3 -c "import sys,json;print(json.loads(sys.stdin.read())['$1'])"; }
apply() { "${Q[@]}" -c "select public.apply_entitlement_event('$U',$1,$2,null,null,$3,$4)::text;" >/dev/null; }

echo "=== 1. unknown account ==="
check "unknown user is not active" "$(state active)" "False"
check "unknown user is not 'known'" "$(state known)" "False"
check "unknown user triggers a verification lookup" "$(state needs_refresh)" "True"

echo
echo "=== 2. purchase activates ==="
apply true "now() + interval '30 days'" "'evt_1'" "now()"
check "premium is active" "$(state active)" "True"
check "no refresh needed straight after a sync" "$(state needs_refresh)" "False"

echo
echo "=== 3. duplicate webhook delivery is idempotent ==="
BEFORE=$("${Q[@]}" -c "select last_event_at from public.user_entitlements where user_id='$U';")
R=$("${Q[@]}" -c "select public.apply_entitlement_event('$U',false,null,null,null,'evt_1',now())::text;")
check "redelivered event id is not applied" "$(echo "$R" | python3 -c "import sys,json;print(json.loads(sys.stdin.read())['applied'])")" "False"
check "…and cannot flip an active user to inactive" "$(state active)" "True"
check "…event timestamp untouched" "$("${Q[@]}" -c "select last_event_at from public.user_entitlements where user_id='$U';")" "$BEFORE"

echo
echo "=== 4. out-of-order delivery cannot downgrade ==="
apply true "now() + interval '30 days'" "'evt_renew'" "now()"
R=$("${Q[@]}" -c "select public.apply_entitlement_event('$U',false,null,null,null,'evt_late_expire',now() - interval '1 hour')::text;")
check "older EXPIRATION is rejected" "$(echo "$R" | python3 -c "import sys,json;print(json.loads(sys.stdin.read())['reason'])")" "stale_event"
check "renewal survives the late expiration" "$(state active)" "True"

echo
echo "=== 5. expiry ends access without needing a webhook ==="
"${Q[@]}" -c "update public.user_entitlements set expires_at = now() - interval '1 minute' where user_id='$U';" >/dev/null
check "a lapsed period is not active even while is_active is true" "$(state active)" "False"
check "…and asks the server to re-verify" "$(state needs_refresh)" "True"

echo
echo "=== 6. cancelled-but-paid keeps access to the period end ==="
apply true "now() + interval '5 days'" "'evt_cancel_autorenew_off'" "now()"
check "still active after auto-renew is turned off" "$(state active)" "True"

echo
echo "=== 7. refund/expiration revokes ==="
apply false "now() - interval '1 second'" "'evt_refund'" "now()"
check "revoked user is not active" "$(state active)" "False"

echo
echo "=== 8. staleness drives the REST fallback ==="
apply true "now() + interval '30 days'" "'evt_fresh'" "now()"
check "fresh row needs no lookup" "$(state needs_refresh)" "False"
# Just INSIDE the window: must still be trusted, so the threshold is not
# accidentally treating every row as stale.
"${Q[@]}" -c "update public.user_entitlements set last_synced_at = now() - interval '5 hours' where user_id='$U';" >/dev/null
check "a row inside the freshness window still needs no lookup" "$(state needs_refresh)" "False"
# Just OUTSIDE it.
"${Q[@]}" -c "update public.user_entitlements set last_synced_at = now() - interval '7 hours' where user_id='$U';" >/dev/null
check "a row past the 6h threshold does need a lookup" "$(state needs_refresh)" "True"
check "the threshold is exactly the approved 6 hours" \
  "$("${Q[@]}" -c "select public.entitlement_stale_after();")" "06:00:00"
check "…but is still treated as active meanwhile" "$(state active)" "True"

echo
echo "=== 9. a user cannot make themselves Premium ==="
for role in anon authenticated; do
  check "$role cannot execute apply_entitlement_event" \
    "$("${Q[@]}" -c "select has_function_privilege('$role','public.apply_entitlement_event(uuid,boolean,timestamptz,text,text,text,timestamptz)','execute');")" "f"
  for priv in INSERT UPDATE DELETE; do
    check "$role has no $priv on user_entitlements" \
      "$("${Q[@]}" -c "select has_table_privilege('$role','public.user_entitlements','$priv');")" "f"
  done
done
check "service_role CAN write entitlements" \
  "$("${Q[@]}" -c "select has_function_privilege('service_role','public.apply_entitlement_event(uuid,boolean,timestamptz,text,text,text,timestamptz)','execute');")" "t"
check "no write policy exists on the table" \
  "$("${Q[@]}" -c "select count(*) from pg_policies where tablename='user_entitlements' and cmd <> 'SELECT';")" "0"
check "RLS is enabled" \
  "$("${Q[@]}" -c "select relrowsecurity from pg_class where relname='user_entitlements';")" "t"

echo
echo "=== 10. no payment data is stored ==="
check "no card/payment/price column" \
  "$("${Q[@]}" -c "select count(*) from information_schema.columns where table_name='user_entitlements' and column_name ~ 'card|payment|price|token|receipt|email';")" "0"

echo
echo "=== 11. the REST fallback must not order events ==="
#
# The bug this section exists for, observed in production on 2026-08-16.
#
# analyze-food hydrates a missing row from RevenueCat's REST API and passes
# p_event_at => null, saying at the call site that this is so it "can never win
# against a real webhook event". apply_entitlement_event used to turn that null
# into now() and store it as last_event_at, so the row claimed to have seen an
# event at hydration time. The genuine INITIAL_PURCHASE webhook that followed
# carried the REAL purchase time — necessarily EARLIER — and was refused as
# stale_event. The account stayed Premium, but product_id, store and
# last_event_id were never written, so the purchase had no provenance and no
# event id to deduplicate a redelivery against.
#
# It would have repeated for every first-time subscriber whose purchase webhook
# lands after their first photo analysis — precisely the race the fallback is
# there to cover.
#
# A separate account: the checks above have deliberately left U with history.
V=22222222-2222-2222-2222-222222222222
"${Q[@]}" -c "insert into auth.users values ('$V');" >/dev/null
# Fuller than apply(): these cases turn on product/store, which the fallback
# leaves null and a real webhook fills in.
fapply() { "${Q[@]}" -c "select public.apply_entitlement_event('$V',$1,$2,$3,$4,$5,$6)::text;"; }
jkey() { python3 -c "import sys,json;print(json.loads(sys.stdin.read()).get('$1'))"; }
vcol() { "${Q[@]}" -c "select coalesce($1::text,'<null>') from public.user_entitlements where user_id='$V';"; }

# A fallback hydrating a row nobody has ever seen.
R=$(fapply true "now() + interval '19 hours'" null null null null)
check "fallback applies" "$(echo "$R" | jkey applied)" "True"
check "fallback activates the account" "$(vcol is_active)" "true"
check "fallback records a sync time" "$([ "$(vcol last_synced_at)" = "<null>" ] && echo missing || echo present)" "present"
check "fallback leaves last_event_at NULL" "$(vcol last_event_at)" "<null>"
check "fallback claims no provenance" "$(vcol product_id)$(vcol store)$(vcol last_event_id)" "<null><null><null>"

# The real purchase webhook, arriving later but describing an EARLIER moment.
R=$(fapply true "now() + interval '19 hours'" "'gutwell_premium_annual'" "'APP_STORE'" "'evt_initial_purchase'" "now() - interval '5 hours'")
check "a real purchase after a fallback is APPLIED, not stale" "$(echo "$R" | jkey applied)" "True"
check "…and fills product_id" "$(vcol product_id)" "gutwell_premium_annual"
check "…and fills store" "$(vcol store)" "APP_STORE"
check "…and fills last_event_id" "$(vcol last_event_id)" "evt_initial_purchase"
check "…and stores the REAL purchase time, not the hydration time" \
  "$("${Q[@]}" -c "select last_event_at < now() - interval '4 hours' from public.user_entitlements where user_id='$V';")" "t"

# A later fallback may refresh what it verified, and nothing else.
EVT_AT=$(vcol last_event_at)
R=$(fapply true "now() + interval '40 days'" null null null null)
check "a later fallback still applies" "$(echo "$R" | jkey applied)" "True"
check "…without erasing product_id" "$(vcol product_id)" "gutwell_premium_annual"
check "…without erasing store" "$(vcol store)" "APP_STORE"
check "…without erasing last_event_id" "$(vcol last_event_id)" "evt_initial_purchase"
check "…and without advancing last_event_at" "$(vcol last_event_at)" "$EVT_AT"
check "…while refreshing the period it verified" \
  "$("${Q[@]}" -c "select expires_at > now() + interval '39 days' from public.user_entitlements where user_id='$V';")" "t"

# The position a real event established must still order later events, so the
# fix cannot have bought provenance at the cost of the out-of-order guard.
R=$(fapply false "now()" null null "'evt_older_than_purchase'" "now() - interval '9 hours'")
check "ordering still refuses an older real event" "$(echo "$R" | jkey reason)" "stale_event"
check "…and the account is untouched by it" "$(vcol is_active)" "true"

# Repeated fallbacks must never accumulate into a phantom ordering position.
W=33333333-3333-3333-3333-333333333333
"${Q[@]}" -c "insert into auth.users values ('$W');" >/dev/null
for _ in 1 2 3; do
  "${Q[@]}" -c "select public.apply_entitlement_event('$W',true,now() + interval '1 day',null,null,null,null);" >/dev/null
done
check "repeated fallbacks leave no event timestamp" \
  "$("${Q[@]}" -c "select coalesce(last_event_at::text,'<null>') from public.user_entitlements where user_id='$W';")" "<null>"
R=$("${Q[@]}" -c "select public.apply_entitlement_event('$W',true,now() + interval '1 day','gutwell_premium_annual','APP_STORE','evt_very_late',now() - interval '30 days')::text;")
check "…so even a much older real purchase still lands" "$(echo "$R" | jkey applied)" "True"

echo
echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
