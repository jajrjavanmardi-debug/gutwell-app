/**
 * components/story/ContextVignettes.tsx
 *
 * The three wordless thoughts around Emma on Frame 1: work, a drive, a walk.
 *
 * ── What these are, and are not ─────────────────────────────────────────────
 * They are the things SHE is weighing up before she eats. They are NOT data
 * the app collects. GutWell records meals, notes and check-ins — there is no
 * column anywhere for driving, work or walking, and there is no detection of
 * any of it.
 *
 * That distinction is enforced three ways rather than trusted to good taste:
 *
 *   - icons only, never labels. A labelled row reads as a feature list; a
 *     wordless one reads as someone thinking. It also keeps German users from
 *     being shown English words.
 *   - no counts, scores, percentages, checkmarks or progress of any kind.
 *     Nothing that could be mistaken for a record of what she did.
 *   - hidden from VoiceOver entirely. The photo's own description already says
 *     she is "thinking about what the rest of her day involves", which is the
 *     honest sentence. Unlabelled icons announced separately could only be
 *     guessed at, and any label naming them risks implying tracking.
 *
 * ── Why three, and why they are not chips ───────────────────────────────────
 * Five small discs read as a toolbar. Three larger ones read as a thought.
 *
 * The previous pass went the other way — smaller and fainter — and on a
 * physical iPhone the result disappeared into the photograph entirely. The
 * problem was never size; it was SHAPE. A perfectly circular, evenly bordered
 * disc is the visual grammar of a button, so making it quieter only produced a
 * faint button. These are deliberately soft-edged and slightly irregular
 * instead: asymmetric corner radii and a few degrees of rotation, no border at
 * all. Nothing about the silhouette suggests it can be pressed, which buys the
 * contrast needed to actually be seen.
 *
 * The icon sits in its own upright layer so the blob can tilt without tipping
 * a laptop or a car on its side.
 *
 * ── Placement ───────────────────────────────────────────────────────────────
 * Percentages of the hero window, not of the source image. These are native
 * views, so unlike baked-in artwork they land in the same place on every
 * device and the cover crop can never take them. They arc around her head; the
 * gap across the top centre is where her face is.
 */
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import type { StoryContextVignette } from './storyFrames';

/**
 * Beats: work at 0.35s, the drive at 1.10s, the walk at 1.85s.
 *
 * The stagger is deliberately long. At 260ms and then 500ms the three arrivals
 * overlapped into a single event that a first-time viewer read as "the screen
 * loaded" rather than as three separate thoughts. Three quarters of a second
 * apart, each one lands in its own moment and can be counted without
 * concentrating.
 */
export const VIGNETTE_STAGGER_MS = 750;
/** Delay before the first one, so Emma reads on her own before anything appears. */
export const VIGNETTE_FIRST_DELAY_MS = 350;
export const VIGNETTE_FADE_MS = 600;
/**
 * Resting opacity.
 *
 * Was 0.82, on the theory that translucency keeps the thoughts subordinate to
 * Emma. On a physical iPhone, against a bright kitchen, it just cost
 * legibility. They are kept secondary by size, placement and the fact that
 * they carry no text — not by being hard to see.
 */
export const VIGNETTE_OPACITY = 1;
/** Points each thought rises as it appears. Far enough to read as movement. */
export const VIGNETTE_RISE = 12;
/** Start scale. 0.12 of travel, where 0.06 was below the threshold of notice. */
export const VIGNETTE_START_SCALE = 0.88;

/** Big enough to read at a glance from arm's length, on an iPhone SE hero. */
const SIZE = 60;
const ICON = 26;

/**
 * Per-thought silhouettes. SIZE/2 is a true circle, so every value below it
 * pulls one corner in and breaks the button symmetry. Applied by index — three
 * shapes for three thoughts — so no two blobs are quite the same.
 */
