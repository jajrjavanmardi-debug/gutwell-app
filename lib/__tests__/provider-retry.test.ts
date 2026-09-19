/**
 * lib/__tests__/provider-retry.test.ts
 *
 * One transient blip used to be terminal.
 *
 * analyze-food made exactly one Gemini attempt, and every way that attempt
 * could fail — a connection that never landed, a 503, a deadline we set
 * ourselves, a 200 with no candidate text — was written to ai_usage_events as
 * the single value 'upstream' with zero tokens. On 2026-08-18 the SAME image
 * under the SAME request id failed three times and then succeeded on the
 * fourth try, 3m45s later; on 2026-08-24 it failed twice, 15.3s apart, and the
 * next photo minutes later worked. Identical payloads both failing and
 * succeeding is the signature of a transport fault, not of a bad image — but
 * the row could not say which, and the platform's function logs are not
 * retained on this plan, so the console.error that DID carry the status was
 * the only copy of it and is gone.
 *
 * Two changes, both server-side: one bounded retry inside the unchanged 42s
 * budget, and enough non-content metadata to tell the four cases apart.
 *
 * Note on method: the Supabase function is Deno and cannot be imported here —
 * it reads Deno.env at module scope, and tsconfig excludes supabase/functions
 * from typechecking. So the retry PREDICATE is extracted from the source and
 * executed for real (see loadPredicate), while ordering, bounds and the SQL
 * clamps are asserted structurally. Provider-call counts are therefore proven
 * by construction — one fetch, a bounded loop — not by running the function.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..', '..');
const read = (...p: string[]) => readFileSync(join(root, ...p), 'utf8');

/** Comments stripped — assertions about absent code must not match prose. */
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const EDGE = read('supabase', 'functions', 'analyze-food', 'index.ts');
const CODE = strip(EDGE);
const SQL = read('supabase', 'migrations', '20260824090000_ai_provider_telemetry.sql');

/** attemptGemini + callGemini only — the next helper below them is serviceClient. */
const PROVIDER_RAW = EDGE.slice(
  EDGE.indexOf('async function attemptGemini'),
  EDGE.indexOf('function serviceClient()'),
);
const PROVIDER = strip(PROVIDER_RAW);

/** Reads a numeric constant from the source so tests cannot drift from it. */
const constant = (name: string): number => {
  const m = new RegExp(`const ${name} = ([\\d_]+);`).exec(EDGE);
  expect(m).not.toBeNull();
  return Number(m![1].replace(/_/g, ''));
};

const MAX_ATTEMPTS = constant('PROVIDER_MAX_ATTEMPTS');
const BACKOFF_MS = constant('PROVIDER_RETRY_BACKOFF_MS');
const MIN_RETRY_BUDGET_MS = constant('PROVIDER_MIN_RETRY_BUDGET_MS');
const TOTAL_BUDGET_MS = constant('GEMINI_TIMEOUT_MS');
const CLIENT_TIMEOUT_MS = 55_000;

/**
 * Executes the REAL predicate from the shipped source rather than a copy of it.
 * A hand-written duplicate would keep passing after the source stopped
 * agreeing with it, which is the one thing this file must not allow.
 */
type Err = {
  failureClass?: string;
  providerStatus?: number;
  timedOut?: boolean;
};
const loadPredicate = (): ((e: Err) => boolean) => {
  const src = EDGE.slice(
    EDGE.indexOf('const RETRYABLE_STATUSES'),
    EDGE.indexOf('const sleep ='),
  );
  expect(src.length).toBeGreaterThan(100);
  const js = strip(src)
    .replace(/: ProviderError/g, '')
    .replace(/\): boolean/g, ')');
  return new Function(`${js}; return isRetryableProviderError;`)() as (e: Err) => boolean;
};
const shouldRetry = loadPredicate();

