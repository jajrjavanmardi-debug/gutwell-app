import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import { Colors, FontFamily, FontSize, Spacing } from '../constants/theme';

const AnimatedLine = Animated.createAnimatedComponent(Line);

type GutScoreGaugeProps = {
  score: number;
  scoreLabel: string;
  statusLabel: string;
  color: string;
  isRtl?: boolean;
  size?: number;
};

const STROKE_WIDTH = 14;
const NEEDLE_LENGTH_RATIO = 0.72;

function polarToCartesian(centerX: number, centerY: number, radius: number, angleInDegrees: number) {
  const angleInRadians = (angleInDegrees * Math.PI) / 180;

  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians),
  };
}

function describeArc(
  centerX: number,
  centerY: number,
  radius: number,
  startAngle: number,
  endAngle: number
) {
  const start = polarToCartesian(centerX, centerY, radius, startAngle);
  const end = polarToCartesian(centerX, centerY, radius, endAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';

  return [
    'M',
    start.x,
    start.y,
    'A',
    radius,
    radius,
    0,
    largeArcFlag,
    1,
    end.x,
    end.y,
  ].join(' ');
}

function getNeedlePoint(score: number, center: number, radius: number) {
  const normalizedScore = Math.min(Math.max(score, 1), 10);
  const angle = 180 + ((normalizedScore - 1) / 9) * 180;

  return polarToCartesian(center, center, radius * NEEDLE_LENGTH_RATIO, angle);
}

export function GutScoreGauge({
  score,
  scoreLabel,
  statusLabel,
  color,
  isRtl = false,
  size = 180,
}: GutScoreGaugeProps) {
  const animatedScore = useRef(new Animated.Value(0)).current;
  const center = size / 2;
  const radius = (size - STROKE_WIDTH) / 2;
  const height = Math.round(size * 0.66);
  const needlePoint = getNeedlePoint(score, center, radius);
  const animatedNeedleX = animatedScore.interpolate({
    inputRange: [0, 10],
    outputRange: [center - radius * NEEDLE_LENGTH_RATIO, needlePoint.x],
  });
  const animatedNeedleY = animatedScore.interpolate({
    inputRange: [0, 10],
    outputRange: [center, needlePoint.y],
  });

  useEffect(() => {
    animatedScore.setValue(0);
    Animated.timing(animatedScore, {
      toValue: score,
      duration: 850,
      useNativeDriver: false,
    }).start();
  }, [animatedScore, score]);

  return (
    <View style={styles.container}>
      <Text style={[styles.scoreLabel, isRtl && styles.rtlText]}>
        {scoreLabel}
        {score}/10
      </Text>

      <View style={[styles.gaugeWrap, { height, width: size }]}>
        <Svg width={size} height={height}>
          <Path
            d={describeArc(center, center, radius, 180, 360)}
            stroke="#E6F6EE"
            strokeWidth={STROKE_WIDTH + 3}
            strokeLinecap="round"
            fill="transparent"
          />
          <Path
            d={describeArc(center, center, radius, 180, 234)}
            stroke="#DC2626"
            strokeWidth={STROKE_WIDTH}
            strokeLinecap="round"
            fill="transparent"
          />
          <Path
            d={describeArc(center, center, radius, 238, 292)}
            stroke="#F59E0B"
            strokeWidth={STROKE_WIDTH}
            strokeLinecap="round"
            fill="transparent"
          />
          <Path
            d={describeArc(center, center, radius, 296, 360)}
            stroke="#22C55E"
            strokeWidth={STROKE_WIDTH}
            strokeLinecap="round"
            fill="transparent"
          />
          <AnimatedLine
            x1={center}
            y1={center}
            x2={animatedNeedleX}
            y2={animatedNeedleY}
            stroke={color}
            strokeWidth={14}
            strokeLinecap="round"
            opacity={0.18}
          />
          <AnimatedLine
            x1={center}
            y1={center}
            x2={animatedNeedleX}
            y2={animatedNeedleY}
            stroke={color}
            strokeWidth={5}
            strokeLinecap="round"
          />
          <Circle cx={center} cy={center} r={13} fill={color} opacity={0.2} />
          <Circle cx={center} cy={center} r={8} fill={color} />
          <Circle cx={center} cy={center} r={3} fill="#FFFFFF" />
        </Svg>

        <View style={styles.gaugeCenter}>
          <Text style={[styles.gaugeScore, { color }]}>{score}</Text>
          <Text style={styles.gaugeMax}>/10</Text>
        </View>
      </View>

      <Text style={[styles.statusText, { color }, isRtl && styles.rtlText]}>{statusLabel}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    alignSelf: 'center',
    gap: Spacing.sm,
    width: '100%',
  },
  gaugeWrap: {
    alignItems: 'center',
    alignSelf: 'center',
    justifyContent: 'flex-start',
    maxWidth: '100%',
  },
  gaugeCenter: {
    alignItems: 'baseline',
    alignSelf: 'center',
    bottom: 0,
    flexDirection: 'row',
    position: 'absolute',
  },
  gaugeScore: {
    fontFamily: FontFamily.sansExtraBold,
    fontSize: 34,
    letterSpacing: -1,
  },
  gaugeMax: {
    color: '#476366',
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.md,
    marginLeft: 2,
  },
  scoreLabel: {
    color: Colors.text,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
    textAlign: 'center',
  },
  statusText: {
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.md,
    textAlign: 'center',
  },
  rtlText: {
    textAlign: 'right',
    writingDirection: 'rtl',
  },
});
