/**
 * scripts/verify-quota-concurrency.mjs
 *
 *   SUPABASE_URL=... SUPABASE_ANON_KEY=... \
 *   QUOTA_TEST_EMAIL=... QUOTA_TEST_PASSWORD=... \
 *   node scripts/verify-quota-concurrency.mjs
 *
 * Fires N reservations for ONE user simultaneously against a real Postgres and
 * asserts that exactly `limit` of them are allowed.
 *
 * WHY THIS EXISTS SEPARATELY
 * verify-quota-sql.mjs proves the semantics but runs on PGlite, which has a
 * single connection and therefore cannot interleave two transactions. The claim
 * that "two requests cannot both see 4 used and become 5 and 6" is a claim
 * about concurrent connections, and the only honest way to support it is to
 * open concurrent connections. Source inspection does not count.
 *
 * SAFETY
 * Point this at a staging project, or accept that it consumes a real day's
 * quota for the test account. It only ever calls the reservation RPC as a
 * normal authenticated user — it grants itself nothing and writes no other
 * table. Credentials come from the environment; nothing is logged.
 */
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_ANON_KEY;
const EMAIL = process.env.QUOTA_TEST_EMAIL;
const PASSWORD = process.env.QUOTA_TEST_PASSWORD;
const PARALLEL = Number(process.env.QUOTA_TEST_PARALLEL ?? 25);

if (!URL || !KEY || !EMAIL || !PASSWORD) {
  console.error(
    'Missing env. Required: SUPABASE_URL, SUPABASE_ANON_KEY, QUOTA_TEST_EMAIL, QUOTA_TEST_PASSWORD',
  );
  process.exit(2);
}

const uuid = () =>
  '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) =>
    (c ^ ((Math.random() * 16) >> (c / 4))).toString(16),
  );

const supabase = createClient(URL, KEY);
const { error: authError } = await supabase.auth.signInWithPassword({
  email: EMAIL,
  password: PASSWORD,
});
if (authError) {
  console.error('Sign-in failed:', authError.message);
  process.exit(2);
}

// Distinct ids: same-id calls would dedupe by design and prove nothing here.
const ids = Array.from({ length: PARALLEL }, uuid);
console.log(`firing ${PARALLEL} simultaneous reservations…`);

const results = await Promise.all(
  ids.map((id) => supabase.rpc('reserve_ai_photo_quota', { p_request_id: id })),
);

const rows = results.map((r) => r.data).filter(Boolean);
const allowed = rows.filter((r) => r.allowed);
const limit = rows[0]?.limit ?? 5;
const maxUsed = Math.max(...rows.map((r) => r.used ?? 0));
const errors = results.filter((r) => r.error).length;

console.log(`  limit reported: ${limit}`);
console.log(`  allowed:        ${allowed.length}`);
console.log(`  rejected:       ${rows.length - allowed.length}`);
console.log(`  rpc errors:     ${errors}`);
console.log(`  highest used:   ${maxUsed}`);

// The `used` values handed back must be exactly 1..limit with no repeats: a
// duplicate would mean two callers both claimed the same slot.
const usedValues = allowed.map((r) => r.used).sort((a, b) => a - b);
const expected = Array.from({ length: limit }, (_, i) => i + 1);
const distinct = JSON.stringify(usedValues) === JSON.stringify(expected);

const ok = allowed.length === limit && maxUsed === limit && errors === 0 && distinct;
console.log(
  ok
    ? `\nPASS — exactly ${limit} of ${PARALLEL} concurrent reservations succeeded, slots ${expected.join(',')}`
    : `\nFAIL — expected exactly ${limit} allowed with distinct slots, got ${allowed.length} (${usedValues.join(',')})`,
);
process.exit(ok ? 0 : 1);
