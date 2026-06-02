# GutWell — Master Brief

**One consolidated document:** product overview, everything done this cycle, everything still open, the launch runbook, and an honest customer-perspective feature review.

- **App:** GutWell — gut-health tracking iOS app (Expo SDK 54 / React Native / TypeScript)
- **Backend:** Supabase (Postgres + Auth + RLS + Edge Functions), project `peipdakrqtgabnvpazrc`
- **Publisher:** Parallel Labs Pte. Ltd. · **Bundle id:** `com.parallellabs.gutwell`
- **Branch:** `main` @ latest · tsc-clean · iOS build verified
- **Date:** 2 June 2026

---

## 1. Executive summary

GutWell is a **feature-complete, well-built gut-health app** whose core loop — *log food + symptoms → see which foods correlate with how you feel* — is genuinely strong. Over this cycle it went from "looks finished but is hollow" (stubbed payments/notifications/analytics, leaked API keys, branded "NutriFlow", widget broken) to **a coherent, compiling, mostly-wired product**.

What's left is now **mostly operational** (your accounts: Apple, Supabase restore, key rotation, store assets) plus a short list of **ship-quality code** (tests, accessibility, a few polish bugs). The single biggest risk today: **the Supabase backend is paused**, so the live app is down until you restore it.

**Verdict:** ~1 week of your operational work (or less if launching free) stands between this and a TestFlight build.

---

## 2. What was done this cycle (merged to `main`)

| PR | Title | Summary |
|----|-------|---------|
| #21 | Widget recovery | Restored the lost iOS widget files (`Module.swift`, `Attributes.swift`, `Info.plist`) that were never committed; bumped widget deploy target to iOS 17. Build green again. |
| #22 | Production-readiness sweep | 9 fixes, one agent each (see below). |
| #23 | Launch-blocker fixes | Onboarding notification opt-in (was fake), edge-function error parsing, root error boundary. |
| #24 | Launch operations runbook | `LAUNCH_OPERATIONS.md` — store copy, privacy answers, IAP spec, key-rotation steps. |
| #25 | This master brief | Consolidated status + customer feature review (this document). |
| #26 | Customer-review fixes | **Gut score now credits honest symptom logging** (logging a symptom no longer scores worse than hiding it); **free top-trigger correlation teaser** shown before the paywall. |

**PR #22 detail (the big one):**
- **Security 🔴** — removed client-bundled Groq + USDA API keys; all AI now runs server-side through the `analyze-food` edge function (Gemini). Eliminated the "keys extractable from the IPA" hole.
- **Rename** — "NutriFlow" → "GutWell" everywhere user-facing (app name, iOS permission dialogs, copy, legal).
- **Notifications** — replaced the no-op stub with real `expo-notifications` (daily reminder, Sunday digest, streak-at-risk).
- **Subscriptions** — real RevenueCat integration + genuinely-enforced premium gating; safe no-op until keyed.
- **Analytics** — PostHog wired (safe no-op until keyed).
- **Core logic** — fixed streak staleness, food↔symptom correlation windowing/double-counting, capped the symptom penalty.
- **Data integrity** — idempotent offline sync + a baseline schema migration for reproducibility.
- **Cleanup** — deleted a leftover `gutwell-mobile/` scaffold (38 files) and dead code.
- **Crash/type fixes** — a `useEffect` crash, a type error, stray dev logs.

**Independently audited afterward:** core-logic fixes verified correct with no regressions; RevenueCat API-correct; security holes confirmed closed; tsc clean. The audit also surfaced the remaining items in §4.

---

## 3. Feature inventory (what the app does today)

- **Onboarding (7 screens):** welcome → features carousel → name → 7-question assessment → "analysing" → gut-profile result (1 of 4 types) → notifications opt-in.
- **Auth:** login, signup, forgot-password.
- **Home:** gut score ring, trend sparkline, streak, daily tip, activity feed, quick AI meal logging.
- **Daily check-in:** Bristol stool chart, symptoms, mood, water, success overlay.
- **Food log:** AI photo analysis, manual entry, favourites, food↔symptom correlation badges.
- **Progress:** charts, contribution calendar, mood trends, **correlations (premium)**.
- **Profile:** stats, level/XP, achievements.
- **AI meal-photo wizard:** snap a meal → gut-friendly coaching (EN/DE), voice corrections.
- **Extras:** weekly digest, reminders, settings (export + account deletion), iOS home-screen widget, paywall, legal pages.
- **Engine:** gut-score algorithm, streak engine, correlation engine, USDA nutrient recommendations.

---

## 4. What's still open

### 4a. Operational blockers — only you (accounts/identity/payment)

| # | Item | Note |
|---|------|------|
| **0** | **Restore the paused Supabase project** (+ upgrade to Pro $25/mo) | Backend is DOWN until done. Dashboard → Restore. Gate for everything. |
| 1 | Deploy `analyze-food` edge function | **Ready on my side** — `GEMINI_API_KEY` already set. I run it the moment #0 is done. |
| 2 | Rotate keys | Revoke old Groq key (no longer used); generate new USDA key → I set the secret. |
| 3 | Apple Developer enrollment ($99) | Then give me `appleId` / `appleTeamId` / `ascAppId` → I fill `eas.json`. |
| 4 | App Store Connect listing | Copy + privacy answers ready to paste in `LAUNCH_OPERATIONS.md`; you upload screenshots. |
| 5 | Subscriptions (if paid launch) | Create products + RevenueCat entitlement; or launch free (recommended). |

### 4b. Ship-quality code — I can do

