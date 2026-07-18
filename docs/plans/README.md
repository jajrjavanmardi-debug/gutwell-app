# docs/plans — Task plans for review

This folder holds **written plans** for bug fixes and new features in GutWell.

## Workflow

1. **Plan** — a task is described here as a Markdown file *before* any code is changed.
2. **Review** — the plan is read and checked (by ChatGPT, a human, or another tool). Reviewers can comment on the Pull Request or edit the file directly.
3. **Implement** — only after the plan is agreed on does the actual code change happen, in a separate PR that links back to the plan.

The point: catch wrong assumptions, missing edge cases, and product/policy decisions **on paper** — before writing code.

## How to read a plan (for reviewers / ChatGPT)

Each plan tells you:

- **What** changes and **why**.
- **Where** in the codebase (exact file, function, line numbers at time of writing).
- **Before / After** behavior.
- **Open questions & decisions** — the part that most needs a second opinion.
- **Risks & regressions** — things that could break.
- **Verification checklist** — how we'll know it works.

When reviewing, focus on the **Open questions** and **Risks** sections. Confirm the
"Before" description matches the real code (line numbers may have drifted), and
push back on any decision that looks like a product/policy change rather than a
pure bug fix.

## Naming

`YYYY-MM-DD-short-slug.md` — e.g. `2026-06-13-meal-revise-prompt.md`.

## Status legend

Each plan has a status near the top:

- `DRAFT` — being written, not ready for review.
- `IN REVIEW` — ready for ChatGPT / human review.
- `APPROVED` — agreed; ready to implement.
- `IMPLEMENTED` — code merged; link the implementation PR.
