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
import { BorderRadius, Colors, FontFamily, FontSize, Spacing } from '../constants/theme';
import { useTranslation } from '../lib/i18n';


/**
 * Pre-scan tutorial mirroring Cal AI's 4-slide scan walkthrough (slides 02–05),
 * rewritten for gut health: how to take a clean meal photo, how GutWell AI reads it
 * for gut impact, how to confirm/fix the result, and accuracy tips. Original copy
 * and Ionicons artwork only.
 */
// Icons stay in code; all copy comes from t.components.scanTutorial.slides,
// matched by index.
const SLIDE_ICONS = [
  { heroIcon: 'camera-outline', bullets: ['hand-left-outline', 'sunny-outline', 'eye-outline'] },
  { heroIcon: 'pulse-outline', bullets: ['restaurant-outline', 'leaf-outline', 'time-outline'] },
  { heroIcon: 'create-outline', bullets: ['checkmark-circle-outline', 'mic-outline', 'sparkles-outline'] },
  { heroIcon: 'shield-checkmark-outline', bullets: ['chatbubble-ellipses-outline', 'nutrition-outline', 'heart-outline'] },
] as const;

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export function ScanTutorial({ onDone }: { onDone: () => void }) {
  const t = useTranslation();
  const SLIDES = SLIDE_ICONS.map((icons, i) => ({
    ...icons,
    ...t.components.scanTutorial.slides[i],
  }));
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
        {SLIDES.map((slide, slideIndex) => (
          <View key={slide.title} style={styles.slide}>
            {/* Full-bleed hero block (Cal AI slides 02–05: image fills the top ~55%). */}
            <View style={styles.hero}>
              <View style={styles.heroIconWrap}>
                <Ionicons name={slide.heroIcon} size={72} color={Colors.secondary} />
              </View>
              <Text style={styles.heroCaption}>{slide.heroCaption}</Text>
            </View>

            <View style={styles.copyBlock}>
              <Text style={styles.title}>{slide.title}</Text>
              <View style={styles.bulletList}>
                {slide.bullets.map((text, bulletIndex) => (
                  <View key={text} style={styles.bulletRow}>
                    <Ionicons
                      name={SLIDE_ICONS[slideIndex].bullets[bulletIndex]}
                      size={22}
                      color={Colors.text}
                    />
                    <Text style={styles.bulletText}>{text}</Text>
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
  },
  // Full-bleed hero panel filling the top ~55% (Cal AI: edge-to-edge photo / phone mockup).
  hero: {
    alignItems: 'center',
    backgroundColor: Colors.surfaceDark,
    borderBottomLeftRadius: BorderRadius.xl,
    borderBottomRightRadius: BorderRadius.xl,
    flex: 1.25,
    gap: Spacing.lg,
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },
  heroIconWrap: {
    alignItems: 'center',
    backgroundColor: 'rgba(82,183,136,0.12)',
    borderColor: 'rgba(82,183,136,0.4)',
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    height: 148,
    justifyContent: 'center',
    width: 148,
  },
  heroCaption: {
    color: Colors.secondaryLight,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.md,
    textAlign: 'center',
  },
  copyBlock: {
    flex: 1,
    gap: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
  },
  title: {
    color: Colors.text,
    fontFamily: FontFamily.displaySemiBold,
    fontSize: FontSize.xxl,
    textAlign: 'left',
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
