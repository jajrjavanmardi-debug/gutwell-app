# .maestro — iOS Simulator E2E (Maestro)

> 🟡 **LATER / NOT NOW — future proposal.** Testing is **manual-first** for now
> (decision 2026-06-13). Do **not** set up Maestro/Playwright/Appium/Detox or
> install E2E dependencies yet. This folder is inert YAML kept as a proposal; it
> runs nothing on its own. Validate changes manually in the iOS Simulator + local
> Expo first. See `docs/plans/2026-06-13-ios-e2e-testing.md`.

Native iOS E2E for GutWell. See the full rationale and the
local-vs-build matrix in `docs/plans/2026-06-13-ios-e2e-testing.md`.

## Why Maestro (not Playwright)

GutWell is a **native** Expo app (cannot run in Expo Go; uses native modules + a
Swift widget). Screens render as native UIKit views, so Playwright — which only
drives a browser DOM — cannot tap or read them. Playwright would only fit a future
**Expo Web** track. Maestro drives the iOS Simulator's accessibility tree directly.

## Install (CLI, not an npm dependency)

```bash
curl -Ls "https://get.maestro.mobile.dev" | bash
```

## Prerequisites

1. Build & install the app on a booted Simulator (first run ~10–15 min):
   ```bash
   npx expo run:ios
   ```
2. For the **full** flow only: be signed in (a session-less launch lands on
   onboarding) and have live Supabase + Gemini reachable.

## Run

```bash
# Default suite = the safe, offline smoke flow only (see config.yaml)
npm run test:e2e:ios
# or:
maestro test .maestro/smoke-launch.yaml

# Full flow — MANUAL, needs auth session + live backend (NOT in CI)
maestro test .maestro/photo-analysis-flow.yaml
```

## Files

| File | Safe unattended? | Notes |
|---|---|---|
| `config.yaml` | — | App id; default suite = smoke only |
| `smoke-launch.yaml` | ✅ | Launch + first-screen assert, offline |
| `photo-analysis-flow.yaml` | ⚠️ manual | Scan → History → Copy/Share → SCORE/MEAL (R1/R2); needs auth + backend |

## Notes / TODO for stable selectors

- The History assertion expects `testID="food-history"` on the History screen root
  (`app/food-history.tsx`). Add it, or change the assertion to match visible text.
- The strongest non-flaky guarantee for R1/R2 stays the **Jest unit tests** on
  `extractMealImpactScore` / `extractMealName`. Maestro proves the app boots and the
  flow is reachable; the SCORE/MEAL content check is a manual, backend-required step.
