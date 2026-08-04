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
| Tests & CI | 26 unit tests + GitHub Actions (tsc, lint, jest) on every PR |

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

### #2b — Transactional email (Resend, root domain) 🔴 BLOCKS PASSWORD RESET
Password recovery cannot work until this is done. Supabase's built-in sender only
delivers to members of the Supabase org, which is why reset mail has never arrived.

Architecture in `EMAIL_ARCHITECTURE.md`: on the **Resend Free plan** (1 domain,
100 emails/day) authentication mail sends from **`auth@getgutwell.app`** on the
**root** domain. Human mail stays on IONOS. Root MX and root SPF are never touched.

1. Resend → add domain **`getgutwell.app`** (the root).
2. Add the 3 records Resend shows, at IONOS, name field without the domain suffix:
   `MX send`, `TXT send` (SPF), `TXT resend._domainkey` (DKIM).
3. Wait for Resend to report **Verified**.
4. IONOS → create **`auth@getgutwell.app` as a forwarder to `support@`**, so
   replies to a reset email reach a human instead of bouncing.
5. Resend → API key with *Sending access*.
6. Supabase → Auth → SMTP: `smtp.resend.com` : 465, user `resend`, pass = API key,
   sender `auth@getgutwell.app`, name `GutWell AI`.
   (Or uncomment `[auth.email.smtp]` in `supabase/config.toml`, export
   `SMTP_PASSWORD`, and `supabase config push`.)
7. Supabase → Auth → URL Configuration: Site URL `https://getgutwell.app`;
   redirect allow-list gets `gutwellapp://reset-password`,
   `gutwellapp:///reset-password`, `gutwellapp://**` and `exp://**` (dev only).
8. Supabase → Auth → Rate Limits: raise the email limit before testing.
9. Paste `supabase/templates/recovery.html` into the Reset Password template.

⚠️ Never add a Resend SPF include to the **root** TXT record. Two SPF records make
all mail — including IONOS human mail — fail SPF.

⚠️ Keep email confirmations OFF until recovery mail is proven to deliver, or new
signups get locked out.

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
