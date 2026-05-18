---
title: NutriFlow Deployment Notes
tags:
  - nutriflow
  - build-log
  - deployment
---

# NutriFlow Deployment Notes

Public demo: https://gutwell-app.vercel.app

## Deployment Shape

- NutriFlow is built as an Expo app with web output enabled.
- Web deployment uses Expo static export.
- Vercel serves the exported `dist` directory.
- Native iOS/Android app configuration remains in `app.json`, while this note focuses on the public web demo.

## Primary Commands

```bash
npm install
npm run build:web
npm run deploy:web
```

What they do:

- `npm install`: installs dependencies and runs the asset generation postinstall.
- `npm run build:web`: runs `npx expo export --platform web` and writes static output to `dist`.
- `npm run deploy:web`: runs `npx vercel --prod`.

## Pre-Deploy Checklist

- Confirm environment variable names exist in Vercel and local `.env`; do not commit values.
- Run lint/build when runtime code changed.
- For docs-only changes, app lint/tests are usually not relevant.
- Verify the guest demo path still works.
- Verify signed-in flows still use Supabase Auth and RLS.
- Check mobile web width for overflow after copy or layout changes.
- Confirm safety copy still says educational insight only, not diagnosis or medical advice.
- Confirm red-flag symptoms route to medical-care guidance before AI generation.

## Required Public Environment Variable Names

These names are safe to document, but values must remain outside git:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_GROQ_API_KEY`
- `EXPO_PUBLIC_USDA_API_KEY`

Optional/legacy:

- `GEMINI_API_KEY`

## Deployment Risks To Watch

- Missing Expo public env prefix can make values unavailable in the web/mobile bundle.
- Supabase anon key must match the Supabase project URL.
- Public demo should not require test accounts for the core first impression.
- Guest mode should remain local-only and should not write demo data to Supabase.
- Static export can hide runtime env issues until the app is loaded in-browser.

## Post-Deploy Smoke Test

Use this as a reusable smoke test after deployment:

- Open https://gutwell-app.vercel.app.
- Continue as guest.
- Complete onboarding and consent.
- Try a symptom-only nutrition prompt and confirm no invented meal appears.
- Try a normal food prompt and confirm educational nutrition guidance appears.
- Open quick relief/SOS and confirm urgent guidance is visible.
- Open settings and confirm data deletion controls are reachable.
- Switch language, especially Persian, and check for layout overflow.

## Rollback Pattern

- Prefer a new fix commit over force-pushing deployment history.
- If a deployment is bad, use Vercel's previous deployment rollback and then patch source.
- Record root cause in [[03-bugs-fixed]] or [[04-feedback-log]] so the issue does not repeat.

