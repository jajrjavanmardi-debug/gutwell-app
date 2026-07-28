# Plan: Replace the meal-correction ("meal_revise") prompt

- **Status:** IN REVIEW
- **Type:** Feature / behavior change (prompt rewrite)
- **Date:** 2026-06-13 (updated 2026-06-13: language scope + review findings)
- **Area:** AI meal photo analysis — the *correction / re-analysis* step
- **Owner:** Hojir

> **Scope decision (2026-06-13):** Persian (Farsi) is **removed** from this app.
> Supported languages are **English + German only**. This supersedes the original
> "respond in English when Persian is requested" wording — Persian is dropped
> entirely, not redirected. German is kept because it is the core market
> (README: Nürtingen / Baden-Württemberg, REWE/Edeka). See §6 Q1 (resolved).

---

## 1. Summary

When a user rates / corrects a meal analysis (the "Apply correction" flow in the
photo-analysis wizard), the app calls the Supabase edge function in
`meal_revise` mode. That mode builds an AI prompt that decides how the **revised**
report reads.

We want to **replace the current `meal_revise` prompt** (both the persona and the
prompt body) with a new prompt that produces a **short, scannable, 5-section
report with emoji labels** and a **120-word cap**, tuned for a small iOS screen.

This document is the plan only. **No code is changed in this PR.** Implementation
follows in a separate PR once this is approved.

---

## 2. Where this lives in the code

| Thing | Location |
|---|---|
| Prompt builder to replace | `supabase/functions/analyze-food/index.ts` → `buildMealRevisePrompt()` |
| Function lines (at time of writing) | ~`317`–`389` |
| Handler that calls it | same file, `case "meal_revise"` → ~`766`–`779` |
| Model call | `callGemini(...)`, `temperature: 0.25`, `maxOutputTokens: 4096` |
| Shared disclaimer strings | `DISCLAIMER` (en/de/fa), ~`141`–`148` |
| Language label map | `LANGUAGE_LABEL` (en/de/fa), `150` |
| Language normalizer | `normalizeLanguage()` → returns `de | fa | en`, ~`58`–`60` |
| Client that sends the request | `app/photo-analysis.tsx` (`applyCorrection` flow, ~`929`) |
| Client output sanitizer | `app/photo-analysis.tsx`, ~`379`–`396` — strips markdown, **keeps emojis** |

> Reviewer note: confirm these line numbers still match `main` — they drift.

---

## 3. Current behavior (BEFORE)

`buildMealRevisePrompt()` returns `{ persona, prompt }`. Today it:

- **Persona:** friendly gut-health coach; apologize first on a misunderstanding;
  *responds in English, German **or Persian (Farsi)***; no medical claims.
- **Prompt body:** revise using chat context; injects gut score, conditions,
  symptoms, `userLocation`; lists prior corrections; includes the previous AI
  analysis and the latest correction; correction-priority rules; IBS/bloating
  food rules.
- **Germany retail boost:** when `userLocation` looks German, it injects a
  *mandatory* rule to name **REWE and Edeka** (plus Kaufland) for store
  suggestions (`germanyRetailBoostPrompt()`).
- **Format:** *plain text only, ALL-CAPS section labels, no emojis, no markdown,
  no fixed length.*
- **Footer:** exact localized `DISCLAIMER[preferredLanguage]`.

So today: free-form, possibly long, plain-text, Persian supported, German store
names enforced.

---

## 4. New prompt (AFTER) — verbatim

The new prompt to install (persona = system instruction, prompt = user message).
Bracketed `[...]` tokens are variables the builder must interpolate from
`MealReviseBody`.

### PERSONA (system instruction)

```
You are a friendly, informal gut-health coach correcting a prior meal analysis.
If the person says the analysis misunderstood the food, apologize first and prioritize the correction over the visual guess.
Only respond in English or German.
Do not respond in any other language.
Avoid medical diagnosis, treatment claims, or promises of symptom relief.
Do not present your advice as medical treatment, prevention, diagnosis, or guaranteed symptom control.
Your output is shown inside a mobile iOS app, so make the revised report short, calm, and easy to scan on a small screen.
```

