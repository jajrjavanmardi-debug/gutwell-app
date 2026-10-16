/**
 * lib/__tests__/batch4-free-limits.test.ts
 *
 * BATCH 4: the final Free AI allowances.
 *
 * 20260918100000 shipped the tiering mechanism with every Free constant at 5,
 * so the new code path ran in production without changing anything a user
 * could see. This batch changes the numbers and nothing else.
 *
 * The app is RELEASED at 1.0.1 and its copy cannot change, so the whole point
 * of these tests is to prove that a pure SQL number change lands as correct UX
 * on a binary that is already in people's hands. That is done end to end: the
 * constants are read out of the migration file, pushed through a simulation of
 * _ai_reserve_quota and of the edge function's 429 builder, and the resulting
 * error is handed to the REAL quotaStateForError and the REAL translations.
 * Nothing about the expected numbers is written twice.
 *
 * Additive. It does not relax any existing assertion; in particular the
 * "batch 1 reduces nothing" test in ai-cost-control.test.ts still guards the
 * ALREADY-DEPLOYED 20260918100000 file, which this batch must not touch.
 */
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import {
  quotaStateForError,
  AnalysisError,
  freeWindowProgress,
  type AnalysisQuotaState,
  DAILY_TEXT_LIMIT_REACHED,
  DAILY_REVISION_LIMIT_REACHED,
  DAILY_PHOTO_LIMIT_REACHED,
  FREE_WINDOW_ENDED,
} from '../ai-quota';
import { translations } from '../i18n';

const root = join(__dirname, '..', '..');
const read = (...p: string[]) => readFileSync(join(root, ...p), 'utf8');

const MIGRATION_DIR = join(root, 'supabase', 'migrations');
const BATCH4_FILE = '20260920120000_ai_quota_batch4_free_limits.sql';
const TIERING_FILE = '20260918100000_ai_quota_tiering.sql';
const BATCH4 = read('supabase', 'migrations', BATCH4_FILE);
const TIERING = read('supabase', 'migrations', TIERING_FILE);
const EDGE = read('supabase', 'functions', 'analyze-food', 'index.ts');
const SCREEN = read('app', 'photo-analysis.tsx');

// ---------------------------------------------------------------------------
// The constants, read from the migration rather than restated here
// ---------------------------------------------------------------------------
const constant = (name: string): number => {
  const m = BATCH4.match(new RegExp(`${name}\\s+constant integer := (\\d+);`));
  if (!m) throw new Error(`${name} not found in ${BATCH4_FILE}`);
  return Number(m[1]);
};
const LIMITS = {
  PREMIUM: constant('PREMIUM_LIMIT'),
  TEXT_IN: constant('FREE_TEXT_IN_WINDOW'),
  TEXT_OUT: constant('FREE_TEXT_EXPIRED'),
  REV_IN: constant('FREE_REVISION_IN_WINDOW'),
  REV_OUT: constant('FREE_REVISION_EXPIRED'),
  PHOTO: constant('FREE_PHOTO'),
};

type Kind = 'photo_analysis' | 'text_analysis' | 'meal_revision';
type Account = { premium: boolean; inWindow: boolean };

/** Mirrors public.ai_quota_limit(p_kind, p_user_id). */
const resolveLimit = (kind: Kind, a: Account): number => {
  if (a.premium) return LIMITS.PREMIUM;
  if (kind === 'photo_analysis') return LIMITS.PHOTO;
  if (kind === 'text_analysis') return a.inWindow ? LIMITS.TEXT_IN : LIMITS.TEXT_OUT;
  return a.inWindow ? LIMITS.REV_IN : LIMITS.REV_OUT;
};

type Reservation = { allowed: boolean; limit: number; used: number; wrote: boolean };

/** Mirrors public._ai_reserve_quota: the `v_limit < 1` short-circuit, then the
 *  conditional `used < v_limit` increment. */
