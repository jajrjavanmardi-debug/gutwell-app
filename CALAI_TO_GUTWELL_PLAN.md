# Cal AI → Gutwell: UI/UX Clone & Restyle Plan

Goal: recreate the Cal AI app's structure, layout, and interaction patterns in **Gutwell**,
adapted for gut health. We copy *patterns* (not Cal AI's logo, copy, icons, or image assets —
those stay original to Gutwell to avoid trademark/asset issues).

Core translation: **Cal AI "calories left" → Gutwell "daily Gut Score."**
The ring, factor cards, streaks, and charts map onto metrics Gutwell already computes
(`lib/scoring.ts`, `lib/streaks.ts`, `lib/correlations.ts`).

Reference screenshots: `~/Desktop/Cal AI - Organized/` (7 grouped, ordered folders, 58 shots).

---

## 0. Design principles (the Cal AI "look")

- Monochrome base: near-black on white / very light gray. One warm accent (Gutwell keeps its
  forest-green `#1B4332` + sage `#52B788` identity instead of Cal AI's orange).
- Bold, large, tight headlines (EB Garamond already in repo); muted gray subtitles.
- Primary CTA = full-width black/dark **pill** pinned to bottom; disabled = light gray.
- Cards: rounded ~16–20px, light fill, soft shadow, leading icon + title + subtitle.
- Hero = **circular progress ring**. Selection = dark-outlined card + filled radio dot.
- Nav = **4-tab bar + floating center "+" FAB** (FAB toggles to "X" when its menu is open).

---

## 1. Design system retrofit  (PHASE 1 — blocks everything else)

Extend `constants/theme.ts` and `components/ui/` with Cal AI primitives:

| Primitive | New / extend existing | File |
|---|---|---|
| `PillButton` (primary/disabled/secondary/outline) | extend | `components/ui/Button.tsx` |
| `ProgressRing` (calorie-ring analog → Gut Score) | new | `components/ui/ProgressRing.tsx` |
| `StepProgressBar` (onboarding top bar) | new | `components/ui/StepProgressBar.tsx` |
| `OptionRow` / `OptionCard` (radio select, selected state) | new | `components/ui/OptionRow.tsx` |
| `SegmentedToggle` (90D/6M/1Y/ALL, units) | new | `components/ui/SegmentedToggle.tsx` |
| `WheelPicker` (date/height) + `RulerSlider` (weight) | new | `components/ui/WheelPicker.tsx`, `RulerSlider.tsx` |
| `StatCard` / `FactorCard` (macro-card analog) | new | `components/ui/StatCard.tsx` |
| `DaySelector` (horizontal weekday strip) | new | `components/ui/DaySelector.tsx` |
| `FabActionMenu` (the "+" 2x2 grid overlay) | new | `components/FabActionMenu.tsx` |

---

## 2. Tab bar restructure  (Gutwell 5 tabs → Cal AI 4 + FAB)

Edit `app/(tabs)/_layout.tsx`:

| Slot | Cal AI | Gutwell target | File |
|---|---|---|---|
| 1 | Home | **Home** — Gut Score ring + 3 factor cards + day strip + recent meals + streak | `app/(tabs)/index.tsx` |
| 2 | Progress | **Progress** — restyled charts, streak/badges header | `app/(tabs)/progress.tsx` |
| 3 | Groups | **Challenges** — discover/active challenges (SUBSTITUTE) | `app/(tabs)/challenges.tsx` (new) |
| 4 | Profile | **Profile** — header, goals/widgets, support/legal, account | `app/(tabs)/profile.tsx` |
| center | "+" FAB | **"+" menu** → Scan meal / Log check-in / Log symptom / Quick add | `components/FabActionMenu.tsx` |

`checkin.tsx` and `food.tsx` leave the tab bar and become destinations of the "+" menu + Home cards.

---

## 3. Screen-by-screen map

### Onboarding (mirror Cal AI's long quiz) — `app/(onboarding)/`
Keep the persuasion skeleton; swap weight-loss questions for gut questions.
- welcome (exists) → sex/age → "tried other gut apps?" → "work with a GI/dietitian?" →
  symptom frequency → primary gut goal (bloating/regularity/energy/discomfort) →
  diet (low-FODMAP/gluten-free/dairy-free/balanced) → barriers → what you want to accomplish →
  optional height/weight → **persuasion screens reused 1:1**: with/without comparison,
  symptom-trend promise, gut-score transition chart, "thank you for trusting us",
  connect Apple Health, social proof + rating, referral code, "all done" →
  `analysing.tsx` loader → `results.tsx` = "your gut plan" payoff (target Gut Score + focus areas + your-info recap).
- Persist quiz answers to `profiles` / `user_profiles` (extend columns).

### Paywall — `app/paywall.tsx` (RevenueCat already wired)
Restyle to trial-offer with device mockup + "No Payment Due Now" + a notification-reminder
priming screen ("we'll remind you before your trial ends").

### Home — `app/(tabs)/index.tsx`
Ring = today's Gut Score; 3 cards = Check-in done / Meals logged / Hydration (or symptom-free
streak); day strip on top; streak flame in header; "Recently logged" meal list; empty state
"Tap + to log your first meal".

