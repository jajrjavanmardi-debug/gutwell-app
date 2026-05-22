# NutriFlow Next Steps Roadmap

Date: 2026-05-19

## Immediate Product Fixes

### 1. Prevent Ingredient Over-Assumption

Problem:
The app may still add common side ingredients, such as tomato, onion, rice, zucchini, olives, bread, or sauce, even when the user did not confirm or mention them.

Required behavior:
- Separate confirmed ingredients from optional likely additions.
- Do not treat optional likely additions as confirmed.
- Only confirmed ingredients should strongly drive the final estimate.
- For kebab barg with no confirmed sides, analyze only the kebab meat.
- Optional suggestions should use copy such as:
  “These are common additions. Select only what is actually in your meal.”

### 2. Remove Negative Correction Tone

Problem:
Some copy may still imply that detection was wrong.

Required behavior:
- Never say “detection was wrong.”
- Use neutral, positive copy:
  - “Thanks, I updated the meal details.”
  - “Your edits help make the estimate more accurate.”
  - “I’ll use your confirmed ingredients for this estimate.”

### 3. Improve Ingredient Confirmation Trust

Priority order:
1. User-written meal notes
2. User-confirmed ingredients
3. User-selected symptoms/context
4. Photo recognition guess

Rules:
- User notes override photo guesses.
- Confirmed ingredients override optional guesses.
- Do not mention optional ingredients unless confirmed or written by the user.

### 4. Voice Input Later

Voice input is useful but should wait until the food-analysis flow is stable.

Requirements for later:
- Microphone permission
- Speech-to-text or clear fallback
- English, German, Persian localization
- Text input must remain available

### 5. Web Camera Later

Web live camera is not a blocker.

Current acceptable behavior:
- Expo Go physical phone supports camera.
- Web uses upload/demo fallback.

Consider web camera later with `navigator.mediaDevices.getUserMedia()` if needed.

## Marketing and Validation

### Current Phase

Controlled feedback, not broad launch.

### Feedback Questions

Ask testers:
1. Do you understand what the app is for?
2. Is onboarding simple?
3. Does ingredient confirmation feel trustworthy?
4. Do results feel non-judgmental?
5. Would you use it again?

### Founder-Led Video

Use:
- Real founder/avatar face
- Screen recording of the app
- Clear disclaimer
- One visible link
- Request for honest feedback

Avoid:
- Medical claims
- Overpromising
- Doctor-like imagery
- Hospital backgrounds

## Medium-Term Product Work

- Custom NutriFlow domain
- Better feedback collection form
- Structured analytics without leaking health data
- Manual QA checklist
- Real user feedback log
- Nutrition/privacy/regulatory advisor review
- Validation study planning if product-market signal is strong
- Culturally broader ingredient database

## Technical Roadmap

### Short Term

- Fix ingredient over-assumption
- Add QA checklist for photo analysis
- Confirm Persian/German/English result quality
- Keep lint and web build passing

### Medium Term

- Add proper feedback form
- Add analytics with privacy safeguards
- Improve route/theme TypeScript issues
- Add test script if feasible
- Review Supabase security before scale

## Strategic Boundary

NutriFlow should stay in the wellness/pattern-tracking category until there is:
- legal review,
- clinical/nutrition expert review,
- stronger privacy review,
- and evidence supporting stronger claims.
