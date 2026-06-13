# Plan: Replace the meal-correction ("meal_revise") prompt

- **Status:** IN REVIEW
- **Type:** Feature / behavior change (prompt rewrite)
- **Date:** 2026-06-13
- **Area:** AI meal photo analysis — the *correction / re-analysis* step
- **Owner:** Hojir

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
If the preferred response language resolves to Persian or Farsi, respond in English instead.
Do not respond in any other language.
Avoid medical diagnosis, treatment claims, or promises of symptom relief.
Do not present your advice as medical treatment, prevention, diagnosis, or guaranteed symptom control.
Your output is shown inside a mobile iOS app, so make the revised report short, calm, and easy to scan on a small screen.
```

### PROMPT (user message)

```
Revise the meal analysis using the ongoing chat context.
Preferred response language: [English / German / Persian].
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
4. No client change is *required* — the sanitizer already strips markdown and
   keeps emojis (verify in §7).

---

## 6. Open questions & decisions (REVIEW FOCUS)

These are real product/policy decisions, not typos. ChatGPT / reviewer should
weigh in before implementation.

### Q1 — Persian users: which language, and which disclaimer footer?
The app today **fully supports Persian/Farsi**: `normalizeLanguage()` returns
`fa`, there is a `DISCLAIMER.fa`, and `LANGUAGE_LABEL.fa = "Persian (Farsi)"`.
The new persona says: *if preferred language resolves to Persian/Farsi, respond
in English instead.*

Conflict: if we still pass `LANGUAGE_LABEL[fa]` ("Persian") into the prompt and
append `DISCLAIMER.fa` (the Persian footer), the model gets contradictory signals
(English body, Persian label, Persian footer).

**Proposed resolution:** when `preferredLanguage === "fa"`, treat it as English
for *this mode only* — pass label `"English"` and append `DISCLAIMER.en`.
→ **Confirm this is the intended behavior**, and confirm it's acceptable that a
Persian-speaking user gets an English correction report (the *initial* analysis
in `meal_text` mode still answers in Persian — this creates a mid-flow language
switch).

### Q2 — Germany retail boost (REWE / Edeka) is dropped
The current prompt force-names REWE/Edeka/Kaufland for German users
(`germanyRetailBoostPrompt()`). The new prompt has no such rule, and the 120-word
cap + "1 sentence per section" leaves little room for store names.
**Decision:** intentionally drop enforced German store names in the revised
report? Or keep a one-line store hint inside `✅ BETTER OPTION` for German
`userLocation`? (Recommend: confirm drop, since brevity is the goal.)

### Q3 — Style mismatch with the initial analysis
The first analysis (`meal_text` mode) is long, plain-text, ALL-CAPS labels, no
emojis. The revised report will now be short with emoji sections. Is this
intentional contrast acceptable, or should the initial analysis eventually adopt
the same 5-section format for consistency? (Out of scope here — flagging only.)

### Q4 — 120-word cap vs. required content
Five sections + optional leading apology + a full disclaimer footer must fit in
120 words. The disclaimer alone is ~25–30 words. Confirm the model is told the
**120-word cap excludes the disclaimer footer**, or relax to ~150 words.
Otherwise sections get squeezed. (Recommend: state "max 120 words excluding the
safety footer.")

---

## 7. Risks & regressions

- **Renderer compatibility:** client sanitizer (`app/photo-analysis.tsx` ~379–396)
  strips `#`, `**`, `*`, `_`, and bullet markers but does **not** strip emoji →
  `🍽️ MEAL` etc. survive. ✅ Low risk, but **verify** no other transform
  uppercases or reflows the text.
- **Section-label dependence:** check nothing downstream parses the old ALL-CAPS
  labels (search for `MEAL`, `SCORE`, `toUpperCase`, section splitting). If a
  history/export feature keys off labels, emoji labels could break it.
  (`lib/photo-analysis-history.ts`, `lib/export.ts` — verify.)
- **Persian regression:** see Q1 — silent behavior change for fa users.
- **Lost German store specificity:** see Q2.
- **Over-truncation:** 1 sentence per section may drop the safer "Plan B" detail
  the old prompt guaranteed for pain symptoms. Confirm `⚠️ POSSIBLE SENSITIVITY`
  + `➡️ NEXT STEP` cover the pain-comfort case adequately.

---

## 8. Verification checklist (for the implementation PR)

- [ ] `npx tsc --noEmit` shows no new errors.
- [ ] Manual: correct a meal → output has exactly the 5 emoji sections, ≤120 words,
      ends with the correct localized disclaimer.
- [ ] EN correction → English report. DE correction → German report.
- [ ] FA preferred → English report + footer per Q1 decision.
- [ ] "different food" correction (e.g. "it's herbal tea") → old food fully dropped.
- [ ] Pain/IBS correction → no banned high-FODMAP suggestions; gentle Plan B present.
- [ ] Emoji labels render correctly in the app (not stripped, not mojibake).
- [ ] No downstream parser breaks on the new labels (history, export, widget).

---

## 9. Decision log

_(Fill in as reviewers respond.)_

- Q1: _pending_
- Q2: _pending_
- Q3: _pending_
- Q4: _pending_