/** The source's budget gate, mirrored — and pinned to the source below. */
const budgetAllowsRetry = (elapsedMs: number) =>
  TOTAL_BUDGET_MS - elapsedMs - BACKOFF_MS >= MIN_RETRY_BUDGET_MS;

/** How many provider attempts a given first-failure would produce. */
const attemptsFor = (err: Err, elapsedMs: number) =>
  shouldRetry(err) && budgetAllowsRetry(elapsedMs) ? 2 : 1;

const NETWORK: Err = { failureClass: 'network_exception' };
const TIMEOUT: Err = { failureClass: 'timeout', timedOut: true };
const EMPTY: Err = { failureClass: 'empty_response', providerStatus: 200 };
const status = (n: number): Err => ({
  failureClass: n === 429 ? 'provider_429' : n >= 500 ? 'provider_5xx' : 'provider_4xx',
  providerStatus: n,
});

// ─── 1–8. Attempt counts per failure class ──────────────────────────────────

describe('a transient failure gets exactly one more chance', () => {
  const FAST = 2_000; // the observed shape: failures arrive in seconds

  test('1. success on the first attempt makes exactly one provider call', () => {
    // Structural, and the strongest form available: there is only ONE fetch in
    // the whole provider section, so a success cannot issue a second.
    expect((PROVIDER.match(/await fetch\(GEMINI_URL/g) ?? []).length).toBe(1);
    expect(PROVIDER).toContain('return { ...result, attempts: attempt };');
  });

  test('2. network exception then success = 2 attempts', () => {
    expect(shouldRetry(NETWORK)).toBe(true);
    expect(attemptsFor(NETWORK, FAST)).toBe(2);
  });

  test('3. 503 then success = 2 attempts', () => {
    expect(attemptsFor(status(503), FAST)).toBe(2);
  });

  test('4. 429 then success = 2 attempts', () => {
    expect(attemptsFor(status(429), FAST)).toBe(2);
  });

  test('5. 400 is never retried', () => {
    expect(shouldRetry(status(400))).toBe(false);
    expect(attemptsFor(status(400), FAST)).toBe(1);
  });

  test('6. 401 and 403 are never retried', () => {
    for (const s of [401, 403]) {
      expect(`${s} retried: ${shouldRetry(status(s))}`).toBe(`${s} retried: false`);
      expect(attemptsFor(status(s), FAST)).toBe(1);
    }
  });

  test('every other 5xx and 4xx follows the approved list exactly', () => {
    const retryable = [429, 500, 502, 503, 504];
    for (const s of [400, 401, 403, 404, 409, 413, 422, 429, 500, 501, 502, 503, 504, 505]) {
      expect(`${s}: ${shouldRetry(status(s))}`).toBe(`${s}: ${retryable.includes(s)}`);
    }
  });

  test('7. a timeout is never retried, however much budget remains', () => {
    // It has by definition spent the budget the retry would need, and the
    // server must still fail before the client's own deadline.
    expect(shouldRetry(TIMEOUT)).toBe(false);
    expect(attemptsFor(TIMEOUT, 100)).toBe(1);
    expect(attemptsFor(TIMEOUT, TOTAL_BUDGET_MS - 1)).toBe(1);
  });

  test('8. a second transient failure still surfaces the existing upstream error', () => {
    // Compatibility with Build 10: the outer handler is untouched, so two
    // failures produce the same 502 UPSTREAM_ERROR one used to.
    expect(CODE).toContain('{ code: "UPSTREAM_ERROR", message: "Failed to analyze", retryable: true },');
    expect(CODE).toContain('502');
    expect(PROVIDER).toContain('throw lastError');
  });

  test('an empty response is not retried — it is a billed model outcome', () => {
    expect(shouldRetry(EMPTY)).toBe(false);
  });
});

// ─── Budget arithmetic ──────────────────────────────────────────────────────

describe('two attempts can never outlast one budget', () => {
  test('the total budget is unchanged, so the client margin is unchanged', () => {
    expect(TOTAL_BUDGET_MS).toBe(42_000);
    expect(TOTAL_BUDGET_MS).toBeLessThan(CLIENT_TIMEOUT_MS);
    expect(read('lib', 'RecommendationEngine.ts')).toContain(
      `const REQUEST_TIMEOUT_MS = ${CLIENT_TIMEOUT_MS};`,
    );
  });

  test('the deadline passed to an attempt is what REMAINS, not a fresh 42s', () => {
    // The bug this forbids is 42s + 42s.
    expect(PROVIDER).toContain('const remaining = GEMINI_TIMEOUT_MS - elapsed();');
    expect(PROVIDER).toContain('await attemptGemini(parts, options, remaining)');
    expect(PROVIDER).toContain('setTimeout(() => controller.abort(), deadlineMs)');
    expect(PROVIDER).not.toContain('controller.abort(), GEMINI_TIMEOUT_MS');
  });

  test('no attempt starts with no budget left', () => {
    expect(PROVIDER).toContain('if (remaining <= 0) break;');
  });

  test('the retry gate subtracts the backoff before comparing', () => {
    expect(PROVIDER).toContain(
      'const afterBackoff = GEMINI_TIMEOUT_MS - elapsed() - PROVIDER_RETRY_BACKOFF_MS;',
    );
    expect(PROVIDER).toContain('if (afterBackoff < PROVIDER_MIN_RETRY_BUDGET_MS) break;');
  });

  test('7b. a first attempt that ate the budget cannot start a second', () => {
    const tooLate = TOTAL_BUDGET_MS - MIN_RETRY_BUDGET_MS - BACKOFF_MS + 1;
    expect(budgetAllowsRetry(tooLate)).toBe(false);
    expect(attemptsFor(NETWORK, tooLate)).toBe(1);
    // …while the observed fast failures comfortably do.
    expect(attemptsFor(NETWORK, 2_000)).toBe(2);
  });

  test('worst case stays inside the budget it always had', () => {
    const worst = TOTAL_BUDGET_MS; // both attempts share one deadline
    expect(worst).toBe(42_000);
    expect(worst + 6_262).toBeLessThan(CLIENT_TIMEOUT_MS);
  });

  test('the backoff is short and bounded', () => {
    expect(BACKOFF_MS).toBeGreaterThanOrEqual(1_000);
    expect(BACKOFF_MS).toBeLessThanOrEqual(2_000);
    expect(MAX_ATTEMPTS).toBe(2);
  });
});

// ─── 9–10. Quota and identity ───────────────────────────────────────────────

describe('a retry is free, exactly like the manual one it replaces', () => {
  test('9. the reservation is taken once, outside the retry', () => {
    // reserveDailyQuota sits ABOVE the try that contains callGemini, and
    // callGemini owns the retry — so a second attempt cannot reach it.
    for (const kind of ['photo_analysis', 'text_analysis', 'meal_revision']) {
      const calls = CODE.match(
        new RegExp(`reserveDailyQuota\\(supabase, requestId as string, "${kind}"\\)`, 'g'),
      ) ?? [];
      expect(`${kind} reservations: ${calls.length}`).toBe(`${kind} reservations: 1`);
    }
    expect(PROVIDER).not.toContain('reserveDailyQuota');
  });

  test('10. the retry reuses the same logical request', () => {
    // callGemini receives only parts and options; the request id lives with the
    // caller, so a retry cannot mint a new one.
    expect(PROVIDER).not.toContain('requestId');
    expect(PROVIDER).not.toContain('crypto.randomUUID');
  });

  test('the refund rule is untouched', () => {
    expect((CODE.match(/if \(!err\.providerAttempted\) \{/g) ?? []).length).toBe(3);
    expect(CODE).toContain('err.providerAttempted = true;');
  });

  test('exactly one usage row per logical analysis, not one per attempt', () => {
    expect(PROVIDER).not.toContain('recordUsage');
    expect((CODE.match(/await recordUsage\(user\.id, \{/g) ?? []).length).toBe(6);
  });
});

// ─── 11–12. Telemetry ───────────────────────────────────────────────────────

describe('the row can now say which failure it was', () => {
  const CLASSES = [
    'network_exception', 'provider_429', 'provider_4xx',
    'provider_5xx', 'timeout', 'empty_response',
  ];

  test('11. every internal class exists and is assigned at its own site', () => {
    for (const c of CLASSES) {
      expect(`${c} in source: ${CODE.includes(`"${c}"`)}`).toBe(`${c} in source: true`);
      expect(`${c} in sql: ${SQL.includes(`'${c}'`)}`).toBe(`${c} in sql: true`);
    }
    expect(PROVIDER).toContain('err.failureClass = "network_exception";');
    expect(PROVIDER).toContain('timedOut.failureClass = "timeout";');
    expect(PROVIDER).toContain('err.failureClass = "empty_response";');
    expect(PROVIDER).toContain('? "provider_429"');
    expect(PROVIDER).toContain(': "provider_4xx"');
  });

  test('11b. the attempt count and outcome are persisted', () => {
    expect(CODE).toContain('provider: providerOk(result.attempts)');
    expect(CODE).toContain('provider: providerFailed(err)');
    expect(CODE).toContain('attempts: err.attempts ?? 0,');
    expect(CODE).toContain('p_provider_attempts: args.provider?.attempts ?? 0,');
    expect(CODE).toContain('err.attempts = attempt;');
  });

  test('11c. an abort before headers is a timeout, not a network error', () => {
    // Previously indistinguishable, and the distinction now decides the retry.
    const fetchCatch = PROVIDER.slice(
      PROVIDER.indexOf('} catch (networkError) {'),
      PROVIDER.indexOf('if (!response.ok)'),
    );
    expect(fetchCatch.length).toBeGreaterThan(100);
    expect(fetchCatch).toContain('if (controller.signal.aborted) {');
    expect(fetchCatch).toContain('timedOut.failureClass = "timeout";');
    expect(fetchCatch.indexOf('timedOut.failureClass')).toBeLessThan(
      fetchCatch.indexOf('err.failureClass = "network_exception"'),
    );
  });

  test('12. telemetry carries no prompt, image or user content', () => {
    const rpc = CODE.slice(CODE.indexOf('admin.rpc("record_ai_usage"'), CODE.indexOf('if (error) console.error("Usage telemetry failed"'));
    expect(rpc.length).toBeGreaterThan(200);
    for (const banned of [
      'body.', 'parts', 'narrative', 'description', 'symptoms', 'conditions',
      'result.text', 'image,', 'imageBase64', '.data', 'prompt:', 'analysis',
    ]) {
      expect(`${banned} in rpc: ${rpc.includes(banned)}`).toBe(`${banned} in rpc: false`);
    }
    // Every value is a count, a flag, a status or a size — nothing else.
    const values = [...rpc.matchAll(/p_[a-z_]+: ([^,\n]+)/g)].map((m) => m[1].trim());
    expect(values.length).toBe(19);
    for (const v of values) {
      const safe =
        /^(userId|GEMINI_MODEL|args\.(requestId|mode|succeeded)|args\.failureKind \?\? null|u\.[a-zA-Z]+Tokens|args\.provider\?\.[a-zA-Z]+ \?\? (null|false|0))$/.test(v);
      expect(`${v} is safe: ${safe}`).toBe(`${v} is safe: true`);
    }
    // image_bytes is a LENGTH, never the bytes.
    expect(CODE).toContain('const imageBytes = image.length;');
    expect(CODE).not.toContain('imageBytes: image,');
  });

  test('12b. SQL clamps every text column, so a leak cannot land even if sent', () => {
    // Defence in depth: the call site is not the only thing standing between a
    // provider error body and this table.
    expect(SQL).toContain("p_provider_reason ~ '^[A-Z][A-Z0-9_]{0,39}$'");
    expect(SQL).toContain("p_mime_type ~ '^[a-z]{1,20}/[a-z0-9.+-]{1,30}$'");
    expect(SQL).toContain("case when p_failure_kind in ('upstream', 'empty', 'error')");
    expect(SQL).toContain('p_provider_status between 100 and 599');
    expect(SQL).toContain('least(greatest(coalesce(p_provider_attempts, 0), 0), 2)');
  });

  test('12c. the provider error body is still never read or logged', () => {
    expect(PROVIDER_RAW).toContain('Non-JSON error body: deliberately discarded rather than logged.');
    const log = PROVIDER.slice(
      PROVIDER.indexOf('console.error("Gemini API error"'),
      PROVIDER.indexOf('const err = new Error("Failed to get analysis'),
    );
    expect(log.length).toBeGreaterThan(50);
    expect(log).toContain('status: response.status');
    expect(log).toContain('reason,');
    // The parsed body itself never travels — only Google's status symbol.
    expect(log).not.toContain('parsed');
    expect(log).not.toContain('await response.text');
    // And the retry log is equally bare.
    const retryLog = PROVIDER.slice(PROVIDER.indexOf('console.error("Gemini retry"'));
    expect(retryLog).toContain('status: err.providerStatus ?? null,');
    expect(retryLog).not.toContain('parts');
  });
});

// ─── 13–15. Scope ───────────────────────────────────────────────────────────

describe('nothing outside the provider call moved', () => {
  test('13. all three modes share the one retry-safe provider call', () => {
    expect((CODE.match(/await callGemini\(/g) ?? []).length).toBe(3);
    expect((CODE.match(/await attemptGemini\(/g) ?? []).length).toBe(1);
  });

  test('14. a scope-guard answer is a SUCCESS and is never retried', () => {
    // The non-food reply is a 200 with text: it returns through the success
    // path and never reaches the retry decision at all.
    expect(CODE).toContain('SCOPE GUARD (HIGHEST PRIORITY)');
    expect(PROVIDER).not.toContain('SCOPE GUARD');
    expect(PROVIDER).toContain('if (!text) {');
  });

  test('15. model, temperature and token budgets are byte-for-byte unchanged', () => {
    expect(EDGE).toContain('const GEMINI_MODEL = "gemini-2.5-flash";');
    expect(EDGE).toContain('{ temperature: 0.25, maxOutputTokens: 4096 },');
    expect(EDGE).toContain('temperature: options.temperature ?? 0.3,');
    expect(EDGE).toContain('maxOutputTokens: options.maxOutputTokens ?? 2048,');
    expect(EDGE).toContain(
      'https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent',
    );
  });

  test('15b. the request body sent to Gemini is unchanged', () => {
    expect(PROVIDER).toContain('contents: [{ parts }],');
    expect(PROVIDER).toContain('"x-goog-api-key": GEMINI_API_KEY!,');
    expect(CODE).toContain('mime_type: imageMimeType,');
    expect(CODE).toContain(
      'const imageMimeType = typeof body.mimeType === "string" ? body.mimeType : "image/jpeg";',
    );
  });

  test('15c. no client file is involved in this change', () => {
    const client = read('lib', 'RecommendationEngine.ts');
    for (const banned of ['PROVIDER_MAX_ATTEMPTS', 'failureClass', 'provider_status', 'attemptGemini']) {
      expect(`${banned} in client: ${client.includes(banned)}`).toBe(`${banned} in client: false`);
    }
    // The client's own contract is untouched.
    expect(client).toContain("case 'UPSTREAM_ERROR':");
    expect(client).toContain('const REQUEST_TIMEOUT_MS = 55000;');
  });
});
