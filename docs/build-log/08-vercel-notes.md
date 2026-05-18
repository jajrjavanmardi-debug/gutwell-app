---
title: NutriFlow Vercel Notes
tags:
  - nutriflow
  - build-log
  - vercel
---

# NutriFlow Vercel Notes

Public demo: https://gutwell-app.vercel.app

## Vercel Configuration

`vercel.json` configures:

- Install command: `npm install`.
- Build command: `npm run build:web`.
- Output directory: `dist`.
- Clean URLs: enabled.
- Trailing slash: disabled.

## Web Build Path

The Vercel build runs:

```bash
npm run build:web
```

That script runs:

```bash
npx expo export --platform web
```

The static output is served from:

```text
dist
```

## Vercel Environment Variables

Set values in Vercel project settings, not in git:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_GROQ_API_KEY`
- `EXPO_PUBLIC_USDA_API_KEY`

Optional/legacy:

- `GEMINI_API_KEY`

## Demo-Specific Behavior

- Guest mode exists so demo visitors can experience the app without account creation.
- Guest data stays local in the browser.
- Signed-in account data uses Supabase.
- The web demo should remain understandable from the first viewport without relying on native-only functionality.

## Vercel QA Checklist

- Root route loads without blank screen.
- Guest entry works.
- Onboarding and consent work on web.
- Home tab loads after onboarding.
- AI flows show graceful messages if provider env values are missing or rate-limited.
- Static assets load, including icon/splash-generated assets.
- No horizontal overflow at mobile widths.
- Localized UI does not break layout.
- The public demo URL remains reachable: https://gutwell-app.vercel.app

## Common Vercel Failure Modes

- Build fails because asset generation dependencies are missing.
- Build succeeds but runtime API calls fail because env vars are missing in Vercel.
- Supabase URL/key mismatch creates auth failures.
- Static export changes route behavior; test routes after deployment.
- Demo breaks when guest-only paths accidentally depend on signed-in user ids.

## Reusable Vercel Pattern

For future Expo apps:

1. Keep `vercel.json` explicit.
2. Use `npx expo export --platform web`.
3. Serve `dist`.
4. Put every client-exposed value behind `EXPO_PUBLIC_`.
5. Add a guest/demo path if the app otherwise requires auth.
6. Smoke test production, not just local web.