const makeCounter = () => {
  const used: Partial<Record<Kind, number>> = {};
  return (kind: Kind, a: Account): Reservation => {
    const limit = resolveLimit(kind, a);
    if (limit < 1) return { allowed: false, limit, used: 0, wrote: false };
    const current = used[kind] ?? 0;
    if (current >= limit) return { allowed: false, limit, used: current, wrote: false };
    used[kind] = current + 1;
    return { allowed: true, limit, used: current + 1, wrote: true };
  };
};

/** Mirrors the `!quota.allowed` branch of reserveDailyQuota in analyze-food. */
const RPC_CODE: Record<Kind, string> = {
  photo_analysis: DAILY_PHOTO_LIMIT_REACHED,
  text_analysis: DAILY_TEXT_LIMIT_REACHED,
  meal_revision: DAILY_REVISION_LIMIT_REACHED,
};
const serverError = (kind: Kind, r: Reservation, a: Account): AnalysisError => {
  const freeWindowOver =
    !a.premium && r.limit === 0 && (kind === 'text_analysis' || kind === 'meal_revision');
  return new AnalysisError(
    freeWindowOver ? 'Your free AI analysis window has ended.' : 'limit',
    freeWindowOver ? FREE_WINDOW_ENDED : RPC_CODE[kind],
    {
      limit: r.limit,
      used: r.used,
      remaining: 0,
      resetAt: '2026-09-21T00:00:00.000Z',
      tier: a.premium ? 'premium' : 'free',
    },
  );
};

/** Mirrors showNewQuotaState's branch order in app/photo-analysis.tsx. */
const copyFor = (error: AnalysisError, lang: 'en' | 'de') => {
  const state: AnalysisQuotaState = quotaStateForError(error, { localPremiumHint: false });
  const serverSignalled =
    error.meta.tier !== undefined || freeWindowProgress(error.meta) !== null;
  const p = translations[lang].photoAnalysis;
  if (state.kind === 'free_window_ended') {
    return { handled: true, kind: state.kind, title: p.freeWindowEndedTitle, body: p.freeWindowEndedMessage };
  }
  if (state.kind === 'premium_ceiling') {
    return { handled: true, kind: state.kind, title: p.premiumCeilingTitle, body: p.premiumCeilingMessage };
  }
  if (state.kind === 'free_daily_used' && serverSignalled) {
    return { handled: true, kind: state.kind, title: p.freeDailyUsedTitle, body: p.freeDailyUsedMessage };
  }
  if (state.kind === 'revision_used' && serverSignalled) {
    return { handled: true, kind: state.kind, title: p.revisionUsedTitle, body: p.revisionUsedMessage };
  }
  return { handled: false, kind: state.kind, title: '', body: '' };
};

const FREE_IN: Account = { premium: false, inWindow: true };
const FREE_OUT: Account = { premium: false, inWindow: false };
const PREMIUM: Account = { premium: true, inWindow: false };

