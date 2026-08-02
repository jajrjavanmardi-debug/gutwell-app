# LEGAL_AUDIT.md — GutWell AI
## Items requiring verification before Privacy Policy, Terms, and Impressum can be finalized.
## Do not publish any legal page with unresolved items below.

---

## 1. OPERATOR IDENTITY

| Item | Status |
|------|--------|
| Full legal name of operator | ❌ NOT CONFIRMED |
| Physical business address (Germany) | ❌ NOT CONFIRMED |
| Contact / support email (monitored) | ❌ support@getgutwell.app — existence unconfirmed |
| Legal entity type (individual / GmbH / etc.) | ❌ NOT CONFIRMED |

---

## 2. GOVERNING LAW AND JURISDICTION

| Item | Status |
|------|--------|
| Governing law jurisdiction | ❌ NOT CONFIRMED — old Terms reference Singapore (incorrect) |
| Dispute resolution court / city | ❌ NOT CONFIRMED |
| Consumer jurisdiction carve-out for EU users | ❌ REQUIRES LEGAL REVIEW |
| Singapore law clause in in-app terms-of-service.tsx | 🔴 ACTIVE BUG — must be removed before submission |

---

## 3. AGE AND MINOR HANDLING

| Item | Status |
|------|--------|
| Minimum age decision (13 / 16 / 18) | ❌ NOT CONFIRMED |
| GDPR Art. 8 compliance for EU minors (default 16) | ❌ REQUIRES LEGAL REVIEW |
| COPPA compliance if US users under 13 | ❌ REQUIRES LEGAL REVIEW |
| Age gate implementation in onboarding | ❌ NOT IMPLEMENTED |

---

## 4. DATA COLLECTED

| Data type | Confirmed in code | Documented in Privacy Policy |
|-----------|------------------|------------------------------|
| Email address | ✅ | Partial |
| Hashed password (Supabase Auth) | ✅ | Missing |
| Display name | ✅ | Missing |
| Stool type (Bristol 1-7) | ✅ | Partial |
| Bloating / pain / energy / mood (1-5) | ✅ | Partial |
| Water intake | ✅ | Partial |
| Free-text check-in notes | ✅ | Missing |
| Meal name and type | ✅ | Partial |
| Meal photographs | ✅ | Partial |
| Symptom logs | ✅ | Partial |
| Supplement notes | ✅ | Missing |
| Onboarding answers (goal, gut concern) | ✅ | Missing |
| Gut scores | ✅ | Missing |
| Streak data | ✅ | Missing |
| Favorites | ✅ | Missing |
| Reminders configuration | ✅ | Missing |
| Voice input (converted to text on device) | ✅ | Missing |
| Approximate location (optional, meal suggestions) | ✅ | Missing |
| Push notification token | ✅ | Missing |
| Pseudonymous usage events (PostHog UUID) | ✅ | Partial |
| Crash / error data (Sentry) | ✅ | Partial |
| Purchase / subscription status (RevenueCat) | ✅ | Partial |
| Widget data | ✅ | Missing |

---

## 5. PROCESSORS AND SDKS

| Processor | Confirmed in code | Transfer mechanism | DPA in place |
|-----------|------------------|--------------------|--------------|
| Supabase (AWS) | ✅ | ❌ NOT CONFIRMED | ❌ |
| Supabase region (eu-west-1 in .env) | ✅ source only | ❌ Verify via dashboard | ❌ |
| Google Gemini API | ✅ | ❌ NOT CONFIRMED | ❌ |
| Google Gemini — training use of API data | ❌ UNVERIFIED | — | — |
| PostHog (us.i.posthog.com — US) | ✅ | ❌ NOT CONFIRMED | ❌ |
| PostHog — cookie / device storage use | ❌ UNVERIFIED | — | — |
| Sentry | ✅ | ❌ Region unconfirmed | ❌ |
| RevenueCat (US) | ✅ | ❌ NOT CONFIRMED | ❌ |
| Apple (App Store, IAP, notifications) | ✅ | Standard Apple DPA | Partial |
| Vercel (website hosting) | ✅ | ❌ NOT CONFIRMED | ❌ |

---

## 6. STORAGE REGIONS AND INTERNATIONAL TRANSFERS

| Item | Status |
|------|--------|
| Supabase primary region | ❌ env says eu-west-1 but not verified via dashboard |
| Supabase backup region | ❌ UNKNOWN |
| Supabase support data region | ❌ UNKNOWN |
| Google data processing location | ❌ UNKNOWN |
| PostHog data processing location | ❌ us.i.posthog.com = US, transfer mechanism unconfirmed |
| Sentry data processing location | ❌ UNKNOWN |
| SCCs or adequacy decisions for each non-EEA transfer | ❌ NOT CONFIRMED |

---

## 7. RETENTION AND DELETION

