/**
 * lib/__tests__/ai-cost-control.test.ts
 *
 * The client and edge-function half of the AI spend ceiling.
 *
 * The SQL half — exhaustion, reset, idempotency, cross-kind isolation, RLS,
 * grants and TRUE MULTI-CONNECTION CONCURRENCY — is executed against a real
 * PostgreSQL server by scripts/verify-quota.sh, because asserting database
 * behaviour from source inspection would prove nothing.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  AnalysisError,
  DAILY_PHOTO_LIMIT_REACHED,
  DAILY_REVISION_LIMIT_REACHED,
  formatQuotaResetTime,
  isDailyPhotoLimitError,
  isDailyRevisionLimitError,
  MAX_CORRECTION_LENGTH,
  newAnalysisRequestId,
} from '../ai-quota';
import { estimateCallCostUsd, maxMonthlySpendPerUser, GEMINI_25_FLASH_PRICING } from '../ai-cost-model';
import { translations } from '../i18n';

const root = join(__dirname, '..', '..');
const read = (...p: string[]) => readFileSync(join(root, ...p), 'utf8');
const EDGE = read('supabase', 'functions', 'analyze-food', 'index.ts');
const MIGRATION = read('supabase', 'migrations', '20260808120000_ai_cost_control.sql');
const QUOTA = read('lib', 'ai-quota.ts');
const LOCKDOWN = read('supabase', 'migrations', '20260809100000_ai_quota_lock_down_refunds.sql');
const ENGINE = read('lib', 'RecommendationEngine.ts');
const SCREEN = read('app', 'photo-analysis.tsx');
/** The request handler only. Helper DEFINITIONS live above it, so ordering
 *  assertions must be made against call sites, not declarations. */
const HANDLER = EDGE.slice(EDGE.indexOf('Deno.serve(async (req: Request)'));

/** Same shape the server enforces. */
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('request identity — what makes a retry free', () => {
  test('ids are well-formed v4 UUIDs, so the server never rejects one', () => {
    for (let i = 0; i < 500; i++) expect(newAnalysisRequestId()).toMatch(UUID_V4);
  });

  test('every id is distinct', () => {
    const ids = new Set(Array.from({ length: 2000 }, newAnalysisRequestId));
    expect(ids.size).toBe(2000);
  });

  test('a new photo mints a new id; a retry does not', () => {
    // Minted where the photo is stored, NOT inside the request path — that is
    // the whole mechanism: retrying reuses the ref, a new photo replaces it.
    const stored = SCREEN.indexOf('const storeCapturedPhoto');
    const mintInStore = SCREEN.indexOf('analysisRequestIdRef.current = newAnalysisRequestId()', stored);
    expect(mintInStore).toBeGreaterThan(stored);
    const run = SCREEN.indexOf('const runPhotoAnalysis');
    const send = SCREEN.indexOf('}, analysisRequestIdRef.current);', run);
    expect(send).toBeGreaterThan(run);
  });

  test('it is not the food-log client_uuid — different lifecycles', () => {
    // onboardingLogKeyRef is minted when a RESULT arrives, so it does not exist
    // during a failed attempt and could not identify a retry.
    expect(SCREEN).toContain('analysisRequestIdRef');
    expect(SCREEN).not.toContain('clientUuid: analysisRequestIdRef');
  });
});

describe('only the two production modes are reachable', () => {
  test('mode is required and whitelisted — no implicit fallback to photo', () => {
    expect(EDGE).toContain('const SUPPORTED_MODES = ["meal_text", "meal_text_only", "meal_revise"] as const');
    expect(EDGE).toContain('!(SUPPORTED_MODES as readonly string[]).includes(mode)');
    // The old default was `body.mode === "string" ? body.mode : "photo"`, which
    // meant omitting mode reached an image path.
    expect(EDGE).not.toContain('? body.mode : "photo"');
  });

  test('the three dead modes are gone entirely, not merely unrouted', () => {
    for (const dead of ['case "photo"', 'case "nutrients"', 'case "nutrient_recommendation"']) {
      expect(EDGE).not.toContain(dead);
    }
    // …and so are their handlers, prompts and the USDA integration, so nothing
    // can be re-wired to them by accident.
    for (const sym of [
      'handlePhotoMode', 'PHOTO_SYSTEM_PROMPT', 'fetchUsdaFood', 'parseNutrientList',
      'buildNutrientsPrompt', 'buildNutrientRecommendationPrompt', 'USDA_API_BASE_URL',
    ]) {
      expect(`${sym} present: ${EDGE.includes(sym)}`).toBe(`${sym} present: false`);
    }
  });

  test('mode is rejected before any quota reservation or provider call', () => {
    const modeCheck = HANDLER.indexOf('Unsupported or missing mode');
    expect(modeCheck).toBeGreaterThan(-1);
    expect(modeCheck).toBeLessThan(HANDLER.indexOf('reserveDailyQuota'));
    expect(modeCheck).toBeLessThan(HANDLER.indexOf('await callGemini'));
  });
});