// ---------------------------------------------------------------------------
describe('the migration is forward-only', () => {
  test('the already-deployed tiering migration is NOT edited', () => {
    // Rewriting applied history would make the repo disagree with production
    // and with the CLI's migration ledger. The 5s must still be in that file.
    expect(TIERING).toContain('FREE_TEXT_IN_WINDOW     constant integer := 5;');
    expect(TIERING).toContain('FREE_TEXT_EXPIRED       constant integer := 5;');
    expect(TIERING).toContain('FREE_PHOTO              constant integer := 5;');
  });

  test('batch 4 sorts after the migration it supersedes, and is the newest', () => {
    const all = readdirSync(MIGRATION_DIR).filter((f) => f.endsWith('.sql')).sort();
    expect(all).toContain(BATCH4_FILE);
    expect(BATCH4_FILE > TIERING_FILE).toBe(true);
    expect(all[all.length - 1]).toBe(BATCH4_FILE);
  });

  test('it changes the allowance and nothing else', () => {
    // A number change must not become a schema change by accident.
    for (const forbidden of [/\bdrop table\b/i, /\bdelete from\b/i, /\btruncate\b/i, /\balter table\b/i, /\bupdate public\./i]) {
      expect(BATCH4).not.toMatch(forbidden);
    }
    // The window helpers keep their shipped definitions.
    for (const fn of ['ai_free_window_days', 'ai_public_launch_at', 'ai_tiering_activated_at', 'ai_free_window_start', 'ai_free_window_active', '_ai_reserve_quota', '_ai_release_quota']) {
      expect(BATCH4).not.toContain(`function public.${fn}`);
    }
  });

  test('the signature is unchanged, so every caller still resolves', () => {
    expect(BATCH4).toContain('create or replace function public.ai_quota_limit(p_kind text, p_user_id uuid)');
    expect(BATCH4).not.toMatch(/drop function .*ai_quota_limit/);
    expect(BATCH4).not.toMatch(/p_(is_)?premium|p_tier|p_plan/);
  });

  test('the tier is still resolved server-side, never taken from the caller', () => {
    expect(BATCH4).toContain("public.get_premium_state(p_user_id) ->> 'active'");
  });

  test('the UTC-day reset is not quietly redefined', () => {
    expect(BATCH4).not.toContain("at time zone 'utc'");
  });

  test('grants are re-asserted BY NAME against all three roles', () => {
    const line = BATCH4.split('\n').find((l) => l.startsWith('revoke all on function public.ai_quota_limit(text, uuid)'));
    expect(line).toBeDefined();
    expect(line).toContain('from public, anon, authenticated');
    expect(BATCH4).toContain('grant execute on function public.ai_quota_limit(text, uuid) to service_role;');
    expect(BATCH4).not.toMatch(/grant execute on function public\.ai_quota_limit.*to (anon|authenticated)/);
  });
});

describe('the final quota matrix', () => {
  test.each([
    ['Free in-window  text',     'text_analysis',  FREE_IN,  1],
    ['Free in-window  revision', 'meal_revision',  FREE_IN,  1],
    ['Free in-window  photo',    'photo_analysis', FREE_IN,  0],
    ['Free expired    text',     'text_analysis',  FREE_OUT, 0],
    ['Free expired    revision', 'meal_revision',  FREE_OUT, 0],
    ['Free expired    photo',    'photo_analysis', FREE_OUT, 0],
    ['Premium         text',     'text_analysis',  PREMIUM,  20],
    ['Premium         revision', 'meal_revision',  PREMIUM,  20],
    ['Premium         photo',    'photo_analysis', PREMIUM,  20],
  ] as [string, Kind, Account, number][])('%s = %d', (_label, kind, account, expected) => {
    expect(resolveLimit(kind, account)).toBe(expected);
  });

  test('the Premium ceiling is untouched by batch 4', () => {
    expect(LIMITS.PREMIUM).toBe(20);
    expect(TIERING).toContain('PREMIUM_LIMIT   constant integer := 20;');
    expect(BATCH4).toContain('PREMIUM_LIMIT   constant integer := 20;');
  });

  test('a zero allowance writes nothing at all', () => {
    // The `v_limit < 1` short-circuit returns before either insert, so a
    // blocked account never accumulates reservation or usage rows.
    const reserve = makeCounter();
    const r = reserve('text_analysis', FREE_OUT);
    expect(r).toEqual({ allowed: false, limit: 0, used: 0, wrote: false });
  });
});

