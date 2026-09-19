/**
 * components/story/StoryFrame.tsx
 *
 * One frame of the Story Experience: a cover-cropped hero, then the copy on an
 * opaque background beneath it.
 *
 * Presentation only — no navigation, no persistence, no product logic. The
 * carousel owns paging, analytics and focus.
 *
 * ── Why the text is never over the photo ────────────────────────────────────
 * Contrast over photography cannot be guaranteed: the asset changes, the crop
 * changes with the device, and the one line that fails is the one a user in
 * sunlight needs. The copy sits below the hero on the app background instead,
 * which is a fixed, known colour.
 *
 * ── Motion ──────────────────────────────────────────────────────────────────
 * Three things move, all subtle, all gated on Reduce Motion:
 *
 *   hero    a one-time push-in on the frame that asks for it. It plays once
 *           per mount and holds. It does not loop — the final Frame 1 video is
 *           specified the same way, so the prototype exercises the behaviour
 *           the real asset will need.
 *   caption a small horizontal parallax and rise as the frame settles.
 *   both    a fade tied to how far the frame is from centre.
 *
 * Parallax is deliberately on the caption rather than the hero. Horizontal
 * headroom in a cover-cropped 4:5 window can only be bought by scaling the
 * image up, and that spends the vertical safe band — the one budget the asset
 * brief is written against. The caption can slide for free.
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { FontFamily } from '../../constants/theme';
import ContextVignettes from './ContextVignettes';
import { BODY_SCALE_CAP, TITLE_SCALE_CAP, type StoryFrameAsset } from './storyFrames';

/**
 * End scale of the push-in. Deliberately almost nothing.
 *
 * This went 1.04 → 1.08 chasing perceptibility, and on a physical iPhone the
 * louder version was no more legible as storytelling — it just read as a
 * slightly restless photograph. The conclusion is that a camera move on a
 * still portrait is the wrong carrier for this beat: the story is what Emma is
 * THINKING, so the motion belongs to the thoughts, and the camera should stay
 * out of their way. What is left here is a whisper of life, not a zoom.
 *
 * Every point of scale also crops the hero further, so this is a geometry
 * decision as much as a motion one. At 1.02 the crop is the tightest the
 * frame ever gets and it clears the asset brief's Tier A region (y 350–1150)
 * on every supported device by a wider margin than any previous value.
 */
export const PUSH_IN_SCALE = 1.01;
/** Finishes well inside the thoughts' own sequence, which ends at 2.45s. */
export const PUSH_IN_MS = 2400;

/**
 * Longest the frame will wait for the poster before playing anyway.
 *
 * See the note on `posterReady` below. This is the fail-safe: if `onLoad` never
 * arrives — a decode failure, a source that resolves oddly — the story still
 * runs rather than sitting silently on a blank hero forever.
 */
const POSTER_TIMEOUT_MS = 1500;
/** Caption parallax amplitude, points. Costs no crop — see the header note. */
const CAPTION_PARALLAX = 22;

export type StoryFrameProps = {
  asset: StoryFrameAsset;
  title: string;
  body: string;
  /** Scene description for VoiceOver. Describes what is shown, never what the app does. */
  alt: string;
  index: number;
  /** Horizontal scroll offset of the carousel, in points. */
  scrollX: SharedValue<number>;
  pageWidth: number;
  heroHeight: number;
  isActive: boolean;
  reduceMotion: boolean;
};

