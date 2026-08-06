# GutWell — Launch Operations Runbook

**Updated: 10 June 2026** (post-acquisition overhaul — see `ACQUISITION_IMPROVEMENT_PLAN.md` for the full audit and what changed).
Project ref: `peipdakrqtgabnvpazrc` · Bundle id: `com.parallellabs.gutwell` · Publisher: Parallel Labs Pte. Ltd.

---

## 🌐 v1.0 language scope (decided August 2026)

- **English** — primary, default, and the permanent fallback for any unrecognised value.
- **German** — the only additional launch language. Informal *du* register throughout.
- **Persian (`fa`) is not supported in v1.0.** It was removed from the app, the
  `analyze-food` Edge Function, and the `user_profiles.preferred_language` CHECK
  constraint. Legacy stored `fa` preferences migrate one-way to English.
- Additional languages may be reconsidered after v1.0 via a fresh implementation.
- Only `en` or `de` is ever sent to AI or backend services.

---

## ✅ Done (was blocking, now resolved)

| Item | Status |
|---|---|
| Supabase project | **ACTIVE** (eu-west-1). Still on free tier — see #1 below |
| Edge function `analyze-food` | **DEPLOYED** (10 Jun) with wellness-compliant prompts + real per-user personalization |
| Production DB security | **FIXED**: legacy "Public can read/insert" policies dropped; check-in unique constraint restored; offline-dedup schema applied; local/remote migration histories identical |
| Auth & onboarding funnel | **RESTORED** (was unreachable since 2 May); welcome → quiz → signup → notifications → tabs, verified end-to-end |
| Free-launch mode | Code ships free cleanly: all premium gates unlocked, paywall unreachable while `EXPO_PUBLIC_REVENUECAT_IOS_KEY` is unset (no dead "Coming Soon" purchase UI) |
| Privacy | In-app policy rewritten (names all processors); analytics carries no health values or names; location strictly opt-in, city-only; per-user disclaimer with server-side consent timestamp |
| Tests & CI | 126 unit tests across 10 suites + GitHub Actions (tsc, lint, jest) on every PR |
| **Password recovery** | **LIVE & VERIFIED (6 Aug 2026)** — custom SMTP via Resend from `auth@getgutwell.app`, branded template applied, full reset completed on a physical iPhone. See #2b below |

---

## 🔴 Owner-only items (in order)

### #1 — Supabase Pro upgrade ($25/mo)
Free-tier projects auto-pause after ~7 days idle, which takes production down. Non-negotiable before launch.
https://supabase.com/dashboard/project/peipdakrqtgabnvpazrc/settings/billing