### Logging & Scan
`photo-analysis.tsx` already IS Cal AI's 4-step scan wizard — restyle + add the 4-slide
scan tutorial and camera-frame capture UI. Cal AI's "Log Exercise" selector pattern →
reuse for **Log Symptom / Log Supplement / Log Check-in** entry screens. "Saved foods"
empty-state tab → Gutwell favorites.

### Progress — `app/(tabs)/progress.tsx`
Restyle existing charts to Cal AI cards. weight→Gut Score trend; weight-changes table→
symptom-frequency changes; daily-avg-calories→daily-avg Gut Score; weekly energy→symptom load;
BMI card→"Gut Health Index". Add streak + badges header row.

### Profile — `app/(tabs)/profile.tsx`
Header card (name/username, premium badge), invite-a-friend, Account list, Goals & Tracking
(Apple Health connected, edit goals, reminders), Widgets preview, Support & Legal, Follow Us,
Account Actions (logout/delete). Most of these screens already exist as standalone routes.

---

## 4. Challenges tab (community substitute) — NEW

**Layout** mirrors Cal AI "Discover Groups": title + bell, "Discover" section, cards
(icon, name, participant count, 2-line description, "+ Join"). Plus an "Active" section
showing joined challenges with a progress bar.

**Screens:**
- `app/(tabs)/challenges.tsx` — discover + active list
- `app/challenge/[id].tsx` — detail: rules, duration, daily tasks, Join/Leave, progress

**Data (Supabase migration):**
- `challenges` (id, slug, title, description, duration_days, type, icon, participants_count, is_featured)
- `user_challenges` (user_id, challenge_id, joined_at, progress_days, completed_at, status)
- Seed: "14-Day No-Trigger Streak", "Daily Check-in Challenge", "Hydration 7-Day",
  "Fiber Ramp 21-Day", "Low-FODMAP Reset". Reuse `lib/streaks.ts` for progress; award points
  via `lib/levels.ts`.

---

## 5. Multi-agent execution

Isolated git worktrees so parallel agents don't collide.

- **Phase 1 (solo):** Design-system agent — primitives in §1. Everything depends on it.
- **Phase 2 (4 parallel):**
  - A: Onboarding quiz (§3 onboarding) + data persistence
  - B: Home + "+" FAB menu (§3 Home, §2 FAB)
  - C: Progress restyle (§3 Progress)
  - D: Challenges tab + Paywall restyle (§4, §3 Paywall) + Supabase migration
- **Phase 3 (solo):** Logging/Scan restyle — `photo-analysis.tsx` + tutorial + camera UI.
- **Phase 4 (solo):** Verification agent — run via preview tools, screenshot each screen,
  diff against `~/Desktop/Cal AI - Organized/`, fix gaps. Run `tsc`, lint, jest.

Merge order: Phase 1 → 2 → 3, then verify.

---

## 6. Risks / notes
- Copy *patterns*, not Cal AI assets/copy/logo. Keep Gutwell branding + green theme.
- App is dark-theme-only (`userInterfaceStyle: "dark"`); Cal AI shots are light — decide whether
  to add a light theme or render the Cal AI layout in Gutwell's dark palette. (Recommend dark palette.)
- i18n: strings are hardcoded EN/DE (+FA in photo-analysis). New screens should follow the
  existing `copy.en/de` pattern.
</content>
</invoke>
