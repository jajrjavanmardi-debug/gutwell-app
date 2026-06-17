# Gutwell Design System — Reference Library

Standalone HTML preview cards documenting Gutwell's own design system (a gut-health app, dark-green theme). Each file is a fully self-contained HTML page — inline `<style>`, Google Fonts via `<link>`, no external JS — that renders a foundation token set, a UI component with its states, or a full screen mockup.

These are reference previews of **Gutwell's own** tokens and components. The source of truth lives in the app repo:
- Tokens: `constants/theme.ts`
- Components: `components/ui/*` and `components/FabActionMenu.tsx`

## The `@dsCard` convention

The **very first line** of every HTML file is a marker comment:

```html
<!-- @dsCard group="GROUP" -->
```

where `GROUP` is one of `Foundations`, `Components`, or `Screens`. The DesignSync tool indexes each file by this first-line marker to group the cards in the browsable library.

## Syncing to claude.ai/design

This folder is synced to **claude.ai/design** via the **DesignSync** tool. DesignSync reads each `.html` file, keys it by its `@dsCard` group marker, and publishes it as a browsable card in the design reference. Re-run DesignSync after adding or editing files.

## Contents

**Foundations**
- `foundations/colors.html` — full palette swatches with hex labels
- `foundations/typography.html` — EB Garamond + Inter type scale
- `foundations/spacing-radius.html` — spacing (4pt base) + radius scale

**Components**
- `components/buttons.html` — pill primary/secondary/outline/ghost/accent + disabled + full-width
- `components/progress-ring.html` — Gut Score SVG ring
- `components/stat-card.html` — gut-factor cards with progress arc
- `components/option-row-card.html` — OptionRow (radio/checkbox) + OptionCard, selected/unselected
- `components/segmented-toggle.html` — segmented control with active pill
- `components/step-progress.html` — onboarding top progress bar
- `components/day-selector.html` — weekday strip with selected day
- `components/fab-menu.html` — "+" 2×2 action menu overlay

**Screens**
- `screens/home.html` — Home dashboard
- `screens/onboarding-step.html` — quiz step
- `screens/challenges.html` — Challenges discover list

## Design tokens (CSS variables)

| Token | Value | | Token | Value |
|---|---|---|---|---|
| bg | `#000000` | | primary | `#1B4332` |
| surface | `#0B0B0B` | | primaryLight | `#2D6A4F` |
| surfaceSecondary | `#111111` | | secondary | `#52B788` |
| border | `#242424` | | secondaryLight | `#74C69D` |
| text | `#FFFFFF` | | accent | `#D4A373` |
| textSecondary | `#A7A7A7` | | ringTrack | `#1A1A1A` |
| textTertiary | `#777777` | | ringFill / segmentActive | `#52B788` / `#1B4332` |

Radius: sm 8 · md 12 · lg 20 · xl 24 · full 999. Spacing: xs 4 · sm 8 · md 16 · lg 24 · xl 32.
Fonts: EB Garamond (headings) · Inter (UI/body).