### PROMPT (user message)

```
Revise the meal analysis using the ongoing chat context.
Preferred response language: [English / German].
Current gut score: [X/10].
Known conditions: [IBS, Bloating, etc.].
Current symptoms: [IBS, Bloating, user-typed symptoms].
userLocation (ground all revised store suggestions in this variable): [city | retail area]

[If previous corrections exist in this session:]
Earlier user corrections this session (oldest first). Each one overrides image guesses and earlier AI text about what the meal was:
1. [first correction the user submitted]
2. [second correction the user submitted]

Previous AI analysis:
[the full original analysis text]

Latest user correction or new detail (highest priority — what they mean now):
[what the user just typed or spoke into the correction field]

Correction rules:
* ABSOLUTE PRIORITY: Everything the user typed or spoke in the correction fields overrides any meal identity from the image or from the previous analysis. Rebuild the meal description from user words first.
* The correction from the user is more reliable than the first visual guess. If the user says it is tea, herbal tea, soup, etc., stop discussing the previous guessed food and re-analyze the corrected food.
* If the user says "you misunderstood", "that is wrong", or gives a correction, apologize immediately in English or German before the revised advice.
* If the correction names a different food, completely clear the old meal context and do not mention the previous guessed food.
* Preserve useful context from the photo and prior analysis only when it does not conflict with the correction and only when the user is discussing the same food.
* For IBS/bloating, do not suggest brown rice, barley bread, barley, or high-fiber whole grains. Prefer white rice, boiled potatoes, zucchini, carrots, peppermint tea, ginger tea, or low-FODMAP soup.
* Do not claim that a food will treat, cure, prevent, or reliably stop symptoms.
* Use cautious comfort language such as "may feel gentler", "could be easier", "possible sensitivity", or "might be worth reducing".
* Do not use strong medical wording such as "treatment", "diagnosis", "cure", "safe", "unsafe", or "medically recommended".

Output format rules:
* Use plain text only.
* Do not use any markdown syntax.
* Forbidden: #, ##, ###, *, **, _.
* Emojis are allowed because they are plain text.
* Use exactly the 5 section labels listed below.
* Do not add extra sections.
* Do not remove sections.
* Do not rename the section labels.
* Use exactly one emoji at the start of each section label.
* Do not use emojis inside the body text.
* Never use an emoji as the only carrier of meaning. The text must always explain the meaning.
* Keep the full answer short: maximum 120 words.
* Keep each section to 1 short sentence.
* Avoid long explanations.
* Avoid numbered lists.
* Avoid bullet points.
* Keep the tone warm, practical, and calm.
* Write for iOS Dynamic Type readability: short lines, simple wording, no dense paragraphs.

Required output structure:
If an apology is required, put it first in one short sentence before the sections.
🍽️ MEAL
Briefly state the corrected meal or drink based on the user correction.
📊 SCORE
Give the revised Meal Impact Score using the current gut score context and explain it briefly.
⚠️ POSSIBLE SENSITIVITY
Name the likely comfort issue in plain language. If uncertain, say so clearly.
✅ BETTER OPTION
Suggest one gentler alternative or one small adjustment that fits the corrected meal.
➡️ NEXT STEP
Give exactly one practical next step the user can do today.
End with this exact safety footer: [localized medical disclaimer]
```

---

## 5. Implementation spec (for the follow-up PR)

Rewrite `buildMealRevisePrompt(body)` so that:

1. **Persona** = the new PERSONA block above (joined string).
2. **Prompt** = the new PROMPT block, interpolating the existing variables:
   - `Preferred response language` ← `LANGUAGE_LABEL[preferredLanguage]`
   - `Current gut score` ← `gutScoreSummary`
   - `Known conditions` ← `conditions.join(", ")` or `not provided`
   - `Current symptoms` ← `symptoms.join(", ")` or `not provided`
   - `userLocation` ← existing `userLocation` string
   - prior corrections block ← existing `prior` array logic (keep numbering)
   - `Previous AI analysis` ← `previousAnalysis`
   - `Latest user correction` ← `correction`
   - footer ← `DISCLAIMER[preferredLanguage]` **(but see Open Question Q1)**
