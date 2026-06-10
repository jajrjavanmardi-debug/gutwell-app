# GutWell — Intern Handoff (June 2026)

**Who this is for:** the intern taking over day-to-day work on GutWell. No deep technical knowledge assumed.
**What this is:** (1) a plain-English list of everything that was just changed in the big June 10 overhaul, (2) what still needs to be done and by whom, (3) how to work on the project safely.

> **The one-minute summary:** GutWell is an iPhone app where people log meals and gut symptoms, and the app finds which foods trigger their problems. On June 10 the app went through a complete overhaul (merged as PR #43 on GitHub): a security hole was closed, the broken login flow was restored, the AI was fixed to use each person's real profile, the privacy story was made honest, the Home screen was rebuilt, and automated tests now guard the code. The app is now technically ready to launch — the remaining steps are mostly business/account tasks for Hojir, plus testing and content tasks you can help with.

---

## Part 1 — Everything that was changed on June 10 (in plain English)

### Database & security (already live on the server)
1. **Closed a serious privacy hole.** Old database rules accidentally let any logged-in user read *everyone's* health entries. Removed.
2. **Fixed daily check-ins not saving.** The live database was missing a rule the app depends on. Restored — check-ins save again.
3. **Fixed offline entries never uploading.** The columns the offline sync needs were missing on the live database. Added.
4. **Made the database and the code agree.** The live database had 9 changes the codebase didn't know about. They're now in the codebase, perfectly in sync.

### Logging in & first-time setup (was completely broken)
5. **Restored login, signup, and the welcome quiz.** Since May 2nd, the app skipped straight past them into broken screens. Now: new users go welcome → quiz → create account → notifications → app. Returning users tap "Sign in."
6. **New users actually get an account now.** The old flow's final button silently did nothing because no account existed yet.
7. **Fixed a wrong message** that told new users to "check your email to verify" (no verification email is ever sent).

### The AI meal scanner
8. **It uses YOUR profile now.** Before, *every* user was secretly analyzed as a fake test patient ("IBS + bloating, score 4/10") and told it was "personalized." Now it uses your real conditions, real gut score, and diet type — or honestly says "general guidance" if it knows nothing yet.
9. **Removed medical-sounding language.** "Instant Relief" sections, prescription-style "Dose/Duration" labels, and promises like "your score will improve by +2 in a week" are gone — replaced with friendly wellness wording plus "see a doctor if it's severe." This keeps the app legal (FDA/App Store rules for wellness apps).
10. **Removed the developer's hometown.** German users everywhere were told to shop "near Nürtingen." Now it uses the user's own area — and only if they share it.
11. **Finished Persian (Farsi) support.** The AI can answer in Persian with a proper Persian safety note; Persian voice input works; text flows right-to-left.

### Privacy & honesty
12. **Location is opt-in now.** The scanner used to demand your location immediately and sent exact GPS coordinates to Google. Now nothing happens unless the user taps "use my location," and only the city name is shared — never coordinates.
13. **The privacy policy tells the truth.** It now names every service the app uses (Supabase, Google's AI, PostHog, Sentry, Apple/RevenueCat) and what each one receives. The old one hid most of this.
14. **Health data no longer goes to analytics.** Stool types, scores, and names were being sent to the analytics service. Now only anonymous events like "check-in logged" are sent.
15. **The health disclaimer shows for every account** (not just once per phone) and acceptance is recorded with a timestamp.
16. **"Export My Data" and "Clear All Data" now cover everything** (they used to skip water logs, scores, favorites, reminders) and admit it when something fails.
17. **Exaggerated claims rewritten.** "Flush toxins," "reduces blood sugar spikes by 30%," "14 days will change everything," etc. — all softened to honest wording.

### The app experience
18. **Home screen rebuilt.** The old Home was a leftover from a previous app: a hand-adjustable fake score, a made-up "Energy" graph, and a separate "Gut Warrior" XP game. The new Home shows the real computed score, real streak, a meal-scan button, your strongest trigger food, recent activity, and a daily tip.
19. **One score, one progress system.** No more two different "gut scores" contradicting each other.
20. **Dead screens connected.** The symptom logger, check-in editor, and scan history existed but nothing linked to them. Now they're reachable.
21. **Notifications actually work.** Tapping a reminder opens the right screen; the "streak at risk" alert really fires at 8 PM (and cancels once you check in); its on/off switch in Settings really controls it.
22. **Settings are honest.** Controls that did nothing ("Daily Goal," "Units") were removed; "Diet Type" now genuinely feeds the AI; picking a reminder time during quiet hours (10 PM–8 AM) now warns you instead of silently never reminding.
23. **Offline entries are visible.** Settings shows "Waiting to sync — X entries" with a tap-to-sync button.

### Money & App Store rules
24. **The app can launch free, cleanly.** Before, premium features were locked behind a paywall whose button said "Coming Soon" — a guaranteed App Store rejection. Now, while payments are unconfigured, everything is simply unlocked and the paywall doesn't appear at all. Turning on paid later is one setting.
25. **The paywall (for later) is honest and legal.** Required Terms & Privacy links added; prices like "$3.33/mo" and "save 52%" are calculated from real store prices; "Free Trial" only shows when the selected plan really has one; the feature list only promises what's actually premium.

### Look & feel
26. **One brand color** — half the app used a leftover green from the old app. Unified.
27. **No more white flash** when the app launches (dark splash screen now).
28. **Fixed an invisible button** — the disclaimer's "I Understand" was white text on a white button.
29. **Deleting a meal asks for confirmation** first; a fake "Save Screenshot" button was removed.
30. **"Rate GutWell" works** — it pointed at a placeholder store page; now it uses Apple's built-in rating popup.
31. **Better accessibility** — screen-reader labels on Food, Progress, and Home controls; the photo wizard says "Step 1 of 3" instead of counting to a step 4 that didn't exist.

### Under the hood
32. **Fixed a bug that silently lost data** when you logged something while the app was uploading offline entries. A test now guards this forever.
33. **Fixed date bugs** that put scores/calendar marks on the wrong day for users west of London.
34. **Deleted dead code** — 8 unused components, an unused chart library, a fake-login backdoor.
35. **26 automated tests + a safety net (CI).** Every change pushed to GitHub is now automatically checked (types, code style, tests) before it can be merged. It already caught one broken change.

### Launch preparation
36. **Usage tracking for the launch funnel** — we can now see where users drop off (onboarding → quiz → signup → first log → paywall), with zero health data attached.
37. **Better App Store search keywords** — added "ibs" (the highest-intent search in this category) and "stool."
38. **iPhone-only for v1** (no iPad screenshots/testing needed) and the export-compliance question pre-answered.
39. **`LAUNCH_OPERATIONS.md` rewritten** — it has ready-to-paste App Store text and the exact remaining steps.

---

## Part 2 — What still needs to be done

### 🔴 Only Hojir can do these (they need his accounts / payment)
| # | Task | Why |
|---|------|-----|
| 1 | **Upgrade Supabase to Pro** ($25/mo) — [billing page](https://supabase.com/dashboard/project/peipdakrqtgabnvpazrc/settings/billing) | Free databases auto-pause after ~7 idle days, which takes the whole app down |
| 2 | **Get a new USDA food-data key** ([signup](https://fdc.nal.usda.gov/api-key-signup.html)) and set it as a server secret | The old key leaked and must be replaced; until then, one minor feature (nutrient suggestions) stays off |
| 3 | **Revoke the old leaked Groq key** ([console](https://console.groq.com/keys)) | Safety hygiene — the app no longer uses Groq at all |
| 4 | **Enroll in the Apple Developer Program** ($99/yr) and provide 3 account values | Required to put anything on the App Store |
| 5 | **Publish the privacy policy on a public web page** | Apple requires a working URL; the text is ready in the app (`app/privacy-policy.tsx`) |
| 6 | **Create the App Store listing** (name, description, keywords, screenshots) | All the text is ready to paste from `LAUNCH_OPERATIONS.md` |

### 🟢 Things the intern can do (no special accounts needed)
1. **Test the app like a brand-new user** (see the QA checklist below) and write down anything confusing, broken, or ugly. This is the most valuable thing you can do right now.
2. **Take App Store screenshots** — once the app runs on a simulator (ask for help getting it running): Home, Check-in, Photo analysis, Progress, Weekly digest. Apple needs at least 3 in the large iPhone size (6.7"/6.9").
3. **Proof-read all the German text** in the app (and the Persian AI replies if you can) — translations were written by developers, not native review.
4. **Draft the privacy policy web page** — copy the sections from the in-app policy into a simple page Hojir can host.
5. **Keep `LAUNCH_OPERATIONS.md` updated** — tick things off as they get done.

### 🧪 QA checklist (test these exact flows and note anything weird)
- [ ] Fresh install → welcome screen appears (NOT a broken home screen)
- [ ] Go through the quiz → create an account → notifications screen → land in the app
- [ ] Health disclaimer appears once, the "I Understand" button is readable, and it doesn't appear again
- [ ] Log a daily check-in → a gut score appears on Home → streak shows "1 day"
- [ ] Log a meal in the Food tab → it appears in "Recent Activity" on Home
- [ ] Scan a meal photo → the analysis mentions YOUR situation (not "IBS" unless you said so) → no "Instant Relief" or "Dose" wording anywhere
- [ ] The location row in the scanner does NOT pop up a permission box by itself — only after you tap it
- [ ] Log a symptom from Home's "Symptom" quick action
- [ ] Turn airplane mode on → log a check-in → it says "saved offline" → turn airplane mode off → Settings shows it synced
- [ ] Delete a meal → it asks "are you sure" first
- [ ] Settings → Export My Data → the file contains your entries
- [ ] Sign out → sign back in → everything is still there
- [ ] Nothing anywhere says "Premium," "Unlock," or shows a paywall (we launch free)

---

## Part 3 — How to work on the project

**Getting it running:** follow the step-by-step guide in `README.md` (Mac + Xcode required; first build takes ~10–15 minutes). Ask Hojir for the `.env.local` secret values.

**The golden rules when changing anything:**
```bash
git checkout main && git pull          # always start fresh
git checkout -b fix/short-description  # never work directly on main
# ...make your change...
npx tsc --noEmit                       # type check — must stay clean
npx jest                               # tests — must stay green (26 passing)
git push -u origin fix/short-description
# then open a Pull Request on GitHub — the robot (CI) checks it automatically
```
One small change per branch. Never commit `.env.local` or the `ios/` folder. When stuck >30 minutes, ask — that's normal.

**Key documents:**
- `README.md` — how to set up and run the app
- `LAUNCH_OPERATIONS.md` — the launch checklist with ready-to-paste store text
- `ACQUISITION_IMPROVEMENT_PLAN.md` — the full audit that drove the June 10 overhaul (more technical)

**Launch strategy (so you understand decisions):** v1 launches **free** — no paywall anywhere. Once real users prove they come back, v1.1 turns on subscriptions by adding a single configuration value; all the paywall screens are already built and legally compliant.
