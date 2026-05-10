export const Theme = {
  colors: {
    sage: '#B2AC88',
    sageDark: '#7E795D',
    sageSoft: '#F3F0E5',
    cream: '#FAF8F1',
    creamSoft: '#FDFBF5',
    creamTrack: '#ECE7D9',
    navy: '#15212D',
    slate: '#4E5B66',
    white: '#FFFFFF',
    border: '#DDE6DF',
  },
  borderRadii: {
    card: 15,
    button: 15,
  },
  shadows: {
    card: {
      shadowColor: '#102018',
      shadowOpacity: 0.07,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 4,
    },
    soft: {
      shadowColor: '#102018',
      shadowOpacity: 0.06,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 5 },
      elevation: 3,
    },
  },
  gradients: {
    primary: ['#B2AC88', '#8E8868'] as const,
    surface: ['#FFFFFF', '#F7F4EA'] as const,
  },
} as const;

import { Platform } from 'react-native';

// ─── Premium Sage Green Color Palette ───────────────────────────────────────
export const Colors = {
  // Brand — soft sage green
  primary: '#B2AC88',
  primaryLight: '#C7C1A0',
  primaryDark: '#7E795D',
  secondary: '#B2AC88',
  secondaryLight: '#C7C1A0',
  accent: '#D4A373',
  accentLight: '#E6C9A8',

  // Backgrounds
  background: '#000000',
  surface: '#0B0B0B',
  surfaceSecondary: '#111111',
  surfaceDark: '#7E795D',

  // Text
  text: '#FFFFFF',
  textSecondary: '#A7A7A7',
  textTertiary: '#777777',
  textInverse: '#FFFFFF',

  // Functional
  success: '#B2AC88',
  warning: '#D4A373',
  error: '#C1444B',
  info: '#5B9BD5',

  // UI elements
  border: '#242424',
  borderFocused: '#B2AC88',
  divider: '#181818',
  disabled: '#2A2A2A',
  tabInactive: '#777777',

  // Severity scale (1-5) for symptoms
  severity: {
    1: '#C7C1A0',
    2: '#B2AC88',
    3: '#D4A373',
    4: '#E07A5F',
    5: '#C1444B',
  } as Record<number, string>,

  // Bristol stool colors
  bristol: {
    1: '#8B6F47',
    2: '#A0845C',
    3: '#B2AC88',
    4: '#7E795D',
    5: '#D4A373',
    6: '#E07A5F',
    7: '#C1444B',
  } as Record<number, string>,

  // Mood colors
  mood: {
    1: '#C1444B',   // Bad
    2: '#E07A5F',   // Low
    3: '#D4A373',   // Okay
    4: '#B2AC88',   // Good
    5: '#7E795D',   // Great
  } as Record<number, string>,

  // Contribution calendar heatmap
  calendarEmpty: '#151515',
  calendarLevel1: '#D8F3DC',
  calendarLevel2: '#95D5B2',
  calendarLevel3: '#B2AC88',
  calendarLevel4: '#7E795D',

  // Onboarding gradient
  onboardingGradientStart: '#7E795D',
  onboardingGradientEnd: '#B2AC88',
  onboardingProgressTrack: '#7E795D',
  onboardingProgressFill: '#B2AC88',
  onboardingOptionBg: '#143728',
  onboardingOptionBorder: '#B2AC88',

  // Level system
  level: {
    beginner: '#95D5B2',
    explorer: '#C7C1A0',
    tracker: '#B2AC88',
    specialist: '#7E795D',
    guru: '#D4A373',
  },
};

// ─── Spacing System (4pt base) ──────────────────────────────────────────────
export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

// ─── Border Radius ──────────────────────────────────────────────────────────
export const BorderRadius = {
  sm: 8,
  md: 12,
  lg: 20,
  xl: 24,
  full: 999,
};

// ─── Font Size ──────────────────────────────────────────────────────────────
export const FontSize = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 22,
  xxl: 28,
  hero: 34,
};

// ─── Typography System (EB Garamond + Inter) ────────────────────────────────
export const FontFamily = {
  // Display / Headings — clean premium sans-serif
  displayRegular: 'Inter_400Regular',
  displayMedium: 'Inter_500Medium',
  displaySemiBold: 'Inter_700Bold',
  displayBold: 'Inter_800ExtraBold',
  // UI / Body — clean sans-serif
  sansRegular: 'Inter_400Regular',
  sansMedium: 'Inter_500Medium',
  sansSemiBold: 'Inter_600SemiBold',
  sansBold: 'Inter_700Bold',
  sansExtraBold: 'Inter_800ExtraBold',
};

export const Typography = {
  h1: {
    fontFamily: FontFamily.displayRegular,
    fontSize: 32,
    lineHeight: 40,
  },
  h2: {
    fontFamily: FontFamily.displayMedium,
    fontSize: 24,
    lineHeight: 32,
  },
  h3: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: 18,
    lineHeight: 24,
  },
  body: {
    fontFamily: FontFamily.sansRegular,
    fontSize: 16,
    lineHeight: 24,
  },
  bodySmall: {
    fontFamily: FontFamily.sansRegular,
    fontSize: 14,
    lineHeight: 20,
  },
  caption: {
    fontFamily: FontFamily.sansMedium,
    fontSize: 12,
    lineHeight: 16,
  },
  button: {
    fontFamily: FontFamily.sansBold,
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: 0.5,
  },
  label: {
    fontFamily: FontFamily.sansMedium,
    fontSize: 14,
    lineHeight: 20,
  },
};

// ─── Legacy Font References (platform defaults for fallback) ────────────────
export const Fonts = Platform.select({
  ios: {
    sans: 'System',
    serif: 'Georgia',
    rounded: 'System',
    mono: 'Menlo',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
});

// ─── Shadows ────────────────────────────────────────────────────────────────
export const Shadows = {
  sm: {
    shadowColor: '#7E795D',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  md: {
    shadowColor: '#7E795D',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 6,
  },
  lg: {
    shadowColor: '#7E795D',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 24,
    elevation: 12,
  },
};
