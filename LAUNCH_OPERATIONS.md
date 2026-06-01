# GutWell — Launch Operations Runbook

Status of the five operational blockers, what's done, and exactly what only you can do.
Project ref: `peipdakrqtgabnvpazrc` · Bundle id: `com.parallellabs.gutwell` · Publisher: Parallel Labs Pte. Ltd.

---

## 🔴 #0 (NEW, must do first) — Restore the paused Supabase project

The GutWell Supabase project is **INACTIVE (paused)** — free-tier projects auto-pause after ~7 days of inactivity. **The whole backend is down** (DB, auth, edge functions) until restored.

1. Open https://supabase.com/dashboard/project/peipdakrqtgabnvpazrc
2. Click **Restore project** (takes ~2 min).
3. **Upgrade to Pro ($25/mo) before launch** — otherwise it will pause again and take production down. Non-negotiable for a shipping app.

→ The moment it's active, tell me and I deploy the edge function (#1) in one command.

---

## #1 — Deploy the edge function ✅ READY (blocked only by #0)

All prepped. `GEMINI_API_KEY` is **already set** on the project. As soon as #0 is done I run:
```
supabase functions deploy analyze-food --project-ref peipdakrqtgabnvpazrc
```
Then meal photo analysis + nutrient recommendations work. (I'll smoke-test it after.)

---

## #2 — Rotate the leaked keys

The old **Groq** and **USDA** keys shipped in the app bundle → treat as compromised.

- **Groq:** the app no longer uses Groq at all (the security fix moved everything to Gemini). So just **revoke** the old key in the Groq console — no replacement needed. https://console.groq.com/keys
- **USDA:** still used (server-side now), and **not yet set** as a secret. Generate a fresh key (https://fdc.nal.usda.gov/api-key-signup.html), then either you run, or paste it to me and I'll run:
  ```
  supabase secrets set USDA_API_KEY=<new_key> --project-ref peipdakrqtgabnvpazrc
  ```
  (Without it, the home "recommended foods" cards are empty — core analysis still works on Gemini.)
- **Gemini:** already a server secret, never exposed — leave as is.

---

## #3 — Apple Developer + eas.json

- **Apple Developer Program enrollment** ($99/yr) — requires your identity + payment; I can't do this. https://developer.apple.com/programs/enroll/
- Once enrolled, I need **3 values** to fill `eas.json` (the `submit.production.ios` block) — give them to me and I'll edit it:
  - `appleId` — your Apple ID email
  - `appleTeamId` — 10-char Team ID (developer.apple.com → Membership)
  - `ascAppId` — App Store Connect App ID (numeric; created when you add the app in ASC, step #4)

---

## #4 — App Store Connect listing (copy below is ready to paste)

Creating the app record + uploading is yours (needs your Apple account). The **content is done** — paste these in. All copy is wellness-framed (no medical/diagnostic claims) for App Store + FTC compliance.

**Name:** GutWell
**Subtitle (30):** Gut health, food & symptoms
**Promotional text (170):** Understand how food affects how you feel. Log meals and symptoms, spot your patterns, and build a daily gut-health habit — with a personal gut score and AI meal insights.

**Keywords (100):** `gut health,digestion,bloating,food diary,symptom tracker,meal log,microbiome,wellness,fodmap,habit`

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

**Support URL:** https://theparallellab.com · **Privacy Policy URL:** (your hosted privacy page)
**Category:** Health & Fitness · **Age rating:** 4+

### App Privacy questionnaire answers (ASC → App Privacy)
"Do you collect data?" → **Yes**. None used to **track** you across other companies' apps (answer **No** to tracking). Collected types:
| Data type | Collected | Linked to identity | Used for tracking | Purpose |
|---|---|---|---|---|
| Email address | Yes | Yes | No | App functionality (account) |
| Health & Fitness (food logs, symptoms, gut score) | Yes | Yes | No | App functionality |
| Coarse location | Yes | Yes | No | App functionality (nearby food suggestions) |
| Usage data (product interaction) | Yes | Yes | No | Analytics (PostHog) |
| Crash data / diagnostics | Yes | No | No | App functionality (Sentry) |
| User ID | Yes | Yes | No | App functionality |

**Screenshots:** still needed — 6.7"/6.9" set, min 3 (Home/gut score, Check-in, Food insights, Photo analysis, Progress). I can capture raw simulator frames on request; polished marketing frames are a design pass.

---

## #5 — Subscriptions (RevenueCat) — spec ready; recommend launching FREE first

**Recommendation:** launch **free** (the code safely no-ops without a key), validate retention with the now-real analytics + notifications, then turn on paid in v1.1. If you want paid at launch, here's the exact config — creating it needs your App Store Connect + RevenueCat accounts:

**App Store Connect → Subscriptions** (group "GutWell Premium"):
| Product ID | Type | Price (match paywall fallbacks) |
|---|---|---|
| `gutwell_premium_monthly` | Auto-renewable | $6.99 / mo |
| `gutwell_premium_annual` | Auto-renewable | $39.99 / yr (optional 7-day free trial intro offer) |

**RevenueCat dashboard:**
- Entitlement identifier: **`premium`** (must match code exactly — `lib/subscription.ts`)
- Offering identifier: **`current`**, with packages **`$rc_monthly`** and **`$rc_annual`** mapped to the two products above, both attached to the `premium` entitlement.
- Copy the **Apple App Store public key** (`appl_…`) → give it to me or set `EXPO_PUBLIC_REVENUECAT_IOS_KEY` in your EAS env / `.env`.

---

## What I need from you (the short list)
1. **Restore the Supabase project** (#0) → then I deploy #1.
2. **New USDA key** value (#2) → I set the secret.
3. **3 Apple values** (#3) → I fill `eas.json`.
4. **Free or paid at launch?** (#5) — recommend free.
Everything else above (revoke old keys, Apple enrollment, ASC listing/screenshots, RevenueCat product creation) requires your accounts and is yours to action with the runbook above.
