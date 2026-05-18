---
title: NutriFlow Codex Prompts
tags:
  - nutriflow
  - build-log
  - codex
  - prompts
---

# NutriFlow Codex Prompts

These are reusable prompt patterns that worked well for NutriFlow-style app work. They are written as templates and do not include private user data.

## Repo Safety Prompt

```text
Work only in:
<absolute repo path>

Do not change runtime app code unless needed for the requested fix.
Preserve unrelated uncommitted changes.
Do not include secrets, emails, auth ids, real health records, or identifiable tester data.
```

Why it worked: it made the working directory and privacy boundaries explicit, especially when multiple app copies existed locally.

## Focused Bug Fix Prompt

```text
Fix <specific bug or flow>.

Inspect existing patterns first.
Keep the change scoped to the relevant files.
Do not refactor unrelated code.
Run the smallest relevant verification command and report what passed or could not run.
```

Good for: auth, Supabase client issues, UI overflow, chart logic, and demo flow bugs.

## Supabase RLS Prompt

```text
Audit/fix the Supabase issue without weakening RLS.

Use migrations for schema, policies, and grants.
Keep anon access revoked for user-owned tables.
Grant only the authenticated privileges required by the app.
Do not commit Supabase .temp metadata or project refs.
```

Good for: explicit Data API grants, profile persistence, health-data consent columns, and delete-own-row policies.

## Health Safety Prompt

```text
Review this health-adjacent flow for safety.

Make copy educational and wellness-oriented.
Avoid diagnosis, treatment, cure, certainty, or emergency substitution.
Add or reuse red-flag triage before AI recommendations.
Keep emergency/urgent guidance available even if consent is not accepted.
```

Good for: home recommendation text, AI outputs, quick relief, onboarding consent, and red-flag handling.

## Demo Readiness Prompt

```text
Prepare the app for a public web feedback demo.

Enable a low-friction guest path that stores demo data locally.
Make the first-run flow understandable without a tester account.
Keep signed-in Supabase data separate from guest data.
Include the public demo link in docs/release notes.
```

Good for: guest mode, web onboarding, demo-facing copy, and Vercel deployment notes.

## AI Restraint Prompt

```text
Improve the AI nutrition flow.

Classify whether the user named a specific food.
For symptom-only input, do not invent a meal or USDA match.
Use provider fallbacks for missing keys, invalid responses, rate limits, and network errors.
Keep all responses educational and localized.
```

Good for: avoiding food guesses, handling missing API keys, and improving coach response quality.

## Localization Prompt

```text
Update this feature in English, German, and Persian.

Keep tone natural in each language.
Verify Persian remains RTL-friendly.
Check mobile widths after copy changes.
Do not leave fallback English labels in localized UI except for brand names or unavoidable technical names.
```

Good for: onboarding language selector, meal photo analysis, quick relief, and main UI copy.

## Frontend QA Prompt

```text
After changing UI, run the app and inspect mobile and desktop web.

Check for horizontal overflow, clipped buttons, overlapping text, blank screens, and broken first-run paths.
Use screenshots or viewport metrics when useful.
```

Good for: public demo polish, mobile SOS compaction, and localization-heavy screens.

## Documentation Prompt

```text
Create Obsidian-friendly project docs under docs/build-log.

Document tools, timeline, bugs fixed, feedback themes, compliance/safety improvements, deployment, Supabase, Vercel, prompt patterns, lessons learned, and reusable playbooks.
Keep it app-specific and reusable.
Do not include private user data or secrets.
```

Good for: turning a fast build into reusable institutional memory.