3. Keep the handler, token budget (`maxOutputTokens: 4096`), and temperature
   (`0.25`) unchanged. 120 words fits easily; no budget change needed.
4. No client change is *required for rendering* — the sanitizer already strips
   markdown and keeps emojis (verify in §7). **But two parsers DO need changes —
   see §7 Risks R1/R2.**

### 5a. Language scope change (Persian removal — EN + DE only)

Companion change, can land in the same implementation PR:

- `normalizeLanguage()` (~`58`–`60`): return `"de" | "en"` only — drop the `fa`
  branch (anything not `de` → `en`).
- `DISCLAIMER` (~`141`–`148`): remove the `fa` entry.
- `LANGUAGE_LABEL` (`150`): remove `fa`.
- `Language` type: drop `fa`.
- `app/photo-analysis.tsx`: `AppLanguage` (`:50`) → `'en' | 'de'`;
  `getCorrectionLanguage()` (~`:418`) returns `en`/`de` only.
- `lib/photo-analysis-history.ts`: the Persian/Arabic-Indic digit normalization in
  `normalizeDigits` becomes dead for this path — harmless to keep, but may be
  removed for clarity.
- Grep for remaining `"fa"`, `Persian`, `Farsi`, `\u06`, `\u066` before merging.

---

## 6. Open questions & decisions (REVIEW FOCUS)

These are real product/policy decisions, not typos. ChatGPT / reviewer should
weigh in before implementation.

### Q1 — Persian users: which language? ✅ RESOLVED (2026-06-13)
**Decision: Persian is removed from the app entirely. Supported languages are
English + German only.** This is cleaner than the original "redirect Persian to
English" idea: there is no Persian label/footer/digit handling left to contradict
anything. Implementation is the §5a language-scope change. German is **kept** (core
market). No mid-flow language switch remains, because `fa` is no longer a possible
state.

### Q2 — Germany retail boost (REWE / Edeka) is dropped ✅ RESOLVED (2026-06-13)
**Decision: drop the enforced REWE/Edeka boost in the revised report.** Brevity
(120 words, 1 sentence/section) wins. Store grounding still flows implicitly via
the `userLocation` line, so the model can name a local store in `✅ BETTER OPTION`
when it fits — it just isn't forced. The full localized boost remains on the
initial `meal_text` analysis. Implemented in PR #52 (`germanyRetailBoostRevise`
removed from `buildMealRevisePrompt`).

### Q3 — Style mismatch with the initial analysis ✅ RESOLVED (2026-06-13)
**Decision: accept the contrast for now.** The correction report is intentionally
short/emoji; the initial analysis stays long/plain-text. Aligning the initial
analysis to the 5-section format is **deferred** (separate future task), not done
in PR #52. Flagged so it isn't mistaken for an oversight.

### Q4 — 120-word cap vs. required content ✅ RESOLVED (2026-06-13)
**Decision: "maximum 120 words, excluding the safety footer."** Implemented in
PR #52 with that exact wording, so the five sections aren't squeezed by the
~25–30-word disclaimer.

---

## 7. Risks & regressions

> Updated after review (2026-06-13). Two label/format dependencies were **found
> and confirmed in code** — they were not hypothetical. They MUST be fixed before
> or with implementation.

- **R1 — Score badge regression (CONFIRMED, high).** `extractMealImpactScore`
  (`lib/photo-analysis-history.ts:40`) regex-parses the score from the analysis
  text: `…score… (\d{1,2})\s*(?:/|out of)\s*10`. The live badge is recomputed from
  the *corrected* text (`app/photo-analysis.tsx:550`, rendered `:1464–1472`). The
  new `📊 SCORE` section ("explain briefly", 1 sentence) does **not** guarantee a
  literal `X/10`. If the model writes "this looks fairly gentle", the score parse
  returns `null` and **the badge disappears after a correction**.
  → Fix: require an explicit `X/10` in the `📊 SCORE` section **and/or** make the
  parser label-aware. Add a unit test.