| Item | Status |
|------|--------|
| Account data retention period | ❌ NOT DEFINED |
| Post-deletion removal period (e.g. 30 days) | ❌ NOT DEFINED |
| Encrypted backup retention period | ❌ NOT DEFINED |
| Waitlist email retention after launch notification | ❌ NOT DEFINED |
| Meal photograph retention by Google | ❌ UNVERIFIED |
| PostHog event retention | ❌ UNVERIFIED |
| Sentry error log retention | ❌ UNVERIFIED |
| delete_user_account RPC — what it actually deletes | ✅ Partial (verified in profile.tsx) |
| Whether backups are purged after deletion | ❌ UNKNOWN |

---

## 8. SUBSCRIPTION AND BILLING

| Item | Status |
|------|--------|
| Subscription tiers (free / premium) | ❌ NOT CONFIRMED FOR LAUNCH |
| Free trial duration and terms | ❌ NOT CONFIRMED |
| Auto-renewal behavior | ✅ Standard Apple IAP |
| Refund rights (Apple policy) | ✅ Standard Apple |
| EU 14-day withdrawal right in Apple IAP context | ❌ REQUIRES LEGAL REVIEW |
| RevenueCat configuration matches Terms claims | ❌ NOT VERIFIED |
| Pricing hardcoded anywhere in app | ❌ CHECK BEFORE SUBMISSION |

---

## 9. USER RIGHTS (GDPR)

| Right | In-app implementation | Documentation |
|-------|----------------------|---------------|
| Access (Art. 15) | ✅ Export in Settings | Partial |
| Rectification (Art. 16) | ✅ Edit Profile | Missing |
| Erasure (Art. 17) | ✅ Delete Account | Partial |
| Portability (Art. 20) | ✅ JSON export via Share | Partial |
| Restriction (Art. 18) | ❌ NOT IMPLEMENTED | Missing |
| Object (Art. 21) | ❌ NOT IMPLEMENTED | Missing |
| Withdraw consent (Art. 7(3)) | ❌ NOT IMPLEMENTED | Missing |
| Response time commitment | ❌ NOT CONFIRMED | Missing |
| Supervisory authority complaint right | ❌ NOT DOCUMENTED | Missing |
| Lead supervisory authority (German state DPA) | ❌ NOT CONFIRMED | Missing |

---

## 10. IMPRESSUM (DDG — REQUIRED BEFORE LAUNCH)

| Item | Status |
|------|--------|
| Full legal name | ❌ NOT CONFIRMED |
| Full postal address | ❌ NOT CONFIRMED |
| Contact email | ❌ NOT CONFIRMED |
| Telephone (if required) | ❌ NOT CONFIRMED |
| Person responsible for editorial content | ❌ NOT CONFIRMED |
| VSBG / dispute resolution statement | ❌ NOT CONFIRMED |
| Impressum page accessible from website | ✅ Placeholder exists |
| Impressum accessible from App | ❌ NOT LINKED |

---

## 11. AI DISCLOSURE

| Item | Status |
|------|--------|
| AI provider named in legal docs | Partial (Google AI services) |
| Specific model version in legal docs | ❌ Intentionally omitted — update if required |
| EU AI Act obligations | ❌ REQUIRES LEGAL REVIEW |
| AI output medical claim disclaimer | ✅ In app and legal docs |
| User right to challenge AI output | ✅ Implemented in app and Terms |

---

## 12. KNOWN ACTIVE LEGAL BUGS IN APP CODE

| File | Issue | Priority |
|------|-------|----------|
| app/terms-of-service.tsx | References Singapore law (Section 9) | 🔴 CRITICAL — fix before App Store submission |
| legal/terms.html (GitHub Pages) | Singapore law removed in dd666a7 | ✅ Fixed |
| app/privacy-policy.tsx | Contains unverified facts about Supabase region, Google API training, analytics exclusions | 🔴 Fix before submission |
| app/terms-of-service.tsx | Hardcoded "13+" minimum age | ❌ Age not confirmed |
| All in-app legal screens | Not localized — English only | 🟡 Phase 2C |

---

## 13. PRE-SUBMISSION CHECKLIST

Before submitting to the App Store, ALL of the following must be complete:

- [ ] Operator legal name and address confirmed
- [ ] Support email confirmed monitored
- [ ] Governing law confirmed by qualified German lawyer
- [ ] Singapore clause removed from in-app terms-of-service.tsx
- [ ] Minimum age confirmed and implemented
- [ ] All processor DPAs confirmed
- [ ] International transfer mechanisms confirmed for all non-EEA processors
- [ ] Data retention periods defined
- [ ] Impressum published and accessible
- [ ] In-app Privacy Policy and Terms updated to match legal/privacy.html and legal/terms.html
- [ ] GDPR rights (restriction, objection, consent withdrawal) addressed
- [ ] Subscription tiers and trial terms confirmed in RevenueCat and reflected in Terms
- [ ] EU AI Act obligations assessed
- [ ] App Privacy nutrition label completed in App Store Connect
- [ ] Age rating confirmed (currently 13+)

---

*Last updated: 2026. Do not treat this file as legal advice.*
*Consult a qualified German lawyer before publication.*
