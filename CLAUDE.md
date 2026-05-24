# NutriFlow Claude Instructions

## Core Workflow

- Work in small, focused tasks.
- Do not combine unrelated tasks.
- Audit first, then propose exact edits, then wait for approval before editing.
- Do not ask the user to relay raw terminal output unless absolutely necessary.
- Run terminal commands yourself when available.
- Summarize findings as:
  1. root cause
  2. files affected
  3. exact anchors
  4. minimal edit plan
  5. risks
  6. verification plan

## Editing Rules

- Do not edit before approval.
- Do not make speculative patches.
- Do not use broad refactors for small bugs.
- Do not touch unrelated files.
- If exact anchors are not known, inspect first.
- If output is truncated, use smaller reads or targeted grep/sed.
- Avoid scripts that modify files unless explicitly approved.
- Read-only scripts are allowed for inspection.
- Edit scripts must fail loudly if anchors are missing.

## Product Rules

- NutriFlow must not rate food.
- Do not show user-facing food scores such as X/10, 4/10, 6/10, 9/10.
- Do not show score bars such as [####------].
- Do not classify food as good or bad.
- Use neutral meal reflection language.
- User-provided meal notes are source of truth.
- If the user names ingredients, treat them as confirmed ingredients.
- Photo recognition may support analysis, but must not override explicit user text.
- Persian must remain natural, RTL-friendly, and must not fall back to English.
- Keep English, German, and Persian support intact.

## Scope Control

Do not touch these unless the current task explicitly requires it:
- Supabase
- auth/session logic
- camera behavior
- voice input
- ingredient confirmation
- daily charts
- ShareCard
- repo docs
- Obsidian vault
- unrelated layout code

## Testing and Verification

After every code edit, run:
- npm run lint
- npm run build:web
- git diff --check
- git status -s
- git diff --name-only

Before commit, report:
- changed files
- exact behavior changed
- checks result
- remaining risks

## Git Rules

- Commit only after user approval.
- Push after committing unless the user says not to.
- Use focused commit messages.
- After push, report:
  - short commit hash
  - git status -s
  - git log -1 --name-status

## Supabase / Backend Rules

If a task touches Supabase functions or backend behavior:
- run relevant lint/tests first
- commit changes
- push to GitHub
- deploy updated Supabase functions/backend changes only after tests pass and after approval

## Security

- Do not expose or print secrets, Supabase tokens, environment variables, private keys, or credentials.
- Do not paste `.env` contents.
- If secrets are needed, ask the user to verify locally without revealing them.

## Documentation / Obsidian

- Repo docs and Obsidian vault are separate.
- Do not update repo docs unless explicitly requested.
- Do not update Obsidian unless explicitly requested.
- Never let Obsidian files leak into the repo.

## Communication Style

- Be concise.
- Do not loop.
- If blocked, state exactly what is blocked and offer one next action.
- Do not repeatedly ask for screenshots, browser access, or copied terminal output if bash can inspect the repo.
