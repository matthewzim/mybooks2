/**
 * Theme Constants
 *
 * Centralized theme values for consistent styling across the app.
 * Includes colors, spacing, typography, and other design tokens.
 */

import { Platform, TextStyle } from 'react-native';

/**
 * Theme types
 */
export type ThemeType = 'light' | 'dark' | 'standard';

export interface ThemeColors {
  // Primary colors
  primary: string;
  primaryLight: string;
  primaryDark: string;

  // Secondary colors
  secondary: string;
  secondaryLight: string;

  // Accent colors
  accent: string;
  accentLight: string;

  // Background colors
  background: string;
  backgroundDark: string;
  card: string;
  cardDark: string;

  // Text colors
  text: string;
  textSecondary: string;
  textLight: string;
  textInverse: string;

  // Bookshelf colors (wood tones)
  bookshelfWood: string;
  bookshelfDark: string;
  bookshelfLight: string;

  // Book appearance colors
  bookBase: string;
  bookPageLines: string;
  bookPageContent: string;
  bookCoverEdge: string;

  // Input colors
  inputBackground: string;
  inputBorder: string;

  // Status colors
  success: string;
  warning: string;
  error: string;
  info: string;

  // Border colors
  border: string;
  borderLight: string;

  // Rating star colors
  starFilled: string;
  starEmpty: string;

  // Danger surfaces (destructive buttons)
  dangerBg: string;
  dangerBorder: string;

  // Decorative accents
  walnut: string;
  gilt: string;

  // Count/badge pills
  pill: string;
  pillText: string;

  // Overlay colors
  overlay: string;
  overlayLight: string;
  overlayDark: string;
  overlayWhite: string;
  overlayWhiteLight: string;

  // Text on contrasting backgrounds
  textOnDark: string;
  textOnDarkMuted: string;
}

/**
 * Light Mode Theme - Warm cream with rust accents
 */
export const LightTheme: ThemeColors = {
  // Primary colors
  primary: '#b0501d',
  primaryLight: '#c8642a',
  primaryDark: '#8f3f14',

  // Secondary colors
  secondary: '#b0501d',
  secondaryLight: '#c8642a',

  // Accent colors
  accent: '#b0501d',
  accentLight: '#c8642a',

  // Background colors
  background: '#f6efe1',
  backgroundDark: '#efe3cf',
  card: '#fffdf8',
  cardDark: '#f4ead6',

  // Text colors
  text: '#2c2420',
  textSecondary: '#857868',
  textLight: '#a89d8c',
  textInverse: '#ffffff',

  // Bookshelf colors (wood tones)
  bookshelfWood: '#7a4f2c',
  bookshelfDark: '#5c3a1f',
  bookshelfLight: '#DEB887',

  // Book appearance colors
  bookBase: '#f4ead6',
  bookPageLines: '#e0d5bf',
  bookPageContent: '#fffdf8',
  bookCoverEdge: 'rgba(0, 0, 0, 0.3)',

  // Input colors
  inputBackground: '#fffdf8',
  inputBorder: '#e3d7c1',

  // Status colors
  success: '#22c55e',
  warning: '#c9a25a',
  error: '#b5402f',
  info: '#857868',

  // Border colors
  border: '#ece2cf',
  borderLight: '#f0e7d6',

  // Rating star colors
  starFilled: '#c9a25a',
  starEmpty: '#e0d5bf',

  // Danger surfaces
  dangerBg: '#fdf3f0',
  dangerBorder: '#e4c3bb',

  // Decorative accents
  walnut: '#6b4423',
  gilt: '#c9a25a',

  // Count/badge pills
  pill: '#f4ead6',
  pillText: '#96795a',

  // Overlay colors
  overlay: 'rgba(20, 12, 6, 0.55)',
  overlayLight: 'rgba(20, 12, 6, 0.2)',
  overlayDark: 'rgba(20, 12, 6, 0.65)',
  overlayWhite: 'rgba(255, 255, 255, 0.3)',
  overlayWhiteLight: 'rgba(255, 255, 255, 0.2)',

  // Text on contrasting backgrounds
  textOnDark: 'rgba(255, 255, 255, 0.9)',
  textOnDarkMuted: 'rgba(255, 255, 255, 0.7)',
};

/**
 * Dark Mode Theme - Deep dark with light gray accents
 */
