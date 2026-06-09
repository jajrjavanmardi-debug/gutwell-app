# GutWell

**GutWell** is a gut-health tracking iOS app: log your food and symptoms, discover your trigger foods.

Built with Expo SDK 54 · React Native · TypeScript · Supabase

---

## Get the project running

### Prerequisites (one-time setup)
1. **Mac** — iOS development requires macOS
2. **Xcode** — Mac App Store, open once to accept the license, install an iOS Simulator
3. **Node.js 20+** — https://nodejs.org. Check: `node --version`
4. **Homebrew** — https://brew.sh
5. **CocoaPods & Watchman** — `brew install cocoapods watchman`
6. **Git** — usually pre-installed. Check: `git --version`
7. Ask Hojir to add you as a GitHub collaborator

### Installation
```bash
git clone https://github.com/jajrjavanmardi-debug/gutwell-app.git
cd gutwell-app
npm install
cp .env.example .env.local   # fill in values from Hojir
npx expo run:ios              # first run takes ~10-15 min
```

> GutWell uses native modules — it **cannot** run in Expo Go. Use `npx expo run:ios`.

### Common first-run issues
| Error | Fix |
|-------|-----|
| CocoaPods Unicode error | `export LANG=en_US.UTF-8` then re-run |
| Sentry build error | `export SENTRY_DISABLE_AUTO_UPLOAD=true` then re-run |
| "no such module" | Delete `ios/` folder and re-run `npx expo run:ios` |

---

## Project structure
| Path | Purpose |
|------|---------|
| `app/(auth)/` | Login, signup, forgot-password |
| `app/(onboarding)/` | 7-step welcome flow |
| `app/(tabs)/` | Home, check-in, food, progress, profile |
| `app/photo-analysis.tsx` | AI meal-photo wizard |
| `components/` | Reusable UI pieces |
| `lib/` | Business logic (scoring, streaks, correlations) |
| `contexts/` | AuthContext |
| `constants/theme.ts` | Colors, fonts, spacing — use these, never hardcode |
| `supabase/migrations/` | Database schema (SQL) |
| `supabase/functions/` | Edge functions (AI runs here, never on client) |
| `widgets/` | iOS home-screen widget (Swift) |

---

## Making a change safely
```bash
git checkout main && git pull
git checkout -b fix/short-description
# make your change
npx tsc --noEmit        # must show no NEW errors in app/ or lib/
git add <your files>    # never commit .env.local or ios/
git commit -m "fix: what you did"
git push -u origin fix/short-description
# open a Pull Request on GitHub
```

---

## Owner / environment
- **Owner:** Hojir / Parallel Labs Pte. Ltd.
- **Bundle ID:** com.parallellabs.gutwell
- **Backend:** Supabase — must be active (ask Hojir to restore if paused)
- **Launch checklist:** `LAUNCH_OPERATIONS.md`
