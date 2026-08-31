/**
 * components/story/storyFrames.ts
 *
 * The four Story Experience frames, and the hero geometry they are composed
 * against. Data and arithmetic only — no React — so the geometry can be tested
 * without rendering anything.
 *
 * ── Hero geometry ───────────────────────────────────────────────────────────
 * The hero is a cover-cropped window onto a 4:5 image. Its height comes from
 * the window height alone, never from the frame, so all four crop identically:
 * a per-slide offset would make Emma drift between frames and break the "four
 * frames from one film" illusion the whole story depends on.
 *
 * Width is never cropped. The window is always wider than it is tall relative
 * to 4:5, so cover scales the image to fill the width exactly and overflows
 * vertically. That is what makes the safe band a purely vertical concern.
 *
 * On the smallest supported screen (iPhone SE, 375×667) the visible slice is
 * y 285–1365 of a 1320×1650 source. Every asset is authored against that.
 *
 * ── The video seam ──────────────────────────────────────────────────────────
 * Frame 1 is intended to become a short silent motion asset. No video package
 * is installed (expo-av and expo-video are both absent, and adding one needs a
 * native rebuild), so `video` is undefined on every frame today and StoryFrame
 * renders the poster path.
 *
 * The descriptor carries the field regardless: adding video later means
 * filling in one branch in StoryFrame, not restructuring the carousel.
 */

/** Below this window height the CTA block needs the extra room. iPhone SE (667) is compact; the 13 mini (812) is not. */
export const COMPACT_HEIGHT_MAX = 700;
export const HERO_RATIO_COMPACT = 0.46;
export const HERO_RATIO_STANDARD = 0.52;

/**
 * Points the caption needs beneath the hero: 14pt of padding, a two-line title
 * at 30pt line height, a 4pt gap, and a two-line body at 20pt.
 *
 * The value is the WORST case, not the typical one. Both lines usually fit on
 * one, but the longest German frame at large Dynamic Type reaches two, and
 * reserving the typical case would clip exactly the translations that need the
 * room.
 *
 * The page indicator is deliberately NOT in this number: it overlays the
 * hero's lower edge rather than occupying a row of its own. That single change
 * returns 60pt, which is most of what makes the geometry work — before it, an
 * iPhone SE could only afford a 205pt hero and cropped straight through the
 * asset brief's Tier A region.
 *
 * With it, an SE gets 305pt against the 307pt the ratio asks for, and Tier A
 * (y 350–1150) survives on every supported device including at the end of the
 * push-in. The asset brief needs no revision.
 */
export const STORY_CHROME_RESERVE = 118;

/** Caps applied via maxFontSizeMultiplier on the caption's two Text nodes. */
export const TITLE_SCALE_CAP = 1.5;
export const BODY_SCALE_CAP = 1.4;

/**
 * The caption reserve at a given Dynamic Type scale.
 *
 * Line heights grow with the text, so a reserve fixed at fontScale 1.0 is only
 * correct for a user who never changed the setting. At the caps above, the
 * caption needs 164pt rather than 118 — 46pt that would otherwise have been
 * clipped off the bottom of the story area with no way to scroll it back.
 *
 * The hero absorbs the difference. On an iPhone SE at the largest supported
 * size that costs enough crop to reach into Tier A; the alternative is
 * unreadable copy, which is worse.
 */
export function captionReserveFor(fontScale: number): number {
  const title = 30 * 2 * Math.min(Math.max(fontScale, 1), TITLE_SCALE_CAP);
  const body = 20 * 2 * Math.min(Math.max(fontScale, 1), BODY_SCALE_CAP);
  return Math.round(14 + title + 4 + body);
}

/**
 * Hero height in points.
 *
 * `availableHeight` is what the story area actually measured. When it is
 * given, the hero is clamped to leave STORY_CHROME_RESERVE for the caption and
 * indicator; on every device where the ratio already fits — everything from
 * the 13 mini upward — the clamp is inert and the ratio wins unchanged.
 *
 * Still a pure function of the window and the measurement, never of the frame
 * index, so all four frames crop identically.
 */
export function heroHeightFor(
  windowHeight: number,
  availableHeight?: number,
  reserve: number = STORY_CHROME_RESERVE,
): number {
  const ratio = windowHeight < COMPACT_HEIGHT_MAX ? HERO_RATIO_COMPACT : HERO_RATIO_STANDARD;
  const preferred = Math.round(windowHeight * ratio);
  if (availableHeight == null || availableHeight <= 0) return preferred;
  return Math.max(0, Math.min(preferred, Math.round(availableHeight - reserve)));
}

