# Gutwell ← Cal AI: Multi-Agent Build System

How the clone is built by parallel agents without collisions.

## Core rules
1. **One owner per file.** No two agents ever edit the same file in the same phase.
2. **Shared files are edited solo, first.** `constants/theme.ts`, `components/ui/Button.tsx`,
   `app/(tabs)/_layout.tsx` are "hot" — only the orchestrator (main session) touches them,
   between phases, never inside a fan-out.
3. **Contracts before construction.** Every primitive's prop API is fixed up front (below).
   Phase-2 screen agents code against these signatures, so primitives + screens build in parallel.
4. **Isolation by phase risk:**
   - Phase 1 (primitives) = new files only → safe to run in the main tree in parallel.
   - Phase 2 (screens) = each agent on its own **git worktree/branch**, merged in order.
5. **No new dependencies** without orchestrator approval. Use what's installed:
   react-native-svg, reanimated v4, gesture-handler, expo-blur, expo-linear-gradient, expo-haptics.
6. **Every agent returns**: files created + exported signatures + any assumptions. The orchestrator
   runs `tsc --noEmit` + lint after each phase as the integration gate.
7. **Conventions** (match existing code): named-export function components, a `Props` type,
   `StyleSheet.create`, tokens imported from `../../constants/theme`. Dark theme. TS strict.

## Phase 1 — primitive contracts (this phase)
| File | Export | Key props |
|---|---|---|
| `components/ui/ProgressRing.tsx` | `ProgressRing` | `progress:0..1, size?, strokeWidth?, trackColor?, fillColor?, children?` |
| `components/ui/StepProgressBar.tsx` | `StepProgressBar` | `progress:0..1, height?, trackColor?, fillColor?` |
| `components/ui/SegmentedToggle.tsx` | `SegmentedToggle` | `options:{label,value}[], value, onChange` |
| `components/ui/OptionRow.tsx` | `OptionRow` | `label, description?, icon?, selected, onPress, multiSelect?` |
| `components/ui/OptionCard.tsx` | `OptionCard` | `title, subtitle?, icon?, selected, onPress` |
| `components/ui/WheelPicker.tsx` | `WheelPicker` | `options:{label,value}[], value, onChange, visibleCount?` |
| `components/ui/RulerSlider.tsx` | `RulerSlider` | `min, max, step?, value, onChange, unit?` |
| `components/ui/StatCard.tsx` | `StatCard` | `icon?, value, label, accentColor?, progress?, onPress?` |
| `components/ui/DaySelector.tsx` | `DaySelector` | `selectedDate, onSelectDate, days?` |
| `components/FabActionMenu.tsx` | `FabActionMenu` | `visible, onClose, actions:{key,label,icon,onPress}[]` |

New theme tokens available: `ringTrack, ringFill, segmentTrack, segmentActive, pickerHighlight,
overlayScrim, fabTile` + existing `onboarding*` tokens. `Button` now supports `fullWidth` + `shape="pill"`.

## Phase order
1. Primitives (parallel, this phase) → integration gate (tsc/lint).
2. Tab restructure (solo, orchestrator).
3. Screens (parallel worktrees): Onboarding · Home+FAB · Progress · Challenges+Paywall.
4. Scan/photo restyle (solo).
5. Verification agent: run app, screenshot, diff vs `~/Desktop/Cal AI - Organized/`.
</content>
