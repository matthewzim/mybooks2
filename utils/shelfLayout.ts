/**
 * Shelf spine geometry
 *
 * Single source of truth for how large a spine is drawn on a shelf. The
 * bookshelf page sizes spines against a full-height shelf; preview cards draw
 * the same shelf smaller, so they take these sizes and scale them by one
 * factor. Sizing a preview with its own ranges instead is what made previews
 * disagree with the shelf they stand for: a clamp that bit at preview scale but
 * not at shelf scale changed a spine's height relative to its neighbours, and —
 * because the clamped box no longer carried the image's aspect ratio — left
 * `contentFit="cover"` cropping the spine artwork.
 */

import {
  BookSpine as BookSpineConstants,
  BookshelfDimensions,
  Spacing,
} from '@/constants/theme';
import {
  getImageSpineHeightFactor,
  getImageSpineSize,
  getPlaceholderSpineSize,
} from '@/utils/placeholderSpine';
import type { Book, ShelfStyle } from '@/types';

export interface SpineSize {
  width: number;
  height: number;
}

/** Natural pixel size of a spine image, once measured */
export interface SpineImageDimensions {
  width: number;
  height: number;
}

/** Fraction of the shelf height below which a spine is never drawn */
const MIN_DISPLAY_HEIGHT_FACTOR = 0.6;

/** Shortest a placeholder (image-less) spine may be, as a fraction of the shelf */
const PLACEHOLDER_MIN_HEIGHT_FACTOR = 0.75;

/** Horizontal room the bookshelf page leaves for spines, by shelf style */
export function getShelfAvailableWidth(screenWidth: number, shelfStyle: ShelfStyle): number {
  if (shelfStyle === 'full') {
    // Cabinet margin and wood frame on both sides, plus the 1px cabinet border
    return (
      screenWidth
      - Spacing.xs * 2
      - BookshelfDimensions.shelfThickness * 2
      - 2
    );
  }

  return screenWidth - Spacing.md * 2;
}

/** Height of one shelf on the bookshelf page for a given interior width */
export function getShelfHeight(availableWidth: number): number {
  return Math.min(BookSpineConstants.maxHeight, Math.floor((availableWidth / 5) * 3.6));
}

export function getShelfSpineWidthRange(): { min: number; max: number } {
  return { min: BookSpineConstants.minWidth, max: BookSpineConstants.maxWidth };
}

export function getShelfPlaceholderHeightRange(shelfHeight: number): { min: number; max: number } {
  const minHeight = Math.max(
    BookSpineConstants.minHeight,
    Math.round(shelfHeight * PLACEHOLDER_MIN_HEIGHT_FACTOR)
  );

  return { min: Math.min(minHeight, shelfHeight), max: shelfHeight };
}

/**
 * Display box for one spine at full shelf scale.
 *
 * `dimensions` is the measured natural size of the spine image, or undefined
 * for a book with no image (or one not measured yet), which falls back to the
 * deterministic cloth-placeholder size.
 */
export function getShelfSpineSize(
  book: Book,
  dimensions: SpineImageDimensions | undefined,
  shelfHeight: number
): SpineSize {
  const widthRange = getShelfSpineWidthRange();

  if (!dimensions) {
    return getPlaceholderSpineSize(book, widthRange, getShelfPlaceholderHeightRange(shelfHeight));
  }

  const minDisplayHeight = Math.round(shelfHeight * MIN_DISPLAY_HEIGHT_FACTOR);
  const clamped = Math.max(minDisplayHeight, Math.min(shelfHeight, dimensions.height));

  return getImageSpineSize(
    dimensions.width,
    dimensions.height,
    clamped * getImageSpineHeightFactor(book),
    widthRange,
    { min: minDisplayHeight, max: shelfHeight }
  );
}

/**
 * Shrink a shelf-scale box for a preview card.
 *
 * The width follows from the scaled height so the box keeps the shelf box's
 * aspect ratio (and with it the image's), leaving `cover` only a sub-pixel
 * remainder to absorb rather than a visible crop.
 */
export function scaleSpineSize(size: SpineSize, scale: number): SpineSize {
  const height = Math.max(1, Math.round(size.height * scale));
  const aspectRatio = size.height > 0 ? size.width / size.height : 0;

  return {
    width: Math.max(1, Math.round(height * aspectRatio)),
    height,
  };
}