describe('the edge function reserves before it spends', () => {
  test('both metered modes require a valid UUID before anything else', () => {
    expect(HANDLER).toContain('if (!isUuid(requestId))');
    const idCheck = HANDLER.indexOf('A valid requestId (UUID) is required');
    expect(idCheck).toBeGreaterThan(-1);
    expect(idCheck).toBeLessThan(HANDLER.indexOf('reserveDailyQuota'));
    expect(idCheck).toBeLessThan(HANDLER.indexOf('await callGemini'));
  });

  for (const [mode, next] of [
    ['meal_text', 'case "meal_revise"'],
    ['meal_revise', 'default:'],
  ] as const) {
    test(`${mode}: validation runs BEFORE reservation, so a bad request costs nothing`, () => {
      const block = EDGE.slice(EDGE.indexOf(`case "${mode}"`), EDGE.indexOf(next));
      expect(block.indexOf('BAD_REQUEST')).toBeLessThan(block.indexOf('reserveDailyQuota'));
    });

    test(`${mode}: reservation happens BEFORE the provider call`, () => {
      const block = EDGE.slice(EDGE.indexOf(`case "${mode}"`), EDGE.indexOf(next));
      expect(block.indexOf('reserveDailyQuota')).toBeLessThan(block.indexOf('await callGemini'));
    });

    test(`${mode}: a failure that reached the provider is NOT refunded`, () => {
      const block = EDGE.slice(EDGE.indexOf(`case "${mode}"`), EDGE.indexOf(next));
      expect(block).toContain('if (!err.providerAttempted)');
      expect(block).toContain('releaseDailyQuota');
    });
  }

  test('each mode draws on its OWN counter — none can spend another', () => {
    const blocks = {
      meal_text: [EDGE.indexOf('case "meal_text":'), EDGE.indexOf('case "meal_text_only"')],
      meal_text_only: [EDGE.indexOf('case "meal_text_only"'), EDGE.indexOf('case "meal_revise"')],
      meal_revise: [EDGE.indexOf('case "meal_revise"'), EDGE.indexOf('default:')],
    };
    const expected = {
      meal_text: 'photo_analysis',
      meal_text_only: 'text_analysis',
      meal_revise: 'meal_revision',
    };
    for (const [mode, [from, to]] of Object.entries(blocks)) {
      const block = EDGE.slice(from, to);
      const kinds = [...block.matchAll(/DailyQuota\((?:supabase|user\.id), requestId as string, "(\w+)"\)/g)]
        .map((m) => m[1]);
      expect(`${mode}: ${[...new Set(kinds)].join(',')}`).toBe(`${mode}: ${expected[mode as keyof typeof expected]}`);
      // Reserve and release must target the same counter.
      expect(kinds.length).toBe(2);
    }
  });

  test('meal_text_only refuses an image outright', () => {
    // Silently ignoring one would let a caller route image analysis onto the
    // cheaper text counter.
    const block = EDGE.slice(EDGE.indexOf('case "meal_text_only"'), EDGE.indexOf('case "meal_revise"'));
    expect(block).toContain('body.image !== undefined');
    expect(block).toContain('does not accept an image');
    expect(block.indexOf('body.image !== undefined')).toBeLessThan(block.indexOf('reserveDailyQuota'));
    // No image is ever sent to the provider on this path.
    expect(block).not.toContain('inline_data');
  });

  test('an empty description is rejected before it costs a slot', () => {
    const block = EDGE.slice(EDGE.indexOf('case "meal_text_only"'), EDGE.indexOf('case "meal_revise"'));
    expect(block).toContain('description.length < 3');
    expect(block.indexOf('description.length < 3')).toBeLessThan(block.indexOf('reserveDailyQuota'));
  });

  test('the no-photo prompt never claims to have seen anything', () => {
    const fn = EDGE.slice(EDGE.indexOf('function buildMealTextOnlyPrompt'), EDGE.indexOf('function buildMealTextPrompt'));
    expect(fn).toContain('THERE IS NO PHOTOGRAPH');
    expect(fn).toContain('treat it as UNKNOWN');
    // And it stays inside food, so it cannot become a general assistant.
    expect(fn).toContain('SCOPE GUARD');
    // It must not carry the photo path's visual instructions.
    expect(fn).not.toContain('visible in the photo');
  });

  test('both analyses share one personalization builder', () => {
    // The pipeline is shared, not duplicated: same profile context, same
    // five-section contract, same disclaimer.
    expect(EDGE).toContain('function buildSharedContext');
    const textOnly = EDGE.slice(EDGE.indexOf('function buildMealTextOnlyPrompt'), EDGE.indexOf('function buildMealTextPrompt'));
    expect(textOnly).toContain('buildSharedContext(body)');
    expect(textOnly).toContain('FIVE_SECTION_FORMAT_RULES');
    expect(textOnly).toContain('fiveSectionStructure(');
  });

  test('meal_revise is no longer a general-purpose LLM endpoint', () => {
    const block = EDGE.slice(EDGE.indexOf('case "meal_revise"'), EDGE.indexOf('default:'));
    // It used to require only a non-empty correction.
    expect(block).toContain('A previous analysis is required to revise');
    expect(block.indexOf('A previous analysis is required to revise'))
      .toBeLessThan(block.indexOf('reserveDailyQuota'));
  });

  test('provider marks attempts, so a network error is not refunded either', () => {
    expect(EDGE).toContain('err.providerAttempted = true');
    const network = EDGE.slice(EDGE.indexOf('} catch (networkError) {'), EDGE.indexOf('if (!response.ok)'));
    expect(network).toContain('providerAttempted = true');
  });

  test('quota lookup failure denies rather than allows', () => {
    const fn = EDGE.slice(EDGE.indexOf('async function reserveDailyQuota'));
    const guard = fn.slice(0, fn.indexOf('const quota ='));
    expect(guard).toContain('if (error || !data)');
    expect(guard).toContain('QUOTA_UNAVAILABLE');
  });

  test('a limit response is marked not-retryable and carries reset metadata', () => {
    const fn = EDGE.slice(EDGE.indexOf('async function reserveDailyQuota'), EDGE.indexOf('async function releaseDailyQuota'));
    expect(fn).toContain('retryable: false');
    expect(fn).toContain('resetAt: quota.reset_at');
    // The codes live in the per-kind table the reservation reads from.
    const table = EDGE.slice(EDGE.indexOf('const QUOTA_RPC'), EDGE.indexOf('} as const;', EDGE.indexOf('const QUOTA_RPC')));
    expect(table).toContain('DAILY_PHOTO_LIMIT_REACHED');
    expect(table).toContain('DAILY_REVISION_LIMIT_REACHED');
    expect(table).toContain('reserve_ai_photo_quota');
    expect(table).toContain('reserve_ai_revision_quota');
  });

  test('the burst limiter is retained as secondary protection', () => {
    expect(EDGE).toContain('RATE_LIMIT_MAX = 10');
    expect(EDGE).toContain('isRateLimited(clientIp)');
  });

  test('auth still precedes everything', () => {
    expect(EDGE.indexOf('auth.getUser()')).toBeLessThan(EDGE.indexOf('isRateLimited(clientIp)'));
  });
});

