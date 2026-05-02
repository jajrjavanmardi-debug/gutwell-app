import sharp from 'sharp';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = resolve(__dirname, '../assets/images');

/** Matches app typography (`constants/theme.ts`): EB Garamond–style display + Inter-style UI sans. */
const FONT_DISPLAY_STACK =
  "EB Garamond, Garamond, Georgia, 'Times New Roman', serif";
const FONT_UI_STACK =
  "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";
const APP_DISPLAY_NAME = 'NutriFlow';

/** NutriFlow / Thrive-inspired palette (aligned with `constants/theme.ts`). */
const BRAND_DEEP_GREEN = '#1B4332';
const BRAND_MINT = '#52B788';
const BRAND_SAGE = '#6B9E7A';
const BRAND_CREAM_TOP = '#FBFDF9';
const BRAND_CREAM_MID = '#F4FAF6';
const BRAND_CREAM_BOTTOM = '#ECF4EE';

// ---------------------------------------------------------------------------
// SVG definitions
// ---------------------------------------------------------------------------

const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <!-- Background -->
  <rect width="1024" height="1024" rx="220" fill="${BRAND_DEEP_GREEN}"/>
  <!-- Leaf shape -->
  <path d="M512 200 C620 200 720 300 720 430 C720 560 620 660 512 700 C404 660 304 560 304 430 C304 300 404 200 512 200 Z" fill="white" opacity="0.95"/>
  <!-- Inner leaf vein (center) -->
  <path d="M512 220 L512 680" stroke="#1B4332" stroke-width="18" stroke-linecap="round" opacity="0.3"/>
  <!-- Leaf veins (right side) -->
  <path d="M512 350 C550 330 590 340 610 370" stroke="#1B4332" stroke-width="12" stroke-linecap="round" fill="none" opacity="0.3"/>
  <path d="M512 420 C550 400 600 410 620 445" stroke="#1B4332" stroke-width="12" stroke-linecap="round" fill="none" opacity="0.3"/>
  <path d="M512 490 C544 472 582 481 600 512" stroke="#1B4332" stroke-width="10" stroke-linecap="round" fill="none" opacity="0.25"/>
  <!-- Gut wave below leaf -->
  <path d="M380 790 C420 750 460 830 500 790 C540 750 580 830 620 790 C660 750 690 790 710 790" stroke="${BRAND_MINT}" stroke-width="28" stroke-linecap="round" fill="none"/>
</svg>`;

// Adaptive icon: same design with slight padding (icon scaled to ~85% centered)
const ADAPTIVE_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <!-- Background — full bleed for adaptive icon safe zone -->
  <rect width="1024" height="1024" fill="${BRAND_DEEP_GREEN}"/>
  <!-- Icon content scaled 85% and centered -->
  <g transform="translate(77, 77) scale(0.85)">
    <!-- Leaf shape -->
    <path d="M512 200 C620 200 720 300 720 430 C720 560 620 660 512 700 C404 660 304 560 304 430 C304 300 404 200 512 200 Z" fill="white" opacity="0.95"/>
    <!-- Center vein -->
    <path d="M512 220 L512 680" stroke="#1B4332" stroke-width="18" stroke-linecap="round" opacity="0.3"/>
    <!-- Side veins -->
    <path d="M512 350 C550 330 590 340 610 370" stroke="#1B4332" stroke-width="12" stroke-linecap="round" fill="none" opacity="0.3"/>
    <path d="M512 420 C550 400 600 410 620 445" stroke="#1B4332" stroke-width="12" stroke-linecap="round" fill="none" opacity="0.3"/>
    <path d="M512 490 C544 472 582 481 600 512" stroke="#1B4332" stroke-width="10" stroke-linecap="round" fill="none" opacity="0.25"/>
    <!-- Gut wave -->
    <path d="M380 790 C420 750 460 830 500 790 C540 750 580 830 620 790 C660 750 690 790 710 790" stroke="${BRAND_MINT}" stroke-width="28" stroke-linecap="round" fill="none"/>
  </g>
</svg>`;

