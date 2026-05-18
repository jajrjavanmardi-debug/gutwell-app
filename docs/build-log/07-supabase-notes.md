---
title: NutriFlow Supabase Notes
tags:
  - nutriflow
  - build-log
  - supabase
---

# NutriFlow Supabase Notes

## Role In The App

Supabase supports signed-in NutriFlow accounts:

- Auth sessions.
- Profiles and onboarding state.
- Check-ins, food logs, symptoms, reminders, gut scores, health logs, water logs, favorites, streaks, and profile settings.
- Health-data consent for signed-in users.
- User-owned data deletion.

Guest demo mode is intentionally local-only and should not create public/demo rows in Supabase.

## Client Setup

Main client files:

- `lib/supabase.ts`
- `lib/supabaseClient.ts`

Important client behavior:

- Requires Expo public Supabase env variables.
- Normalizes Supabase URL and anon key.
- Rejects placeholder values.
- Checks that Supabase URL and anon key appear to belong to the same project.
- Uses PKCE auth flow.
- Uses localStorage on web.
- Uses SecureStore on native for small auth values.
- Moves oversized native auth session values to AsyncStorage with a SecureStore pointer.

## Migration Themes

- `001_full_schema.sql`: profile, check-in, food log, symptoms, reminders, gut scores, RLS, profile trigger, and indexes.
- `002_features.sql`: feature tables and related schema expansion.
- `003_delete_account.sql`: user account/data deletion function.
- `004_water_intake.sql`: water tracking.
- `005_streaks_table.sql`: streak data.
- `006_checkins_unique_user_entry_date.sql`: daily check-in uniqueness.
- `007_health_logs.sql`: AI meal/health analysis logs and deletion support.
- `008_user_profiles.sql`: user profile table and own-row policies.
- `009_user_profiles_onboarding_columns.sql`: onboarding profile columns.
- `010_auth_profile_persistence.sql`: profile persistence reliability and RLS repairs.
- `20260511123000_user_profile_settings_columns.sql`: settings/profile columns.
- `20260516123000_explicit_data_api_grants.sql`: explicit authenticated Data API grants and anon revokes.
- `20260518103000_health_data_consent.sql`: consent columns.
- `20260518110000_data_deletion_own_rows.sql`: delete-own policies for gut scores and streaks.

## RLS And Grants

NutriFlow uses a layered model:

- RLS policies enforce `auth.uid()` ownership.
- Authenticated role grants allow app access to intended tables.
- Anon grants are revoked for user-owned tables.
- Sequence access is granted only where authenticated inserts require it.

Reusable principle: never treat grants as a replacement for RLS, and never treat RLS as a replacement for grants.

## Health-Data Consent

Files:

- `lib/health-data-consent.ts`
- `supabase/migrations/20260518103000_health_data_consent.sql`

Behavior:

- Consent version is `2026-05-18`.
- Local consent is cached in AsyncStorage.
- Signed-in users sync consent to `user_profiles`.
- Guest users store consent locally only.
- Emergency guidance remains available even if consent has not been accepted.

## Data Deletion

Files:

- `lib/delete-user-data.ts`
- `supabase/migrations/20260518110000_data_deletion_own_rows.sql`

Behavior:

- Guest deletion clears local app keys and `gutwell_` local prefixes while preserving language.
- Signed-in deletion removes user-owned rows from app tables and resets profile fields.
- Missing delete grants/policies were added for `gut_scores` and `streaks`.

## Common Supabase Issues And Fixes

- Env values missing from Expo bundle: use `EXPO_PUBLIC_` prefixes.
- Placeholder credentials: fail fast with a clear setup message.
- Wrong anon key for project URL: decode/check project ref where possible.
- RLS hidden by test bypass: test through real Supabase Auth sessions.
- Schema drift: add migrations and compatibility fallbacks.
- Data API default changes: add explicit grants and anon revokes.
- Supabase `.temp` metadata: keep out of docs and commits.

## Safe Documentation Boundary

Safe to document:

- Table names.
- Migration filenames.
- Env variable names.
- Access model and policies at a high level.

Do not document:

- Project refs.
- API keys.
- Auth user ids.
- Emails.
- Row-level user data.
- Real health records.

