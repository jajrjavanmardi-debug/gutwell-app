# Question for Codex: local-first encrypted storage vs. Supabase (until the user pays)

- **Status:** QUESTION / RFC (no code change)
- **Date:** 2026-06-13
- **Owner:** Hojir
- **For:** Codex review — architecture & privacy opinion requested.

---

## The question

Would it be **better and safer** to store the customer's data **only locally on the
iOS device, encrypted**, *without* Supabase — at least until the user converts to a
**paid** subscription — and only then sync/persist to a backend?

The motivation: stronger privacy by default, no server-side personal-data liability
for free users, and possibly lower/zero backend cost for the (large) free tier.

We want Codex to weigh this honestly, including the parts that make it **not** a
clean win.

---

## Current architecture (facts, so the answer is grounded)

- **Backend:** Supabase (project "THRIVE"), currently **Free plan** (no branching).
- **Auth:** Supabase Auth — session-gated app (`app/index.tsx` redirects
  session-less users to onboarding). Today, having an account is required to use the
  tabs.
- **Server-stored personal data** (`supabase/migrations/`): `user_profiles`,
  check-ins, food/health logs, symptoms, `water_intake`, `gut_scores`, `streaks`,
  plus `health_data_consent` and account/row deletion flows. RLS + explicit grants
  are in place (recent security-repair migrations).
- **Already local:** the **photo-analysis history** lives on-device in AsyncStorage
  (`lib/photo-analysis-history.ts`, 14-day window) — so a local-first pattern is
  partly precedent.
- **Encrypted storage available:** `expo-secure-store` is already a dependency
  (Keychain-backed); `@react-native-async-storage/async-storage` is used for
  non-secret local data.
- **Payments:** `react-native-purchases` (RevenueCat) + `app/paywall.tsx` — there is
  already a clear free/paid boundary to hang a "sync on paid" rule on.

## Hard constraint Codex must account for (this is the catch)

The **AI features cannot be fully local.** Photo analysis, the `meal_revise`
correction flow, and nutrient recommendations run in the Supabase **edge function**
`analyze-food`, which holds the **Gemini API key as a server secret**. Shipping that
key inside the app is a security non-starter. So:

- "No Supabase at all" is **not** achievable while the app calls Gemini — some
  server (Supabase edge function or equivalent) must exist to hold the key and proxy
  the AI call.
- A realistic version of this idea is **"local-first for user *data*"** (check-ins,
  logs, profile stay on-device, encrypted), while AI calls still go through a thin
  stateless server that **stores nothing**.

## What we'd like Codex to evaluate

1. Is **local-first + encrypted on-device** (e.g. SQLite/MMKV encrypted, or
   SecureStore for secrets) genuinely **safer/better** here than Supabase with RLS?
   Where does each win?
2. How to keep the **AI proxy stateless** (no PII persisted server-side) so "no
   server data for free users" actually holds while Gemini still works.
3. **Auth without a backend:** can onboarding/usage work with no account until
   payment? What replaces Supabase Auth for the free tier?
4. **Data loss & migration:** local-only means no cloud backup — device loss = data
   loss, no multi-device. Is that acceptable for a health-tracking app? What's the
   sync-on-upgrade migration story (local → server when the user pays)?
5. **Compliance/UX:** does local-first simplify or complicate GDPR / health-data
   handling, App Store review, the existing `health_data_consent` + deletion flows?
6. **Cost reality:** does this meaningfully cut Supabase cost, or just move
   complexity onto the client?
7. A concrete **recommendation**: keep Supabase-as-is, go local-first for data, or a
   hybrid — with the migration path and the top 3 risks.

Constraints for the answer: **opinion/review only, no code changes, no deploy.**