### #2 — Rotate / set API keys
- **Groq:** the app no longer uses Groq — **revoke** the old leaked key: https://console.groq.com/keys
- **USDA:** generate a fresh key (https://fdc.nal.usda.gov/api-key-signup.html) then:
  ```
  supabase secrets set USDA_API_KEY=<new_key> --project-ref peipdakrqtgabnvpazrc
  ```
  (Without it the nutrient-recommendation enrichment stays disabled; core analysis works on Gemini.)
- **Gemini:** already a server secret — leave as is.

### #2b — Transactional email (Resend, root domain) ✅ DONE — 6 August 2026

**Password recovery is live and verified end to end.** Nothing here is outstanding.

Architecture in `EMAIL_ARCHITECTURE.md`: on the **Resend Free plan** (1 domain,
100 emails/day) authentication mail sends from **`auth@getgutwell.app`** on the
**root** domain. Human mail stays on IONOS. Root MX and root SPF were never touched.

Verified live configuration (read from the Management API, not the dashboard UI):

| Setting | Value |
|---|---|
| Host / Port | `smtp.resend.com` : `465` |
| Username | `resend` |
| Password | stored (API returns a 64-char digest; the value is never readable) |
| Sender | `auth@getgutwell.app` / `GutWell AI` |
| Recovery template | branded, 2918 chars, matches `supabase/templates/recovery.html` |
| Site URL | `https://getgutwell.app` |
| Redirect allow-list | `gutwellapp://reset-password`, `gutwellapp:///reset-password`, `gutwellapp://**` |

**Evidence of a working end-to-end reset (6 Aug, 13:40:58 UTC):** on the test
account, `last_sign_in_at` and `updated_at` both moved to that instant while
`recovery_sent_at` became `null` — GoTrue nulls that column only when a recovery
token is *consumed*. That is the signature of a link being used and a password
actually changed, confirmed on a physical iPhone.

#### Still open (non-blocking)

- **IONOS: create `auth@getgutwell.app` as a forwarder to `support@`.** Until then,
  anyone replying to a reset email gets a bounce.
- **The reset email is English only.** Supabase Auth serves one template per email
  type, so a German reset email requires a Send Email Hook branching on
  `user_profiles.preferred_language`. Do not assume DE users get German mail.

#### Operational gotchas — read before touching email again

⚠️ **Never run `supabase config push`.** `[auth.email.smtp]` is commented out in
`supabase/config.toml`, so a push would wipe the working hosted SMTP config and
silently break password recovery for every user.

⚠️ `smtp_max_frequency = 60` s **per address**. A rapid retest is throttled, not
broken. Wait a minute between sends before concluding anything has failed.

⚠️ `exp://**` is listed in `supabase/config.toml` but is **not** in the hosted
allow-list. Expo Go cannot complete a reset. Dev-client and release builds use the
`gutwellapp://` scheme and work correctly.

⚠️ Never add a Resend SPF include to the **root** TXT record. Two SPF records make
all mail — including IONOS human mail — fail SPF. Verified: exactly one root SPF
record, still IONOS-only, and root MX still `mx00`/`mx01.ionos.de`.

⚠️ Keep email confirmations OFF (`mailer_autoconfirm` stays true) unless you have
re-proven delivery, or new signups get locked out.

⚠️ Root domain = no reputation firewall. Send **transactional auth mail only**.
Marketing gets its own subdomain and a paid plan, never the root.

### #3 — Apple Developer + eas.json
- Enroll: https://developer.apple.com/programs/enroll/ ($99/yr)
- Then provide the 3 values for `eas.json → submit.production.ios`:
  `appleId` (your Apple ID email) · `appleTeamId` (10-char) · `ascAppId` (numeric, after #4)

### #4 — App Store Connect listing (copy ready below)

**Name:** GutWell
**Subtitle (30):** Gut health, food & symptoms
**Promotional text (170):** Understand how food affects how you feel. Log meals and symptoms, spot your patterns, and build a daily gut-health habit — with a personal gut score and AI meal insights.

**Keywords (100):**
`ibs,gut health,digestion,bloating,food diary,symptom tracker,meal log,fodmap,microbiome,stool`
> Changed from the old set: added **ibs** (highest-intent term in the category) and **stool**; dropped words duplicated by the subtitle/name (gut, health, wellness, habit) — Apple indexes title+subtitle words automatically, so repeating them wastes characters.

**Description:**
> GutWell helps you understand the connection between what you eat and how you feel.
>
> Log your meals, check in on your symptoms, and GutWell surfaces the patterns — so you can make informed choices about your diet and daily routine. It's a wellness companion for building awareness of your digestive health, not a medical device, and it does not diagnose, treat, or cure any condition.
>
> • DAILY CHECK-IN — Track digestion, mood, energy and more in under a minute.
> • FOOD ↔ SYMPTOM INSIGHTS — See which foods tend to line up with how you feel.
> • GUT SCORE — A simple daily score that reflects your recent habits and check-ins.
> • AI MEAL PHOTOS — Snap a meal and get gut-friendly observations and ideas.
> • STREAKS & PROGRESS — Stay consistent and watch your trends over time.
> • PRIVATE BY DESIGN — Your data is yours; export or delete it anytime.
>
> GutWell provides general wellness information only and is not a substitute for professional medical advice. Always consult a qualified healthcare provider about your health.

**Support URL:** https://theparallellab.com · **Privacy Policy URL:** host the policy (in-app copy in `app/privacy-policy.tsx` is the source of truth — must be published on the web before submission)
**Category:** Health & Fitness · **Age rating:** 4+
**Devices:** iPhone only (`supportsTablet` is now false — no iPad screenshots or iPad QA needed)

### App Privacy questionnaire answers (ASC → App Privacy) — UPDATED
"Do you collect data?" → **Yes**. Tracking across other companies' apps → **No**.
| Data type | Collected | Linked to identity | Tracking | Purpose |
|---|---|---|---|---|
| Email address | Yes | Yes | No | App functionality (account) |
| Health & Fitness (food logs, symptoms, gut score) | Yes | Yes | No | App functionality |
| Photos (meal photos, only when user scans) | Yes | Yes | No | App functionality (AI analysis) |
| Coarse location (ONLY if user opts in; city-level, never raw GPS) | Yes | Yes | No | App functionality (local food suggestions) |
| Usage data (interaction events, NO health values) | Yes | Yes | No | Analytics (PostHog) |
| Crash data / diagnostics | Yes | No | No | App functionality (Sentry) |
| User ID | Yes | Yes | No | App functionality |

**Screenshots:** 6.7"/6.9" set, min 3 — suggested: Home (new core-loop screen), Check-in, Photo analysis, Progress, Weekly digest.

### #5 — Subscriptions (v1.1, not launch)
Launch **free** (current code is configured for it). When ready for paid:
1. ASC → Subscriptions group "GutWell Premium": `gutwell_premium_monthly` $6.99/mo · `gutwell_premium_annual` $39.99/yr (optional 7-day trial intro offer)
2. RevenueCat: entitlement **`premium`**, offering **`current`**, packages `$rc_monthly`/`$rc_annual`
3. Set `EXPO_PUBLIC_REVENUECAT_IOS_KEY` in the EAS build env — that single env var turns on all gates, upsells, and the paywall (with required legal links + price-derived claims already built)

#### Deferred: German paywall hero wraps — **not a v1.0 blocker**

The German hero line `heroLine2` wraps onto an extra line on **every** supported
iPhone width. Measured against the real EB Garamond 700 Bold metrics at 34pt,
including the inline 30pt leaf icon, against a content width of screen minus
24pt padding each side (iPhone SE 327pt · iPhone 15/16 345pt · Pro Max 392pt):

| String | Width | Result |
|---|---|---|
| `GutWell kostenlos testest` (before the rename) | 402.5pt | wraps on all widths |
| `GutWell AI kostenlos testest` (current) | 447.5pt | wraps on all widths |
| English `GutWell AI for free` (current) | 321.3pt | **fits** on all widths |

**The German wrap pre-dates the GutWell AI rename** — it already wrapped at
402.5pt. The rename widened an existing wrap; it did not create one. English is
unaffected and fits on every supported width.

**Why this is not a release blocker:** the paywall is **unreachable in v1.0**.
`EXPO_PUBLIC_REVENUECAT_IOS_KEY` is unset, so `isMonetizationEnabled()` is false
and `isPremiumFeature()` returns true for everyone (`lib/subscription.ts:185`).
The locked states in `weekly-digest.tsx` and `progress.tsx` therefore never
render, and `profile.tsx` gates its upsell on `isMonetizationEnabled()` directly.
All four entry points are gated. No user can reach this screen.

**Revisit when RevenueCat and StoreKit are implemented**, alongside step 3 above.
When you do:

- Final copy must be driven by **actual StoreKit trial eligibility**. The CTA
  already does this correctly — `app/paywall.tsx:146-153` reads
  `product.introPrice` and only offers a trial when StoreKit reports one. **Do
  not hardcode a free-trial claim in the hero**, which renders before any
  offering loads and would assert a trial that may not exist for that user.
- Fixing it likely needs **both copy and layout** work, not just a shorter
  string. German puts the verb last, so `"Wir möchten, dass du / GutWell AI
  kostenlos testest"` cannot drop `testest` without breaking the sentence.
  Candidate shorter strings were measured and still wrap: `Teste GutWell AI
  kostenlos` 433.3pt, `GutWell AI kostenlos` 310.2pt — both over the 288.9pt
  text budget on iPhone SE.
- Do not "fix" it by shrinking the font aggressively; the hero is the screen's
  visual anchor.

---

## Build & submit

```bash
eas build --platform ios --profile production
eas submit --platform ios   # after eas.json values are filled
```

Pre-flight: `npx tsc --noEmit` · `npx expo lint` · `npx jest` (CI runs all three on every PR).

## What I need from you (short list)
1. Supabase Pro upgrade (#1)
2. New USDA key value (#2) → I set the secret
3. Revoke old Groq key (#2)
4. Apple enrollment + 3 values (#3) → I fill `eas.json`
5. Host the privacy policy at a public URL (#4)
6. Create the ASC listing with the copy above + screenshots (#4)
7. IONOS: `auth@getgutwell.app` forwarder to `support@` (#2b) — replies bounce without it
