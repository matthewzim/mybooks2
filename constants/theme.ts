/**
 * Theme Constants
 *
 * Centralized theme values for consistent styling across the app.
 * Includes colors, spacing, typography, and other design tokens.
 */

export const Colors = {
  // Primary colors
  primary: '#1a1a2e',
  primaryLight: '#16213e',
  primaryDark: '#0f0f1a',

  // Secondary colors
  secondary: '#0f3460',
  secondaryLight: '#1a5276',

  // Accent colors
  accent: '#e94560',
  accentLight: '#ff6b6b',

  // Background colors
  background: '#ffffff',
  backgroundDark: '#f5f5f5',
  card: '#ffffff',
  cardDark: '#f8f9fa',

  // Text colors
  text: '#1a1a2e',
  textSecondary: '#6c757d',
  textLight: '#adb5bd',
  textInverse: '#ffffff',

  // Bookshelf colors (wood tones)
  bookshelfWood: '#8B4513',
  bookshelfDark: '#654321',
  bookshelfLight: '#DEB887',

  // Status colors
  success: '#28a745',
  warning: '#ffc107',
  error: '#dc3545',
  info: '#17a2b8',

  // Border colors
  border: '#dee2e6',
  borderLight: '#e9ecef',

  // Rating star colors
  starFilled: '#ffc107',
  starEmpty: '#e4e5e9',

  // Overlay
  overlay: 'rgba(0, 0, 0, 0.5)',
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
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
  // Line heights
  lineHeights: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.75,
  },
} as const;

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
  normal: 300,
  slow: 500,
} as const;

// Screen breakpoints (for responsive design)
export const Breakpoints = {
  sm: 375,
  md: 428,
  lg: 768,
  xl: 1024,
} as const;
