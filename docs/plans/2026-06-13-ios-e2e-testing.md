# Plan: iOS Simulator E2E testing for the meal_revise change

- **Status:** IN REVIEW
- **Type:** Test infrastructure (additive, no app behavior change)
- **Date:** 2026-06-13
- **Goal:** Verify the `meal_revise` change works in the **real Expo iOS app**, not
  only in Jest unit tests.
- **Companion to:** `docs/plans/2026-06-13-meal-revise-prompt.md` and
  `docs/plans/CODEX_PROMPT.md` (R1 score badge / R2 meal name).

---

## 1. Why Maestro (native iOS), not Playwright

**Recommendation: use [Maestro](https://maestro.mobile.dev) for native iOS Simulator E2E.**

GutWell is a native Expo app — the README is explicit: it **cannot run in Expo Go**
and must be launched with `npx expo run:ios` because it uses native modules
(`@react-native-voice/voice`, `expo-speech-recognition`, `react-native-purchases`,
the Swift home-screen widget, Sentry, etc.). The screens we need to test
(`app/photo-analysis.tsx`, the tabs, History) render as **native UIKit views**, not
DOM.

- **Playwright drives a browser DOM.** It can only test the **Expo Web** target
  (`expo start --web` / `react-native-web`). It has no way to tap a native iOS
  view, read native accessibility labels, or exercise native modules. On iOS it is
  simply not applicable.
- **Maestro drives the iOS Simulator directly** via the accessibility tree. It taps
  by visible text or `accessibilityLabel`, which this codebase already provides
  (e.g. `accessibilityLabel="Scan a meal photo with AI"` in `app/(tabs)/food.tsx`).
- Maestro flows are plain YAML, no build step, easy to read in review, and the CLI
  is installed separately (not an npm dependency), so it adds nothing to the bundle.

**Where Playwright *would* fit:** only if we later test the **Expo Web** build of a
DOM-rendered screen. That is a separate, optional track — see §6. We are **not**
adding Playwright now (it is not installed, and native iOS is the actual target).

---

## 2. What we want to verify (acceptance, ties to R1/R2)

1. App launches on the Simulator and reaches its first screen.
2. The photo-analysis / correction flow is reachable.
3. The History screen opens.
4. Copy / Share buttons are reachable when an analysis is visible.
5. A corrected analysis renders **visible `SCORE` and `MEAL` output** (this is the
   real-app proof for **R1** score badge and **R2** meal-name labels surviving the
   new emoji format).

---

## 3. Hard reality: auth + network gating

Two things gate full E2E and are why most of it **cannot** be a clean CI test:

- **Auth gate.** `app/index.tsx` redirects a session-less launch to
  `/(onboarding)/welcome`, not the tabs. So a fresh Simulator lands on onboarding.
  Reaching the food tab → photo analysis requires an **authenticated session**
  (a seeded test account or a build that restores a session).
- **Network/AI gate.** Producing a corrected analysis calls the Supabase edge
  function `analyze-food` (`meal_revise`), which calls Gemini. That is real network
  + AI — **non-deterministic and not allowed as an unmocked CI test** (constraint).

**Consequence:** the scaffold is split into a *safe, offline* smoke flow and a
*gated, manual* full flow that is documented, not wired into CI.

---

## 4. Scaffold added in this PR (`.maestro/`)

| File | What it does | Safe to run unattended? |
|---|---|---|
| `.maestro/config.yaml` | App id (`com.parallellabs.gutwell`) | n/a |
| `.maestro/smoke-launch.yaml` | Launch the app, assert the first screen renders | ✅ Offline, deterministic (needs build) |
| `.maestro/photo-analysis-flow.yaml` | Navigate to scan → History → Copy/Share → assert `SCORE`/`MEAL` | ⚠️ **Manual** — needs auth session + live backend |
| `.maestro/README.md` | Prerequisites + how to run | — |

Selectors used are real and already in the code (text + `accessibilityLabel`), e.g.
`"Scan a meal photo with AI"`, `"Copy Full Result"`, `"Apply correction"`,
correction placeholder `"Tell us what to fix…"`. The `SCORE`/`MEAL` assertions match
both the old ("MEAL IMPACT SCORE") and the new emoji format ("📊 SCORE", "🍽️ MEAL")
via substring.

The full flow is intentionally written with the navigation/correction steps under a
clear "requires authenticated build + backend" header so a human can run it after a
build, but it will not be scheduled in CI.

---

## 5. npm scripts

- `test:e2e:ios` → `maestro test .maestro` — **added.** (Maestro CLI is installed
  separately: `curl -Ls "https://get.maestro.mobile.dev" | bash`.)
- `test:e2e:web` → **not added.** Playwright is not installed, and the native iOS
  target does not need it. Add only if/when an Expo Web E2E track is intentionally
  started (see §6).

---

## 6. Optional future track: Expo Web + Playwright

If web E2E is ever wanted: `npm i -D @playwright/test`, run against
`expo start --web`, and add `test:e2e:web`. This only covers the web rendering of
DOM screens and **does not** validate native iOS behavior, native modules, or the
widget. Out of scope here.

---

## 7. Local vs. simulator-build matrix (constraint #8)

| Check | Runs locally now? | Needs Simulator build (`npx expo run:ios`)? | Needs auth session? | Needs live backend? |
|---|---|---|---|---|
| Jest unit tests (`npm test`, incl. R1/R2 parser tests) | ✅ yes | no | no | no |
| `.maestro/smoke-launch.yaml` | no | ✅ yes (app must be installed on a booted sim) | no | no |
| Navigate to photo analysis / History | no | ✅ yes | ✅ yes | no |
| Copy/Share reachable | no | ✅ yes | ✅ yes | no (Share is OS sheet) |
| Corrected analysis shows `SCORE`/`MEAL` | no | ✅ yes | ✅ yes | ✅ yes (Gemini) |

**Bottom line:** the strongest *automatable, non-flaky* guarantee for R1/R2 remains
the **Jest unit tests** on `extractMealImpactScore` / `extractMealName`. The Maestro
smoke flow proves the app boots after the change. The full correction → SCORE/MEAL
check is a **manual, build-required, backend-required** verification, documented
here rather than run in CI.

---

## 8. How to run (after the code change lands)

```bash
# 1. Unit tests (no simulator) — primary R1/R2 guarantee
npm test

# 2. Build & install on a Simulator (one-time, ~10-15 min first run)
npx expo run:ios

# 3. Smoke flow (offline, deterministic)
npm run test:e2e:ios            # runs everything in .maestro/
# or just the safe one:
maestro test .maestro/smoke-launch.yaml

# 4. Full flow — MANUAL, needs a logged-in build + live Supabase/Gemini
maestro test .maestro/photo-analysis-flow.yaml
```
