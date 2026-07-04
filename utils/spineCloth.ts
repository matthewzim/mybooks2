/**
 * Cloth spine palette helpers.
 *
 * Placeholder book spines (books without an uploaded spine image) render as
 * cloth-bound spines. This module maps a book title to a deterministic cloth
 * color and provides the matching title/gilt-band colors, since the two light
 * cloths (mustard, cream) need dark text and darker bands.
 */

import { BookSpine } from '@/constants/theme';

export interface SpineCloth {
  /** Base cloth color for the spine */
  color: string;
  /** True for light cloths that need dark text/bands */
  isLight: boolean;
  /** Vertical title color */
  titleColor: string;
  /** Gilt band color */
  bandColor: string;
}

const LIGHT_CLOTHS: Record<string, string> = {
  '#c08a2d': '#4a3211',
  '#d9c9a8': '#6b5636',
};

const DARK_CLOTH_TITLE = '#ecdfc6';
const DARK_CLOTH_BAND = 'rgba(201, 162, 90, 0.55)';
const LIGHT_CLOTH_BAND = 'rgba(74, 45, 15, 0.4)';

/**
 * Deterministic title → palette index hash. Kept identical to the historic
 * getBookColor hash so a given title always maps to the same spine color.
 */
export function getClothColor(title?: string | null): string {
  const colors = BookSpine.colors;
  const safeTitle = title?.trim() || 'Untitled';
  let hash = 0;
  for (let i = 0; i < safeTitle.length; i++) {
    hash = safeTitle.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

export function getSpineCloth(title?: string | null): SpineCloth {
  const color = getClothColor(title);
  const lightTitleColor = LIGHT_CLOTHS[color];
  const isLight = Boolean(lightTitleColor);

  return {
    color,
    isLight,
    titleColor: lightTitleColor || DARK_CLOTH_TITLE,
    bandColor: isLight ? LIGHT_CLOTH_BAND : DARK_CLOTH_BAND,
  };
}
