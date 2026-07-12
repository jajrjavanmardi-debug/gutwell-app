# GutWell — App Store Connect "App Privacy" answers

Fill these in App Store Connect → your app → **App Privacy**. This mapping reflects what GutWell
actually collects (per `app/privacy-policy.tsx` and the codebase). **Tracking: NO** — nothing is
used to track across other companies' apps/websites, so **App Tracking Transparency is not required**.

> "Linked to identity" = can be tied to the user's account. "Used for tracking" = NO for every item.

| Apple data type | Collected? | Linked to identity | Purpose | Notes |
|---|---|---|---|---|
| **Health & Fitness → Health** | Yes | Yes | App Functionality | Stool/Bristol, bloating, pain, energy, mood, water, symptoms, check-ins |
| **User Content → Photos or Videos** | Yes | Yes | App Functionality | Meal photos you choose to analyze; sent to Google Gemini for analysis |
| **User Content → Other User Content** | Yes | Yes | App Functionality | Meal names, supplement notes, free-text logs, onboarding answers |
| **Contact Info → Email Address** | Yes | Yes | App Functionality | Account creation / auth (Supabase) |
| **Contact Info → Name** | Yes | Yes | App Functionality | Display name (optional) |
| **Identifiers → User ID** | Yes | Yes | App Functionality; Analytics | Account UUID; PostHog uses a per-user random ID |
| **Usage Data → Product Interaction** | Yes | Yes | Analytics | PostHog events (e.g. "check-in logged"); no health values/email sent |
| **Diagnostics → Crash Data** | Yes | No | App Functionality | Sentry; not linked to identity |
| **Diagnostics → Performance Data** | Yes | No | App Functionality | Sentry |
| **Location → Coarse Location** | Yes | Yes | App Functionality | Approximate only, **optional/opt-in**, for nearby food suggestions |
| **Purchases → Purchase History** | Yes | Yes | App Functionality | Only if you subscribe (Apple / RevenueCat) |

### Questionnaire answers (verbatim)
- **Does your app collect data?** → **Yes**
- **Is data used to track you?** (ATT) → **No** for every item above.
- **Third parties:** Supabase (storage), Google Gemini (meal-photo analysis), PostHog (analytics),
  Sentry (crash), Apple/RevenueCat (purchases). None used for cross-app tracking.

### Privacy manifest follow-up (code)
`ios/GutWell/PrivacyInfo.xcprivacy` currently has an **empty** `NSPrivacyCollectedDataTypes`.
It's not a hard blocker (the App Store Connect label above is the binding declaration), but for
completeness it should declare: Health, Photos, Email/Name, User ID, Product Interaction, Crash
Data, Coarse Location, Purchase History — all `NSPrivacyCollectedDataTypeLinked = true` except
Crash/Performance, and all `…Tracking = false`. (Addressed in Step 3.)

### Required URLs (App Store Connect)
- **Privacy Policy URL** (required field): host `legal/privacy.html`
- **Terms of Use (EULA) URL** (optional but recommended for subscriptions): host `legal/terms.html`
</content>
