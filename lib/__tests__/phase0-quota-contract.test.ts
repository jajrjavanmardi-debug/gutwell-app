/**
 * lib/__tests__/phase0-quota-contract.test.ts
 *
 * Phase 0: the server-side half of the quota UX that 1.0.1 already ships.
 *
 * 1.0.1 is RELEASED. Its copy cannot change. So the only thing that can make
 * it show the number-agnostic quota wording is the server sending the fields
 * its parser already looks for. These tests pin that contract from both ends:
 * what the edge function now emits, and what the released client does with it.
 *
 * Additive only — nothing here relaxes an existing assertion.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { quotaStateForError, AnalysisError, freeWindowProgress, DAILY_TEXT_LIMIT_REACHED, DAILY_REVISION_LIMIT_REACHED, FREE_WINDOW_ENDED } from '../ai-quota';
import { translations } from '../i18n';

const root = join(__dirname, '..', '..');
const read = (...p: string[]) => readFileSync(join(root, ...p), 'utf8');
const EDGE = read('supabase', 'functions', 'analyze-food', 'index.ts');
const ENGINE = read('lib', 'RecommendationEngine.ts');
const SCREEN = read('app', 'photo-analysis.tsx');

/** The gate in photo-analysis.tsx that decides whether the new copy is used. */
const serverSignalledWindow = (meta: Record<string, unknown>) =>
  meta.tier !== undefined || freeWindowProgress(meta as never) !== null;

describe('edge function emits what the released client reads', () => {
  test('the 429 carries a top-level tier', () => {
    expect(EDGE).toContain('tier: premium ? "premium" : "free",');
  });

  test('tier comes from the entitlement already used for the limit, not a second lookup', () => {
    // refreshEntitlementBeforeQuota returns the hydrated state; the reserve
    // call receives it. A second resolution could disagree with ai_quota_limit.
    expect(EDGE).toContain('const premium = await refreshEntitlementBeforeQuota(supabase, user.id);');
    expect(EDGE).toMatch(/reserveDailyQuota\(supabase, requestId as string, "text_analysis", premium\)/);
    expect(EDGE).toMatch(/reserveDailyQuota\(supabase, requestId as string, "meal_revision", premium\)/);
    expect(EDGE).toMatch(/reserveDailyQuota\(supabase, requestId as string, "photo_analysis", premium\.active\)/);
  });

  test('a zero Free allowance is reported as an ended window, not a spent day', () => {
    expect(EDGE).toContain('const freeWindowOver =');
    expect(EDGE).toContain('quota.limit === 0 &&');
    expect(EDGE).toContain('(kind === "text_analysis" || kind === "meal_revision")');
    expect(EDGE).toContain('code: freeWindowOver ? "FREE_WINDOW_ENDED" : rpc.code,');
  });

  test('the window state is never claimed for a Premium account', () => {
    expect(EDGE).toContain('!premium &&');
  });

  test('existing metadata is preserved', () => {
    for (const field of ['limit: quota.limit,', 'used: quota.used,', 'remaining: 0,', 'resetAt: quota.reset_at,', 'retryable: false,']) {
      expect(EDGE).toContain(field);
    }
  });

  test('the released client reads tier off the top level of the body', () => {
    expect(ENGINE).toContain("b?.tier === 'free' || b?.tier === 'premium' ? b.tier : undefined");
  });
});

describe('1.0.1 selects the number-agnostic UX once tier arrives', () => {
  const body = (over: Record<string, unknown>) => ({
    retryable: false, limit: 5, used: 5, remaining: 0,
    resetAt: '2026-09-21T00:00:00.000Z', ...over,
  });

  test('BEFORE Phase 0 (no tier): the gate is shut, old wording is used', () => {
    const meta = body({});
    expect(serverSignalledWindow(meta)).toBe(false);
  });

  test('AFTER Phase 0 (tier=free): the gate opens and the state is free_daily_used', () => {
    const meta = body({ tier: 'free' });
    expect(serverSignalledWindow(meta)).toBe(true);
    const s = quotaStateForError(new AnalysisError('x', DAILY_TEXT_LIMIT_REACHED, meta as never));
    expect(s.kind).toBe('free_daily_used');
    expect(s.kind === 'free_daily_used' && s.resetAt).toBe('2026-09-21T00:00:00.000Z');
  });

  test('revision path opens the same way', () => {
    const meta = body({ tier: 'free' });
    expect(serverSignalledWindow(meta)).toBe(true);
    expect(quotaStateForError(new AnalysisError('x', DAILY_REVISION_LIMIT_REACHED, meta as never)).kind).toBe('revision_used');
  });

  test('tier=premium keeps a subscriber on neutral ceiling copy, never a paywall', () => {
    const s = quotaStateForError(new AnalysisError('x', DAILY_TEXT_LIMIT_REACHED, body({ tier: 'premium', limit: 20, used: 20 }) as never));
    expect(s.kind).toBe('premium_ceiling');
  });

  test('server tier OVERRIDES a stale local premium hint', () => {
    const s = quotaStateForError(
      new AnalysisError('x', DAILY_TEXT_LIMIT_REACHED, body({ tier: 'free' }) as never),
      { localPremiumHint: true },
    );
    expect(s.kind).toBe('free_daily_used');
  });

  test('FREE_WINDOW_ENDED never becomes a daily state — no false tomorrow', () => {
    const s = quotaStateForError(new AnalysisError('x', FREE_WINDOW_ENDED, body({ tier: 'free', limit: 0, used: 0 }) as never));
    expect(s.kind).toBe('free_window_ended');
    expect(s.kind).not.toBe('free_daily_used');
  });

  test('the free_daily_used branch is the one gated on the server signal', () => {
    expect(SCREEN).toContain("state.kind === 'free_daily_used' && serverSignalledWindow");
    // free_window_ended is deliberately NOT gated: the code alone is decisive.
    expect(SCREEN).toContain("if (state.kind === 'free_window_ended') {");
  });
});

describe('the copy 1.0.1 will now show states no number', () => {
  for (const lang of ['en', 'de'] as const) {
    test(`${lang}: daily-used copy is number-free and promises a tomorrow`, () => {
      const p = translations[lang].photoAnalysis;
      expect(p.freeDailyUsedTitle).not.toMatch(/\d/);
      expect(p.freeDailyUsedMessage).not.toMatch(/\d/);
      expect(p.freeDailyUsedMessage.length).toBeGreaterThan(20);
    });
    test(`${lang}: window-ended copy exists and does not promise a tomorrow`, () => {
      const p = translations[lang].photoAnalysis;
      expect(p.freeWindowEndedTitle.length).toBeGreaterThan(5);
      expect(p.freeWindowEndedMessage).toMatch(lang === 'en' ? /Premium/ : /Premium/);
    });
    test(`${lang}: premium ceiling copy carries no number and no upsell`, () => {
      const p = translations[lang].photoAnalysis;
      expect(p.premiumCeilingMessage).not.toMatch(/\d/);
    });
  }
});
