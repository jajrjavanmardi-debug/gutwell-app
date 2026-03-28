import React from 'react';
import { View } from 'react-native';
import Svg, { Path, Defs, LinearGradient as SVGGradient, Stop, Circle } from 'react-native-svg';
import { Colors } from '../constants/theme';

interface Props {
  data: number[]; // scores 0-100, at least 2 points
  width: number;
  height?: number; // default 52
  color?: string;  // default Colors.secondary
}

export function SparklineChart({ data, width, height = 52, color = Colors.secondary }: Props) {
  if (!data || data.length < 2) return null;

  const h = height;
  const w = width;
  const n = data.length;

  // Map data values to SVG coordinates
  const points = data.map((val, i) => ({
    x: i * (w / (n - 1)),
    y: h - (val / 100) * h,
  }));

  // Build line path
  const linePath = points
    .map((p, i) => (i === 0 ? `M ${p.x},${p.y}` : `L ${p.x},${p.y}`))
    .join(' ');

  // Build fill area path (close at bottom)
  const fillPath =
    linePath +
    ` L ${points[n - 1].x},${h} L ${points[0].x},${h} Z`;

  return (
    <View>
      <Svg width={w} height={h}>
        <Defs>
          <SVGGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity={0.38} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </SVGGradient>
        </Defs>

        {/* Gradient fill area */}
        <Path d={fillPath} fill="url(#sparkGrad)" />

        {/* Line */}
        <Path
          d={linePath}
          stroke={color}
          strokeWidth={2}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Dots at each data point */}
        {points.map((p, i) => {
          const isLast = i === n - 1;
          if (isLast) {
            return (
              <Circle
                key={i}
                cx={p.x}
                cy={p.y}
                r={4}
                fill={color}
              />
            );
          }
          return (
            <Circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={3}
              fill="white"
              stroke={color}
              strokeWidth={2}
            />
          );
        })}
      </Svg>
    </View>
  );
}

export default SparklineChart;
