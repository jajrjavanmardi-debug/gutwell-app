import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Svg, { Circle, Rect, Path, Ellipse, Line } from 'react-native-svg';
import { Colors, FontFamily, Spacing, BorderRadius } from '../constants/theme';

// ─── Color palette per spec ──────────────────────────────────────────────────
const FILL_COLORS: Record<number, string> = {
  1: '#6B4226',
  2: '#6B4226',
  3: '#8B5E3C',
  4: '#8B5E3C',
  5: '#A0785A',
  6: '#A0785A',
  7: '#A0785A',
};

// ─── SVG Visuals ─────────────────────────────────────────────────────────────

function Type1Visual() {
  const fill = FILL_COLORS[1];
  return (
    <Svg width={60} height={40} viewBox="0 0 60 40">
      <Circle cx={14} cy={20} r={7} fill={fill} />
      <Circle cx={30} cy={20} r={7} fill={fill} />
      <Circle cx={46} cy={20} r={7} fill={fill} />
    </Svg>
  );
}

function Type2Visual() {
  const fill = FILL_COLORS[2];
  // Rounded rect base with 5 bump arcs on top edge
  // Base rect: x=3, y=14, w=54, h=22, rx=8
  // Bumps: 5 small arcs distributed along top edge (y=14)
  const bumpPath =
    'M 3 22 Q 3 14 11 14 Q 13 10 16.5 14 Q 19 10 22 14 Q 24.5 10 27.5 14 Q 30 10 33 14 Q 35.5 10 38.5 14 Q 41 10 44 14 Q 47 14 57 14 L 57 36 Q 57 36 3 36 Z';
  return (
    <Svg width={60} height={40} viewBox="0 0 60 40">
      <Path d={bumpPath} fill={fill} />
    </Svg>
  );
}

function Type3Visual() {
  const fill = FILL_COLORS[3];
  return (
    <Svg width={60} height={40} viewBox="0 0 60 40">
      {/* Rounded sausage */}
      <Rect x={3} y={14} width={54} height={22} rx={8} fill={fill} />
      {/* 3 short vertical crack lines */}
      <Line x1={16} y1={14} x2={14} y2={20} stroke="#5A3A20" strokeWidth={1.5} strokeLinecap="round" />
      <Line x1={30} y1={14} x2={28} y2={20} stroke="#5A3A20" strokeWidth={1.5} strokeLinecap="round" />
      <Line x1={44} y1={14} x2={42} y2={20} stroke="#5A3A20" strokeWidth={1.5} strokeLinecap="round" />
    </Svg>
  );
}

function Type4Visual() {
  const fill = FILL_COLORS[4];
  return (
    <Svg width={60} height={40} viewBox="0 0 60 40">
      {/* Clean pill */}
      <Rect x={3} y={14} width={54} height={22} rx={11} fill={fill} />
      {/* Subtle highlight */}
      <Rect x={10} y={17} width={24} height={4} rx={2} fill="rgba(255,255,255,0.18)" />
    </Svg>
  );
}

function Type5Visual() {
  const fill = FILL_COLORS[5];
  return (
    <Svg width={60} height={40} viewBox="0 0 60 40">
      {/* Three irregular ellipses in a cluster */}
      <Ellipse cx={14} cy={22} rx={10} ry={8} fill={fill} />
      <Ellipse cx={30} cy={18} rx={9} ry={7} fill={fill} />
      <Ellipse cx={46} cy={24} rx={10} ry={7} fill={fill} />
    </Svg>
  );
}

function Type6Visual() {
  const fill = FILL_COLORS[6];
  // Large irregular cloud/blob shape using path
  const blobPath =
    'M 8 28 Q 2 22 7 16 Q 12 8 22 12 Q 26 6 34 10 Q 42 6 48 12 Q 56 14 56 22 Q 58 30 50 32 Q 44 38 34 34 Q 26 40 18 36 Q 8 36 8 28 Z';
  return (
    <Svg width={60} height={40} viewBox="0 0 60 40">
      <Path d={blobPath} fill={fill} />
    </Svg>
  );
}

function Type7Visual() {
  const stroke = FILL_COLORS[7];
  // Three wavy horizontal lines (sinusoidal paths), no fill
  return (
    <Svg width={60} height={40} viewBox="0 0 60 40">
      <Path
        d="M 4 14 Q 11 10 18 14 Q 25 18 32 14 Q 39 10 46 14 Q 53 18 60 14"
        stroke={stroke}
        strokeWidth={2.5}
        fill="none"
        strokeLinecap="round"
      />
      <Path
        d="M 4 22 Q 11 18 18 22 Q 25 26 32 22 Q 39 18 46 22 Q 53 26 60 22"
        stroke={stroke}
        strokeWidth={2.5}
        fill="none"
        strokeLinecap="round"
      />
      <Path
        d="M 4 30 Q 11 26 18 30 Q 25 34 32 30 Q 39 26 46 30 Q 53 34 60 30"
        stroke={stroke}
        strokeWidth={2.5}
        fill="none"
        strokeLinecap="round"
      />
    </Svg>
  );
}