const SPLASH_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1284 2778" width="1284" height="2778">
  <defs>
    <linearGradient id="splashWash" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="${BRAND_CREAM_TOP}"/>
      <stop offset="48%" stop-color="${BRAND_CREAM_MID}"/>
      <stop offset="100%" stop-color="${BRAND_CREAM_BOTTOM}"/>
    </linearGradient>
    <radialGradient id="splashGlow" cx="50%" cy="38%" r="28%" fx="50%" fy="38%">
      <stop offset="0%" stop-color="#D8EFDF" stop-opacity="0.95"/>
      <stop offset="55%" stop-color="#E8F5EC" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="${BRAND_CREAM_BOTTOM}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1284" height="2778" fill="url(#splashWash)"/>
  <rect width="1284" height="2778" fill="url(#splashGlow)"/>
  <!-- Icon card: centered, 300×300 — mint halo + deep green tile -->
  <g transform="translate(492, 1089)">
    <rect width="300" height="300" rx="68" fill="${BRAND_DEEP_GREEN}" stroke="${BRAND_MINT}" stroke-opacity="0.45" stroke-width="3"/>
    <!-- Leaf -->
    <path d="M150 58 C182 58 211 88 211 126 C211 164 182 194 150 205 C118 194 89 164 89 126 C89 88 118 58 150 58 Z" fill="white" opacity="0.95"/>
    <!-- Center vein -->
    <path d="M150 64 L150 198" stroke="#1B4332" stroke-width="5" stroke-linecap="round" opacity="0.3"/>
    <!-- Side veins -->
    <path d="M150 102 C161 96 173 99 179 108" stroke="#1B4332" stroke-width="4" stroke-linecap="round" fill="none" opacity="0.3"/>
    <path d="M150 123 C162 117 175 120 182 130" stroke="#1B4332" stroke-width="4" stroke-linecap="round" fill="none" opacity="0.3"/>
    <!-- Gut wave -->
    <path d="M111 230 C123 219 134 242 146 230 C158 219 170 242 182 230 C193 219 202 230 208 230" stroke="${BRAND_MINT}" stroke-width="8" stroke-linecap="round" fill="none"/>
  </g>
  <!-- App name -->
  <text x="642" y="1460" font-family="${FONT_DISPLAY_STACK}" font-size="72" font-weight="700" letter-spacing="-1" fill="${BRAND_DEEP_GREEN}" text-anchor="middle">${APP_DISPLAY_NAME}</text>
  <!-- Tagline -->
  <text x="642" y="1520" font-family="${FONT_UI_STACK}" font-size="32" font-weight="500" fill="${BRAND_SAGE}" text-anchor="middle">Track. Understand. Thrive.</text>
  <!-- Decorative dots below tagline -->
  <circle cx="622" cy="1570" r="5" fill="${BRAND_MINT}" opacity="0.4"/>
  <circle cx="642" cy="1570" r="5" fill="${BRAND_MINT}" opacity="0.65"/>
  <circle cx="662" cy="1570" r="5" fill="${BRAND_MINT}" opacity="0.4"/>
</svg>`;

// ---------------------------------------------------------------------------
// Generate PNGs from SVG buffers using sharp
// ---------------------------------------------------------------------------

async function generateIcon() {
  const outputPath = resolve(ASSETS_DIR, 'icon.png');
  await sharp(Buffer.from(ICON_SVG))
    .resize(1024, 1024)
    .png({ compressionLevel: 9 })
    .toFile(outputPath);
  console.log(`✓ icon.png  →  ${outputPath}`);
}

async function generateAdaptiveIcon() {
  const outputPath = resolve(ASSETS_DIR, 'adaptive-icon.png');
  await sharp(Buffer.from(ADAPTIVE_ICON_SVG))
    .resize(1024, 1024)
    .png({ compressionLevel: 9 })
    .toFile(outputPath);
  console.log(`✓ adaptive-icon.png  →  ${outputPath}`);
}

async function generateSplash() {
  const outputPath = resolve(ASSETS_DIR, 'splash.png');
  await sharp(Buffer.from(SPLASH_SVG))
    .resize(1284, 2778)
    .png({ compressionLevel: 9 })
    .toFile(outputPath);
  console.log(`✓ splash.png  →  ${outputPath}`);
}

// Also regenerate the existing assets used by app.json so they match the new brand
async function generateSplashIcon() {
  // splash-icon.png: 200×200 transparent bg version for expo-splash-screen plugin
  const splashIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
    <rect width="200" height="200" rx="44" fill="${BRAND_DEEP_GREEN}"/>
    <path d="M100 38 C121 38 139 57 139 82 C139 107 121 126 100 134 C79 126 61 107 61 82 C61 57 79 38 100 38 Z" fill="white" opacity="0.95"/>
    <path d="M100 42 L100 129" stroke="#1B4332" stroke-width="3.5" stroke-linecap="round" opacity="0.3"/>
    <path d="M100 68 C108 64 116 66 120 72" stroke="#1B4332" stroke-width="3" stroke-linecap="round" fill="none" opacity="0.3"/>
    <path d="M100 82 C109 78 118 80 122 87" stroke="#1B4332" stroke-width="3" stroke-linecap="round" fill="none" opacity="0.3"/>
    <path d="M74 155 C80 149 87 160 93 154 C99 149 106 160 112 154 C118 149 123 154 126 154" stroke="${BRAND_MINT}" stroke-width="6" stroke-linecap="round" fill="none"/>
  </svg>`;
  const outputPath = resolve(ASSETS_DIR, 'splash-icon.png');
  await sharp(Buffer.from(splashIconSvg))
    .resize(200, 200)
    .png({ compressionLevel: 9 })
    .toFile(outputPath);
  console.log(`✓ splash-icon.png  →  ${outputPath}`);
}