describe('FREE, inside the 14-day window: one analysis a day', () => {
  test('analysis #1 succeeds, #2 is refused', () => {
    const reserve = makeCounter();
    expect(reserve('text_analysis', FREE_IN)).toMatchObject({ allowed: true, used: 1, limit: 1 });
    expect(reserve('text_analysis', FREE_IN)).toMatchObject({ allowed: false, limit: 1 });
  });

  test('revision #1 succeeds, #2 is refused, on its OWN counter', () => {
    const reserve = makeCounter();
    expect(reserve('text_analysis', FREE_IN).allowed).toBe(true);
    // Spending the analysis must not spend the correction of it.
    expect(reserve('meal_revision', FREE_IN)).toMatchObject({ allowed: true, used: 1 });
    expect(reserve('meal_revision', FREE_IN).allowed).toBe(false);
  });

  test.each(['en', 'de'] as const)('%s: #2 renders "today\'s is used", with a tomorrow', (lang) => {
    const reserve = makeCounter();
    reserve('text_analysis', FREE_IN);
    const err = serverError('text_analysis', reserve('text_analysis', FREE_IN), FREE_IN);
    expect(err.code).toBe(DAILY_TEXT_LIMIT_REACHED);
    expect(err.meta.tier).toBe('free');
    const copy = copyFor(err, lang);
    expect(copy.handled).toBe(true);
    expect(copy.kind).toBe('free_daily_used');
    expect(copy.title).toBe(translations[lang].photoAnalysis.freeDailyUsedTitle);
    // 1.0.1's copy cannot change, so it must not contain a number that batch 4
    // has just made wrong.
    expect(copy.title).not.toMatch(/\d/);
    expect(copy.body).not.toMatch(/\d/);
  });

  test.each(['en', 'de'] as const)('%s: a refused revision gets revision copy, not analysis copy', (lang) => {
    const reserve = makeCounter();
    reserve('meal_revision', FREE_IN);
    const err = serverError('meal_revision', reserve('meal_revision', FREE_IN), FREE_IN);
    const copy = copyFor(err, lang);
    expect(copy.kind).toBe('revision_used');
    expect(copy.title).toBe(translations[lang].photoAnalysis.revisionUsedTitle);
  });
});

describe('FREE, after the window: no allowance, and no false tomorrow', () => {
  test('the server answers FREE_WINDOW_ENDED, not a daily limit', () => {
    const reserve = makeCounter();
    const err = serverError('text_analysis', reserve('text_analysis', FREE_OUT), FREE_OUT);
    expect(err.code).toBe(FREE_WINDOW_ENDED);
    expect(err.meta.limit).toBe(0);
    expect(err.meta.tier).toBe('free');
  });

  test('a revision is refused the same way', () => {
    const reserve = makeCounter();
    expect(serverError('meal_revision', reserve('meal_revision', FREE_OUT), FREE_OUT).code)
      .toBe(FREE_WINDOW_ENDED);
  });

  test.each(['en', 'de'] as const)('%s: the window-ended UX is shown and never promises tomorrow', (lang) => {
    const reserve = makeCounter();
    const err = serverError('text_analysis', reserve('text_analysis', FREE_OUT), FREE_OUT);
    const copy = copyFor(err, lang);
    expect(copy.handled).toBe(true);
    expect(copy.kind).toBe('free_window_ended');
    expect(copy.title).toBe(translations[lang].photoAnalysis.freeWindowEndedTitle);
    // The exact failure this separation exists to prevent.
    const daily = translations[lang].photoAnalysis.freeDailyUsedMessage;
    expect(copy.body).not.toBe(daily);
    for (const tomorrow of lang === 'en' ? [/tomorrow/i, /reset/i] : [/morgen/i, /zurückgesetzt/i]) {
      expect(copy.body).not.toMatch(tomorrow);
    }
  });

  test('the two states are never collapsed by quotaStateForError', () => {
    const daily = new AnalysisError('x', DAILY_TEXT_LIMIT_REACHED, { tier: 'free', limit: 1 });
    const ended = new AnalysisError('x', FREE_WINDOW_ENDED, { tier: 'free', limit: 0 });
    expect(quotaStateForError(daily).kind).toBe('free_daily_used');
    expect(quotaStateForError(ended).kind).toBe('free_window_ended');
  });

  test('photo at limit 0 cannot reach the user as a false daily limit', () => {
    // FREE_PHOTO := 0 is defence in depth BEHIND the entitlement gate. That
    // gate is what the user actually meets, so it must still come first.
    expect(EDGE).toContain('const premium = await hasActivePremium(supabase, user.id);');
    expect(EDGE.indexOf('code: "PREMIUM_REQUIRED"'))
      .toBeLessThan(EDGE.indexOf('reserveDailyQuota(supabase, requestId as string, "photo_analysis"'));
    // The screen keeps its own dedicated branch for that answer, so a Free
    // user meets the paywall rather than a daily-limit alert.
    expect(SCREEN).toContain('isPremiumRequiredError(error)');
    // And the mapper never turns PREMIUM_REQUIRED into a quota state.
    const gated = new AnalysisError('x', 'PREMIUM_REQUIRED', { tier: 'free', limit: 0 });
    expect(quotaStateForError(gated).kind).toBe('premium_required');
  });
});