export const DarkTheme: ThemeColors = {
  // Primary colors
  primary: '#c8642a',
  primaryLight: '#d4723f',
  primaryDark: '#8f3f14',

  // Secondary colors
  secondary: '#c8642a',
  secondaryLight: '#d4723f',

  // Accent colors
  accent: '#c8642a',
  accentLight: '#d4723f',

  // Background colors (dark — matches the widget's dark appearance #0b1220)
  background: '#0b1220',
  backgroundDark: '#0f172a',
  card: '#111a2e',
  cardDark: '#0f172a',

  // Text colors
  text: '#f1f5f9',
  textSecondary: '#94a3b8',
  textLight: '#64748b',
  textInverse: '#0f172a',

  // Bookshelf colors (wood tones)
  bookshelfWood: '#78350f',
  bookshelfDark: '#451a03',
  bookshelfLight: '#a16207',

  // Book appearance colors
  bookBase: '#1e293b',
  bookPageLines: '#334155',
  bookPageContent: '#0f172a',
  bookCoverEdge: 'rgba(0, 0, 0, 0.5)',

  // Input colors
  inputBackground: '#111a2e',
  inputBorder: '#334155',

  // Status colors
  success: '#22c55e',
  warning: '#c9a25a',
  error: '#cf5a45',
  info: '#94a3b8',

  // Border colors
  border: '#24324a',
  borderLight: '#1a2639',

  // Rating star colors
  starFilled: '#c9a25a',
  starEmpty: '#334155',

  // Danger surfaces
  dangerBg: '#2a1712',
  dangerBorder: '#5c3128',

  // Decorative accents
  walnut: '#6b4423',
  gilt: '#c9a25a',

  // Count/badge pills
  pill: '#1e293b',
  pillText: '#a89d8c',

  // Overlay colors
  overlay: 'rgba(0, 0, 0, 0.7)',
  overlayLight: 'rgba(0, 0, 0, 0.4)',
  overlayDark: 'rgba(0, 0, 0, 0.8)',
  overlayWhite: 'rgba(255, 255, 255, 0.3)',
  overlayWhiteLight: 'rgba(255, 255, 255, 0.2)',

  // Text on contrasting backgrounds
  textOnDark: 'rgba(255, 255, 255, 0.9)',
  textOnDarkMuted: 'rgba(255, 255, 255, 0.7)',
};

/**
 * Standard Theme - Light brown/dark brown (warm wood tones)
 */
export const StandardTheme: ThemeColors = {
  // Primary colors
  primary: '#b0501d',
  primaryLight: '#c8642a',
  primaryDark: '#8f3f14',

  // Secondary colors
  secondary: '#b0501d',
  secondaryLight: '#c8642a',

  // Accent colors
  accent: '#b0501d',
  accentLight: '#c8642a',

  // Background colors
  background: '#f6efe1',
  backgroundDark: '#efe3cf',
  card: '#fffdf8',
  cardDark: '#f4ead6',

  // Text colors
  text: '#2c2420',
  textSecondary: '#857868',
  textLight: '#a89d8c',
  textInverse: '#ffffff',

  // Bookshelf colors (wood tones)
  bookshelfWood: '#7a4f2c',
  bookshelfDark: '#5c3a1f',
  bookshelfLight: '#DEB887',

  // Book appearance colors
  bookBase: '#f4ead6',
  bookPageLines: '#e0d5bf',
  bookPageContent: '#fffdf8',
  bookCoverEdge: 'rgba(0, 0, 0, 0.3)',

  // Input colors
  inputBackground: '#fffdf8',
  inputBorder: '#e3d7c1',

  // Status colors
  success: '#15803d',
  warning: '#c9a25a',
  error: '#b5402f',
  info: '#857868',

  // Border colors
  border: '#ece2cf',
  borderLight: '#f0e7d6',

  // Rating star colors
  starFilled: '#c9a25a',
  starEmpty: '#e0d5bf',

  // Danger surfaces
  dangerBg: '#fdf3f0',
  dangerBorder: '#e4c3bb',

  // Decorative accents
  walnut: '#6b4423',
  gilt: '#c9a25a',

  // Count/badge pills
  pill: '#f4ead6',
  pillText: '#96795a',

  // Overlay colors
  overlay: 'rgba(69, 26, 3, 0.5)',
  overlayLight: 'rgba(69, 26, 3, 0.2)',
  overlayDark: 'rgba(69, 26, 3, 0.7)',
  overlayWhite: 'rgba(255, 255, 255, 0.3)',
  overlayWhiteLight: 'rgba(255, 255, 255, 0.2)',

  // Text on contrasting backgrounds
  textOnDark: 'rgba(255, 255, 255, 0.9)',
  textOnDarkMuted: 'rgba(255, 255, 255, 0.7)',
};

/**
 * Theme collection
 */
export const Themes: Record<ThemeType, ThemeColors> = {
  light: LightTheme,
  dark: DarkTheme,
  standard: StandardTheme,
};

/**
 * Default theme colors (for backwards compatibility)
 * This will be overridden by ThemeContext in runtime
 */
export const Colors = LightTheme;

export const Spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  xxxl: 64,
} as const;

export const BorderRadius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  xxl: 20,
  full: 9999,
} as const;

