/**
 * components/story/StoryCarousel.tsx
 *
 * The four-frame Story Experience shown on Welcome, before sign-up.
 *
 * Manual paging only. There is no timer and no auto-advance: the screen is
 * asking a stranger to trust a health app, and content that moves on its own
 * takes the decision away from the person making it.
 *
 * ── VoiceOver ───────────────────────────────────────────────────────────────
 * A paging ScrollView is not an accessible carousel on its own. VoiceOver
 * traverses every child, including the three off-screen frames, so a user
 * hears frame 3's copy while frame 1 is displayed and has no way to tell the
 * carousel moved. Two things fix it, and both are required:
 *
 *   1. StoryFrame hides itself from accessibility unless it is the active one.
 *   2. The indicator below is an `adjustable` control. VoiceOver's swipe up /
 *      swipe down then pages the story, and reads out "2 of 4" — which is also
 *      why position is never signalled by dot colour alone.
 *
 * Reduce Motion removes the animations inside each frame and makes programmatic
 * paging jump rather than glide.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  StyleSheet,
  useWindowDimensions,
  View,
  type AccessibilityActionEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import Animated, {
  useAnimatedRef,
  useAnimatedScrollHandler,
  useSharedValue,
} from 'react-native-reanimated';

import StoryFrame from './StoryFrame';
import { STORY_FRAMES, captionReserveFor, heroHeightFor } from './storyFrames';
import { useTranslation } from '../../lib/i18n';
import { useReducedMotion } from '../../lib/useReducedMotion';
import { track, Events } from '../../lib/analytics';

export default function StoryCarousel() {
  const t = useTranslation();
  const { width, height, fontScale } = useWindowDimensions();
  const reduceMotion = useReducedMotion();

  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const scrollX = useSharedValue(0);
  const [index, setIndex] = useState(0);

  /** Frames already reported this visit. Keeps the event once-per-frame. */
  const seen = useRef<Set<number>>(new Set());

  /**
   * Measured rather than derived: the story area is whatever the top bar and
   * the CTA block leave behind, and on an iPhone SE that is less than the hero
   * ratio asks for. Zero until the first layout pass, which heroHeightFor
   * treats as "not measured yet" and answers with the plain ratio.
   */
  const [areaHeight, setAreaHeight] = useState(0);
  const heroHeight = useMemo(
    // The reserve tracks Dynamic Type: the caption's line heights grow with
    // the user's text size, and the hero gives up the difference.
    () => heroHeightFor(height, areaHeight || undefined, captionReserveFor(fontScale)),
    [height, areaHeight, fontScale],
  );
  const copy = t.welcome.story;
  const total = STORY_FRAMES.length;

  const scrollHandler = useAnimatedScrollHandler((event) => {
    scrollX.value = event.contentOffset.x;
  });

  const report = useCallback((next: number) => {
    if (seen.current.has(next)) return;
    seen.current.add(next);
    // 1-based: the analytics question is "how many frames did they read".
    track(Events.ONBOARDING_STORY_VIEWED, { index: next + 1 });
  }, []);

  // Frame 1 is on screen from the moment the story mounts, so it counts as
  // viewed without any interaction. In an effect rather than in render: this
  // sends a network event, and render must stay free of side effects.
  useEffect(() => {
    report(0);
  }, [report]);

  const settleOn = useCallback(
    (next: number) => {
      if (next === index) return;
      setIndex(next);
      report(next);
    },
    [index, report],
  );

  const handleMomentumEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const next = Math.round(event.nativeEvent.contentOffset.x / width);
      settleOn(Math.max(0, Math.min(total - 1, next)));
    },
    [width, total, settleOn],
  );

  const goTo = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(total - 1, next));
      if (clamped === index) return;
      scrollRef.current?.scrollTo({ x: clamped * width, animated: !reduceMotion });
      settleOn(clamped);
    },
    [index, total, width, reduceMotion, scrollRef, settleOn],
  );

  const handleAccessibilityAction = useCallback(
    (event: AccessibilityActionEvent) => {
      if (event.nativeEvent.actionName === 'increment') goTo(index + 1);
      if (event.nativeEvent.actionName === 'decrement') goTo(index - 1);
    },
    [goTo, index],
  );

  const positionText = copy.positionFormat
    .replace('{current}', String(index + 1))
    .replace('{total}', String(total));

  return (
    <View
      style={styles.container}
      onLayout={(event) => setAreaHeight(event.nativeEvent.layout.height)}
    >
      <Animated.ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        onMomentumScrollEnd={handleMomentumEnd}
        // Nothing inside the story is tappable, so paging should never be
        // interrupted by a child claiming the gesture.
        keyboardShouldPersistTaps="handled"
        style={styles.scroll}
      >
        {STORY_FRAMES.map((asset, i) => (
          <StoryFrame
            key={asset.key}
            asset={asset}
            index={i}
            title={copy.frames[i]?.title ?? ''}
            body={copy.frames[i]?.body ?? ''}
            alt={copy.frames[i]?.alt ?? ''}
            scrollX={scrollX}
            pageWidth={width}
            heroHeight={heroHeight}
            isActive={i === index}
            reduceMotion={reduceMotion}
          />
        ))}
      </Animated.ScrollView>

      {/*
        The paging control for VoiceOver as well as the position readout for
        everyone else. `adjustable` is what makes swipe up / swipe down work;
        the value string is what makes position available without seeing the
        dots at all.

        It overlays the hero's lower edge rather than taking a row beneath it.
        A separate row cost 60pt of vertical space, and that 60pt was the
        difference between an iPhone SE showing the hero the asset brief was
        written for and cropping through the middle of it.

        Only the indicator moves onto the photo. No story copy does: dots are
        an affordance and survive an unlucky background, a sentence does not.
        The pill behind them guarantees contrast regardless of the frame.

        box-none, and dots that register no touch handler, so the pill never
        becomes a dead zone for the swipe that pages the story.
      */}
      <View
        pointerEvents="box-none"
        style={[styles.indicatorOverlay, { top: Math.max(0, heroHeight - INDICATOR_INSET) }]}
      >
        <View
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={copy.a11yCarouselLabel}
          accessibilityHint={copy.a11yCarouselHint}
          accessibilityValue={{ text: positionText }}
          accessibilityActions={ADJUSTABLE_ACTIONS}
          onAccessibilityAction={handleAccessibilityAction}
          style={styles.indicatorPill}
        >
          {STORY_FRAMES.map((asset, i) => (
            // Active state is carried by width and opacity as well as colour,
            // so the indicator never depends on colour perception alone.
            <View
              key={asset.key}
              style={[styles.dot, i === index ? styles.dotActive : null]}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

const ADJUSTABLE_ACTIONS = [{ name: 'increment' as const }, { name: 'decrement' as const }];

/** Distance from the hero's bottom edge up to the top of the indicator row. */
const INDICATOR_INSET = 46;

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  indicatorOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    // Full 44pt height so the VoiceOver target is unaffected by the move.
    height: 44,
    justifyContent: 'center',
  },
  indicatorPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    // Scrim: the dots sit on photography now, so contrast cannot be left to
    // whatever the frame happens to show behind them.
    backgroundColor: 'rgba(0,0,0,0.38)',
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  dotActive: {
    width: 22,
    opacity: 1,
    backgroundColor: '#FFFFFF',
  },
});