describe('PREMIUM is unchanged by batch 4', () => {
  test('20 succeed and the 21st is refused', () => {
    const reserve = makeCounter();
    let allowed = 0;
    for (let i = 0; i < 20; i++) if (reserve('text_analysis', PREMIUM).allowed) allowed++;
    expect(allowed).toBe(20);
    const r = reserve('text_analysis', PREMIUM);
    expect(r.allowed).toBe(false);
    expect(r.limit).toBe(20);
  });

  test('the window does not apply to a subscriber', () => {
    expect(resolveLimit('text_analysis', { premium: true, inWindow: false })).toBe(20);
    expect(resolveLimit('text_analysis', { premium: true, inWindow: true })).toBe(20);
  });

  test.each(['en', 'de'] as const)('%s: #21 shows neutral ceiling copy, never a paywall or Free wording', (lang) => {
    const reserve = makeCounter();
    for (let i = 0; i < 20; i++) reserve('text_analysis', PREMIUM);
    const err = serverError('text_analysis', reserve('text_analysis', PREMIUM), PREMIUM);
    expect(err.code).toBe(DAILY_TEXT_LIMIT_REACHED);
    expect(err.meta.tier).toBe('premium');
    const copy = copyFor(err, lang);
    expect(copy.kind).toBe('premium_ceiling');
    expect(copy.body).not.toBe(translations[lang].photoAnalysis.freeWindowEndedMessage);
    expect(copy.body).not.toBe(translations[lang].photoAnalysis.freeDailyUsedMessage);
    expect(copy.body).not.toMatch(/\d/);
  });

  test('a Premium 429 never carries the window code, whatever the limit', () => {
    const r: Reservation = { allowed: false, limit: 0, used: 0, wrote: false };
    expect(serverError('text_analysis', r, PREMIUM).code).toBe(DAILY_TEXT_LIMIT_REACHED);
  });
});