export type StoryMotion = 'push-in' | 'none';

/** Ionicons glyphs used by the thought vignettes. Kept as a literal union so this module stays React-free. */
export type ContextIcon = 'laptop-outline' | 'car-outline' | 'walk-outline';

/**
 * One thought vignette. `x`/`y` are percentages of the HERO WINDOW, not of the
 * source image — the overlays are native views, so they sit where they are put
 * on every device and can never be cropped away like baked-in artwork would.
 */
export type StoryContextVignette = { icon: ContextIcon; x: number; y: number };

/**
 * What Emma is weighing up before she eats: work, a drive, a walk.
 *
 * Three, not five. Five small glyphs arced around her head read as a toolbar
 * no matter how faint they were made; three larger ones with room between them
 * read as someone thinking. The dropped concepts (exercise, plans later) were
 * the two least tied to how a meal actually sits with you.
 *
 * Icons only, never labels. Two reasons, and both are hard requirements:
 * baked text would ship untranslated to German users, and — more importantly —
 * GutWell records meals, notes and check-ins and nothing else. It does not
 * detect driving, work or walking. Wordless vignettes read as her own
 * considerations; a labelled row would read as a tracking feature that does
 * not exist.
 *
 * Positioned to arc AROUND her head rather than over it: work above her left
 * shoulder, the drive and the walk down her right. The gap across the top
 * centre is where her face is, and the lower half is left alone entirely
 * because her hand and the food are there. Order is the reveal order.
 */
export const CONSIDER_CONTEXTS: StoryContextVignette[] = [
  { icon: 'laptop-outline', x: 17, y: 22 },
  { icon: 'car-outline', x: 83, y: 17 },
  { icon: 'walk-outline', x: 86, y: 45 },
];

export type StoryFrameAsset = {
  /** Stable identity for tests and analytics. Never shown to the user. */
  key: 'consider' | 'scan' | 'patterns' | 'confidence';
  /** Production art. All four frames are the approved Emma. */
  poster: number;
  /**
   * Final motion asset. Undefined on every frame today — see the note above.
   * Typed here so the swap is additive.
   */
  video?: number;
  motion: StoryMotion;
  /** Thought vignettes drawn over the hero. Frame 1 only. */
  contexts?: StoryContextVignette[];
};

/**
 * Order is the story: uncertainty → understanding → confident choice →
 * reflection.
 *
 * The order is chronological as much as emotional, and that is why confidence
 * comes before patterns rather than last. Device QA caught the earlier
 * arrangement running backwards in time: it ended on a finished, cleared plate
 * (patterns) and then cut back to a full, untouched meal (confidence). Reading
 * it as before the meal → understanding it → making the choice → looking back
 * afterwards removes the jump.
 *
 * The asset filenames are frozen to the frames they were generated for, so
 * emma-4 is the third slide and emma-3 the fourth. Renaming the files to match
 * their positions would only move the confusion into `git status` and break the
 * link back to the generation brief.
 *
 * Copy and accessibility descriptions live in i18n under welcome.story.frames
 * and are matched to these BY INDEX, the same pattern ScanTutorial uses — so
 * reordering here requires the same reordering there, or every slide gets the
 * wrong words. The `key` travels with its own content, never with its position.
 */
export const STORY_FRAMES: StoryFrameAsset[] = [
  {
    key: 'consider',
    // Production art. Approved Emma master reference, and the source every
    // later frame must match: same face, hair, sweater, kitchen, light and
    // camera height — only the scene changes.
    poster: require('../../assets/story/emma-1.webp'),
    // Frame 1 is the only motion-led frame in the final design.
    motion: 'push-in',
    contexts: CONSIDER_CONTEXTS,
  },
  {
    key: 'scan',
    poster: require('../../assets/story/emma-2.webp'),
    motion: 'none',
  },
  {
    key: 'confidence',
    poster: require('../../assets/story/emma-4.webp'),
    motion: 'none',
  },
  {
    key: 'patterns',
    poster: require('../../assets/story/emma-3.webp'),
    motion: 'none',
  },
];

export const STORY_FRAME_COUNT = STORY_FRAMES.length;