- **R2 — Meal-name regression (CONFIRMED, high).** `extractMealName`
  (`lib/photo-analysis-history.ts`) finds a line matching `^(likely meal|meal|food)`
  after stripping leading `-*•#` — **emoji are not stripped**, so `🍽️ MEAL` does
  not match. It then falls back to `cleanedLines[0]`, which in the new format is
  *the leading apology sentence or the literal `🍽️ MEAL` label*. That wrong value
  is fed to `recordTriggerFeedback({ mealName: extractMealName(correctedAnalysis) })`
  (`app/photo-analysis.tsx:967`). → Fix: make `extractMealName` strip/recognize the
  `🍽️ MEAL` label. Add a unit test incl. the apology-first case.
- **Renderer compatibility (low).** Client sanitizer (`app/photo-analysis.tsx`
  ~379–396) strips `#`, `**`, `*`, `_`, bullets but **keeps emoji** → `🍽️ MEAL`
  etc. survive. Share/Copy/Export pass the whole sanitized text, so they are safe.
  No widget dependency on the analysis text was found.
- **Lost German store specificity:** see Q2 (still open).
- **Over-truncation:** 1 sentence per section may drop the safer "Plan B" detail
  the old prompt guaranteed for pain symptoms. Confirm `⚠️ POSSIBLE SENSITIVITY`
  + `➡️ NEXT STEP` cover the pain-comfort case adequately. Note: `ensurePainApology`
  (`app/photo-analysis.tsx`) still prepends an apology, which interacts with R2.
- **Persian:** resolved — removed entirely (see Q1, §5a). No `fa` regression remains.

---

## 8. Verification checklist (for the implementation PR)

- [ ] `npx tsc --noEmit` shows no new errors.
- [ ] **R1 unit test:** `extractMealImpactScore` returns a score for new-format
      `📊 SCORE` outputs (with and without explicit `/10`).
- [ ] **R2 unit test:** `extractMealName` returns the real meal for `🍽️ MEAL`
      output, including the apology-first case.
- [ ] Manual: correct a meal → output has exactly the 5 emoji sections, ≤120 words
      (excluding footer), ends with the correct localized disclaimer.
- [ ] EN correction → English report. DE correction → German report.
- [ ] Persian fully removed: no `"fa"`, `Persian`, `Farsi`, or `\u06xx` digit
      handling remains (grep clean); `AppLanguage`/`Language` are `'en' | 'de'`.
- [ ] "different food" correction (e.g. "it's herbal tea") → old food fully dropped.
- [ ] Pain/IBS correction → no banned high-FODMAP suggestions; gentle Plan B present.
- [ ] Emoji labels render correctly in the app (not stripped, not mojibake).
- [ ] Score badge still shows after a correction (R1); trigger-memory meal name is
      correct (R2).

---

## 9. Decision log

- **Language scope (2026-06-13):** EN + DE only. **Persian removed** entirely
  (not redirected). German kept (core market). → drives Q1 + §5a.
- **Q1 (2026-06-13): RESOLVED** — Persian removed; no language-switch / footer
  conflict remains.
- **Review (2026-06-13):** panel review (Cagan / Beck / Majors) → *APPROVE WITH
  CHANGES*. Confirmed two real regressions R1 (score badge) and R2 (meal name);
  folded into §7. Mandatory before implementation: fix R1+R2 with unit tests.
- **Q2 (2026-06-13): RESOLVED** — drop the enforced REWE/Edeka boost in the revised
  report; store grounding stays implicit via `userLocation`. Done in PR #52.
- **Q3 (2026-06-13): RESOLVED** — accept the style contrast; aligning the initial
  analysis is deferred to a separate task.
- **Q4 (2026-06-13): RESOLVED** — "max 120 words, excluding the safety footer." Done in PR #52.
- **Implementation (2026-06-13):** PR #52 (`feat/meal-revise-prompt-en-de`) — new
  prompt, EN+DE only, R1/R2 parser fixes + unit tests (11/11 logic checks pass).
- **Deploy strategy (2026-06-13):** server + client are coupled — deploying the
  edge function to production alone would break the currently-released app (old
  parsers can't read the new emoji format). Plan: deploy to a **Supabase preview
  branch** for testing; promote to production only together with the app release.