describe('the simulation still matches the code it stands in for', () => {
  test('the edge function builds the 429 the way serverError() does', () => {
    expect(EDGE).toContain('const freeWindowOver =');
    expect(EDGE).toContain('!premium &&');
    expect(EDGE).toContain('quota.limit === 0 &&');
    expect(EDGE).toContain('(kind === "text_analysis" || kind === "meal_revision")');
    expect(EDGE).toContain('code: freeWindowOver ? "FREE_WINDOW_ENDED" : rpc.code,');
    expect(EDGE).toContain('tier: premium ? "premium" : "free",');
  });

  test('the reservation short-circuits below 1, as makeCounter() does', () => {
    expect(TIERING).toContain('if v_limit < 1 then');
    expect(TIERING).toContain('where ai_daily_usage.used < v_limit');
  });

  test('showNewQuotaState branches in the order copyFor() assumes', () => {
    const order = ['free_window_ended', 'premium_ceiling', 'free_daily_used', 'revision_used']
      .map((k) => SCREEN.indexOf(`state.kind === '${k}'`));
    expect(order.every((i) => i > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  test('only the daily states are gated on the server signal', () => {
    // free_window_ended and premium_ceiling must render without it, or a
    // server that stops sending tier would strand a subscriber on Free copy.
    expect(SCREEN).toContain("state.kind === 'free_daily_used' && serverSignalledWindow");
    expect(SCREEN).toContain("state.kind === 'revision_used' && serverSignalledWindow");
    expect(SCREEN).not.toContain("state.kind === 'free_window_ended' && serverSignalledWindow");
  });
});

// ---------------------------------------------------------------------------
// The website is the other half of the contract: it is where the limit is
// DISCLOSED. A quota the product enforces but the marketing page does not
// mention is the failure mode these tests exist to prevent.
// ---------------------------------------------------------------------------
const SITE = read('website', 'public', 'index.html');
const PLANS = SITE.slice(SITE.indexOf('id="premium"'), SITE.indexOf('id="trust"'));
const FAQ = SITE.slice(SITE.indexOf('id="faq"'), SITE.indexOf('id="get"'));

describe('the website states the final Free allowance', () => {
  test('the plans section gives the number, not a vague "free analysis"', () => {
    expect(PLANS).toContain('1 text-based meal analysis per day — including your Meal Impact Score and personalized reflection');
    // The score is part of the analysis bullet on purpose. A separate bullet
    // read as a second, independent free feature that survives the window.
    expect(PLANS).not.toMatch(/<li>Meal Impact Score/);
  });

  test('Premium does not imply unlimited usage', () => {
    expect(PLANS).toContain('<li>Expanded daily AI meal analysis</li>');
    expect(PLANS).not.toContain('without the one-a-day limit');
    // The 20/day Premium ceiling is an internal abuse limit, not a product
    // promise, and must never be advertised.
    expect(SITE).not.toMatch(/\b20\s*(\/|per )\s*day\b/i);
  });

  test('the free plan never implies a one-meal-a-day diary', () => {
    expect(PLANS).toContain('Log as many meals a day as you like');
    expect(SITE).not.toMatch(/one meal per day|1 meal per day|one meal a day/i);
  });

  test('no stale 5/day wording survives anywhere on the site', () => {
    for (const stale of [/5 text/i, /5 meal/i, /5 analys/i, /five analys/i]) {
      expect(SITE).not.toMatch(stale);
    }
  });

  test('the 14-day window is disclosed in the plans section itself', () => {
    // Material limitation: after the window a Free account has NO AI analysis
    // at all. Putting that only in the FAQ would be hiding it.
    expect(PLANS).toMatch(/first 14 days/);
    expect(PLANS).toMatch(/AI meal analysis continues with Premium/);
  });

  test('the FAQ separates logging from analysis and does not cap logging', () => {
    expect(FAQ).toContain('How many meals can I log per day?');
    expect(FAQ).toMatch(/As many as you like, on every plan/);
    expect(FAQ).toMatch(/no daily limit and no time limit/);
  });

  test('nothing on the page implies unlimited free analysis any more', () => {
    // "unlimited" is gone from the page entirely: even applied to the diary it
    // sat one clause away from the analysis allowance and invited the wrong read.
    expect(SITE).not.toMatch(/unlimited/i);
    // The old wording promised describing a meal was simply "free".
    expect(SITE).not.toContain('describing a meal is free');
  });

  test('no subscription price is hard-coded', () => {
    expect(SITE).not.toMatch(/[€$£]\s?\d/);
    expect(SITE).toContain('Pricing is shown in the app before you subscribe.');
  });

  test('the new copy adds no medical claim', () => {
    const added = [
      ...PLANS.split('\n').filter((l) => /14 days|text-based meal analysis|one-a-day/.test(l)),
      ...FAQ.split('\n').filter((l) => /14 days|one analysis a day|As many as you like/.test(l)),
    ].join(' ');
    expect(added.length).toBeGreaterThan(0);
    for (const banned of [/\bdiagnos/i, /\bcure\b/i, /\bprevent\b/i, /\btreat(s|ment)?\b/i, /\bdetect/i, /\bintolerance/i, /microbiome/i]) {
      expect(added).not.toMatch(banned);
    }
  });

  test('English stays the page language and no RTL is introduced', () => {
    expect(SITE).toMatch(/<html[^>]*lang="en"/);
    expect(SITE).not.toMatch(/dir="rtl"|lang="fa"/);
  });
});
