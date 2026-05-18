---
title: NutriFlow Tool Stack
tags:
  - nutriflow
  - build-log
  - tools
---

# NutriFlow Tool Stack

## App Framework

- Expo SDK 54.
- React 19 and React Native 0.81.
- Expo Router for file-based navigation.
- TypeScript with typed routes enabled.
- React Native Web for the Vercel-hosted web demo.
- Expo static export for web deployment.

## UI And Native Capabilities

- `@expo/vector-icons` for icons.
- `react-native-svg` and `victory-native` for charts.
- `lottie-react-native` for milestone animations.
- Expo Image Picker, File System, SecureStore, Location, Haptics, Sharing, Web Browser, and Store Review.
- Native widget support through `react-native-widget-extension` and files under `widgets/`.
- App assets generated through `scripts/generate-assets.mjs`.

## Data And Auth

- Supabase JavaScript client.
- Supabase Auth with PKCE flow.
- Supabase Postgres migrations under `supabase/migrations/`.
- RLS policies for user-owned rows.
- Explicit authenticated Data API grants.
- AsyncStorage for local app state, guest mode, cached consent, and non-secret data.
- SecureStore for native auth values, with AsyncStorage fallback for oversized session payloads.

## AI And Nutrition Data

- Groq chat completions for nutrition coaching, meal photo analysis, correction flows, and barcode/product analysis.
- USDA FoodData Central API for structured food and nutrient data.
- Older Gemini code remains present, but current recommendation and photo flows are centered around Groq.
- Fallback nutrient and recommendation logic keeps the app useful when AI keys are missing or providers fail.

## Safety And Privacy Systems

- Red-flag symptom detection in `lib/red-flag-triage.ts`.
- Health-data consent in `lib/health-data-consent.ts`.
- Data deletion in `lib/delete-user-data.ts`.
- Medical disclaimer copy across onboarding, home, AI outputs, and quick relief.
- Guest mode stores demo data locally rather than writing public/demo data to Supabase.

## Deployment Tooling

- `npm run build:web` runs `npx expo export --platform web`.
- `npm run deploy:web` runs `npx vercel --prod`.
- `vercel.json` configures install, build, output directory, clean URLs, and slash behavior.
- Public demo: https://gutwell-app.vercel.app

## Quality Tools

- `npm run lint` runs `expo lint`.
- Manual mobile and web QA has been important for overflow, RTL, and demo flow issues.
- Git history is a useful source of build timeline and bug-fix context.

## Key Environment Variable Names

Do not commit values. These names are safe to document:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_GROQ_API_KEY`
- `EXPO_PUBLIC_USDA_API_KEY`
- `GEMINI_API_KEY` if legacy Gemini paths are used

