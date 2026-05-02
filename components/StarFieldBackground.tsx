import React, { useMemo } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { generateStars, type StarFieldOptions } from '../utils/starField';

export interface StarFieldBackgroundProps extends StarFieldOptions {
  width?: number;
  height?: number;
}

export const StarFieldBackground: React.FC<StarFieldBackgroundProps> = ({ width, height, seed, count, opacityVariation }) => {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const w = width ?? screenWidth;
  const h = height ?? screenHeight;
  const stars = useMemo(() => generateStars(w, h, { seed, count, opacityVariation }), [w, h, seed, count, opacityVariation]);
  return (
    <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
      <Svg width={w} height={h}>
        {stars.map((s, i) => <Circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#FFFFFF" opacity={s.o} />)}
      </Svg>
    </View>
  );
};
export default StarFieldBackground;
