/**
 * Story Experience — geometry, copy, motion gating and accessibility.
 *
 * Two halves, for the same reason the onboarding handoff tests split:
 *
 *   1. heroHeightFor and the frame descriptors are pure and tested directly.
 *      The hero geometry is the one thing that cannot be judged on a
 *      simulator running a large phone — the iPhone SE is the binding case and
 *      it is arithmetic, so it is asserted here.
 *
 *   2. The screens are asserted structurally. What matters most about this
 *      change is not what renders but what is guaranteed: that only the active
 *      frame is exposed to VoiceOver, that nothing auto-advances, that Reduce
 *      Motion is honoured, and that the copy claims no capability the product
 *      does not have.
 */

import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import {
  heroHeightFor,
  STORY_FRAMES,
  STORY_FRAME_COUNT,
  COMPACT_HEIGHT_MAX,
  HERO_RATIO_COMPACT,
  HERO_RATIO_STANDARD,
  STORY_CHROME_RESERVE,
  captionReserveFor,
  CONSIDER_CONTEXTS,
} from '../../components/story/storyFrames';
import { translations } from '../i18n';
import { Events } from '../analytics';

const root = join(__dirname, '..', '..');
const read = (...p: string[]) => readFileSync(join(root, ...p), 'utf8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const CAROUSEL = strip(read('components', 'story', 'StoryCarousel.tsx'));
const FRAME = strip(read('components', 'story', 'StoryFrame.tsx'));
const WELCOME = strip(read('app', '(onboarding)', 'welcome.tsx'));
const MOTION_HOOK = strip(read('lib', 'useReducedMotion.ts'));
const VIGNETTES = strip(read('components', 'story', 'ContextVignettes.tsx'));

/** Source image, per the approved asset spec. */
const IMG_W = 1320;
const IMG_H = 1650;

/**
 * Visible vertical slice of the source image, in source pixels, for a device.
 * Cover scales the image to fill the width, so the crop is purely vertical.
 */
function visibleBand(deviceW: number, deviceH: number, scale = 1, available?: number) {
  const hero = heroHeightFor(deviceH, available);
  const renderedH = deviceW * (IMG_H / IMG_W) * scale;
  const fraction = hero / renderedH;
  const cropHalf = ((1 - fraction) / 2) * IMG_H;
  return { top: Math.round(cropHalf), bottom: Math.round(IMG_H - cropHalf), fraction };
}

/**
 * Story-area height each device is left with once the fixed Welcome chrome is
 * subtracted: safe-area insets, the top bar, and the CTA block.
 */
const TOP_BAR = 6 + 44 + 4; // padding + the language switcher's protected 44pt target
const CTA_FIXED = 10 + 52 + 8 + 48 + 8 + 32; // padTop, primary, gap, secondary, gap, legal
const DEVICES = [
  { name: 'SE', w: 375, h: 667, top: 20, bottom: 0 },
  { name: '13 mini', w: 375, h: 812, top: 50, bottom: 34 },
  { name: '16', w: 393, h: 852, top: 59, bottom: 34 },
  { name: '16 Pro Max', w: 440, h: 956, top: 62, bottom: 34 },
].map((d) => ({
  ...d,
  // The bottom inset is absorbed as the CTA block's padding, not stacked.
  area: d.h - (d.top + TOP_BAR) - (CTA_FIXED + Math.max(12, d.bottom)),
}));

const SE = DEVICES[0];
const SE_STORY_AREA = SE.area;

/** Where the asset brief puts the face, the hands and every key object. */
const TIER_A_TOP = 350;
const TIER_A_BOTTOM = 1150;
const PUSH_IN = Number(/PUSH_IN_SCALE = ([\d.]+)/.exec(FRAME)?.[1]);

describe('hero geometry', () => {
  test('compact and standard ratios are applied on the right side of the threshold', () => {
    expect(heroHeightFor(667)).toBe(Math.round(667 * HERO_RATIO_COMPACT));
    expect(heroHeightFor(812)).toBe(Math.round(812 * HERO_RATIO_STANDARD));
    expect(heroHeightFor(COMPACT_HEIGHT_MAX - 1)).toBe(
      Math.round((COMPACT_HEIGHT_MAX - 1) * HERO_RATIO_COMPACT),
    );
    expect(heroHeightFor(COMPACT_HEIGHT_MAX)).toBe(
      Math.round(COMPACT_HEIGHT_MAX * HERO_RATIO_STANDARD),
    );
  });

  test('unclamped, the iPhone SE gives the audited y 285–1365 band', () => {
    const se = visibleBand(375, 667);
    expect(se.top).toBe(285);
    expect(se.bottom).toBe(1365);
  });

  test('the ratio is a ceiling the clamp can only lower, never raise', () => {
    for (const { h, area } of DEVICES) {
      expect(heroHeightFor(h, area)).toBeLessThanOrEqual(heroHeightFor(h));
    }
  });

  test('the caption and indicator always get their room, on every device', () => {
    // The failure this prevents was silent: the caption clipped off the bottom
    // of the story area, with nothing to scroll it back into view.
    for (const { h, area } of DEVICES) {
      expect(area - heroHeightFor(h, area)).toBeGreaterThanOrEqual(STORY_CHROME_RESERVE);
    }
  });

  test('the largest phone reaches the ratio outright, so the clamp is not load-bearing there', () => {
    const proMax = DEVICES[3];
    expect(heroHeightFor(proMax.h, proMax.area)).toBe(heroHeightFor(proMax.h));
  });

  test('larger phones crop less, so the SE alone constrains the artwork', () => {
    const se = visibleBand(375, 667).fraction;
    for (const [w, h] of [
      [375, 812], // 13 mini
      [393, 852], // 16
      [440, 956], // 16 Pro Max
    ]) {
      expect(visibleBand(w, h).fraction).toBeGreaterThan(se);
    }
  });

  test('the hero never letterboxes — cover always fills the width', () => {
    for (const [w, h] of [
      [375, 667],
      [375, 812],
      [393, 852],
      [440, 956],
    ]) {
      // Letterboxing would mean the rendered image is shorter than the window.
      expect(w * (IMG_H / IMG_W)).toBeGreaterThan(heroHeightFor(h));
    }
  });

  test('Tier A survives on EVERY supported device, at rest', () => {
    for (const { name, w, h, area } of DEVICES) {
      const band = visibleBand(w, h, 1, area);
      expect(`${name} top ${band.top}`).toBe(`${name} top ${Math.min(band.top, TIER_A_TOP)}`);
      expect(band.bottom).toBeGreaterThanOrEqual(TIER_A_BOTTOM);
    }
  });

  test('Tier A also survives at the end of the push-in, where the crop is tightest', () => {
    expect(PUSH_IN).toBeGreaterThan(1);
    for (const { name, w, h, area } of DEVICES) {
      const held = visibleBand(w, h, PUSH_IN, area);
      expect(`${name} top ${held.top}`).toBe(`${name} top ${Math.min(held.top, TIER_A_TOP)}`);
      expect(held.bottom).toBeGreaterThanOrEqual(TIER_A_BOTTOM);
    }
  });

  test('the iPhone SE lands within a few points of the full ratio', () => {
    // Before the indicator moved onto the hero this was 205pt against 307.
    const hero = heroHeightFor(667, SE_STORY_AREA);
    expect(heroHeightFor(667) - hero).toBeLessThanOrEqual(5);
  });

  test('the reserve grows with Dynamic Type, so the caption can never clip', () => {
    expect(captionReserveFor(1)).toBe(STORY_CHROME_RESERVE);
    expect(captionReserveFor(1.5)).toBeGreaterThan(captionReserveFor(1));
    // Capped, matching maxFontSizeMultiplier on the two Text nodes.
    expect(captionReserveFor(3)).toBe(captionReserveFor(1.5));
    // Never smaller than the base, even if the system reports a scale below 1.
    expect(captionReserveFor(0.8)).toBe(STORY_CHROME_RESERVE);
  });

  test('at the largest supported text size the hero shrinks rather than the caption clipping', () => {
    for (const { h, area } of DEVICES) {
      const big = heroHeightFor(h, area, captionReserveFor(1.5));
      expect(big).toBeLessThanOrEqual(heroHeightFor(h, area));
      expect(area - big).toBeGreaterThanOrEqual(captionReserveFor(1.5));
    }
  });

  test('the caption is capped at two lines, matching what the reserve budgets', () => {
    expect(FRAME).toContain('numberOfLines={2}');
    expect(FRAME).not.toMatch(/numberOfLines=\{[^}]*3/);
    expect(FRAME).toContain('maxFontSizeMultiplier={TITLE_SCALE_CAP}');
    expect(FRAME).toContain('maxFontSizeMultiplier={BODY_SCALE_CAP}');
  });

  test('the indicator is not reserved beneath the hero — it overlays it', () => {
    expect(CAROUSEL).toContain('styles.indicatorOverlay');
    expect(CAROUSEL).toContain("position: 'absolute'");
    expect(CAROUSEL).toContain('heroHeight - INDICATOR_INSET');
    // Reserve now covers the caption only: padding + 2 title lines + gap + 2 body lines.
    expect(STORY_CHROME_RESERVE).toBe(14 + 2 * 30 + 4 + 2 * 20);
  });

  test('geometry depends on the window only, so all four frames crop identically', () => {
    expect(String(heroHeightFor)).not.toMatch(/index|frame|slide/i);
  });
});

describe('frame descriptors', () => {
  test('there are four, in the approved emotional order', () => {
    expect(STORY_FRAME_COUNT).toBe(4);
    // Confidence before patterns: the story is chronological, and ending on a
    // cleared plate then cutting back to a full one ran backwards in time.
    expect(STORY_FRAMES.map((f) => f.key)).toEqual([
      'consider',
      'scan',
      'confidence',
      'patterns',
    ]);
  });

  test('each frame carries the artwork that was generated for it', () => {
    // Filenames are frozen to the scene, not to the slot, so the third slide is
    // emma-4 and the fourth is emma-3. This pins that on purpose.
    const src = strip(read('components', 'story', 'storyFrames.ts'));
    const order = [...src.matchAll(/assets\/story\/(emma-\d)\.webp/g)].map((m) => m[1]);
    expect(order).toEqual(['emma-1', 'emma-2', 'emma-4', 'emma-3']);
  });

  test('copy is index-matched to the descriptors, so both moved together', () => {
    // The failure this guards against is silent: reorder one and every slide
    // shows the wrong words with no error anywhere.
    for (const lang of ['en', 'de'] as const) {
      const frames = translations[lang].welcome.story.frames;
      expect(frames).toHaveLength(STORY_FRAME_COUNT);
    }
    expect(translations.en.welcome.story.frames[2].title).toBe('Understand. Choose better.');
    expect(translations.en.welcome.story.frames[3].title).toBe('See your patterns over time');
    expect(translations.de.welcome.story.frames[2].title).toBe('Verstehen. Besser wählen.');
    expect(translations.de.welcome.story.frames[3].title).toBe('Erkenne deine Muster mit der Zeit');
    // The choosing scene must not be described as looking back, or vice versa.
    expect(translations.en.welcome.story.frames[2].alt).toContain('choosing between');
    expect(translations.en.welcome.story.frames[3].alt).toContain('looking back');
  });

  test('every frame has a poster', () => {
    for (const frame of STORY_FRAMES) expect(frame.poster).toBeDefined();
  });

  test('no frame ships a video yet — no video package is installed', () => {
    for (const frame of STORY_FRAMES) expect(frame.video).toBeUndefined();
  });

  test('only the first frame is motion-led', () => {
    expect(STORY_FRAMES[0].motion).toBe('push-in');
    for (const frame of STORY_FRAMES.slice(1)) expect(frame.motion).toBe('none');
  });
});

describe('no auto-advance', () => {
  test('the carousel owns no timer', () => {
    expect(CAROUSEL).not.toMatch(/setInterval|setTimeout/);
  });

  test('paging only ever follows a gesture or an accessibility action', () => {
    // scrollTo appears once, inside goTo, which is reached from the
    // accessibility action handler only.
    expect(CAROUSEL.match(/scrollTo\(/g)).toHaveLength(1);
    expect(CAROUSEL).toContain('onMomentumScrollEnd={handleMomentumEnd}');
  });

  test('Welcome no longer runs the retired tagline cycler', () => {
    expect(WELCOME).not.toMatch(/setInterval|taglineOpacity|TAGLINE_/);
    expect(WELCOME).not.toContain('valuePoints');
  });
});

describe('accessibility', () => {
  test('non-active frames are hidden from VoiceOver on both platforms', () => {
    expect(FRAME).toContain('accessibilityElementsHidden={!isActive}');
    expect(FRAME).toContain("importantForAccessibility={isActive ? 'auto' : 'no-hide-descendants'}");
  });

  test('the indicator is an adjustable control, so VoiceOver can page the story', () => {
    expect(CAROUSEL).toContain('accessibilityRole="adjustable"');
    expect(CAROUSEL).toContain('onAccessibilityAction={handleAccessibilityAction}');
    expect(CAROUSEL).toContain("actionName === 'increment'");
    expect(CAROUSEL).toContain("actionName === 'decrement'");
  });

  test('position is announced as text, never by dot colour alone', () => {
    expect(CAROUSEL).toContain('accessibilityValue={{ text: positionText }}');
    // The active dot also differs in width, not only in colour.
    expect(CAROUSEL).toMatch(/dotActive:\s*\{\s*width:/);
  });

  test('each frame carries a scene description', () => {
    expect(FRAME).toContain('accessibilityLabel={alt}');
  });

  test('the story exposes no interactive control other than the indicator', () => {
    expect(FRAME).not.toMatch(/onPress|Pressable|TouchableOpacity/);
  });
});

describe('reduce motion', () => {
  test('the hook listens for changes rather than reading once at mount', () => {
    expect(MOTION_HOOK).toContain("addEventListener(\n      'reduceMotionChanged'");
    expect(MOTION_HOOK).toContain('subscription.remove()');
  });

  test('it fails closed to motion-allowed', () => {
    expect(MOTION_HOOK).toContain('useState(false)');
  });

  test('every animated property is gated on it', () => {
    expect(FRAME).toContain('if (reduceMotion || asset.motion !== ');
    expect(FRAME).toContain('const opacity = reduceMotion');
    expect(FRAME).toContain('if (reduceMotion) return { opacity: 1');
  });

  test('programmatic paging jumps rather than glides under reduce motion', () => {
    expect(CAROUSEL).toContain('animated: !reduceMotion');
  });

  test('the push-in plays once and holds — it never repeats or reverses', () => {
    expect(FRAME).toContain('withTiming(PUSH_IN_SCALE');
    expect(FRAME).not.toMatch(/withRepeat|repeat:|reverse/);
  });
});

describe('analytics', () => {
  test('the event is registered and carries only a frame index', () => {
    expect(Events.ONBOARDING_STORY_VIEWED).toBe('onboarding_story_viewed');
    expect(CAROUSEL).toContain('track(Events.ONBOARDING_STORY_VIEWED, { index: next + 1 })');
  });

  test('it fires at most once per frame per visit', () => {
    expect(CAROUSEL).toContain('if (seen.current.has(next)) return;');
    expect(CAROUSEL).toContain('seen.current.add(next)');
  });

  test('no health, meal or identifying data is attached', () => {
    for (const banned of ['user', 'email', 'goal', 'meal', 'symptom', 'answers']) {
      expect(CAROUSEL.toLowerCase()).not.toContain(`${banned}:`);
    }
  });
});

describe('story copy', () => {
  const langs = ['en', 'de'] as const;

  test('both languages define four frames with title, body and alt', () => {
    for (const lang of langs) {
      const frames = translations[lang].welcome.story.frames;
      expect(frames).toHaveLength(4);
      for (const frame of frames) {
        expect(frame.title.length).toBeGreaterThan(0);
        expect(frame.body.length).toBeGreaterThan(0);
        expect(frame.alt.length).toBeGreaterThan(0);
      }
    }
  });

  test('German is genuinely translated, not copied from English', () => {
    for (let i = 0; i < 4; i += 1) {
      expect(translations.de.welcome.story.frames[i].title).not.toBe(
        translations.en.welcome.story.frames[i].title,
      );
    }
  });

  test('the position format carries both placeholders in both languages', () => {
    for (const lang of langs) {
      const format = translations[lang].welcome.story.positionFormat;
      expect(format).toContain('{current}');
      expect(format).toContain('{total}');
    }
  });

  test('no scene description claims the app tracks activity it does not record', () => {
    // GutWell records meals, notes and check-ins. It does not detect driving,
    // work, study, exercise or walking — those are the user's own
    // considerations, and the accessibility copy must not say otherwise.
    const CLAIMS = [
      /\btracks?\s+(her|your)\b/i,
      /\bdetects?\b/i,
      /\bmonitors?\b/i,
      /\bautomatically\b/i,
      /\berkennt automatisch\b/i,
      /\büberwacht\b/i,
    ];
    for (const lang of langs) {
      for (const frame of translations[lang].welcome.story.frames) {
        for (const claim of CLAIMS) {
          expect(`${lang}: ${frame.alt}`).not.toMatch(claim);
        }
      }
    }
  });

  test('no frame promises an outcome or shows a score', () => {
    const BANNED = [/\bguarantee/i, /\bcure/i, /\bproven\b/i, /\d+\s*%/, /\d+\s*\/\s*10/];
    for (const lang of langs) {
      const story = translations[lang].welcome.story;
      for (const frame of story.frames) {
        for (const pattern of BANNED) {
          expect(`${frame.title} ${frame.body} ${frame.alt}`).not.toMatch(pattern);
        }
      }
    }
  });
});

describe('welcome frame is otherwise unchanged', () => {
  test('routing, stage write and both calls to action are intact', () => {
    expect(WELCOME).toContain("void saveLocalStage('goal')");
    expect(WELCOME).toContain("router.push('/(onboarding)/questions')");
    expect(WELCOME).toContain("router.push('/(auth)/login')");
    expect(WELCOME).toContain('track(Events.ONBOARDING_STARTED)');
  });

  test('the legal links still open the existing screens', () => {
    expect(WELCOME).toContain("router.push('/terms-of-service')");
    expect(WELCOME).toContain("router.push('/privacy-policy')");
  });

  test('the shared language switcher is still used, not reimplemented', () => {
    expect(WELCOME).toContain('<LanguageSwitcher />');
    expect(WELCOME).not.toContain('LANGUAGE_LABELS');
  });

  test('the story never renders over the call to action', () => {
    // storyArea is a flex sibling of the CTA block, so it cannot overlap it.
    expect(WELCOME).toContain('styles.storyArea');
    expect(WELCOME).not.toMatch(/position:\s*'absolute'/);
  });

  test('onboarding_stage is written but never completed from here', () => {
    expect(WELCOME).not.toContain('completeOnboarding');
    expect(WELCOME).not.toContain('onboarding_completed');
  });
});

describe('story artwork', () => {
  const ASSET_DIR = join(root, 'assets', 'story');
  /** Lossy WebP header: 'RIFF' … 'WEBP' 'VP8 ', then 14-bit width/height at 26. */
  function webpSize(file: string) {
    const b = readFileSync(join(ASSET_DIR, file));
    expect(b.subarray(0, 4).toString()).toBe('RIFF');
    expect(b.subarray(8, 16).toString()).toBe('WEBPVP8 ');
    return {
      width: b.readUInt16LE(26) & 0x3fff,
      height: b.readUInt16LE(28) & 0x3fff,
      bytes: b.length,
      hasAlpha: b.subarray(12, 16).toString() === 'VP8L' || b.subarray(12, 16).toString() === 'VP8X',
    };
  }

  test('all four frames ship real artwork at the approved spec', () => {
    for (const n of [1, 2, 3, 4]) {
      const a = webpSize(`emma-${n}.webp`);
      // 1320x1650 is the 4:5 the whole hero geometry is computed against.
      expect(`emma-${n} ${a.width}x${a.height}`).toBe(`emma-${n} 1320x1650`);
      // Four of these load on the first screen of the app.
      expect(`emma-${n} ${a.bytes <= 400 * 1024}`).toBe(`emma-${n} true`);
      // Lossy VP8 only: an alpha channel would be dead weight over an opaque
      // cover-cropped hero.
      expect(a.hasAlpha).toBe(false);
    }
  });

  test('every descriptor points at production art, and the placeholders are gone', () => {
    const src = strip(read('components', 'story', 'storyFrames.ts'));
    for (const n of [1, 2, 3, 4]) expect(src).toContain(`assets/story/emma-${n}.webp`);
    expect(src).not.toContain('placeholder');
    // The obsolete files must not linger in the bundle.
    expect(readdirSync(ASSET_DIR).filter((f) => f.startsWith('placeholder'))).toEqual([]);
    expect(readdirSync(ASSET_DIR).sort()).toEqual([
      'emma-1.webp',
      'emma-2.webp',
      'emma-3.webp',
      'emma-4.webp',
    ]);
  });

  test('only frame 1 animates; the rest are stills', () => {
    expect(STORY_FRAMES.map((f) => f.motion)).toEqual(['push-in', 'none', 'none', 'none']);
  });
});

describe('Frame 1 thought vignettes', () => {
  test('exactly three wordless thoughts ship, on frame 1 only', () => {
    // Three is a product decision, not a coincidence: five small glyphs read as
    // a toolbar however faint they were made.
    expect(CONSIDER_CONTEXTS).toHaveLength(3);
    expect(STORY_FRAMES[0].contexts).toBe(CONSIDER_CONTEXTS);
    for (const frame of STORY_FRAMES.slice(1)) expect(frame.contexts).toBeUndefined();
  });

  test('they are work, driving and walking — and nothing else', () => {
    expect(CONSIDER_CONTEXTS.map((c) => c.icon)).toEqual([
      'laptop-outline',
      'car-outline',
      'walk-outline',
    ]);
  });

  test('the dropped concepts leave no dead support behind', () => {
    const FRAMES_SRC = strip(read('components', 'story', 'storyFrames.ts'));
    for (const gone of ['barbell', 'calendar']) {
      expect(FRAMES_SRC).not.toContain(gone);
      expect(VIGNETTES).not.toContain(gone);
    }
  });

  test('they carry NO text — icons only', () => {
    // A label would ship untranslated to German users and, worse, would read
    // as a feature list for tracking the app does not do.
    expect(VIGNETTES).not.toMatch(/<Text[\s>]/);
    for (const word of ['Drive', 'Study', 'Work', 'Exercise', 'Walk', 'label:']) {
      expect(VIGNETTES).not.toContain(word);
    }
  });

  test('they claim no functionality — nothing rendered implies a record', () => {
    // Scoped to what actually draws. A status glyph, a number or a progress
    // element would turn "she is considering this" into "the app logged this".
    for (const glyph of ['checkmark', 'stats-', 'analytics', 'pulse', 'trending']) {
      expect(VIGNETTES).not.toContain(glyph);
    }
    for (const element of ['<Text', 'ProgressBar', 'ActivityIndicator', 'Badge']) {
      expect(VIGNETTES).not.toContain(element);
    }
    // Every icon is a plain lifestyle outline glyph.
    for (const c of CONSIDER_CONTEXTS) expect(c.icon).toMatch(/-outline$/);
  });

  test('they are hidden from VoiceOver, so nothing can imply tracking', () => {
    expect(VIGNETTES).toContain('accessibilityElementsHidden');
    expect(VIGNETTES).toContain('importantForAccessibility="no-hide-descendants"');
  });

  test('they never intercept the paging gesture', () => {
    expect(VIGNETTES).toContain('pointerEvents="none"');
  });

  test('positions arc around her face rather than over it', () => {
    // Nothing in the horizontal band her head occupies, and nothing in the
    // lower half where the food sits.
    for (const c of CONSIDER_CONTEXTS) {
      expect(`${c.icon} x=${c.x}`).toBe(`${c.icon} x=${c.x < 30 || c.x > 70 ? c.x : 'CENTRE'}`);
      expect(c.y).toBeLessThanOrEqual(50);
      // Inside the window on every device: these are percentages of the hero.
      expect(c.x).toBeGreaterThan(5);
      expect(c.x).toBeLessThan(95);
    }
  });

  test('they sit outside the scaling photo, so they hold position during the push-in', () => {
    const hero = FRAME.slice(FRAME.indexOf('styles.heroWindow'), FRAME.indexOf('styles.caption'));
    expect(hero.indexOf('</Animated.View>')).toBeLessThan(hero.indexOf('<ContextVignettes'));
  });

  test('they read as soft thought scenes, not as UI chips', () => {
    // The shape is what stopped them reading as buttons, which is what bought
    // the contrast to actually be visible: no border at all, asymmetric
    // corners, a tilt, and a neutral surface over the blur rather than under.
    expect(VIGNETTES).toContain('const SIZE = 60;');
    expect(VIGNETTES).toContain('BlurView');
    expect(VIGNETTES).toContain("backgroundColor: 'rgba(16,20,18,0.46)'");
    expect(VIGNETTES).toContain('rotate:');
    // A border is the single strongest "this is tappable" signal.
    expect(VIGNETTES).not.toContain('borderWidth');
    expect(VIGNETTES).not.toContain('borderColor');
    // Not a perfect circle: at SIZE 60 a true circle is 30, so every blob has
    // at least one corner pulled in.
    const radii = [...VIGNETTES.matchAll(/border(?:Top|Bottom)(?:Left|Right)Radius: (\d+)/g)].map(
      (m) => Number(m[1]),
    );
    expect(radii.length).toBe(12);
    expect(Math.min(...radii)).toBeLessThan(30);
    expect(Math.max(...radii)).toBeLessThanOrEqual(30);
  });

  test('they rest fully opaque — legibility beats elegance here', () => {
    // 0.82 was the "translucent keeps them secondary" theory. On a real phone
    // over a bright kitchen it only cost contrast. They stay secondary through
    // size, placement and having no text.
    expect(Number(/VIGNETTE_OPACITY = ([\d.]+)/.exec(VIGNETTES)?.[1])).toBe(1);
    expect(VIGNETTES).toContain('opacity: progress.value * VIGNETTE_OPACITY');
  });

  test('the contrast comes from a fixed scrim, not from averaging the photo', () => {
    // Blur averages what is behind it, so a heavily blurred disc over the
    // window went bright and swallowed the white glyph. Light blur, solid-ish
    // neutral surface: the glyph reads the same everywhere in the frame.
    const intensity = Number(/intensity=\{(\d+)\}/.exec(VIGNETTES)?.[1]);
    expect(intensity).toBeLessThanOrEqual(12);
    const alpha = Number(/rgba\(16,20,18,([\d.]+)\)/.exec(VIGNETTES)?.[1]);
    expect(alpha).toBeGreaterThanOrEqual(0.4);
  });

  test('the glyph stays upright however far the blob tilts', () => {
    // The icon is a sibling of the rotated wrapper, not a child of it.
    const wrap = VIGNETTES.indexOf('styles.shadowWrap');
    expect(VIGNETTES.indexOf('styles.iconLayer')).toBeGreaterThan(wrap);
    expect(VIGNETTES.indexOf('</View>', wrap)).toBeLessThan(VIGNETTES.indexOf('<Ionicons'));
  });

  test('each thought scales up and rises into place, once, by a visible amount', () => {
    // The amplitudes that failed on device: 5pt rise, 0.06 of scale. These are
    // the approved replacements, and the floors below are the point of the test
    // — anything smaller has already been proven imperceptible three times.
    expect(VIGNETTES).toContain(
      'scale: VIGNETTE_START_SCALE + progress.value * (1 - VIGNETTE_START_SCALE)',
    );
    expect(VIGNETTES).toContain('translateY: (1 - progress.value) * VIGNETTE_RISE');
    expect(Number(/VIGNETTE_RISE = (\d+)/.exec(VIGNETTES)?.[1])).toBeGreaterThanOrEqual(12);
    expect(Number(/VIGNETTE_START_SCALE = ([\d.]+)/.exec(VIGNETTES)?.[1])).toBeLessThanOrEqual(0.88);
  });

  test('every blob fits on screen at its position on the narrowest phone', () => {
    const SIZE = 60;
    for (const c of CONSIDER_CONTEXTS) {
      const px = (c.x / 100) * 375;
      expect(`${c.icon} left ${px - SIZE / 2 >= 0}`).toBe(`${c.icon} left true`);
      expect(`${c.icon} right ${px + SIZE / 2 <= 375}`).toBe(`${c.icon} right true`);
    }
  });

  test('the gap across the centre leaves her face, hand and food clear', () => {
    const xs = CONSIDER_CONTEXTS.map((c) => c.x).sort((a, b) => a - b);
    expect(xs[xs.length - 1] - xs[0]).toBeGreaterThanOrEqual(60);
  });

  test('Reduce Motion shows them in their final state without animating', () => {
    expect(VIGNETTES).toContain('if (reduceMotion) {');
    expect(VIGNETTES).toContain('progress.value = 1;');
  });

  test('the reveal is staggered and one-shot', () => {
    expect(VIGNETTES).toContain('withDelay(');
    expect(VIGNETTES).toContain('index * VIGNETTE_STAGGER_MS');
    expect(VIGNETTES).not.toMatch(/withRepeat|reverse|loop/);
  });
});

describe('the story motion comes from the thoughts, not the camera', () => {
  test('the hero is near-static — the louder push-in was tried and rejected', () => {
    // 1.04 was invisible; 1.08 was visible and read as a restless photograph
    // rather than as storytelling. A still portrait is the wrong carrier.
    expect(PUSH_IN).toBeGreaterThan(1);
    expect(PUSH_IN).toBeLessThanOrEqual(1.01);
  });

  test('nothing animates until the photo is actually on screen', () => {
    // The failure three rounds of tuning could not fix. Mount is not paint: the
    // hero has to be fetched and decoded, and the sequence was finishing over a
    // blank frame. Amplitude was never the problem.
    expect(FRAME).toContain('const play = isActive && posterReady;');
    expect(FRAME).toContain('onLoad={() => setPosterReady(true)}');
    // A decode failure must not swallow the story.
    expect(FRAME).toContain('onError={() => setPosterReady(true)}');
    expect(FRAME).toMatch(/setTimeout\(\(\) => setPosterReady\(true\), POSTER_TIMEOUT_MS\)/);
    // Both the hero and the thoughts wait for it.
    expect(FRAME).toContain('play={play}');
    expect(FRAME).not.toContain('play={isActive}');
  });

  test('each thought enters over 500-600ms at the approved beats', () => {
    const first = Number(/VIGNETTE_FIRST_DELAY_MS = (\d+)/.exec(VIGNETTES)?.[1]);
    const stagger = Number(/VIGNETTE_STAGGER_MS = (\d+)/.exec(VIGNETTES)?.[1]);
    const fade = Number(/VIGNETTE_FADE_MS = (\d+)/.exec(VIGNETTES)?.[1]);
    expect(fade).toBeGreaterThanOrEqual(500);
    expect(fade).toBeLessThanOrEqual(600);
    // 0.35s, 1.10s, 1.85s — far enough apart to be counted, not blended.
    expect(CONSIDER_CONTEXTS.map((_, i) => first + i * stagger)).toEqual([350, 1100, 1850]);
    // Each thought is fully at rest before the next one starts, which is what
    // makes them read as three events rather than one.
    expect(stagger).toBeGreaterThanOrEqual(fade);
  });

  test('all three are up by 3s and nothing moves afterwards', () => {
    const pushMs = Number(/PUSH_IN_MS = (\d+)/.exec(FRAME)?.[1]);
    const first = Number(/VIGNETTE_FIRST_DELAY_MS = (\d+)/.exec(VIGNETTES)?.[1]);
    const stagger = Number(/VIGNETTE_STAGGER_MS = (\d+)/.exec(VIGNETTES)?.[1]);
    const fade = Number(/VIGNETTE_FADE_MS = (\d+)/.exec(VIGNETTES)?.[1]);
    const vignettesEnd = first + (CONSIDER_CONTEXTS.length - 1) * stagger + fade;
    expect(vignettesEnd).toBeLessThanOrEqual(3000);
    // The hero must not still be creeping after the last thought lands.
    expect(pushMs).toBeLessThanOrEqual(vignettesEnd);
  });

  test('the held crop still clears Tier A on every device', () => {
    for (const { name, w, h, area } of DEVICES) {
      const held = visibleBand(w, h, PUSH_IN, area);
      expect(`${name} ${held.top}`).toBe(`${name} ${Math.min(held.top, TIER_A_TOP)}`);
      expect(held.bottom).toBeGreaterThanOrEqual(TIER_A_BOTTOM);
    }
  });
});
