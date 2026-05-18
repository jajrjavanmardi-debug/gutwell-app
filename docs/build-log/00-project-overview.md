---
title: NutriFlow Project Overview
tags:
  - nutriflow
  - build-log
  - project-overview
---

# NutriFlow Project Overview

NutriFlow is a gut wellness nutrition app built from the `gutwell-app` Expo codebase. The app is branded as NutriFlow in `app.json`, while the repo, package, Expo slug, and public Vercel URL still use the historical GutWell naming.

Public demo: https://gutwell-app.vercel.app

## Product Shape

- Mobile-first Expo Router app for iOS, Android, and web.
- Core loop: user shares symptoms, meals, photos, habits, and check-ins; NutriFlow returns educational nutrition guidance and pattern tracking.
- Primary screens include onboarding, login/guest entry, home nutrition guide, meal photo analysis, food history, quick relief/SOS guidance, settings, progress, and streak experiences.
- Data layer uses Supabase for signed-in accounts and local AsyncStorage-based guest mode for demos.
- AI-assisted guidance uses Groq for localized meal and nutrition coaching, with USDA FoodData Central as the structured food data source.

## Current App Identity

- App name: NutriFlow.
- Expo slug: `gutwell`.
- Package name: `gutwell-app`.
- Bundle/package id: `com.parallellabs.gutwell`.
- Demo deployment: `https://gutwell-app.vercel.app`.

## What The App Is

NutriFlow is an educational, wellness-oriented nutrition guide. It helps people notice food and gut symptom patterns, get gentle nutrition ideas, and understand possible triggers over time.

The app is not a medical device and does not provide diagnosis, treatment, or emergency care. Safety language now repeats this boundary across onboarding, AI outputs, quick relief, and home guidance.

## Main Workstreams

- Product foundation: Expo Router app, theme, core screens, mobile/web routing, and app assets.
- Supabase foundation: profiles, check-ins, food logs, symptoms, reminders, gut scores, health logs, water logs, favorites, streaks, user profile settings, RLS, grants, and deletion support.
- AI nutrition layer: Groq prompts, USDA lookups, fallback recommendations, photo analysis, correction flow, and barcode/product analysis.
- Demo readiness: local guest mode, web onboarding path, public Vercel deployment, demo-facing copy, and feedback sharing.
- Safety/compliance: medical disclaimer, red-flag triage, softened medical wording, health-data consent, data deletion, and least-privilege Supabase access.
- Localization: English, German, and Persian UI/copy passes, including RTL-aware Persian behavior.

## Non-Negotiables

- Do not document private user data, emails, auth ids, project refs, API keys, real health records, or identifiable tester details.
- Keep implementation notes reusable and app-specific.
- Keep Supabase secrets and `.temp` project metadata out of docs and commits.
- Treat health and nutrition guidance as educational pattern support, not medical advice.

## Related Notes

- [[01-tool-stack]]
- [[02-build-timeline]]
- [[03-bugs-fixed]]
- [[06-deployment-notes]]
- [[07-supabase-notes]]
- [[08-vercel-notes]]