export const Typography = {
  // Font sizes
  sizes: {
    xs: 10,
    sm: 12,
    md: 14,
    lg: 16,
    xl: 18,
    xxl: 24,
    xxxl: 32,
  },
  // Font weights
  weights: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
  },
  fonts: {
    regular: Platform.select({
      web: '"Plus Jakarta Sans", "Inter", sans-serif',
      default: 'PlusJakartaSans_400Regular',
    }),
    medium: Platform.select({
      web: '"Plus Jakarta Sans", "Inter", sans-serif',
      default: 'PlusJakartaSans_500Medium',
    }),
    semibold: Platform.select({
      web: '"Plus Jakarta Sans", "Inter", sans-serif',
      default: 'PlusJakartaSans_600SemiBold',
    }),
    bold: Platform.select({
      web: '"Plus Jakarta Sans", "Inter", sans-serif',
      default: 'PlusJakartaSans_700Bold',
    }),
    serif: Platform.select({
      web: '"Newsreader", "Georgia", serif',
      default: 'Newsreader_500Medium',
    }),
    serifRegular: Platform.select({
      web: '"Newsreader", "Georgia", serif',
      default: 'Newsreader_400Regular',
    }),
    serifSemibold: Platform.select({
      web: '"Newsreader", "Georgia", serif',
      default: 'Newsreader_600SemiBold',
    }),
    serifItalic: Platform.select({
      web: '"Newsreader", "Georgia", serif',
      default: 'Newsreader_400Regular_Italic',
    }),
    serifMediumItalic: Platform.select({
      web: '"Newsreader", "Georgia", serif',
      default: 'Newsreader_500Medium_Italic',
    }),
  },
  // Line heights
  lineHeights: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.75,
  },
} as const;

export const getFontFamily = (
  weight: keyof typeof Typography.weights = 'regular'
): TextStyle['fontFamily'] => Typography.fonts[weight];

export type SerifVariant = 'regular' | 'medium' | 'semibold' | 'italic' | 'mediumItalic';

const serifFontMap: Record<SerifVariant, TextStyle['fontFamily']> = {
  regular: Typography.fonts.serifRegular,
  medium: Typography.fonts.serif,
  semibold: Typography.fonts.serifSemibold,
  italic: Typography.fonts.serifItalic,
  mediumItalic: Typography.fonts.serifMediumItalic,
};

export const getSerifFontFamily = (
  variant: SerifVariant = 'medium'
): TextStyle['fontFamily'] => serifFontMap[variant];

/**
 * Style fragment for italic serif text. Native loads dedicated italic font
 * files, while web relies on fontStyle to pick the italic face.
 */
export const serifItalicStyle: TextStyle = {
  fontFamily: getSerifFontFamily('italic'),
  ...(Platform.OS === 'web' ? { fontStyle: 'italic' as const } : {}),
};

export const Shadows = {
  sm: {
    shadowColor: '#4a2f19',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 12,
    elevation: 2,
  },
  md: {
    shadowColor: '#4a2f19',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 6,
  },
  lg: {
    shadowColor: '#4a2f19',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.22,
    shadowRadius: 34,
    elevation: 10,
  },
} as const;

/**
 * Wood / shelf gradient tokens.
 * Used everywhere a shelf renders: plank surfaces, cabinet frames, and the
 * warm lit back panel behind books.
 */
export const Wood = {
  plankTop: '#7a4f2c',
  plankBottom: '#5c3a1f',
  plankHighlight: 'rgba(255, 220, 170, 0.35)',
  frameTop: '#8a5a30',
  frameBottom: '#6e4324',
  frameEdge: '#b98a52',
  backTop: '#e9dcc2',
  backBottom: '#f1e6cf',
} as const;

// Book spine dimensions
export const BookSpine = {
  // Default dimensions
  width: 50,
  height: 180,
  minWidth: 20,
  maxWidth: 100,
  minHeight: 120,
  maxHeight: 220,

  // Spine colors (for books without images) — warm literary cloth set
  colors: [
    '#7c3b2e', // Oxblood
    '#2d3a54', // Navy
    '#c08a2d', // Mustard (light cloth)
    '#3f5641', // Forest
    '#33261f', // Espresso
    '#d9c9a8', // Cream (light cloth)
    '#4a2f45', // Plum
    '#6b2f2a', // Brick
    '#37514f', // Teal
    '#5c3a1f', // Walnut
  ] as const,
} as const;

// Bookshelf dimensions
export const BookshelfDimensions = {
  // Grid layout
  columns: 1,
  minRows: 3,
  rowHeight: 200,

  // Shelf appearance
  shelfThickness: 12,
  shelfColor: '#7a4f2c',
  backColor: '#e9dcc2',
} as const;

// Animation durations
export const Animations = {
  fast: 150,
  normal: 220,
  slow: 300,
} as const;

// Screen breakpoints (for responsive design)
export const Breakpoints = {
  sm: 375,
  md: 428,
  lg: 768,
  xl: 1024,
} as const;