- **Zero tests / no CI** — add unit tests for `scoring`/`streaks`/`correlations`/`offline-queue` + a CI workflow.
- **Accessibility** — `(auth)` and `(onboarding)` have *zero* a11y props; VoiceOver users can't navigate signup.
- **Minor bugs** — RevenueCat doesn't re-check premium on screen focus (post-purchase unlock lag); notification taps don't deep-link; legacy correlation engine still crosses midnight; `scripts/generate-assets.mjs` still says "NutriFlow"; `supabase/config.toml` missing.
- **Scoring uses settings** — gut score ignores the user's configured daily goal (left as a documented TODO).

---

## 5. Customer feedback — me as a user with gut issues who just downloaded this

*Persona: someone with recurring bloating who wants to find their trigger foods. Honest reactions — what's smart, what's off.*

### What I genuinely like (this is well thought out)
- **The core promise is exactly my problem.** "Log food + symptoms → see what triggers you" is precisely why I'd download a gut app. The whole product points at a real pain. ✅
- **Bristol stool chart in the check-in.** This signals the app is *serious* and clinically literate, not a generic wellness toy. It immediately earned my trust. ✅
- **AI meal photo logging.** The #1 reason people quit food trackers is friction. Snap-a-photo is the lowest-friction logging I've seen — this is the standout feature. ✅
- **One gut score + streak.** A single number and a streak give me an at-a-glance "am I doing better?" and a reason to come back daily. Good habit design. ✅
- **Data ownership (export + delete).** For *health* data this matters a lot to me. Builds trust. ✅

### What doesn't make logical sense to me (I'd raise an eyebrow)
1. **My score drops when I log symptoms.** This is backwards. The app *rewards me for hiding how bad I feel* — the more honestly I track a flare-up, the worse my "gut score" looks. The score should reflect **consistency and trend**, not punish honesty. This was the single most important logic flaw. ✅ **Fixed in PR #26** — honest logging is now *credited* (the first symptom nets to zero; the penalty is softened and capped), so tracking how you feel never scores worse than hiding it.
2. **The "Analysing…" screen is fake.** A 2.6-second progress animation when there's nothing real to compute reads as theater. The moment I realize it's staged, I trust *everything else* a little less. For a health app, credibility > hype — cut it or make it real. ⚠️
3. **The 7-question quiz → "gut profile type" feels like a personality test.** "Reactive Gut / Sensitive Gut / …" is fun, but if my answers don't actually change how the app scores or coaches me, it's a BuzzFeed gimmick bolted onto a medical-adjacent product. Either *use* the answers to personalize, or drop the theater. ⚠️
4. **The one insight I came for is behind the paywall.** Correlations ("X correlates with your bloating") *are the product*. Gating 100% of it means I can't see that GutWell works before paying. Let me see **one real correlation free** — prove the value, then charge for the full picture. It felt like my own data's answers were held hostage. ✅ **Fixed in PR #26** — free users now see their single strongest trigger food before the paywall.
5. **It wants my location to "find healthy food nearby."** I downloaded a symptom tracker, not Yelp. Asking for location for a tangential feature adds a permission prompt, a privacy worry, and scope creep — all friction against the core loop. Cut it or make it clearly optional/late. ⚠️
6. **XP, levels, and achievements feel juvenile for a health concern.** Streaks fit (consistency matters). But "leveling up" while I'm trying to figure out why I'm in pain feels tonally off — like gamifying a doctor's visit. Mild, but it slightly undercuts the clinical credibility the Bristol chart earned. ⚠️

### Logical/structural observations
- **Empty-state problem:** correlations need weeks of data to mean anything. My first 1–2 weeks I'll see noise or blanks — exactly when I'm deciding whether to keep the app. The onboarding quiz could **seed provisional insights** ("people with your profile often react to dairy") to bridge that gap honestly.
- **Value tiering is fuzzy:** weekly digest is free but correlations are paid — as a user I can't tell what "Premium" *is*. Make the one-line promise of premium obvious on the paywall ("See exactly which foods trigger you").
- **Trust > conversion tricks.** The strongest version of GutWell leans into its clinical credibility (Bristol chart, honest data, real insights) and drops the conversion theater (fake loader, gimmick profiles, XP). A gut-health audience is anxious and skeptical; earnest beats hypey.

### If I were prioritizing as the product owner
1. ~~**Fix the score incentive**~~ — ✅ **Done (PR #26):** honest symptom logging no longer punishes the score.
2. ~~**Give one free correlation**~~ — ✅ **Done (PR #26):** free users see their top trigger before the paywall.
3. **Make the onboarding quiz actually personalize** the experience (or simplify it). *(still open)*
4. **Cut or postpone location**; lead with the food↔symptom loop. *(still open)*
5. Keep streaks, **dial back XP/levels** to match a health tone. *(still open)*

**Bottom line as a customer:** the *bones are genuinely good* and I'd want this to exist — but a few choices optimize for conversion at the cost of the trust a gut-health app lives or dies on. Tighten those and it's a product I'd pay for and recommend.

---

## 6. Definition of done (v1 launch)

**Must-have:** Supabase restored + Pro · edge function deployed · keys rotated · Apple enrolled + `eas.json` filled · ASC listing + screenshots + privacy questionnaire · one production EAS build through TestFlight.
**Should-have:** root error boundary (done) · score-incentive fix (done) · free correlation teaser (done) · a11y on auth/onboarding · a minimal test suite + CI.
**Recommended:** launch **free**, validate retention with the now-real analytics + notifications, turn on paid in v1.1.

*Full operational detail lives in `LAUNCH_OPERATIONS.md`.*
