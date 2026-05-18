---
title: NutriFlow Feedback Log
tags:
  - nutriflow
  - build-log
  - feedback
---

# NutriFlow Feedback Log

This file captures product and QA feedback themes without recording private user data, tester identities, emails, auth ids, or real health records.

## Feedback Themes

### The demo needed a no-account path

- Signal: sharing the app for feedback was harder when every tester needed a Supabase account first.
- Response: local guest demo mode and web guest onboarding flow.
- Reusable action: build demo mode early for apps with auth-heavy onboarding.

### Copy needed to feel premium but not medical

- Signal: health-adjacent wording can easily sound diagnostic or overly clinical.
- Response: medical copy softened; disclaimers made consistent; AI output boundaries clarified.
- Reusable action: run a "no diagnosis, no treatment, no cure" copy pass before demos.

### Urgent symptoms needed a clearer boundary

- Signal: routine nutrition suggestions are inappropriate for severe or unusual symptoms.
- Response: shared red-flag triage and quick medical-care guidance.
- Reusable action: put safety triage before recommendation generation.

### Multilingual polish mattered

- Signal: German and Persian needed direct copy review rather than automatic-feeling translations.
- Response: German/Persian UI copy polish and RTL-aware screens.
- Reusable action: test every high-value flow in each supported language, including mobile widths.

### Symptom-only AI guidance needed restraint

- Signal: when users asked about symptoms without naming a meal, food-specific recommendations felt invented.
- Response: specific-food detection and symptom-only guidance.
- Reusable action: add input classification before AI calls.

### Mobile demo layouts needed tighter QA

- Signal: small screens exposed overflow and oversized action problems.
- Response: horizontal overflow fixes and compact SOS action.
- Reusable action: inspect mobile viewport after every copy-heavy or localization-heavy change.

### Trust features needed to be visible

- Signal: users needed to understand why NutriFlow's answers were educational and how data was handled.
- Response: premium analysis trust UI, health-data consent, data deletion flow, data source note, and disclaimers.
- Reusable action: surface trust and control features in product flows, not only legal documents.

## Feedback Capture Template

Use this template for future feedback without storing identifying data:

```md
## YYYY-MM-DD Feedback Theme

- Source type: demo, QA, design review, support, or self-audit.
- Flow: onboarding, home, photo analysis, relief, settings, deployment, auth, or data.
- Observation: anonymized behavior or friction.
- Risk: user confusion, safety, privacy, conversion, reliability, accessibility, or polish.
- Response: code/docs/product change.
- Follow-up: what still needs verification.
```

## Data Hygiene Rules

- Do not paste real symptom journals, meal logs, screenshots with personal data, auth ids, emails, Supabase project refs, or API keys.
- Rewrite feedback as themes, not transcripts.
- Prefer flow-level examples such as "symptom-only prompt" instead of real user wording.
- If a screenshot is needed later, sanitize visible account and health details first.