const VISUAL_MAP: Record<number, React.ReactElement> = {
  1: <Type1Visual />,
  2: <Type2Visual />,
  3: <Type3Visual />,
  4: <Type4Visual />,
  5: <Type5Visual />,
  6: <Type6Visual />,
  7: <Type7Visual />,
};

// ─── Type metadata ────────────────────────────────────────────────────────────

const BRISTOL_META = [
  { type: 1, label: 'Type 1', desc: 'Separate lumps', ideal: false },
  { type: 2, label: 'Type 2', desc: 'Lumpy sausage', ideal: false },
  { type: 3, label: 'Type 3', desc: 'Cracked sausage', ideal: false },
  { type: 4, label: 'Type 4', desc: 'Smooth sausage', ideal: true },
  { type: 5, label: 'Type 5', desc: 'Soft blobs', ideal: false },
  { type: 6, label: 'Type 6', desc: 'Mushy', ideal: false },
  { type: 7, label: 'Type 7', desc: 'Watery', ideal: false },
];

// ─── Props ────────────────────────────────────────────────────────────────────

interface BristolStoolChartProps {
  selected: number | null;
  onSelect: (type: number) => void;
}

// ─── Cell ─────────────────────────────────────────────────────────────────────

function BristolCell({
  type,
  label,
  desc,
  ideal,
  isSelected,
  onPress,
}: {
  type: number;
  label: string;
  desc: string;
  ideal: boolean;
  isSelected: boolean;
  onPress: () => void;
}) {
  const isIdealSelected = ideal && isSelected;

  return (
    <TouchableOpacity
      style={[
        styles.cell,
        isSelected && styles.cellSelected,
        isIdealSelected && styles.cellIdealSelected,
      ]}
      onPress={onPress}
      activeOpacity={0.72}
    >
      {/* SVG visual centered */}
      <View style={styles.svgWrapper}>{VISUAL_MAP[type]}</View>

      {/* Label */}
      <Text style={[styles.typeLabel, isSelected && styles.typeLabelSelected]}>
        {label}
      </Text>

      {/* Descriptor */}
      <Text style={styles.typeDesc}>{desc}</Text>

      {/* Ideal badge */}
      {ideal && (
        <View style={styles.idealBadge}>
          <Text style={styles.idealBadgeText}>Ideal</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function BristolStoolChart({ selected, onSelect }: BristolStoolChartProps) {
  const row1 = BRISTOL_META.slice(0, 3); // types 1-3
  const row2 = BRISTOL_META.slice(3, 6); // types 4-6
  const row3 = BRISTOL_META.slice(6, 7); // type 7

  return (
    <View style={styles.container}>
      {/* Row 1: Types 1–3 */}
      <View style={styles.row}>
        {row1.map(item => (
          <BristolCell
            key={item.type}
            {...item}
            isSelected={selected === item.type}
            onPress={() => onSelect(item.type)}
          />
        ))}
      </View>

      {/* Row 2: Types 4–6 */}
      <View style={styles.row}>
        {row2.map(item => (
          <BristolCell
            key={item.type}
            {...item}
            isSelected={selected === item.type}
            onPress={() => onSelect(item.type)}
          />
        ))}
      </View>

      {/* Row 3: Type 7 centered */}
      <View style={styles.rowCentered}>
        {row3.map(item => (
          <BristolCell
            key={item.type}
            {...item}
            isSelected={selected === item.type}
            onPress={() => onSelect(item.type)}
          />
        ))}
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    gap: Spacing.sm,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  rowCentered: {
    flexDirection: 'row',
    justifyContent: 'center',
  },

  // Cell
  cell: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.border,
    gap: 4,
  },
  cellSelected: {
    borderColor: Colors.secondary,
    backgroundColor: Colors.secondary + '10',
  },
  cellIdealSelected: {
    borderColor: Colors.secondary,
    backgroundColor: Colors.secondary + '10',
  },

  // SVG wrapper
  svgWrapper: {
    width: 60,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Labels
  typeLabel: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: 12,
    color: Colors.text,
    marginTop: 2,
  },
  typeLabelSelected: {
    color: Colors.secondary,
  },
  typeDesc: {
    fontFamily: FontFamily.sansRegular,
    fontSize: 10,
    color: Colors.textSecondary,
    textAlign: 'center',
  },

  // Ideal badge
  idealBadge: {
    backgroundColor: Colors.secondary + '20',
    borderRadius: BorderRadius.full,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 2,
  },
  idealBadgeText: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: 9,
    color: Colors.secondary,
  },
});
