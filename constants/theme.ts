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
 * Light Mode Theme - Clean white with slate accents
 */
export const LightTheme: ThemeColors = {
  // Primary colors
  primary: '#ba541f',
  primaryLight: '#d4723f',
  primaryDark: '#9a4419',

  // Secondary colors
  secondary: '#ba541f',
  secondaryLight: '#d4723f',

  // Accent colors
  accent: '#ba541f',
  accentLight: '#d4723f',

  // Background colors
  background: '#fbf6ec',
  backgroundDark: '#f5eddf',
  card: '#fbf6ec',
  cardDark: '#f5eddf',

  // Text colors
  text: '#1e293b',
  textSecondary: '#64748b',
  textLight: '#94a3b8',
  textInverse: '#ffffff',

  // Bookshelf colors (wood tones)
  bookshelfWood: '#8B4513',
  bookshelfDark: '#654321',
  bookshelfLight: '#DEB887',

  // Book appearance colors
  bookBase: '#f5eddf',
  bookPageLines: '#cbd5e1',
  bookPageContent: '#fbf6ec',
  bookCoverEdge: 'rgba(0, 0, 0, 0.3)',

  // Input colors
  inputBackground: '#fbf6ec',
  inputBorder: '#e2e8f0',

  // Status colors
  success: '#22c55e',
  warning: '#f59e0b',
  error: '#ef4444',
  info: '#64748b',

  // Border colors
  border: '#dbe3ef',
  borderLight: '#eef2f7',

  // Rating star colors
  starFilled: '#f59e0b',
  starEmpty: '#e2e8f0',

  // Overlay colors
  overlay: 'rgba(0, 0, 0, 0.5)',
  overlayLight: 'rgba(0, 0, 0, 0.2)',
  overlayDark: 'rgba(0, 0, 0, 0.6)',
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
  primary: '#ba541f',
  primaryLight: '#d4723f',
  primaryDark: '#9a4419',

  // Secondary colors
  secondary: '#ba541f',
  secondaryLight: '#d4723f',

  // Accent colors
  accent: '#ba541f',
  accentLight: '#d4723f',

  // Background colors
  background: '#fbf6ec',
  backgroundDark: '#f5eddf',
  card: '#fbf6ec',
  cardDark: '#f5eddf',

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
  bookBase: '#f5eddf',
  bookPageLines: '#334155',
  bookPageContent: '#fbf6ec',
  bookCoverEdge: 'rgba(0, 0, 0, 0.5)',

  // Input colors
  inputBackground: '#fbf6ec',
  inputBorder: '#334155',

  // Status colors
  success: '#22c55e',
  warning: '#f59e0b',
  error: '#ef4444',
  info: '#94a3b8',

  // Border colors
  border: '#24324a',
  borderLight: '#1a2639',

  // Rating star colors
  starFilled: '#f59e0b',
  starEmpty: '#334155',

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
  primary: '#ba541f',
  primaryLight: '#d4723f',
  primaryDark: '#9a4419',

  // Secondary colors
  secondary: '#ba541f',
  secondaryLight: '#d4723f',

  // Accent colors
  accent: '#ba541f',
  accentLight: '#d4723f',

  // Background colors
  background: '#fbf6ec',
  backgroundDark: '#f5eddf',
  card: '#fbf6ec',
  cardDark: '#f5eddf',

  // Text colors
  text: '#292524',
  textSecondary: '#57534e',
  textLight: '#a8a29e',
  textInverse: '#ffffff',

  // Bookshelf colors (wood tones)
  bookshelfWood: '#8B4513',
  bookshelfDark: '#654321',
  bookshelfLight: '#DEB887',

  // Book appearance colors
  bookBase: '#f5eddf',
  bookPageLines: '#d4cfc4',
  bookPageContent: '#fbf6ec',
  bookCoverEdge: 'rgba(0, 0, 0, 0.3)',

  // Input colors
  inputBackground: '#fbf6ec',
  inputBorder: '#d6d3d1',

  // Status colors
  success: '#15803d',
  warning: '#ca8a04',
  error: '#dc2626',
  info: '#0369a1',

  // Border colors
  border: '#d6d3d1',
  borderLight: '#e7e5e4',

  // Rating star colors
  starFilled: '#f59e0b',
  starEmpty: '#fde68a',

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
      default: 'System',
    }),
    medium: Platform.select({
      web: '"Plus Jakarta Sans", "Inter", sans-serif',
      default: 'System',
    }),
    semibold: Platform.select({
      web: '"Plus Jakarta Sans", "Inter", sans-serif',
      default: 'System',
    }),
    bold: Platform.select({
      web: '"Plus Jakarta Sans", "Inter", sans-serif',
      default: 'System',
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

export const Shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
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

  // Spine colors (for books without images)
  colors: [
    '#8B0000', // Dark Red
    '#00008B', // Dark Blue
    '#006400', // Dark Green
    '#4B0082', // Indigo
    '#8B4513', // Saddle Brown
    '#2F4F4F', // Dark Slate Gray
    '#483D8B', // Dark Slate Blue
    '#556B2F', // Dark Olive Green
    '#800000', // Maroon
    '#191970', // Midnight Blue
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
  shelfColor: '#8B4513',
  backColor: '#654321',
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
