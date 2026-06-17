import { Ionicons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import {
  Dimensions,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from './ui/Button';
import { BorderRadius, Colors, FontFamily, FontSize, Shadows, Spacing } from '../constants/theme';

type IoniconName = keyof typeof Ionicons.glyphMap;

type TutorialBullet = {
  icon: IoniconName;
  text: string;
};

type TutorialSlide = {
  heroIcon: IoniconName;
  heroCaption: string;
  title: string;
  bullets: TutorialBullet[];
};

/**
 * Pre-scan tutorial mirroring Cal AI's 4-slide scan walkthrough (slides 02–05),
 * rewritten for gut health: how to take a clean meal photo, how Gutwell reads it
 * for gut impact, how to confirm/fix the result, and accuracy tips. Original copy
 * and Ionicons artwork only.
 */
const SLIDES: TutorialSlide[] = [
  {
    heroIcon: 'camera-outline',
    heroCaption: 'Frame the whole plate',
    title: 'Get the clearest scan',
    bullets: [
      { icon: 'hand-left-outline', text: 'Hold the phone steady' },
      { icon: 'sunny-outline', text: 'Use bright, even light' },
      { icon: 'eye-outline', text: 'Keep every ingredient in view' },
    ],
  },
  {
    heroIcon: 'pulse-outline',
    heroCaption: 'Reads your meal for gut impact',
    title: 'Gutwell reads your meal',
    bullets: [
      { icon: 'restaurant-outline', text: 'Ingredients are recognized' },
      { icon: 'leaf-outline', text: 'Fiber, ferments and triggers are weighed' },
      { icon: 'time-outline', text: 'Gut-impact insights in a few seconds' },
    ],
  },
  {
    heroIcon: 'create-outline',
    heroCaption: 'You stay in control',
    title: 'Confirm or fix the result',
    bullets: [
      { icon: 'checkmark-circle-outline', text: 'Check that the read looks right' },
      { icon: 'mic-outline', text: 'Speak or type what to correct' },
      { icon: 'sparkles-outline', text: 'Tap to refine if something is off' },
    ],
  },
  {
    heroIcon: 'shield-checkmark-outline',
    heroCaption: 'Small details, sharper insight',
    title: 'Tips for accurate insights',
    bullets: [
      { icon: 'chatbubble-ellipses-outline', text: 'Name the dish and how you feel' },
      { icon: 'nutrition-outline', text: 'Note portion size and add-ons' },
      { icon: 'heart-outline', text: 'Log symptoms so trends sharpen over time' },
    ],
  },
];

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export function ScanTutorial({ onDone }: { onDone: () => void }) {
  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);
  const isLastSlide = index === SLIDES.length - 1;

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const nextIndex = Math.round(event.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    if (nextIndex !== index) setIndex(nextIndex);
  };

  const handleNext = () => {
    if (isLastSlide) {
      onDone();
      return;
    }
    const target = index + 1;
    scrollRef.current?.scrollTo({ x: target * SCREEN_WIDTH, animated: true });
    setIndex(target);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
        scrollEventThrottle={16}
        style={styles.pager}
      >
        {SLIDES.map((slide) => (
          <View key={slide.title} style={styles.slide}>
            <View style={styles.hero}>
              <View style={styles.heroIconWrap}>
                <Ionicons name={slide.heroIcon} size={64} color={Colors.secondary} />
              </View>
              <Text style={styles.heroCaption}>{slide.heroCaption}</Text>
            </View>

            <View style={styles.copyBlock}>
              <Text style={styles.title}>{slide.title}</Text>
              <View style={styles.bulletList}>
                {slide.bullets.map((bullet) => (
                  <View key={bullet.text} style={styles.bulletRow}>
                    <Ionicons name={bullet.icon} size={22} color={Colors.text} />
                    <Text style={styles.bulletText}>{bullet.text}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        ))}
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.dots}>
          {SLIDES.map((slide, dotIndex) => (
            <View
              key={slide.title}
              style={[styles.dot, dotIndex === index && styles.dotActive]}
            />
          ))}
        </View>
        <Button
          title={isLastSlide ? 'Scan now' : 'Next'}
          onPress={handleNext}
          variant="primary"
          size="lg"
          shape="pill"
          fullWidth
          icon={
            <Ionicons
              name={isLastSlide ? 'scan-outline' : 'arrow-forward'}
              size={20}
              color={Colors.textInverse}
            />
          }
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.background,
    flex: 1,
  },
  pager: {
    flex: 1,
  },
  slide: {
    width: SCREEN_WIDTH,
    flex: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
  },
  hero: {
    alignItems: 'center',
    backgroundColor: Colors.surfaceDark,
    borderColor: 'rgba(82,183,136,0.25)',
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    flex: 1,
    gap: Spacing.lg,
    justifyContent: 'center',
    marginBottom: Spacing.xl,
    padding: Spacing.xl,
    ...Shadows.md,
  },
  heroIconWrap: {
    alignItems: 'center',
    backgroundColor: 'rgba(82,183,136,0.12)',
    borderColor: 'rgba(82,183,136,0.4)',
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    height: 132,
    justifyContent: 'center',
    width: 132,
  },
  heroCaption: {
    color: Colors.secondaryLight,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.md,
    textAlign: 'center',
  },
  copyBlock: {
    gap: Spacing.lg,
    paddingBottom: Spacing.lg,
  },
  title: {
    color: Colors.text,
    fontFamily: FontFamily.displaySemiBold,
    fontSize: FontSize.xxl,
    textAlign: 'center',
  },
  bulletList: {
    gap: Spacing.md,
  },
  bulletRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.md,
  },
  bulletText: {
    color: Colors.text,
    flex: 1,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.md,
    lineHeight: 22,
  },
  footer: {
    gap: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.md,
  },
  dots: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.sm,
    justifyContent: 'center',
  },
  dot: {
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderRadius: BorderRadius.full,
    height: 8,
    width: 8,
  },
  dotActive: {
    backgroundColor: Colors.secondary,
    width: 22,
  },
});