describe('request body and field size limits', () => {
  test('the body is capped BEFORE JSON.parse', () => {
    expect(EDGE).toContain('const MAX_BODY_BYTES = 12 * 1024 * 1024');
    const read = EDGE.indexOf('await readBodyWithLimit(req)');
    expect(read).toBeGreaterThan(-1);
    expect(read).toBeLessThan(EDGE.indexOf('JSON.parse(raw.text)'));
    expect(EDGE).toContain('REQUEST_TOO_LARGE');
  });

  test('a dishonest Content-Length cannot get past the stream counter', () => {
    const fn = EDGE.slice(EDGE.indexOf('async function readBodyWithLimit'), EDGE.indexOf('const FIELD_LIMITS'));
    expect(fn).toContain('content-length');
    expect(fn).toContain('total > MAX_BODY_BYTES');
    // Stops reading rather than buffering the remainder.
    expect(fn).toContain('await reader.cancel()');
  });

  test('the body ceiling still admits a legitimate 10 MB image request', () => {
    const body = Number(/MAX_BODY_BYTES = (\d+) \* 1024 \* 1024/.exec(EDGE)?.[1]);
    const image = Number(/MAX_IMAGE_SIZE = (\d+) \* 1024 \* 1024/.exec(EDGE)?.[1]);
    expect(body).toBeGreaterThan(image);
  });

  test('every audited field limit is configured exactly as approved', () => {
    const limits = EDGE.slice(EDGE.indexOf('const FIELD_LIMITS'), EDGE.indexOf('} as const;', EDGE.indexOf('const FIELD_LIMITS')));
    for (const [field, value] of [
      ['correction', '2_000'], ['previousAnalysis', '8_000'], ['userFeelingsNarrative', '4_000'],
      ['retailLocationHint', '500'], ['locationContext', '500'], ['listItem', '200'],
      // Approved 500-char cap for individual correction/history items.
      ['correctionHistoryItem', '500'], ['mealDescription', '4_000'], ['listCount', '20'],
    ]) {
      expect(limits).toContain(`${field}: ${value}`);
    }
  });

  test('EVERY attacker-controlled prompt input is clamped — none missed', () => {
    // Whitelist over the two prompt builders: any raw `body.x` read that is not
    // a number, an enum or a nested object must go through clampText/clampList.
    for (const builder of ['buildMealTextPrompt', 'buildMealRevisePrompt']) {
      const start = EDGE.indexOf(`function ${builder}`);
      const block = EDGE.slice(start, EDGE.indexOf('\n}', start));
      const rawReads = [...block.matchAll(/=\s*(?:String\(|asStringArray\()?\s*body\.(\w+)/g)]
        .map((m) => m[1])
        .filter((f) => !['gutScore', 'preferredLanguage', 'mealContext'].includes(f));
      for (const field of rawReads) {
        const line = block.split('\n').find((l) => l.includes(`body.${field}`)) ?? '';
        expect(`${builder}.${field}: ${/clampText|clampList/.test(line)}`).toBe(
          `${builder}.${field}: true`,
        );
      }
    }
  });

  test('nested mealContext fields are clamped too', () => {
    expect(EDGE).toContain('clampText(mealCtx.currentState');
    expect(EDGE).toContain('clampText(mealCtx.afterMealActivity');
  });

  test('lists are capped on BOTH count and per-item length', () => {
    const fn = EDGE.slice(EDGE.indexOf('function clampList'), EDGE.indexOf('const CORS_HEADERS'));
    expect(fn).toContain('.slice(0, maxItems)');
    expect(fn).toContain('clampText(item, maxItemLength)');
  });

  test('truncation is deterministic, so the same input yields the same prompt', () => {
    const fn = EDGE.slice(EDGE.indexOf('function clampText'), EDGE.indexOf('function clampList'));
    expect(fn).toContain('.slice(0, max)');
    expect(fn).not.toMatch(/random|Date\.now/);
  });

  test('the client caps corrections at the same length the server does', () => {
    expect(SCREEN).toContain('maxLength={MAX_CORRECTION_LENGTH}');
    const clientMax = Number(/MAX_CORRECTION_LENGTH = (\d+)/.exec(read('lib', 'ai-quota.ts'))?.[1]);
    const serverMax = Number(/correction: (\d[\d_]*),/.exec(EDGE)?.[1].replace(/_/g, ''));
    expect(clientMax).toBe(serverMax);
  });
});

describe('telemetry is cost data, never content', () => {
  test('the table has no column that could hold content', () => {
    const table = MIGRATION.slice(
      MIGRATION.indexOf('create table if not exists public.ai_usage_events'),
      MIGRATION.indexOf('create index if not exists ai_usage_events_created_at_idx'),
    );
    for (const banned of ['prompt_text', 'image', 'response', 'analysis_text', 'description', 'symptom', 'meal_name']) {
      expect(table).not.toContain(banned);
    }
    for (const wanted of ['prompt_tokens', 'output_tokens', 'thoughts_tokens', 'cached_tokens', 'total_tokens', 'model', 'mode', 'succeeded']) {
      expect(table).toContain(wanted);
    }
  });

  test('the recording function cannot be passed content', () => {
    const sig = MIGRATION.slice(
      MIGRATION.indexOf('create or replace function public.record_ai_usage('),
      MIGRATION.indexOf('returns void'),
    );
    expect(sig).not.toMatch(/p_(prompt|image|text|analysis|response|content)\b/);
  });

  test('provider error text cannot reach the table', () => {
    expect(MIGRATION).toContain("case when p_failure_kind in ('upstream', 'empty', 'error')");
  });

  test('the provider error BODY is never logged', () => {
    // Gemini echoes parts of a rejected request in some failures (blocked
    // prompt, bad inline image), so logging the body verbatim would put meal
    // descriptions, symptoms and image data into the function logs — defeating
    // the whole point of keeping content out of telemetry.
    const block = EDGE.slice(EDGE.indexOf('if (!response.ok)'), EDGE.indexOf('const data = await response.json()'));
    expect(block).not.toMatch(/detail:\s*errorText/);
    expect(block).not.toContain('await response.text()');
    // Only the provider's machine-readable status/reason survives.
    expect(block).toContain('reason');
    expect(block).toContain('parsed?.error?.status');
    expect(block).toContain('.slice(0, 40)');
  });

  test('no logging path anywhere emits request content', () => {
    const logs = [...EDGE.matchAll(/console\.(?:log|error|warn)\([\s\S]{0,220}?\);/g)].map((m) => m[0]);
    expect(logs.length).toBeGreaterThan(0);
    for (const call of logs) {
      for (const banned of ['body', 'prompt', 'image', 'description', 'correction', 'analysis', 'errorText', 'result.text']) {
        expect(`${banned} in log: ${new RegExp(`\\b${banned}\\b`).test(call)}`).toBe(`${banned} in log: false`);
      }
    }
  });

  test('the edge function never sends anything but counts', () => {
    const call = EDGE.slice(
      EDGE.indexOf('async function recordUsage'),
      EDGE.indexOf('// ------', EDGE.indexOf('async function recordUsage')),
    );
    // Whitelist, not a blacklist: enumerate every argument actually sent and
    // require it to be one of the known-safe ones. A blacklist would pass a
    // future `p_meal_description` simply because nobody thought to ban it.
    const sent = [...call.matchAll(/\b(p_[a-z_]+):/g)].map((m) => m[1]).sort();
    expect(sent).toEqual([
      'p_cached_tokens', 'p_failure_kind', 'p_mode', 'p_model', 'p_output_tokens',
      'p_prompt_tokens', 'p_request_id', 'p_succeeded', 'p_thoughts_tokens',
      'p_total_tokens', 'p_user_id',
    ]);
    // Nothing derived from the request body reaches this function.
    expect(call).not.toMatch(/\bbody\b/);
  });

  test('usage is recorded on success AND on provider failure', () => {
    const block = EDGE.slice(EDGE.indexOf('case "meal_text"'), EDGE.indexOf('case "meal_revise"'));
    expect(block).toContain('succeeded: true');
    expect(block).toContain('succeeded: false');
    expect(block).toContain('failureKind:');
  });

  test('usage metadata is read from the Gemini response', () => {
    expect(EDGE).toContain('m.promptTokenCount');
    expect(EDGE).toContain('m.candidatesTokenCount');
    expect(EDGE).toContain('m.thoughtsTokenCount');
    expect(EDGE).toContain('m.cachedContentTokenCount');
    expect(EDGE).toContain('m.totalTokenCount');
  });
});

describe('client behaviour at the limit', () => {
  test('the error code is surfaced with its metadata, not flattened to a string', () => {
    expect(ENGINE).toContain('new AnalysisError(');
    expect(ENGINE).toContain('readQuotaMeta');
  });

  test('only safe fields are read off the error body', () => {
    const fn = ENGINE.slice(ENGINE.indexOf('function readQuotaMeta'), ENGINE.indexOf('function messageForErrorCode'));
    expect(fn).toContain('limit');
    expect(fn).toContain('resetAt');
    for (const leak of ['gemini', 'provider', 'cost', 'token']) expect(fn.toLowerCase()).not.toContain(leak);
  });

  test('isDailyPhotoLimitError identifies exactly the limit', () => {
    expect(isDailyPhotoLimitError(new AnalysisError('x', DAILY_PHOTO_LIMIT_REACHED))).toBe(true);
    expect(isDailyPhotoLimitError(new AnalysisError('x', 'UPSTREAM_ERROR'))).toBe(false);
    expect(isDailyPhotoLimitError(new Error('x'))).toBe(false);
    expect(isDailyPhotoLimitError(null)).toBe(false);
  });

  test('the photo limit offers the text fallback instead of dead-ending', () => {
    const c = SCREEN.slice(SCREEN.indexOf('if (isDailyPhotoLimitError(error))'), SCREEN.indexOf('ONBOARDING (3/4)'));
    expect(c).toContain('dailyLimitTitle');
    expect(c).toContain('dailyLimitFallbackMessage');
    // The fallback is offered as an action, not merely described.
    expect(c).toContain('onPress: startTextOnlyFlow');
    expect(c).toContain('setPhotoQuotaExhausted(true)');
    expect(c).toContain('return;');
    // Hitting a limit is not app breakage, so it must not arm the escape hatch.
    expect(c).not.toContain('setOnboardingFailures');
  });

  test('reset time renders in the user locale, or is omitted when unusable', () => {
    const at = new Date('2026-08-09T00:00:00.000Z').toISOString();
    expect(formatQuotaResetTime(at, 'en')).toBeTruthy();
    expect(formatQuotaResetTime(at, 'de')).toBeTruthy();
    expect(formatQuotaResetTime(undefined, 'en')).toBeNull();
    expect(formatQuotaResetTime('not-a-date', 'en')).toBeNull();
  });

  test('EN copy is present, plain, and reveals nothing about cost or abuse', () => {
    const p = translations.en.photoAnalysis;
    expect(p.dailyLimitTitle).toBe('Daily limit reached');
    expect(p.dailyLimitMessage).toContain('5 meals');
    expect(p.dailyLimitResetsAt).toContain('{time}');
    for (const banned of ['abuse', 'hack', 'cost', 'spend', 'Gemini', 'API', 'quota', 'billing']) {
      expect(`${p.dailyLimitTitle} ${p.dailyLimitMessage} ${p.dailyLimitResetsAt}`).not.toContain(banned);
    }
  });

  test('DE copy is genuinely translated and carries the same placeholder', () => {
    const de = translations.de.photoAnalysis;
    const en = translations.en.photoAnalysis;
    expect(de.dailyLimitTitle).toBe('Tageslimit erreicht');
    expect(de.dailyLimitTitle).not.toBe(en.dailyLimitTitle);
    expect(de.dailyLimitMessage).not.toBe(en.dailyLimitMessage);
    expect(de.dailyLimitMessage).toContain('5');
    expect(de.dailyLimitResetsAt).toContain('{time}');
    for (const banned of ['abuse', 'Gemini', 'API', 'Kosten', 'Missbrauch']) {
      expect(de.dailyLimitMessage).not.toContain(banned);
    }
  });

  test('no paywall or subscription behaviour was introduced', () => {
    const c = SCREEN.slice(SCREEN.indexOf('if (isDailyPhotoLimitError(error))'), SCREEN.indexOf('ONBOARDING (3/4)'));
    for (const banned of ['paywall', 'Purchases', 'premium', 'subscribe', 'upgrade']) {
      expect(c.toLowerCase()).not.toContain(banned.toLowerCase());
    }
  });
});

describe('cost model', () => {
  test('thinking tokens bill as output', () => {
    const withThoughts = estimateCallCostUsd({ promptTokens: 0, outputTokens: 0, thoughtsTokens: 1_000_000 });
    expect(withThoughts).toBeCloseTo(GEMINI_25_FLASH_PRICING.outputPerMillion, 10);
  });

  test('totalTokens is never added on top of the parts', () => {
    const parts = { promptTokens: 1000, outputTokens: 500, thoughtsTokens: 200 };
    expect(estimateCallCostUsd({ ...parts, totalTokens: 1700 })).toBeCloseTo(
      estimateCallCostUsd(parts), 12,
    );
  });

  test('cached tokens are a discounted subset of input, not an addition', () => {
    const all = estimateCallCostUsd({ promptTokens: 1_000_000, cachedTokens: 0 });
    const half = estimateCallCostUsd({ promptTokens: 1_000_000, cachedTokens: 1_000_000 });
    expect(half).toBeLessThan(all);
    expect(half).toBeCloseTo(GEMINI_25_FLASH_PRICING.cachedInputPerMillion, 10);
  });

  test('missing or nonsense usage costs zero rather than NaN', () => {
    for (const u of [{}, { promptTokens: null }, { outputTokens: undefined }, { promptTokens: -5 }]) {
      const c = estimateCallCostUsd(u);
      expect(Number.isFinite(c)).toBe(true);
      expect(c).toBe(0);
    }
  });

  test('the price snapshot is dated, because provider pricing moves', () => {
    expect(GEMINI_25_FLASH_PRICING.capturedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(read('lib', 'ai-cost-model.ts')).toContain('ai.google.dev/gemini-api/docs/pricing');
  });

  test('the monthly ceiling follows the 5/day cap', () => {
    expect(maxMonthlySpendPerUser(0.01)).toBeCloseTo(1.55, 10);
    expect(maxMonthlySpendPerUser(0.03)).toBeCloseTo(4.65, 10);
  });

  test('no cost is written to the database — raw usage only, so it can be re-priced', () => {
    // Scoped to the table definition: prose about pricing is fine, a price
    // COLUMN is not, because a stored dollar figure goes stale silently.
    const table = MIGRATION.slice(
      MIGRATION.indexOf('create table if not exists public.ai_usage_events'),
      MIGRATION.indexOf('create index if not exists ai_usage_events_created_at_idx'),
    );
    expect(table).not.toMatch(/\b\w*(cost|usd|price|_rate)\w*\b/i);
    // The edge function may point at the cost model in a comment, but must not
    // import it: pricing has no business running on the request path.
    expect(EDGE).not.toMatch(/^\s*import[^\n]*ai-cost-model/m);
  });
});

describe('revision request identity and limit UX', () => {
  test('one id per correction SUBMISSION, keyed by the correction text', () => {
    // A retry of the same text reuses the id (free); different text mints a new
    // one (costs a slot). Reusing the PHOTO id would dedupe the first
    // correction against the scan itself.
    expect(SCREEN).toContain("revisionRequestRef.current?.correction !== correction");
    expect(SCREEN).toContain('revisionRequestRef.current = { correction, id: newAnalysisRequestId() }');
    expect(SCREEN).toContain('}, revisionRequestRef.current?.id);');
    expect(SCREEN).not.toContain('analysisRequestIdRef.current);\n      const revised');
  });

  test('a successful correction clears the id so the next one is new work', () => {
    const block = SCREEN.slice(SCREEN.indexOf('const submitChatCorrection'), SCREEN.indexOf('const applyVoiceTranscript'));
    expect(block).toContain('revisionRequestRef.current = null;');
  });

  test('isDailyRevisionLimitError identifies exactly the revision limit', () => {
    expect(isDailyRevisionLimitError(new AnalysisError('x', DAILY_REVISION_LIMIT_REACHED))).toBe(true);
    expect(isDailyRevisionLimitError(new AnalysisError('x', DAILY_PHOTO_LIMIT_REACHED))).toBe(false);
    expect(isDailyPhotoLimitError(new AnalysisError('x', DAILY_REVISION_LIMIT_REACHED))).toBe(false);
    expect(isDailyRevisionLimitError(new Error('x'))).toBe(false);
  });

  test('the correction screen shows limit copy, not a failure alert or retry', () => {
    const block = SCREEN.slice(SCREEN.indexOf('if (isDailyRevisionLimitError(error))'), SCREEN.indexOf('correctionFailedTitle'));
    expect(block).toContain('revisionLimitTitle');
    expect(block).toContain('revisionLimitMessage');
    expect(block).toContain('return;');
    // Nothing the user does before reset can succeed, so no retry is offered.
    expect(block.toLowerCase()).not.toContain('tryagain');
  });

  test('EN revision copy is plain and reveals nothing about cost or abuse', () => {
    const p = translations.en.photoAnalysis;
    expect(p.revisionLimitTitle).toBe('Daily correction limit reached');
    expect(p.revisionLimitMessage).toContain('20 corrections');
    for (const banned of ['abuse', 'hack', 'cost', 'spend', 'Gemini', 'API', 'quota', 'billing', 'error']) {
      expect(`${p.revisionLimitTitle} ${p.revisionLimitMessage}`).not.toContain(banned);
    }
  });

  test('DE revision copy is genuinely translated', () => {
    const de = translations.de.photoAnalysis;
    expect(de.revisionLimitTitle).toBe('Tageslimit für Korrekturen erreicht');
    expect(de.revisionLimitTitle).not.toBe(translations.en.photoAnalysis.revisionLimitTitle);
    expect(de.revisionLimitMessage).not.toBe(translations.en.photoAnalysis.revisionLimitMessage);
    expect(de.revisionLimitMessage).toContain('20');
    for (const banned of ['Gemini', 'API', 'Kosten', 'Missbrauch', 'Fehler']) {
      expect(de.revisionLimitMessage).not.toContain(banned);
    }
  });

  test('the engine surfaces the revision code with its metadata', () => {
    expect(ENGINE).toContain('DAILY_REVISION_LIMIT_REACHED');
    expect(ENGINE).toContain('requestId,');
  });

  test('the correction cap is a real number the client can enforce', () => {
    expect(MAX_CORRECTION_LENGTH).toBe(2000);
  });
});

describe('text-only meal analysis — the permanent fallback', () => {
  test('the entry point is ALWAYS rendered, never conditional', () => {
    const step1 = SCREEN.slice(SCREEN.indexOf('{wizardStep === 1 ? ('), SCREEN.indexOf('{wizardStep === 3 && isOnboarding ? ('));
    const cta = step1.indexOf('t.photoAnalysis.describeMealCta');
    expect(cta).toBeGreaterThan(-1);
    // It must not sit behind photoUri, a quota flag, or an entitlement check.
    const opensAt = step1.lastIndexOf('<Pressable', cta);
    const guard = step1.slice(step1.lastIndexOf('{', opensAt), opensAt);
    expect(guard).not.toMatch(/\?|&&/);
    expect(step1.indexOf('onPress={startTextOnlyFlow}')).toBeGreaterThan(-1);
  });

  test('the client sends no image key at all on the text path', () => {
    const fn = ENGINE.slice(ENGINE.indexOf('export async function analyzeMealText'), ENGINE.indexOf('export async function reviseMealAnalysis'));
    expect(fn).toContain("mode: 'meal_text_only'");
    expect(fn).not.toMatch(/^\s*image:/m);
    expect(fn).not.toMatch(/^\s*mimeType:/m);
    // Same personalization as the photo path, so results stay comparable.
    for (const field of ['conditions', 'symptoms', 'userEnteredSymptoms', 'mealContext', 'gutScore']) {
      expect(fn).toContain(field);
    }
  });

  test('the text result reuses the existing Result Screen, not a second one', () => {
    const fn = SCREEN.slice(SCREEN.indexOf('const runTextAnalysis'), SCREEN.indexOf('const runPhotoAnalysis'));
    // Same state the photo path sets: same parser, same screen, same save.
    expect(fn).toContain('setAnalysis(rawResult)');
    expect(fn).toContain('setWizardStep(3)');
    expect(fn).not.toContain('AnalysisResult');
  });

  test('starting the text flow clears any earlier photo', () => {
    const fn = SCREEN.slice(SCREEN.indexOf('const startTextOnlyFlow'), SCREEN.indexOf('const submitChatCorrection'));
    expect(fn).toContain('setPhotoUri(null)');
    expect(fn).toContain("setLastImageBase64('')");
    expect(fn).toContain('newAnalysisRequestId()');
    expect(fn).toContain('setWizardStep(2)');
  });

  test('a text request carries its own id, so retries are free', () => {
    const fn = SCREEN.slice(SCREEN.indexOf('const runTextAnalysis'), SCREEN.indexOf('const runPhotoAnalysis'));
    expect(fn).toContain('analysisRequestIdRef.current');
  });

  test('the text limit has its own code and helper', () => {
    expect(QUOTA).toContain("DAILY_TEXT_LIMIT_REACHED = 'DAILY_TEXT_LIMIT_REACHED'");
    expect(QUOTA).toContain('export function isDailyTextLimitError');
    expect(ENGINE).toContain('DAILY_TEXT_LIMIT_REACHED');
  });

  test('EN copy matches the approved wording exactly', () => {
    const p = translations.en.photoAnalysis;
    expect(p.describeMealCta).toBe('Describe your meal instead');
    expect(p.describeMealHint).toBe('Tell us what you ate, ingredients, and how you feel.');
    expect(p.dailyLimitFallbackMessage).toBe(
      "You've used today's 5 photo analyses. You can still describe your meal.",
    );
    expect(p.describeMealPlaceholder).toContain('Chicken burger');
    expect(p.describeMealPlaceholder).toContain('bloated');
    for (const banned of ['Gemini', 'API', 'quota', 'abuse', 'cost', 'backend', 'server']) {
      const all = `${p.describeMealCta} ${p.describeMealHint} ${p.dailyLimitFallbackMessage} ${p.textLimitMessage}`;
      expect(all).not.toContain(banned);
    }
  });

  test('DE copy matches the approved wording exactly', () => {
    const d = translations.de.photoAnalysis;
    expect(d.describeMealCta).toBe('Mahlzeit stattdessen beschreiben');
    expect(d.describeMealHint).toBe(
      'Beschreibe, was du gegessen hast, die Zutaten und wie du dich fühlst.',
    );
    expect(d.dailyLimitFallbackMessage).toContain('5 Fotoanalysen');
    expect(d.dailyLimitFallbackMessage).toContain('beschreiben');
    expect(d.describeMealPlaceholder).toContain('Chickenburger');
    for (const banned of ['Gemini', 'API', 'Kontingent', 'Missbrauch', 'Server']) {
      expect(d.dailyLimitFallbackMessage).not.toContain(banned);
    }
    // Genuinely translated, not copied.
    for (const k of ['describeMealCta', 'describeMealHint', 'describeMealPlaceholder', 'textLimitMessage'] as const) {
      expect(d[k]).not.toBe(translations.en.photoAnalysis[k]);
    }
  });

  test('the description input is capped at the server limit', () => {
    expect(SCREEN).toContain('maxLength={MAX_MEAL_DESCRIPTION_LENGTH}');
    const clientMax = Number(/MAX_MEAL_DESCRIPTION_LENGTH = (\d+)/.exec(QUOTA)?.[1]);
    const serverMax = Number(/mealDescription: (\d[\d_]*),/.exec(EDGE)?.[1].replace(/_/g, ''));
    expect(clientMax).toBe(serverMax);
  });

  test('text calls are metered like every other provider call', () => {
    const block = EDGE.slice(EDGE.indexOf('case "meal_text_only"'), EDGE.indexOf('case "meal_revise"'));
    expect(block).toContain('succeeded: true');
    expect(block).toContain('succeeded: false');
    expect(block).toContain('mode,');
    // mode is what lets photo / text / revision costs be compared later.
    expect(block).not.toMatch(/p_(prompt_text|meal|description)/);
  });

  test('the text limit is documented as a temporary safety default', () => {
    // 5/day is NOT the permanent Free-plan entitlement; the trial/text split
    // arrives with RevenueCat and belongs in ai_quota_limit(), not the client.
    const block = EDGE.slice(EDGE.indexOf('const QUOTA_RPC'), EDGE.indexOf('} as const;', EDGE.indexOf('const QUOTA_RPC')));
    expect(block).toContain('SAFETY DEFAULT');
    expect(block).toContain('ai_quota_limit()');
  });

  test('all three quota kinds exist with the approved v1 limits', () => {
    expect(MIGRATION).toContain("when 'photo_analysis' then 5");
    expect(MIGRATION).toContain("when 'text_analysis'  then 5");
    expect(MIGRATION).toContain("when 'meal_revision'  then 5");
    for (const fn of ['reserve_ai_text_quota', 'release_ai_text_quota']) {
      expect(MIGRATION).toContain(`create or replace function public.${fn}(p_request_id uuid)`);
      expect(MIGRATION).toContain(`grant execute on function public.${fn}(uuid) to authenticated`);
    }
  });

  test('allowances have ONE source of truth, and it is not the client', () => {
    // The Free/Premium ALLOWANCE split belongs in this SQL function.
    expect(MIGRATION).toContain('SINGLE SOURCE OF TRUTH');

    // The client may consult entitlement to decide what to SHOW — that is the
    // paywall gate, and it is UX. What it must never do is decide how much a
    // user is allowed, or send anything the server would treat as proof.
    for (const [name, src] of [['screen', SCREEN], ['engine', ENGINE], ['quota', QUOTA]] as const) {
      // No client-side limit arithmetic.
      expect(`${name}: ${/(limit|quota|remaining)\s*[=<>]=?\s*\d/.test(src)}`).toBe(`${name}: false`);
      // Nothing claiming premium is ever put on the wire.
      expect(`${name}: ${/isPremium\s*:/.test(src)}`).toBe(`${name}: false`);
      expect(`${name}: ${/entitlement\s*:/.test(src)}`).toBe(`${name}: false`);
    }

    // And the server never reads such a field even if one were sent.
    expect(EDGE).not.toMatch(/body\.(isPremium|premium|entitlement|subscription)/);
  });
});

describe('the edge function actually parses', () => {
  // The app's tsconfig EXCLUDES supabase/functions (they are Deno, not RN), so
  // `tsc --noEmit` never looks at this file. Every other test here reads it as
  // TEXT, which means a syntax error can pass the entire suite and only fail at
  // `supabase functions deploy` — which is exactly what happened: a dropped
  // `fetch(` line shipped green and was caught by the deploy bundler.
  test('it is syntactically valid TypeScript', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ts = require('typescript');
    const out = ts.transpileModule(EDGE, {
      compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext },
      reportDiagnostics: true,
      fileName: 'index.ts',
    });
    const errors = (out.diagnostics ?? []).map((d: { messageText: unknown; start?: number }) => {
      const line = d.start != null ? EDGE.slice(0, d.start).split('\n').length : '?';
      return `${line}: ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`;
    });
    expect(errors).toEqual([]);
  });

  test('every brace and paren balances', () => {
    // Cheap structural backstop that does not depend on the compiler being
    // present, and catches the specific shape of the bug above.
    const stripped = EDGE
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1')
      .replace(/`(?:\\.|[^`\\])*`/g, '``')
      .replace(/"(?:\\.|[^"\\])*"/g, '""')
      .replace(/'(?:\\.|[^'\\])*'/g, "''");
    for (const [open, close] of [['{', '}'], ['(', ')'], ['[', ']']]) {
      const o = stripped.split(open).length - 1;
      const c = stripped.split(close).length - 1;
      expect(`${open}${close} ${o}/${c}`).toBe(`${open}${close} ${o}/${o}`);
    }
  });
});

describe('refunds and telemetry are server-only', () => {
  // Found by probing the deployed project, not by a local test: Supabase grants
  // EXECUTE on new functions to anon/authenticated by DEFAULT PRIVILEGES, so a
  // `revoke ... from public` is inert. That left release_ai_*_quota callable by
  // any authenticated user, who could spend a slot on a real analysis and then
  // refund it — bypassing the ceiling completely.
  test('every sensitive function is revoked from anon AND authenticated by name', () => {
    expect(LOCKDOWN).toContain('revoke all on function %s from public, anon, authenticated');
    for (const fn of [
      'public._ai_release_quota(uuid, uuid, text)',
      'public.release_ai_photo_quota(uuid, uuid)',
      'public.release_ai_text_quota(uuid, uuid)',
      'public.release_ai_revision_quota(uuid, uuid)',
      'public._ai_reserve_quota(uuid, text)',
    ]) {
      expect(LOCKDOWN).toContain(fn);
    }
  });

  test('refunds are granted to service_role only', () => {
    expect(LOCKDOWN).toContain('grant execute on function %s to service_role');
    // …and never to a role a user can reach.
    expect(LOCKDOWN).not.toMatch(/grant execute on function public\.release_[^;]*to (anon|authenticated)/);
    expect(LOCKDOWN).not.toMatch(/grant execute on function public\.record_ai_usage[^;]*to (anon|authenticated)/);
  });

  test('the old user-callable signatures are dropped, not merely revoked', () => {
    for (const fn of [
      'drop function if exists public.release_ai_photo_quota(uuid);',
      'drop function if exists public.release_ai_text_quota(uuid);',
      'drop function if exists public.release_ai_revision_quota(uuid);',
      'drop function if exists public._ai_release_quota(uuid, text);',
    ]) {
      expect(LOCKDOWN).toContain(fn);
    }
  });

  test('reserving stays on the caller JWT, so no user id is trusted from input', () => {
    expect(LOCKDOWN).toMatch(/grant execute on function public\.reserve_ai_photo_quota\(uuid\) to authenticated/);
    expect(MIGRATION).toContain('v_user     uuid := auth.uid()');
    // Reserve takes no user parameter.
    expect(LOCKDOWN).not.toMatch(/reserve_ai_\w+_quota\(p_user_id/);
  });

  test('the edge function uses the service role for refunds and telemetry only', () => {
    expect(EDGE).toContain('SUPABASE_SERVICE_ROLE_KEY');
    const release = EDGE.slice(EDGE.indexOf('async function releaseDailyQuota'), EDGE.indexOf('async function recordUsage'));
    expect(release).toContain('serviceClient()');
    expect(release).toContain('p_user_id: userId');
    // Missing key must NOT fall back to the user's JWT — the slot stays spent.
    expect(release).toContain('Quota release skipped');
    // Reservation still runs as the caller.
    const reserve = EDGE.slice(EDGE.indexOf('async function reserveDailyQuota'), EDGE.indexOf('async function releaseDailyQuota'));
    expect(reserve).toContain('supabase.rpc(rpc.reserve');
    expect(reserve).not.toContain('serviceClient()');
  });

  test('the follow-up migration is forward-only and sorts after the first', () => {
    expect('20260809100000' > '20260808120000').toBe(true);
    // The applied migration must not have been edited to fix this.
    expect(MIGRATION).toContain("when 'photo_analysis' then 5");
  });
});

describe('a photo always analyses as a photo', () => {
  /**
   * textOnlyMode used to be a one-way latch. startTextOnlyFlow() set it and
   * cleared the image; storeCapturedPhoto() set the image but left the flag, so
   * a user routed into the describe path by the Premium gate and returning with
   * a photo still analysed as mode "meal_text_only". The image was never sent,
   * and because the typed text described how they felt rather than what they
   * ate, the text-only scope guard refused with "I can only look at meals and
   * drinks you've described". The correction flow then worked, because it is a
   * different mode with a different prompt.
   */
  const STORE = SCREEN.slice(
    SCREEN.indexOf('const storeCapturedPhoto'),
    SCREEN.indexOf('const ensurePhotoEntitlement'),
  );
  const FLOW = SCREEN.slice(
    SCREEN.indexOf('const startTextOnlyFlow'),
    SCREEN.indexOf('const startTextOnlyFlow') + 900,
  );

  test('storing a photo leaves text-only mode', () => {
    expect(STORE).toContain('setTextOnlyMode(false)');
  });

  test('the flag has both transitions, so it cannot latch again', () => {
    expect(SCREEN).toContain('setTextOnlyMode(true)');
    expect(SCREEN).toContain('setTextOnlyMode(false)');
  });

  test('entering and leaving the text path are mirror images', () => {
    // Entering clears the image; storing an image clears the flag. Either half
    // alone leaves the screen able to disagree with itself about its own mode.
    expect(FLOW).toContain('setTextOnlyMode(true)');
    expect(FLOW).toContain("setLastImageBase64('')");
    expect(STORE).toContain('setLastImageBase64(asset.base64)');
    expect(STORE).toContain('setTextOnlyMode(false)');
  });

  test('the generate handler routes on the flag, and the flag now tracks reality', () => {
    const handler = SCREEN.slice(
      SCREEN.indexOf('const handleGenerateAnalysis'),
      SCREEN.indexOf('const runTextAnalysis'),
    );
    expect(handler).toContain('if (textOnlyMode)');
    expect(handler).toContain('void runTextAnalysis(');
    expect(handler).toContain('void runPhotoAnalysis(lastImageBase64, photoUri, narrative)');
  });

  test('the photo path sends the image AND the narrative under mode meal_text', () => {
    const fn = SCREEN.slice(SCREEN.indexOf('const runPhotoAnalysis'), SCREEN.length);
    expect(fn).toContain("analyzeMealPhoto(imageBase64, 'image/jpeg'");
    expect(fn).toContain('userFeelingsNarrative:');
    const engine = ENGINE.slice(ENGINE.indexOf('export async function analyzeMealPhoto'));
    expect(engine).toContain("mode: 'meal_text'");
    expect(engine).toContain('image: imageBase64');
  });

  test('the text path still sends no image at all', () => {
    const engine = ENGINE.slice(
      ENGINE.indexOf('export async function analyzeMealText'),
      ENGINE.indexOf('export async function reviseMealAnalysis'),
    );
    expect(engine).toContain("mode: 'meal_text_only'");
    // Comments are stripped: the function documents that it deliberately omits
    // these keys, and that explanation should not read as the keys being sent.
    const code = engine.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/\bimage:/);
    expect(code).not.toMatch(/\bmimeType\b/);
  });

  test('correction stays its own mode and is unaffected by either path', () => {
    const engine = ENGINE.slice(ENGINE.indexOf('export async function reviseMealAnalysis'));
    expect(engine).toContain("mode: 'meal_revise'");
  });

  test('the refusal wording lives only in the text-only prompt', () => {
    // If this string ever appears in the photo prompt, a photo analysis could
    // refuse for the same reason and this whole guard would prove nothing.
    const textOnly = EDGE.slice(
      EDGE.indexOf('function buildMealTextOnlyPrompt'),
      EDGE.indexOf('function buildMealTextPrompt'),
    );
    const photo = EDGE.slice(
      EDGE.indexOf('function buildMealTextPrompt'),
      EDGE.indexOf('function buildMealRevisePrompt'),
    );
    expect(textOnly).toContain('you can only look at meals and drinks');
    expect(photo).not.toContain('you can only look at meals and drinks');
  });
});
