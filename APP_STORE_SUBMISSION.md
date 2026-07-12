# GutWell — App Store Submission Checklist

Legend: ✅ done · 🔧 code/config (Claude can do) · 👤 you (Apple account / App Store Connect) · ⚠️ needs attention

---

## Phase 0 — Accounts & prerequisites (👤, blocks everything)
- 👤 **Apple Developer Program** membership ($99/yr) — enroll at developer.apple.com.
- 👤 **Expo (EAS) account** — `eas login` (you're not logged in yet). Free tier works.
- 👤 Decide build path: **EAS Build (cloud)** [recommended] or local Xcode archive.

## Phase 1 — Code & config readiness
- ✅ Bundle ID `com.parallellabs.gutwell`, version `1.0.0`, build `1`.
- ✅ All iOS permission usage strings present (camera, mic, speech, photos, location).
- ✅ `ITSAppUsesNonExemptEncryption: false` (export compliance pre-answered).
- ✅ Apple **privacy manifest** present (`ios/GutWell/PrivacyInfo.xcprivacy`) with reason codes.
- ✅ **Account deletion** in-app (Settings/Profile) — required by Apple 5.1.1(v).
- ✅ **Paywall** has Restore Purchases + Terms + Privacy + auto-renew disclosure (Apple 3.1.2).
- ⚠️🔧 **App icon has an alpha channel.** EAS usually flattens it, but to be safe produce an opaque 1024×1024 `icon.png` (composited on the brand background). Apple rejects transparent marketing icons.
- ⚠️🔧 `PrivacyInfo.xcprivacy` → `NSPrivacyCollectedDataTypes` is empty. Since the app collects analytics (PostHog), crash data (Sentry), health data, email, and photos, declare those types (belt-and-suspenders with the App Store Connect label).
- ⚠️🔧 `eas.json` → `submit.production.ios` still has placeholder Apple ID / ASC App ID / Team ID — fill after Phase 2.

## Phase 2 — App Store Connect setup (👤)
- 👤 Register the bundle ID (Certificates, Identifiers & Profiles) — or let EAS do it.
- 👤 Create the **app record** in App Store Connect (name "GutWell", primary language, category **Health & Fitness**, bundle ID).
- 👤 **In-App Purchases**: create the subscription product(s) matching the RevenueCat offering; add to a subscription group; set pricing; add localized display name/description; submit them WITH the build.
- 👤 **App Privacy "nutrition label"** — see the data-type mapping in `APP_STORE_PRIVACY_LABEL.md` (Claude will generate).
- 👤 **Age rating** questionnaire (likely 12+ for "Medical/Treatment Information: Infrequent/Mild" — gut-health content; answer honestly, claim NO medical treatment advice).

## Phase 3 — Assets & metadata (mix)
- 🔧 **Privacy Policy + Terms** must be at PUBLIC URLs (App Store Connect requires a privacy-policy URL). Claude can generate hostable HTML from the in-app screens; you host (GitHub Pages / simple site) and paste the URLs.
- 🔧 **Screenshots** — 6.9" (iPhone 16/17 Pro Max) + 6.5" required; Claude can capture from the simulator at the right sizes.
- 👤 **Metadata**: subtitle, promotional text, description, keywords, support URL, marketing URL.
- ⚠️ **Health-claims review** of all user-facing copy + the App Store description — NO "diagnose/treat/cure" language (Apple 1.4.1 / 5.x). Claude can run a compliance pass.

## Phase 4 — Build & upload (👤 runs, 🔧 Claude preps commands)
```bash
eas login
eas build --platform ios --profile production    # cloud build; EAS handles signing
```
- 👤 First build: let EAS create the distribution cert + provisioning profile (interactive).
- Then upload: `eas submit --platform ios --profile production` (needs Phase 1 eas.json creds), OR Transporter.

## Phase 5 — Submit for review (👤)
- 👤 Attach the build to the app version; attach the IAP product(s).
- 👤 **App Review Information**: provide a **demo account** (email + password the reviewer can log in with — the app is login-gated) and notes ("Voice features require a physical device; reviewer can type meal descriptions.").
- 👤 Export compliance: "No" (already declared in Info.plist).
- 👤 Submit for review.

## Phase 6 — After review
- 👤 Respond to any rejection (common for health apps: claims wording, demo-account access, IAP metadata).
- 👤 Release manually or automatically once approved.

---

## Biggest review risks for THIS app (address before submitting)
1. **Health claims** — a gut-health app with AI "analysis" must avoid medical/diagnostic claims; keep the existing health disclaimer prominent.
2. **Demo account** — login-gated apps get rejected without working reviewer credentials.
3. **IAP metadata** — subscription length/price/terms must be disclosed in the description AND on the paywall (paywall ✓; add to description).
4. **Privacy label accuracy** — must match what the app actually collects (health data, photos, analytics, crash, location).
</content>
