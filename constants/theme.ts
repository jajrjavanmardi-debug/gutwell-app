import { Platform } from 'react-native';

// ─── Premium Dark Green Color Palette ───────────────────────────────────────
export const Colors = {
  // Brand — deep forest green
  primary: '#1B4332',
  primaryLight: '#2D6A4F',
  primaryDark: '#0B2618',
  secondary: '#52B788',
  secondaryLight: '#74C69D',
  accent: '#D4A373',
  accentLight: '#E6C9A8',

  // Backgrounds
  background: '#000000',
  surface: '#0B0B0B',
  surfaceSecondary: '#111111',
  surfaceDark: '#0B2618',

  // Text
  text: '#FFFFFF',
  textSecondary: '#A7A7A7',
  textTertiary: '#777777',
  textInverse: '#FFFFFF',

  // Functional
  success: '#2D6A4F',
  warning: '#D4A373',
  error: '#C1444B',
  info: '#5B9BD5',

  // UI elements
  border: '#242424',
  borderFocused: '#2D6A4F',
  divider: '#181818',
  disabled: '#2A2A2A',
  tabInactive: '#777777',

  // Severity scale (1-5) for symptoms
  severity: {
    1: '#52B788',
    2: '#74C69D',
    3: '#D4A373',
    4: '#E07A5F',
    5: '#C1444B',
  } as Record<number, string>,

  // Bristol stool colors
  bristol: {
    1: '#8B6F47',
    2: '#A0845C',
    3: '#52B788',
    4: '#2D6A4F',
    5: '#D4A373',
    6: '#E07A5F',
    7: '#C1444B',
  } as Record<number, string>,

  // Mood colors
  mood: {
    1: '#C1444B',   // Bad
    2: '#E07A5F',   // Low
    3: '#D4A373',   // Okay
    4: '#52B788',   // Good
    5: '#2D6A4F',   // Great
  } as Record<number, string>,

  // Contribution calendar heatmap
  calendarEmpty: '#151515',
  calendarLevel1: '#D8F3DC',
  calendarLevel2: '#95D5B2',
  calendarLevel3: '#52B788',
  calendarLevel4: '#1B4332',

  // Onboarding gradient
  onboardingGradientStart: '#0B2618',
  onboardingGradientEnd: '#1B4332',
  onboardingProgressTrack: '#0B2618',
  onboardingProgressFill: '#52B788',
  onboardingOptionBg: '#143728',
  onboardingOptionBorder: '#52B788',

  // Level system
  level: {
    beginner: '#95D5B2',
    explorer: '#74C69D',
    tracker: '#52B788',
    specialist: '#2D6A4F',
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
  // Display / Headings — elegant serif
  displayRegular: 'EBGaramond_400Regular',
  displayMedium: 'EBGaramond_500Medium',
  displaySemiBold: 'EBGaramond_600SemiBold',
  displayBold: 'EBGaramond_700Bold',
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
    shadowColor: '#1B4332',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  md: {
    shadowColor: '#1B4332',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 6,
  },
  lg: {
    shadowColor: '#1B4332',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 24,
    elevation: 12,
  },
};
