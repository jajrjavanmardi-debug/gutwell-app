/**
 * lib/ai-cost-model.ts
 *
 * Turns recorded token counts into money, for planning only.
 *
 * ── Not used at runtime ─────────────────────────────────────────────────────
 * Nothing in the app imports this. The DATABASE is authoritative: public
 * .ai_usage_events stores raw token counts and the model name, never a price
 * and never a computed cost. That is deliberate — provider pricing changes, and
 * a stored dollar figure would silently become wrong with no way to correct it.
 * Storing raw usage means historical spend can always be recomputed against
 * whatever the price was at the time.
 *
 * ── Prices ──────────────────────────────────────────────────────────────────
 * Source: Google Gemini API paid-tier pricing for gemini-2.5-flash, as
 * published at ai.google.dev/gemini-api/docs/pricing.
 * Captured: 2026-08-08. VERIFY BEFORE QUOTING THESE FIGURES TO ANYONE — they
 * are a snapshot, not a contract, and Google has changed them before.
 *
 * ── Thinking tokens ─────────────────────────────────────────────────────────
 * gemini-2.5-flash is a thinking model. Google bills reasoning tokens at the
 * OUTPUT rate, and `candidatesTokenCount` does NOT include them, so output cost
 * is (output + thoughts). `totalTokenCount` already includes everything, which
 * is exactly why it must never be added to the parts — doing so double-counts.
 */

/** USD per 1,000,000 tokens. */
export const GEMINI_25_FLASH_PRICING = {
  model: 'gemini-2.5-flash',
  capturedAt: '2026-08-08',
  inputPerMillion: 0.3,
  /** Reasoning tokens bill at this rate too. */
  outputPerMillion: 2.5,
  /** Cached input is discounted; null when the project has no caching. */
  cachedInputPerMillion: 0.075,
} as const;

export type TokenUsage = {
  promptTokens?: number | null;
  outputTokens?: number | null;
  thoughtsTokens?: number | null;
  cachedTokens?: number | null;
  totalTokens?: number | null;
};

const n = (v: number | null | undefined) => (typeof v === 'number' && v > 0 ? v : 0);

/**
 * USD for one provider call.
 *
 * Cached tokens are billed at the cached rate and are assumed to be a SUBSET of
 * promptTokens, which is how Gemini reports them — so they are subtracted from
 * the uncached input rather than added on top.
 */
export function estimateCallCostUsd(
  usage: TokenUsage,
  pricing = GEMINI_25_FLASH_PRICING,
): number {
  const cached = n(usage.cachedTokens);
  const uncachedInput = Math.max(n(usage.promptTokens) - cached, 0);
  // Thinking is billed as output. totalTokens is deliberately not used here.
  const output = n(usage.outputTokens) + n(usage.thoughtsTokens);
  return (
    (uncachedInput / 1_000_000) * pricing.inputPerMillion +
    (cached / 1_000_000) * pricing.cachedInputPerMillion +
    (output / 1_000_000) * pricing.outputPerMillion
  );
}

/** Worst-case monthly spend for one user under the hard daily cap. */
export function maxMonthlySpendPerUser(
  costPerScanUsd: number,
  scansPerDay = 5,
  daysInMonth = 31,
): number {
  return costPerScanUsd * scansPerDay * daysInMonth;
}
