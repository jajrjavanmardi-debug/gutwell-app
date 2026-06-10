# GutWell — Acquisition Improvement Plan

**Date:** 10 June 2026 · **Basis:** 7-role due-diligence audit (PM, UX, UI, Frontend, Backend, Marketing, Compliance) — 96 findings, all critical/high code claims independently verified against the current code and the **live** Supabase project.

---

## Executive verdict (CEO summary)

GutWell's core loop — *log food + symptoms → computed gut score → trigger-food correlations* — is genuinely well-engineered in its Supabase-backed half: scoring is fair, streaks are resilient, correlations have real statistical hygiene, AI keys live server-side, and monetization/analytics plumbing is real. **But the product cannot ship today** for five verified reasons:

1. **The front door is severed.** A May 2 regression (commit `76e67d5`) made auth + onboarding unreachable — the app boots straight into tabs with no session, and every data feature silently fails. ~40% of the built product (auth, the 7-step onboarding, default reminders) is orphaned dead code.
2. **Production database is broken and unsafe.** Verified live: the daily check-in save fails (missing `(user_id, entry_date)` unique constraint), and leftover `Public can read/insert` RLS policies let **any user read every user's health data**. Plus 8 remote-only migrations the repo doesn't know about.
3. **The app is two apps.** The Home tab + photo wizard are a leftover parallel app (NutriFlow): device-local manual 1–10 "gut score" contradicting the real computed 0–100 score, a second XP system, a fabricated "Energy" trend line, a second brand green (#2DCE89), their own i18n layer, and a duplicate meal history.
4. **The flagship AI feature lies.** Every user's meal photo is "personalized" against a hardcoded test profile (IBS + Bloating, score 4/10) — a health-accuracy and FTC deception problem. Server prompts also mandate "Instant Relief" treatment sections, Dose/Duration labels, and quantified outcome predictions — past the FDA general-wellness line.
5. **Privacy story is inaccurate.** The in-app policy omits photos-to-Gemini, GPS, voice, PostHog, Sentry, RevenueCat; stool type + gut score + user names flow to PostHog identity-linked; the paywall lacks required ToS/Privacy links and would strand free-launch users at a dead "Coming Soon" screen.

**Strategy:** fix the foundation (Phase 0), unify into one product (Phase 1), make it trustworthy (Phase 2), make it premium (Phase 3), make it durable (Phase 4), make it sellable (Phase 5). Launch **free first** with honest premium teasers, turn on paid in v1.1.

---

## What is already strong (do not break)

- Check-in screen UX (Bristol chart, success overlay, milestone popups, review prompt timing)
- `lib/scoring.ts` fairness fix (honest symptom logging never scores worse)
- `lib/streaks.ts` recompute-as-source-of-truth with self-healing cache
- New correlation engine's statistical hygiene (min observations, confidence thresholds, midnight caps)
- Server-side AI key architecture (`analyze-food` edge function)
- RevenueCat integration with safe no-op, focus-based premium refresh
- Free teaser pattern on Progress (strongest trigger shown before paywall)
- Design token system in `constants/theme.ts` + EB Garamond/Inter identity

---

## The plan, by department

### Phase 0 — Make it work (Backend + Frontend) ✅ CRITICAL
| # | Fix | Where |
|---|-----|-------|
| 0.1 | Drop `Public can read/insert` RLS policies on `check_ins`/`food_logs` (live + repo migration) | Live DB + `supabase/migrations/` |
| 0.2 | Add missing `(user_id, entry_date)` unique constraint (dedupe first) | Live DB + repo migration |
| 0.3 | Recover the 8 remote-only migrations into the repo (kill drift) | `supabase/migrations/` |
| 0.4 | Restore auth gate: no session → welcome/auth; no onboarding → quiz; else tabs | `app/index.tsx`, `app/(auth)/_layout.tsx`, `app/_layout.tsx` |
| 0.5 | Remove `TEST_GUT_PROFILE`; send the user's real conditions + computed score to the AI | `app/photo-analysis.tsx`, edge function |
| 0.6 | Fix offline-queue race (enqueue during flush loses items) | `lib/offline-queue.ts` |
| 0.7 | Free-launch mode: hide premium gates + paywall when RevenueCat is unconfigured | `lib/subscription.ts`, gated screens |

### Phase 1 — One product, one truth (Product Manager)
- Rebuild **Home** around the core loop: today's computed score, check-in CTA, real streak, latest trigger insight, scan shortcut. Delete manual score gauge, XP ranks, fabricated Energy line, duplicate meal history, inline language toggle.
- Wire orphaned screens (`log-symptom`, `edit-checkin`) into navigation.
- One gamification system (keep `lib/levels.ts` + streaks; delete `lib/user-progress.ts` ranks). Tone: calm progress, not arcade.
- Make the onboarding quiz **actually personalize**: profile conditions feed the AI context and tip selection.
- Retention wiring: streak-at-risk alert fires (and respects its settings toggle), notification taps deep-link, reminders honor quiet-hours with a visible conflict warning.

### Phase 2 — Trustworthy (Compliance + Backend)
- Rewrite in-app privacy policy to name every processor (Supabase/AWS, Google Gemini, PostHog, Sentry, RevenueCat) and every data type (photos, GPS, voice, quiz answers); match the in-app delete flow.
- Strip health values (`stool_type`, scores) and personal names from analytics events; reset identity on sign-out.
- Defang AI prompts: no "Instant Relief", no Dose/Duration labels, no numeric score-change predictions, no Nürtingen; keep the urgent-care escalation + disclaimer.
- Soften tips library ("flush toxins", "2x more likely", antibiotic advice → wellness-safe phrasing).
- Location: explicit opt-in toggle inside the flow, city-only context (no raw coordinates), honest purpose string.
- Health disclaimer: per-user key, shown before onboarding, acceptance timestamped server-side.
- Export/Clear-All-Data cover **all** user tables (water_logs, gut_scores, favorites, reminders, profile).
- Paywall: ToS/Privacy links, computed per-month + savings %, trial CTA derived from the selected package, feature list matches actual gating.

### Phase 3 — Premium feel (UI + UX Designers)
- One brand green (`#52B788`); retire `#2DCE89` from tab bar, Home, photo flow.
- One severity/score palette across Check-in, Progress, History; Bristol colors consistent.
- Fix splash flash (`userInterfaceStyle: "dark"`, proper dark splash, hi-res icon).
- Consistent navigation chrome (one back affordance, one header typeface), Ionicons replace emoji on paywall/quiz.
- Contrast pass: no deep-green-on-black text; quiet-hours chip dark-theme colors.
- Destructive actions confirm; "gut hurts" no longer triggers a celebration; photo wizard step count correct; haptics on Home + photo flows; accessibility labels on Food/Progress/Home.
- Offline: pending-sync indicator in Settings; NetInfo-based offline detection instead of error-string matching.

### Phase 4 — Durable (Frontend Engineer)
- Lint to zero errors; remove dead deps (`victory-native`) and ~12 orphaned components.
- Date correctness: local-day keys everywhere (calendar off-by-one, bestDay west of UTC).
- Progress screen surfaces query errors instead of rendering empty data.
- Fix AuthProvider hooks-order violation, stray 55s timer, analytics reset.
- **Jest tests** for `lib/scoring`, `lib/streaks`, `lib/correlations`, `lib/offline-queue` + **GitHub Actions CI** (tsc, lint, tests on every PR).

### Phase 5 — Sellable (Marketing + CEO)
- Instrument the funnel end-to-end: onboarding step events, paywall views with source attribution, purchase/restore, share events.
- ASO: add `ibs` (highest-intent term) to keywords; drop subtitle duplicates.
- Share loop: real App Store link once live, working save/share, share analytics.
- `ITSAppUsesNonExemptEncryption: false`; decide `supportsTablet` (recommend false for v1 → smaller screenshot/QA matrix).
- Refresh `LAUNCH_OPERATIONS.md`: what this overhaul completed, what remains owner-only.

### Owner-only checklist (cannot be done from code)
1. Apple Developer enrollment + 3 values for `eas.json`
2. App Store Connect listing + screenshots upload + privacy labels (updated to match new reality: no location if cut, analytics without health data)
3. RevenueCat product creation (only if/when paid launch)
4. New USDA key → `supabase secrets set USDA_API_KEY=…`
5. Revoke old leaked Groq key
6. Host the privacy policy at a public URL (generated copy will be provided)
7. Supabase Pro upgrade ($25/mo) so the project never auto-pauses again

---

## Sequencing & risk notes

- Phases run 0 → 5; each lands as reviewable commits on `feat/acquisition-overhaul` (main untouched).
- Live-DB changes (0.1–0.3) are surgical and reversible: policy drops remove *excess* permissions only; the constraint add is preceded by a duplicate check; migration recovery is read-only against prod.
- The Home rebuild (1.x) is the largest single change; everything it shows already exists in `lib/` — the work is composition, not invention.
- Free launch means RevenueCat stays unconfigured at submit time; the code must therefore *never* show purchase UI in that state (0.7) — this is what unblocks the App Store submission.
