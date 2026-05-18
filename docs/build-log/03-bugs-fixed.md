---
title: NutriFlow Bugs Fixed
tags:
  - nutriflow
  - build-log
  - bugs
---

# NutriFlow Bugs Fixed

## Auth And Supabase

### Environment values caused confusing auth/network failures

- Symptom: local auth failures looked like generic network errors.
- Fix: Supabase config now normalizes URLs/keys, rejects placeholders, accepts Expo public env names, and prints clearer setup errors.
- Reusable lesson: fail fast at startup when env values are missing, placeholder-like, malformed, or from the wrong Supabase project.

### Native testing bypass could hide RLS problems

- Symptom: test paths did not fully match real Supabase Auth sessions.
- Fix: testing bypass was disabled so RLS behavior matches signed-in sessions.
- Reusable lesson: RLS must be tested through the same auth pathway real users use.

### Profile persistence was unreliable

- Symptom: onboarding/profile data could fail to persist because deployed tables and app expectations drifted.
- Fix: profile migrations added missing columns, repaired `profiles` and `user_profiles` policies, and hardened client-side profile settings fallbacks.
- Reusable lesson: every mobile field expected by the app needs a migration and a compatibility fallback.

### Supabase Data API grants needed to be explicit

- Symptom: upcoming public-schema default changes could break authenticated reads/writes even with RLS policies in place.
- Fix: migration `20260516123000_explicit_data_api_grants.sql` grants only authenticated access to user-owned tables and revokes anon table/sequence access.
- Reusable lesson: RLS policies and SQL grants are separate layers; both must be correct.

### Oversized SecureStore auth values

- Symptom: native auth session JSON could exceed comfortable SecureStore value limits.
- Fix: small auth values stay in SecureStore; oversized values move to AsyncStorage with a SecureStore pointer.
- Reusable lesson: secure native session storage needs a size-aware strategy.

## Demo And Guest Flow

### Web demo required sign-in too early

- Symptom: demo users needed a low-friction path before creating accounts.
- Fix: local guest mode stores demo profile/onboarding data in AsyncStorage and avoids Supabase writes.
- Reusable lesson: demos of account-based apps benefit from an explicit guest path with clear local-only data boundaries.

### Guest onboarding did not work consistently on web

- Symptom: web guest users could enter the app but onboarding state did not always complete cleanly.
- Fix: guest onboarding now saves local answers, profile state, language, focus areas, habits, and completion time.
- Reusable lesson: guest mode needs its own persistence contract instead of pretending to be a signed-in account.

## AI And Nutrition Guidance

### Symptom-only prompts guessed foods

- Symptom: when a user described a symptom without naming a food, the app could overfit and invent meal-level guidance.
- Fix: `hasSpecificFoodReference` detects whether a specific food was actually supplied; fallback guidance now distinguishes symptom-only support from food analysis.
- Reusable lesson: AI prompts should carry explicit context flags, especially "specific item present" versus "symptom only".

### AI/provider failures created brittle UX

- Symptom: missing API keys, invalid keys, provider failures, or incomplete responses could interrupt the core loop.
- Fix: Groq/USDA errors map to typed failure states and fallback recommendations.
- Reusable lesson: health-adjacent apps need graceful educational fallbacks, not blank states.

### Photo analysis needed safer correction behavior

- Symptom: meal photo analysis had to respect user corrections and not overclaim.
- Fix: Groq prompts include prior corrections, user-entered symptoms, language rules, and educational disclaimers.
- Reusable lesson: correction flows should treat the user correction as binding context.

## UI And Mobile Polish

### Mobile horizontal overflow

- Symptom: some demo/mobile layouts exceeded viewport width.
- Fix: mobile overflow fixes tightened text, layout sizing, and responsive constraints.
- Reusable lesson: multilingual mobile apps need viewport checks after copy changes.

### SOS action was too large on mobile

- Symptom: urgent guidance action took too much space in mobile demo layouts.
- Fix: compact SOS action shipped.
- Reusable lesson: emergency/safety actions must be visible without dominating routine workflows.

### Charts averaged incorrectly by day

- Symptom: daily gut score charting could misrepresent multiple entries per day.
- Fix: chart daily gut score averages.
- Reusable lesson: health trend charts should define aggregation rules explicitly.

### Simulator camera paths failed

- Symptom: camera/photo flows needed to work during simulator demos.
- Fix: simulator-safe camera fallback.
- Reusable lesson: demo-critical native capabilities need non-device fallbacks.

## Safety And Compliance

### Medical language was too strong

- Symptom: some copy could sound diagnostic or treatment-like.
- Fix: wording softened across NutriFlow to emphasize educational pattern tracking.
- Reusable lesson: review every AI output, onboarding screen, and relief screen for diagnosis/treatment/cure claims.

### Red-flag symptoms needed a hard stop

- Symptom: the app needed to avoid giving routine nutrition advice for urgent symptoms.
- Fix: shared red-flag triage detects urgent patterns in English, German, and Persian and shows medical-care guidance.
- Reusable lesson: safety routing should happen before AI generation.

### Health-data consent needed to be explicit

- Symptom: onboarding collected health-related information without a dedicated consent checkpoint.
- Fix: health-data consent step added; signed-in consent syncs to Supabase, guest consent stays local.
- Reusable lesson: consent state should be versioned, cached locally, and stored remotely only for signed-in users.

### Data deletion needed broader coverage

- Symptom: settings deletion needed to clear local and signed-in user-owned records.
- Fix: local data keys/prefixes are cleared; signed-in deletion removes rows across user-owned tables and resets profile fields.
- Reusable lesson: deletion playbooks need both local storage and remote table coverage.