async function generateAndroidForeground() {
  // Android adaptive icon foreground: transparent bg, icon on clear canvas
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
    <path d="M512 200 C620 200 720 300 720 430 C720 560 620 660 512 700 C404 660 304 560 304 430 C304 300 404 200 512 200 Z" fill="white" opacity="0.95"/>
    <path d="M512 220 L512 680" stroke="#1B4332" stroke-width="18" stroke-linecap="round" opacity="0.3"/>
    <path d="M512 350 C550 330 590 340 610 370" stroke="#1B4332" stroke-width="12" stroke-linecap="round" fill="none" opacity="0.3"/>
    <path d="M512 420 C550 400 600 410 620 445" stroke="#1B4332" stroke-width="12" stroke-linecap="round" fill="none" opacity="0.3"/>
    <path d="M512 490 C544 472 582 481 600 512" stroke="#1B4332" stroke-width="10" stroke-linecap="round" fill="none" opacity="0.25"/>
    <path d="M380 790 C420 750 460 830 500 790 C540 750 580 830 620 790 C660 750 690 790 710 790" stroke="${BRAND_MINT}" stroke-width="28" stroke-linecap="round" fill="none"/>
  </svg>`;
  const outputPath = resolve(ASSETS_DIR, 'android-icon-foreground.png');
  await sharp(Buffer.from(svg))
    .resize(1024, 1024)
    .png({ compressionLevel: 9 })
    .toFile(outputPath);
  console.log(`✓ android-icon-foreground.png  →  ${outputPath}`);
}

async function generateAndroidBackground() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
    <rect width="1024" height="1024" fill="${BRAND_DEEP_GREEN}"/>
  </svg>`;
  const outputPath = resolve(ASSETS_DIR, 'android-icon-background.png');
  await sharp(Buffer.from(svg))
    .resize(1024, 1024)
    .png({ compressionLevel: 9 })
    .toFile(outputPath);
  console.log(`✓ android-icon-background.png  →  ${outputPath}`);
}

async function generateAndroidMonochrome() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
    <path d="M512 200 C620 200 720 300 720 430 C720 560 620 660 512 700 C404 660 304 560 304 430 C304 300 404 200 512 200 Z" fill="white" opacity="0.95"/>
    <path d="M512 220 L512 680" stroke="black" stroke-width="18" stroke-linecap="round" opacity="0.3"/>
    <path d="M512 350 C550 330 590 340 610 370" stroke="black" stroke-width="12" stroke-linecap="round" fill="none" opacity="0.3"/>
    <path d="M512 420 C550 400 600 410 620 445" stroke="black" stroke-width="12" stroke-linecap="round" fill="none" opacity="0.3"/>
    <path d="M380 790 C420 750 460 830 500 790 C540 750 580 830 620 790 C660 750 690 790 710 790" stroke="white" stroke-width="28" stroke-linecap="round" fill="none"/>
  </svg>`;
  const outputPath = resolve(ASSETS_DIR, 'android-icon-monochrome.png');
  await sharp(Buffer.from(svg))
    .resize(1024, 1024)
    .png({ compressionLevel: 9 })
    .toFile(outputPath);
  console.log(`✓ android-icon-monochrome.png  →  ${outputPath}`);
}

async function generateFavicon() {
  // 196×196 favicon
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 196 196" width="196" height="196">
    <rect width="196" height="196" rx="42" fill="${BRAND_DEEP_GREEN}"/>
    <path d="M98 36 C120 36 138 56 138 80 C138 104 120 122 98 130 C76 122 58 104 58 80 C58 56 76 36 98 36 Z" fill="white" opacity="0.95"/>
    <path d="M98 40 L98 125" stroke="#1B4332" stroke-width="3" stroke-linecap="round" opacity="0.3"/>
    <path d="M72 150 C77 144 84 154 90 148 C96 143 102 154 108 148 C114 143 119 148 122 148" stroke="${BRAND_MINT}" stroke-width="5.5" stroke-linecap="round" fill="none"/>
  </svg>`;
  const outputPath = resolve(ASSETS_DIR, 'favicon.png');
  await sharp(Buffer.from(svg))
    .resize(196, 196)
    .png({ compressionLevel: 9 })
    .toFile(outputPath);
  console.log(`✓ favicon.png  →  ${outputPath}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('\nNutriFlow Asset Generator');
  console.log('=======================\n');

  await Promise.all([
    generateIcon(),
    generateAdaptiveIcon(),
    generateSplash(),
    generateSplashIcon(),
    generateAndroidForeground(),
    generateAndroidBackground(),
    generateAndroidMonochrome(),
    generateFavicon(),
  ]);

  console.log('\nAll assets generated successfully.\n');
}

main().catch((err) => {
  console.error('Asset generation failed:', err);
  process.exit(1);
});
