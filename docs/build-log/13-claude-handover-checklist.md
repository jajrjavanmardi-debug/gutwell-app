# Claude Handover Checklist

Date: 2026-05-19

This checklist is for any AI agent or developer resuming work on NutriFlow. Read it before making changes. For project context, see `11-current-state-handover.md` and `12-next-steps-roadmap.md`.

## Start Work Safely

Always start from the real repo:

```bash
cd ~/gut-well/gutwell-app
pwd
git branch --show-current
git status -sb
git log -5 --oneline
```

Confirm before doing anything:
- `pwd` is `~/gut-well/gutwell-app`.
- The branch is the intended working branch (currently `fix/supabase-rls-auth-bypass-off`).
- You understand any uncommitted changes already in the working tree.
- You are not about to commit unrelated work-in-progress.

## Orient Before Editing

Read these first, in order:
1. `docs/build-log/11-current-state-handover.md` — what works now and what does not.
2. `docs/build-log/12-next-steps-roadmap.md` — what to do next and what to avoid.
3. `docs/build-log/00-project-overview.md` — product shape and non-negotiables.
4. The relevant numbered build-log note for the area you are touching (Supabase, Vercel, bugs, deployment).

Do not assume project state from memory. The build log is the source of truth.

## Verify The App Is Healthy

Run these and confirm they pass before and after changes:

```bash
npm run lint
npm run build:web
```

Expected baseline:
- `npm run lint` exits 0. Pre-existing warnings (unused vars, `react-hooks/exhaustive-deps`) are acceptable; new errors are not.
- `npm run build:web` exits 0 and exports static routes to `dist/`.
- There is no `npm test` script. Do not assume automated tests exist.

Check production routes are still reachable:

```bash
curl -I https://gutwell-app.vercel.app/
curl -I https://gutwell-app.vercel.app/photo-analysis
curl -I https://gutwell-app.vercel.app/privacy-policy
curl -I https://gutwell-app.vercel.app/terms-disclaimer
```

All four should return HTTP 200.

## Environment And Secrets

- Required env names: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_GROQ_API_KEY`, `EXPO_PUBLIC_USDA_API_KEY`. Optional/legacy: `GEMINI_API_KEY`.
- Values live in local `.env` and Vercel project settings only. Never commit values.
- Never commit `supabase/.temp/*` metadata (project ref, pooler URL, version files).
- Never put project refs, API keys, auth user ids, emails, or real health records in docs or commits.

## Conventions To Follow

- Localization: update English, German, and Persian together. Check Persian RTL and mobile width after copy changes.
- Safety first: red-flag triage must run before any AI generation. Keep medical disclaimers and non-diagnostic wording.
- Guest mode stays local-only. It must never write to Supabase.
- Ingredient confirmation priority: user meal notes > confirmed ingredients > selected context > photo guess.
- AI flows need graceful educational fallbacks for missing keys, bad responses, rate limits, and network failures.
- Keep the NutriFlow brand name consistent in user-facing copy.

## Do Not Change Casually

These areas need extra care and usually a clear reason:
- Supabase security, RLS policies, grants, and migration logic.
- Red-flag hard-stop behavior.
- Medical disclaimers and consent copy.
- Health-data consent flow.
- Delete-my-data flow.
- Privacy Policy and Terms/Disclaimer copy.
- Guest mode flow.
- Ingredient confirmation priority rules.

## Before You Commit

- Run `git status -s` and `git diff --cached --name-only`. Know exactly what is staged.
- Stage files explicitly with `git add <paths>`. A commit with nothing staged does nothing.
- The commit message must describe the actual staged changes. Do not reuse a planned message that no longer matches.
- Do not stage `supabase/.temp/*` files or any secrets.
- Re-run `npm run lint` and `npm run build:web` if runtime code changed. Docs-only changes do not need them.

## Commit And Push Safely

- Confirm the branch is correct before pushing.
- Prefer a new fix commit over force-pushing.
- Capture the short hash and final status after pushing:

```bash
git commit -m "<accurate message>"
git push
git rev-parse --short HEAD
git status -s
```

## When Unsure

- Stop and ask rather than guessing on safety, privacy, auth, Supabase, or medical wording.
- If a requested change conflicts with the safety posture in `11-current-state-handover.md`, raise it before proceeding.
- If a commit message and the actual changes do not match, fix the mismatch before committing.
