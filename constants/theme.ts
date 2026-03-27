import { Platform } from 'react-native';

// GutWell natural green color palette
export const Colors = {
  // Brand colors
  primary: '#4A9D6E',       // Natural green
  primaryLight: '#6DB88A',  // Light green
  primaryDark: '#357A52',   // Deep forest green
  secondary: '#8BC4A0',     // Soft mint
  secondaryLight: '#B5DCC5', // Pale mint
  accent: '#E8A84C',        // Warm amber/golden

  // Backgrounds
  background: '#F5FAF7',    // Soft green-white
  surface: '#FFFFFF',       // White cards
  surfaceSecondary: '#EAF4EE', // Light green tint

  // Text
  text: '#1A2E23',          // Deep green-black
  textSecondary: '#4A6355', // Muted green-grey
  textTertiary: '#8BA698',  // Light sage text
  textInverse: '#FFFFFF',   // White text

  // Functional
  success: '#4A9D6E',       // Green (same as primary)
  warning: '#E8A84C',       // Amber
  error: '#D65353',         // Red
  info: '#5B9BD5',          // Blue

  // UI elements
  border: '#D6E8DD',        // Soft green border
  borderFocused: '#4A9D6E', // Green border
  divider: '#E4F0E8',       // Subtle green divider
  disabled: '#BCCFC3',      // Disabled green-grey
  tabInactive: '#8BA698',   // Inactive tab

  // Severity scale (1-5) for symptoms
  severity: {
    1: '#7CB08A', // Green - mild
    2: '#A3CDB0', // Light green
    3: '#F5C26B', // Amber - moderate
    4: '#F2A994', // Light coral
    5: '#E85D5D', // Red - severe
  } as Record<number, string>,

  // Bristol stool colors
  bristol: {
    1: '#8B6F47', // Type 1
    2: '#A0845C', // Type 2
    3: '#6DB88A', // Type 3 (good)
    4: '#4A9D6E', // Type 4 (ideal - matches primary)
    5: '#C4A96A', // Type 5
    6: '#E8A84C', // Type 6
    7: '#D65353', // Type 7
  } as Record<number, string>,
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const BorderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 999,
};

export const FontSize = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 22,
  xxl: 28,
  hero: 34,
};

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  },
});

export const Shadows = {
  sm: {
    shadowColor: '#1A2E23',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3,
  },
  md: {
    shadowColor: '#1A2E23',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  lg: {
    shadowColor: '#1A2E23',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 10,
  },
};
