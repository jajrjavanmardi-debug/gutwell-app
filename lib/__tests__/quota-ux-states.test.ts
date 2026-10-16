/**
 * lib/__tests__/quota-ux-states.test.ts
 *
 * Batch 3: the client's handling of the quota states, before any of them is
 * activated server-side.
 *
 * The state mapper is tested behaviourally — it is pure. The screen's wiring is
 * tested by source inspection, this repo's convention for React Native screens
 * whose rendering would need the whole Supabase/RevenueCat surface to mount.
 *
 * The property that matters most here is SEPARATION: "today's is used" and "the
 * free period ended" look alike but differ in whether there is a tomorrow, and
 * a subscriber must never be shown Free-window copy or a paywall for something
 * they already pay for.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  AnalysisError,
  DAILY_PHOTO_LIMIT_REACHED,
  DAILY_REVISION_LIMIT_REACHED,
  DAILY_TEXT_LIMIT_REACHED,
  FREE_WINDOW_ENDED,
  PREMIUM_REQUIRED,
  freeWindowProgress,
  isFreeWindowEndedError,
  isProviderUnavailableError,
  quotaStateForError,
} from '../ai-quota';
import { translations } from '../i18n';

const root = join(__dirname, '..', '..');
const read = (...p: string[]) => readFileSync(join(root, ...p), 'utf8');
const SCREEN = read('app', '(tabs)', '..', '..', 'app', 'photo-analysis.tsx');
const QUOTA = read('lib', 'ai-quota.ts');
const ENGINE = read('lib', 'RecommendationEngine.ts');

const err = (code: string, meta: Record<string, unknown> = {}) =>
  new AnalysisError('x', code, meta as never);

describe('state mapping — the six outcomes stay distinct', () => {
  it('Free, inside the window, today used -> free_daily_used', () => {
    const s = quotaStateForError(err(DAILY_TEXT_LIMIT_REACHED, { tier: 'free', resetAt: '2026-09-19T00:00:00Z' }));
    expect(s.kind).toBe('free_daily_used');
    expect(s.kind === 'free_daily_used' && s.resetAt).toBe('2026-09-19T00:00:00Z');
  });

  it('Free, window over -> free_window_ended, NOT a daily limit', () => {
    const s = quotaStateForError(err(FREE_WINDOW_ENDED, { windowEndsAt: '2026-10-01T00:00:00Z' }));
    expect(s.kind).toBe('free_window_ended');
    // The critical separation: it must never be mapped to the daily state,
    // which would promise a tomorrow that does not come.
    expect(s.kind).not.toBe('free_daily_used');
  });

  it('Premium at the ceiling -> premium_ceiling, never a paywall', () => {
    for (const code of [DAILY_TEXT_LIMIT_REACHED, DAILY_PHOTO_LIMIT_REACHED, DAILY_REVISION_LIMIT_REACHED]) {
      const s = quotaStateForError(err(code, { tier: 'premium' }));
      expect(`${code}: ${s.kind}`).toBe(`${code}: premium_ceiling`);
    }
  });

  it('Premium users never reach a Free state, even from the local hint', () => {
    // Server tier wins over the local hint in both directions.
    expect(quotaStateForError(err(DAILY_TEXT_LIMIT_REACHED, { tier: 'premium' }), { localPremiumHint: false }).kind)
      .toBe('premium_ceiling');
    expect(quotaStateForError(err(DAILY_TEXT_LIMIT_REACHED, { tier: 'free' }), { localPremiumHint: true }).kind)
      .toBe('free_daily_used');
  });

  it('Free revision used -> revision_used', () => {
    expect(quotaStateForError(err(DAILY_REVISION_LIMIT_REACHED, { tier: 'free' })).kind).toBe('revision_used');
  });

  it('photo on a Free account -> premium_required (the one upsell state)', () => {
    expect(quotaStateForError(err(PREMIUM_REQUIRED)).kind).toBe('premium_required');
  });

  it('provider failure -> provider_unavailable, never a user quota state', () => {
    for (const code of ['UPSTREAM_ERROR', 'EMPTY_RESPONSE']) {
      const s = quotaStateForError(err(code));
      expect(`${code}: ${s.kind}`).toBe(`${code}: provider_unavailable`);
      expect(`${code}: ${s.kind}`).not.toBe(`${code}: free_daily_used`);
      expect(`${code}: ${s.kind}`).not.toBe(`${code}: premium_ceiling`);
    }
  });

  it('auth / network / unknown -> other, not a quota state', () => {
    expect(quotaStateForError(err('UNAUTHORIZED')).kind).toBe('other');
    expect(quotaStateForError(new Error('network')).kind).toBe('other');
    expect(quotaStateForError(null).kind).toBe('other');
  });

  it('the type guards agree with the mapper', () => {
    expect(isFreeWindowEndedError(err(FREE_WINDOW_ENDED))).toBe(true);
    expect(isFreeWindowEndedError(err(DAILY_TEXT_LIMIT_REACHED))).toBe(false);
    expect(isProviderUnavailableError(err('UPSTREAM_ERROR'))).toBe(true);
    expect(isProviderUnavailableError(err(DAILY_TEXT_LIMIT_REACHED))).toBe(false);
  });
});

describe('free-window progress is server-supplied or absent', () => {
  it('renders a day only when BOTH numbers arrived', () => {
    expect(freeWindowProgress({ dayOfWindow: 4, windowTotalDays: 14 })).toEqual({ day: 4, total: 14 });
  });

  it('returns null rather than guessing', () => {
    expect(freeWindowProgress(undefined)).toBeNull();
    expect(freeWindowProgress({})).toBeNull();
    expect(freeWindowProgress({ dayOfWindow: 4 })).toBeNull();
    expect(freeWindowProgress({ windowTotalDays: 14 })).toBeNull();
    expect(freeWindowProgress({ dayOfWindow: 0, windowTotalDays: 14 })).toBeNull();
    expect(freeWindowProgress({ dayOfWindow: 15, windowTotalDays: 14 })).toBeNull();
  });

  it('never expresses the allowance as a count of remaining analyses', () => {
    // Missed days do not accumulate, so a balance would be a promise the user
    // cannot spend. The unit must be the day within a fixed window.
    for (const lang of ['en', 'de'] as const) {
      const s = translations[lang].photoAnalysis.freeWindowStatus;
      expect(`${lang}: ${/\{day\}/.test(s) && /\{total\}/.test(s)}`).toBe(`${lang}: true`);
      expect(`${lang}: ${/remaining|verbleib|\{remaining\}/i.test(s)}`).toBe(`${lang}: false`);
    }
  });
});

describe('screen wiring', () => {
  it('the meal can still be logged with no analysis', () => {
    expect(SCREEN).toContain('const logMealWithoutAnalysis = async ()');
    const fn = SCREEN.slice(
      SCREEN.indexOf('const logMealWithoutAnalysis = async ()'),
      SCREEN.indexOf('const showNewQuotaState'),
    );
    // Built from what the user typed, not from an analysis that was refused.
    expect(fn).toContain('mealDescription.trim()');
    expect(fn).toContain('saveMealLog(');
    // Logging must never consult quota. Assert on the BODY, not the signature —
    // the function's own name contains "Analysis", which a blanket negative
    // regex matches.
    const body = fn.slice(fn.indexOf('{'));
    expect(body).not.toContain('quotaStateForError');
    expect(body).not.toContain('showNewQuotaState');
    expect(body).not.toContain('isPremiumFeature');
    expect(body).not.toContain('quotaMeta');
    // It must not read the refused analysis either — that is the whole point.
    expect(body).not.toMatch(/\banalysis\b(?!WithoutAnalysis)/);
  });

  it('every state that blocks analysis offers the log-meal escape', () => {
    const fn = SCREEN.slice(SCREEN.indexOf('const showNewQuotaState'), SCREEN.indexOf('ONBOARDING (4/4)'));
    for (const state of ['free_window_ended', 'free_daily_used']) {
      const at = fn.indexOf(`state.kind === '${state}'`);
      expect(`${state}: ${at > -1}`).toBe(`${state}: true`);
    }
    expect(fn).toContain('logAction');
    expect(fn).toContain('t.photoAnalysis.logMealWithoutAnalysis');
  });

  it('the free-window and window-ended branches use DIFFERENT copy', () => {
    const fn = SCREEN.slice(SCREEN.indexOf('const showNewQuotaState'), SCREEN.indexOf('ONBOARDING (4/4)'));
    expect(fn).toContain('t.photoAnalysis.freeDailyUsedTitle');
    expect(fn).toContain('t.photoAnalysis.freeWindowEndedTitle');
    // The ended branch must not offer a "resets at" time — there is no tomorrow.
    const ended = fn.slice(fn.indexOf("state.kind === 'free_window_ended'"), fn.indexOf("state.kind === 'premium_ceiling'"));
    expect(ended).not.toContain('withReset');
  });

  it('a subscriber at the ceiling sees neutral copy and no paywall', () => {
    const fn = SCREEN.slice(SCREEN.indexOf('const showNewQuotaState'), SCREEN.indexOf('ONBOARDING (4/4)'));
    const branch = fn.slice(fn.indexOf("state.kind === 'premium_ceiling'"), fn.indexOf("state.kind === 'free_daily_used'"));
    expect(branch).toContain('t.photoAnalysis.premiumCeilingTitle');
    expect(branch).not.toContain('premiumAction');
    expect(branch).not.toContain('/paywall');
    expect(branch).not.toContain('freeWindow');
  });

  it('the status strip is hidden for subscribers and when the server said nothing', () => {
    const block = SCREEN.slice(SCREEN.indexOf('Free-window status.'), SCREEN.indexOf('Says why the button is inert'));
    expect(block).toContain("quotaMeta?.tier === 'premium'");
    expect(block).toContain('freeWindowProgress(quotaMeta)');
    expect(block).toContain('if (!progress) return null;');
  });

  it('quota metadata comes from the server, never computed locally', () => {
    expect(SCREEN).toContain('setQuotaMeta(error.meta)');
    // No local arithmetic inventing a day or a window end.
    expect(SCREEN).not.toMatch(/dayOfWindow\s*=\s*[^;]*Date/);
    expect(SCREEN).not.toMatch(/windowTotalDays\s*=\s*\d/);
  });

  it('a provider failure is not rendered as the user exhausting their quota', () => {
    // UPSTREAM_ERROR falls through to the generic branch, whose message comes
    // from the engine and says the SERVICE is busy.
    const at = ENGINE.indexOf("case 'UPSTREAM_ERROR':");
    const msg = ENGINE.slice(at, ENGINE.indexOf('default:', at));
    expect(msg).toContain('analysis service is busy');
    expect(msg).not.toMatch(/you(&#39;|')?ve reached|your (daily )?limit|quota/i);
    // And showNewQuotaState must not claim it.
    const fn = SCREEN.slice(SCREEN.indexOf('const showNewQuotaState'), SCREEN.indexOf('ONBOARDING (4/4)'));
    expect(fn).toContain('provider_unavailable is deliberately NOT handled here');
  });

  it('nothing claiming premium is put on the wire', () => {
    // The existing guard in ai-cost-control.test.ts forbids `isPremium:` in the
    // screen. This pins WHY the option is named a hint instead.
    expect(SCREEN).not.toMatch(/isPremium\s*:/);
    expect(SCREEN).toContain('localPremiumHint:');
    expect(QUOTA).toContain('It is named');
  });
});

describe('EN and DE copy exists for every state', () => {
  const KEYS = [
    'freeWindowStatus', 'freeDailyUsedTitle', 'freeDailyUsedMessage',
    'freeWindowEndedTitle', 'freeWindowEndedMessage',
    'revisionUsedTitle', 'revisionUsedMessage',
    'premiumCeilingTitle', 'premiumCeilingMessage',
    'providerBusyTitle', 'providerBusyMessage',
    'logMealWithoutAnalysis', 'seePremiumCta',
  ];

  it('both languages define every key as a non-empty string', () => {
    for (const lang of ['en', 'de'] as const) {
      for (const k of KEYS) {
        const v = (translations[lang].photoAnalysis as Record<string, unknown>)[k];
        expect(`${lang}.${k}: ${typeof v === 'string' && v.length > 0}`).toBe(`${lang}.${k}: true`);
      }
    }
  });

  it('the window-ended copy never promises a tomorrow', () => {
    for (const lang of ['en', 'de'] as const) {
      const s = translations[lang].photoAnalysis.freeWindowEndedMessage;
      expect(`${lang}: ${/tomorrow|morgen/i.test(s)}`).toBe(`${lang}: false`);
    }
  });

  it('the premium ceiling copy never mentions the free window or Premium upsell', () => {
    for (const lang of ['en', 'de'] as const) {
      const s = translations[lang].photoAnalysis.premiumCeilingMessage;
      expect(`${lang}: ${/free|kostenlos|premium/i.test(s)}`).toBe(`${lang}: false`);
    }
  });

  it('both languages say meal logging stays available', () => {
    expect(/logging stays free/i.test(translations.en.photoAnalysis.freeDailyUsedMessage)).toBe(true);
    expect(/kostenlos/i.test(translations.de.photoAnalysis.freeDailyUsedMessage)).toBe(true);
  });

  it('no Persian or RTL copy was introduced', () => {
    for (const k of KEYS) {
      for (const lang of ['en', 'de'] as const) {
        const v = String((translations[lang].photoAnalysis as Record<string, unknown>)[k]);
        expect(`${lang}.${k}: ${/[؀-ۿ]/.test(v)}`).toBe(`${lang}.${k}: false`);
      }
    }
  });
});