const BLOBS = [
  {
    rotate: '-6deg',
    radii: {
      borderTopLeftRadius: 30,
      borderTopRightRadius: 23,
      borderBottomRightRadius: 30,
      borderBottomLeftRadius: 27,
    },
  },
  {
    rotate: '5deg',
    radii: {
      borderTopLeftRadius: 25,
      borderTopRightRadius: 30,
      borderBottomRightRadius: 24,
      borderBottomLeftRadius: 30,
    },
  },
  {
    rotate: '-3deg',
    radii: {
      borderTopLeftRadius: 30,
      borderTopRightRadius: 28,
      borderBottomRightRadius: 22,
      borderBottomLeftRadius: 30,
    },
  },
] as const;

function Vignette({
  item,
  index,
  reduceMotion,
  play,
}: {
  item: StoryContextVignette;
  index: number;
  reduceMotion: boolean;
  play: boolean;
}) {
  const progress = useSharedValue(0);
  const blob = BLOBS[index % BLOBS.length];

  useEffect(() => {
    if (reduceMotion) {
      // Final state, immediately. Visible, but nothing moves.
      progress.value = 1;
      return;
    }
    if (!play) return;
    progress.value = withDelay(
      VIGNETTE_FIRST_DELAY_MS + index * VIGNETTE_STAGGER_MS,
      withTiming(1, { duration: VIGNETTE_FADE_MS, easing: Easing.out(Easing.cubic) }),
    );
  }, [play, reduceMotion, index, progress]);

  const style = useAnimatedStyle(() => ({
    opacity: progress.value * VIGNETTE_OPACITY,
    transform: [
      // Settles down to rest rather than growing past it — an overshoot would
      // read as a notification popping in.
      { scale: VIGNETTE_START_SCALE + progress.value * (1 - VIGNETTE_START_SCALE) },
      { translateY: (1 - progress.value) * VIGNETTE_RISE },
    ],
  }));

  return (
    <Animated.View
      style={[
        styles.root,
        { left: `${item.x}%`, top: `${item.y}%`, marginLeft: -SIZE / 2, marginTop: -SIZE / 2 },
        style,
      ]}
    >
      {/* Two nested views on purpose: iOS will not draw a shadow on a view
          that clips its children, and the blur has to be clipped to take the
          blob's corners. */}
      <View style={[styles.shadowWrap, { transform: [{ rotate: blob.rotate }] }]}>
        <View style={[styles.blob, blob.radii]}>
          <BlurView intensity={10} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, styles.surface]} />
        </View>
      </View>
      {/* Upright, outside the rotation, so the glyph never tilts. */}
      <View style={styles.iconLayer}>
        <Ionicons name={item.icon} size={ICON} color="#FFFFFF" />
      </View>
    </Animated.View>
  );
}

export default function ContextVignettes({
  items,
  reduceMotion,
  play,
}: {
  items: StoryContextVignette[];
  reduceMotion: boolean;
  /** True once the frame is on screen. Nothing animates before then. */
  play: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      // See the header: the photo's description already covers this honestly.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {items.map((item, index) => (
        <Vignette
          key={item.icon}
          item={item}
          index={index}
          reduceMotion={reduceMotion}
          play={play}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', width: SIZE, height: SIZE },
  shadowWrap: {
    ...StyleSheet.absoluteFillObject,
    // Wide and soft: the blob should feel like it is resting in the room's
    // light, not stamped on top of the photograph.
    shadowColor: '#000000',
    shadowOpacity: 0.3,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  blob: { flex: 1, overflow: 'hidden' },
  /* A neutral translucent surface carrying most of the contrast, with only a
     little blur behind it.

     Heavy blur and a barely-there wash was the elegant version and it failed on
     a real phone: blur averages whatever is behind it, so over the bright
     window the disc became bright too and the white glyph vanished into it.
     A fixed neutral scrim does not depend on what it sits over, so the glyph
     reads the same everywhere in the frame. It goes OVER the blur — underneath,
     the blur would simply average it away. */
  surface: { backgroundColor: 'rgba(16,20,18,0.46)' },
  iconLayer: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
});
