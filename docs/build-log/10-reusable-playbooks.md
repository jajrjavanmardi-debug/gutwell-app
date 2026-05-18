---
title: NutriFlow Reusable Playbooks
tags:
  - nutriflow
  - build-log
  - playbooks
---

# NutriFlow Reusable Playbooks

## Playbook: Expo App To Public Web Demo

1. Confirm app works locally with `npm install` and `npm run web`.
2. Add or verify `npm run build:web` using `npx expo export --platform web`.
3. Add explicit Vercel config with `outputDirectory` set to `dist`.
4. Configure Vercel env vars using `EXPO_PUBLIC_` names for client-side values.
5. Add a guest/demo path if the app requires auth.
6. Deploy with `npm run deploy:web`.
7. Smoke test production on mobile and desktop.

## Playbook: Supabase RLS Hardening

1. List every table the app reads or writes.
2. Confirm every user-owned table has RLS enabled.
3. Confirm policies use `auth.uid()` and the correct owner column.
4. Grant only required privileges to `authenticated`.
5. Revoke anon access for user-owned tables.
6. Grant sequence access only when authenticated inserts require it.
7. Test through real Supabase Auth, not a bypass.
8. Keep project refs, keys, and `.temp` metadata out of git.

## Playbook: Health Safety Pass

1. Search for medical verbs and strong claims.
2. Replace diagnosis/treatment/cure language with educational pattern-tracking language.
3. Add disclaimers close to AI output and health guidance.
4. Add red-flag detection before AI calls.
5. Keep urgent-care guidance short, visible, and not blocked by consent.
6. Verify all supported languages carry the same safety boundary.

## Playbook: AI Nutrition Flow

1. Validate user input is non-empty.
2. Detect red-flag symptoms first.
3. Classify whether a specific food was named.
4. Fetch structured food data only when useful.
5. Pass language, symptoms, user corrections, and context into the model.
6. Tell the model not to diagnose, treat, cure, or overclaim.
7. Add fallbacks for missing keys, invalid responses, rate limits, and network failure.
8. Store only the user-owned history needed by the product.

## Playbook: Guest Demo Mode

1. Create a local-only guest profile.
2. Store guest onboarding answers locally.
3. Keep guest consent local.
4. Do not write guest data to Supabase.
5. Clearly label guest/demo mode in UI copy.
6. Provide a deletion/reset path for local guest data.
7. Verify guest mode on web after deployment.

## Playbook: Data Deletion

1. Inventory local storage keys and prefixes.
2. Inventory every user-owned remote table.
3. Add delete policies and grants where missing.
4. Delete user-owned rows table by table.
5. Reset profile fields that should remain as an account shell.
6. Preserve non-personal preferences only when intentional, such as language.
7. Return partial failures clearly enough to debug without exposing private data.

## Playbook: Localization And RTL QA

1. Update all supported languages in the same change.
2. Keep brand names consistent.
3. Avoid leaving English fallback labels in user-facing localized UI.
4. Test mobile widths after copy changes.
5. Verify RTL alignment for Persian.
6. Re-check safety copy in every language.

## Playbook: Build Log Update

1. Record what changed.
2. Record why it changed.
3. Record the reusable lesson.
4. Link to relevant files or migrations by filename only.
5. Avoid private user data, emails, auth ids, real health records, secrets, and project refs.
6. Add follow-up checks if the item affects deployment, privacy, safety, or auth.

