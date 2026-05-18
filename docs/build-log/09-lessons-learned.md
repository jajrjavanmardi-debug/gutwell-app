---
title: NutriFlow Lessons Learned
tags:
  - nutriflow
  - build-log
  - lessons
---

# NutriFlow Lessons Learned

## Product

- Build the actual core loop early: input, insight, history, and return path.
- Demo friction is product friction. Guest mode made the public web demo easier to share.
- Health-adjacent apps need trust features in the product UI, not only in policy pages.
- Localization is not a final pass; it changes layout, tone, and safety clarity.

## Engineering

- Keep the Supabase schema, RLS policies, grants, and client expectations moving together.
- Treat environment validation as part of the product. Clear startup failures save hours.
- Build AI fallbacks before demo day.
- Classify user input before sending it to AI. Symptom-only and food-specific prompts need different behavior.
- Native storage needs platform-specific thinking; SecureStore is not a universal large-value store.
- Public web demos expose mobile layout issues quickly because people open links on phones.

## Safety And Compliance

- Avoid diagnosis, treatment, cure, certainty, or emergency-substitution language.
- Red-flag triage should happen before coaching or AI generation.
- Consent should be explicit, versioned, and tied to the type of storage being used.
- Guest mode and signed-in mode need separate privacy behavior.
- Data deletion must cover local storage and every user-owned remote table.

## Deployment

- Expo web static export works well for demos when routes and env vars are verified after deploy.
- Vercel config should be explicit about install, build, output, clean URLs, and trailing slash behavior.
- The public demo link should live in docs, release notes, and QA checklists.
- Production smoke tests should cover first run, guest path, AI fallback, safety path, and settings controls.

## Documentation

- Keep a build log while the work is fresh. Git history is useful, but it misses why decisions were made.
- Use theme-based feedback logs instead of storing raw tester comments.
- Keep docs reusable: each fix should include "what happened", "what changed", and "what to repeat next time".
- Document variable names, table names, and architecture; never document secret values or user records.

## Future App Defaults

- Add guest/demo mode before public feedback.
- Add consent and deletion flows before collecting sensitive data.
- Add RLS and explicit grants from the first migration.
- Add AI provider error handling before adding UI polish.
- Add mobile viewport checks to every localization pass.
- Add a docs/build-log folder once the app reaches demo stage.

