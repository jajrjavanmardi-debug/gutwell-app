# Codex Prompt: Verify & implement the meal_revise prompt change

You are working in the repository **jajrjavanmardi-debug/gutwell-app**
(Expo / React Native / TypeScript + Supabase Edge Functions).

There is a written, reviewed plan. Your job has TWO phases: first VERIFY the plan
against the real code, then IMPLEMENT the corrections.

## Reference files
- Plan:          `docs/plans/2026-06-13-meal-revise-prompt.md` (read this fully first)
- Edge function: `supabase/functions/analyze-food/index.ts` (function `buildMealRevisePrompt`)
- Client screen: `app/photo-analysis.tsx` (the "Apply correction" flow)
- Parsers:       `lib/photo-analysis-history.ts` (`extractMealImpactScore`, `extractMealName`)

## PHASE 1 — CONTROL (verify, do not change code yet)
Read the plan, then confirm against the actual current code:
1. Does the plan's "BEFORE" description still match `buildMealRevisePrompt` (persona,
   prompt body, Germany retail boost, plain-text/ALL-CAPS format, localized footer)?
   Note any line-number drift.
2. Confirm the two regressions the plan calls R1 and R2 are real:
   - **R1:** `extractMealImpactScore` (`lib/photo-analysis-history.ts`) regex-parses "X/10";
     the live score badge is recomputed from the corrected analysis (`app/photo-analysis.tsx`
     ~line 550, rendered ~1464).
   - **R2:** `extractMealName` does not recognize the emoji label "🍽️ MEAL" and falls back to
     the first line (apology), feeding a wrong name into `recordTriggerFeedback`
     (`app/photo-analysis.tsx` ~line 967).
3. List every remaining reference to Persian/Farsi: `"fa"`, `Persian`, `Farsi`, `\u06xx` digits.

Output a short verification report (PASS/FAIL per item) BEFORE writing any code.

## PHASE 2 — CORRECTION (implement)
Create a branch: `feat/meal-revise-prompt-en-de`. Make these changes exactly:

A) Replace `buildMealRevisePrompt`'s persona + prompt with the new 5-section emoji format from the
   plan (🍽️ MEAL / 📊 SCORE / ⚠️ POSSIBLE SENSITIVITY / ✅ BETTER OPTION / ➡️ NEXT STEP), max
   120 words EXCLUDING the safety footer, one short sentence per section, emoji labels only.
   The 📊 SCORE section MUST instruct the model to include an explicit "X/10" value (fixes R1 at the source).

B) Language scope = English + German ONLY. Remove Persian entirely:
   - `normalizeLanguage()`: return `"de" | "en"` only (drop the `"fa"` branch).
   - `DISCLAIMER`: remove the `"fa"` entry. `LANGUAGE_LABEL`: remove `"fa"`. `Language` type: drop `"fa"`.
   - `app/photo-analysis.tsx`: `AppLanguage` -> `'en' | 'de'`; `getCorrectionLanguage` returns en/de only.
   - Remove now-dead Persian/Arabic-Indic digit normalization in `lib/photo-analysis-history.ts`.

C) Fix R1: make `extractMealImpactScore` robust to the new "📊 SCORE" section (keep the X/10 regex,
   verify it matches the new output).
D) Fix R2: make `extractMealName` strip/recognize the "🍽️ MEAL" emoji label so it returns the real
   meal, including when an apology line precedes the sections.

E) Keep the handler, temperature (`0.25`), and `maxOutputTokens` (`4096`) unchanged.

## TESTS (add before finishing)
- Unit test `extractMealImpactScore` on new-format "📊 SCORE" outputs (with and without explicit /10).
- Unit test `extractMealName` on "🍽️ MEAL" output, including the apology-first case.
- Run `npx tsc --noEmit` (no new errors) and `npm test`.

## CONSTRAINTS
- Work on the `feat/` branch only. Do NOT merge, do NOT deploy the edge function.
- Open a Pull Request describing the changes and linking PR #51 (the plan).
- Grep must be clean of `"fa"` / `Persian` / `Farsi` / `\u06xx` before you finish.

## ACCEPTANCE
- 5 emoji sections, ≤120 words excl. footer, EN or DE only.
- Score badge still appears after a correction; trigger-memory meal name is correct.
- `tsc` + tests pass.
