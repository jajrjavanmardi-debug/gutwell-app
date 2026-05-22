# NutriFlow Current State Handover

Date: 2026-05-19

## Project

NutriFlow is an educational gut-health and food-pattern tracking app. It helps users track meals, symptoms, ingredient confirmations, and possible gut-health patterns over time.

NutriFlow is not a medical diagnosis or treatment tool.

## Production

Public demo:

https://gutwell-app.vercel.app

Current production routes verified:
- `/`
- `/photo-analysis`
- `/privacy-policy`
- `/terms-disclaimer`

## Repo

Local repo path:

`~/gut-well/gutwell-app`

Current working branch:

`fix/supabase-rls-auth-bypass-off`

## Current Working Features

- Guest mode works without email/password.
- Progressive onboarding requires only essential first steps before Home.
- Optional profile completion remains available after onboarding.
- Photo Analysis supports Expo Go physical-phone camera capture.
- Web and iOS simulator use upload/demo image fallback.
- Ingredient confirmation appears before final meal estimate.
- User meal notes and confirmed ingredients are intended to override photo guesses.
- Persian, German, and English are supported in core flows.
- Red-flag symptom triage and hard-stop safety flow exist.
- Health-data consent exists before health-related processing.
- Delete-my-data flow exists in Settings/Profile.
- Privacy Policy and Terms/Disclaimer pages exist.
- Photo metadata stripping was added before analysis.
- Softer medical wording and educational estimate language are used.
- Eating-behavior safeguards and low-variety reminders were added.

## Recent Major Improvements

- SecureStore oversized Supabase session issue fixed.
- Guest demo mode added.
- Web guest onboarding flow fixed.
- Supabase explicit Data API grants added.
- German and Persian UI copy polished.
- Red-flag symptom triage added.
- Medical wording softened across app and AI prompts.
- Health-data consent step added.
- Delete-my-data flow added.
- Legal/trust pages added.
- Native camera capture restored for Expo Go.
- Photo EXIF/location metadata stripping added.
- Progressive onboarding added.
- Persian readability and mixed-language issues improved.
- Ingredient confirmation added before meal estimates.
- Meal notes prioritized over image guesses.

## Known Limitations

- Web link currently uses upload/demo fallback, not live native camera.
- Voice input is not implemented yet.
- Ingredient suggestions may still over-assume side ingredients in some cases.
- Correction tone may still need final polish if any screen says detection was wrong.
- Product brand is NutriFlow, but current demo URL still uses `gutwell-app.vercel.app`.
- Legal/privacy pages are MVP-level and not lawyer-reviewed.
- No clinical validation exists.
- No HIPAA, FDA, MDR, CE, or medical-device compliance is claimed.
- No `npm test` script exists in `package.json`.
- TypeScript noEmit may still fail on pre-existing unrelated route/theme/Deno typing issues.

## Current Safety and Privacy Posture

NutriFlow should remain positioned as an educational wellness/pattern-tracking tool.

Current safeguards:
- Red-flag hard-stop
- Medical disclaimer and non-diagnostic wording
- Health-data consent
- Delete-my-data flow
- Privacy Policy and Terms/Disclaimer
- Photo metadata stripping
- Eating-behavior safeguards
- Non-judgmental food language

Do not make stronger medical claims without expert review and validation.

## Marketing Status

Current marketing phase is controlled feedback, not broad public launch.

Recommended positioning:

“NutriFlow is an educational gut-health tracking assistant that helps users explore possible food-symptom patterns over time.”

Avoid:
- “identifies food sensitivities”
- “diagnoses gut problems”
- “treats IBS”
- “improves gut health” as a strong claim

## Do Not Change Casually

- Supabase security/RLS/migration logic
- Red-flag hard-stop behavior
- Medical disclaimers
- Health-data consent
- Delete-my-data flow
- Privacy/Terms copy
- Guest mode flow
- Ingredient confirmation priority rules
- Existing dirty `.gitignore` and `supabase/.temp/*` files unless intentionally scoped