export default function StoryFrame({
  asset,
  title,
  body,
  alt,
  index,
  scrollX,
  pageWidth,
  heroHeight,
  isActive,
  reduceMotion,
}: StoryFrameProps) {
  const { fontScale } = useWindowDimensions();
  const pushIn = useSharedValue(1);

  /**
   * Whether the photo is actually on screen yet.
   *
   * This is the fix for a failure that survived three rounds of tuning the
   * numbers. Mounting is not the same as being visible: the hero is a 361 KB
   * WebP that has to be fetched (from Metro in development) and decoded, and on
   * a real device that lands somewhere in the first second or two — comfortably
   * past the point where the earlier, shorter sequences had already finished.
   * The animation ran correctly every time; it ran against a blank hero, and by
   * the time Emma appeared the thoughts were already sitting at rest.
   *
   * Waiting for `onLoad` means the sequence starts when there is something to
   * watch. It matters far more than the amplitudes do.
   */
  const [posterReady, setPosterReady] = useState(false);
  const play = isActive && posterReady;

  useEffect(() => {
    if (posterReady) return;
    const t = setTimeout(() => setPosterReady(true), POSTER_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [posterReady]);

  useEffect(() => {
    if (reduceMotion || asset.motion !== 'push-in') {
      // Reduce Motion: the poster, immediately, at rest. Also the branch the
      // final video will take.
      pushIn.value = 1;
      return;
    }
    if (!play) return;
    // Plays once and holds. There is no repeat and no reverse, deliberately:
    // a looping hero on a first-run screen reads as a background animation
    // rather than a story beat.
    // Eased out, so most of the movement happens early and the frame decelerates
    // into its hold rather than stopping dead.
    pushIn.value = withTiming(PUSH_IN_SCALE, {
      duration: PUSH_IN_MS,
      easing: Easing.out(Easing.cubic),
    });
  }, [play, reduceMotion, asset.motion, pushIn]);

  /** Distance of this page from centre, in pages. Drives every fade. */
  const inputRange = [(index - 1) * pageWidth, index * pageWidth, (index + 1) * pageWidth];

  const heroStyle = useAnimatedStyle(() => {
    const opacity = reduceMotion
      ? 1
      : interpolate(scrollX.value, inputRange, [0.55, 1, 0.55], Extrapolation.CLAMP);
    return { opacity, transform: [{ scale: pushIn.value }] };
  });

  const captionStyle = useAnimatedStyle(() => {
    if (reduceMotion) return { opacity: 1, transform: [{ translateX: 0 }, { translateY: 0 }] };
    const opacity = interpolate(scrollX.value, inputRange, [0, 1, 0], Extrapolation.CLAMP);
    const translateX = interpolate(
      scrollX.value,
      inputRange,
      [CAPTION_PARALLAX, 0, -CAPTION_PARALLAX],
      Extrapolation.CLAMP,
    );
    // Small rise as the frame settles; never a drop, which reads as a glitch.
    const translateY = interpolate(scrollX.value, inputRange, [10, 0, 10], Extrapolation.CLAMP);
    return { opacity, transform: [{ translateX }, { translateY }] };
  });

  return (
    <View
      style={[styles.page, { width: pageWidth }]}
      // Only the frame on screen is reachable. Without this, VoiceOver walks
      // every off-screen frame and reads frame 3's copy while frame 1 is
      // displayed, with nothing to indicate the mismatch.
      accessibilityElementsHidden={!isActive}
      importantForAccessibility={isActive ? 'auto' : 'no-hide-descendants'}
    >
      <View style={[styles.heroWindow, { height: heroHeight }]}>
        <Animated.View style={[StyleSheet.absoluteFill, heroStyle]}>
          {/*
            expo-image rather than react-native's Image: RN's does not decode
            WebP on iOS, and every story asset is WebP. `recyclingKey` keeps the
            four heroes from swapping pixels as the carousel recycles views.
          */}
          <Image
            source={asset.poster}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            recyclingKey={asset.key}
            transition={0}
            // Both branches, not just success: a frame that failed to decode
            // must not also swallow the story.
            onLoad={() => setPosterReady(true)}
            onError={() => setPosterReady(true)}
            accessible
            accessibilityRole="image"
            accessibilityLabel={alt}
          />
        </Animated.View>

        {/* Siblings of the scaling photo, not children of it: the vignettes
            hold their positions while the image pushes in behind them, which
            reads as depth rather than as the whole frame zooming. */}
        <ContextVignettes items={asset.contexts ?? []} reduceMotion={reduceMotion} play={play} />
      </View>

      <Animated.View style={[styles.caption, captionStyle]}>
        {/*
          Two lines each, always. captionReserveFor budgets exactly two, so a
          third line would render into space the hero has already taken and be
          clipped with nothing to scroll it back. The caps match the constants
          the reserve is computed from — change one and the other must follow.
        */}
        <Text
          style={styles.title}
          accessibilityRole="header"
          maxFontSizeMultiplier={TITLE_SCALE_CAP}
          numberOfLines={2}
          adjustsFontSizeToFit={fontScale > 1.2}
          minimumFontScale={0.85}
        >
          {title}
        </Text>
        <Text style={styles.body} maxFontSizeMultiplier={BODY_SCALE_CAP} numberOfLines={2}>
          {body}
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  /* Clips the hero to the cover window. Without overflow hidden the push-in
     would bleed over the caption. */
  heroWindow: { overflow: 'hidden', width: '100%', backgroundColor: 'rgba(255,255,255,0.04)' },
  /* Sizes here are load-bearing, not taste: STORY_CHROME_RESERVE reserves
     14 + 2×30 + 4 + 2×20 = 118pt for this block, and the hero takes whatever
     is left. Growing the type or the padding shrinks the hero on an SE. */
  caption: { paddingHorizontal: 24, paddingTop: 14, gap: 4 },
  title: {
    fontFamily: FontFamily.displayBold,
    fontSize: 24,
    lineHeight: 30,
    color: '#FFFFFF',
    letterSpacing: -0.4,
  },
  body: {
    fontFamily: FontFamily.sansRegular,
    fontSize: 15,
    lineHeight: 20,
    color: 'rgba(255,255,255,0.65)',
  },
});
