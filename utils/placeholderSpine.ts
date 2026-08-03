import type { Book } from '@/types';

const PLACEHOLDER_VARIATION_SCALE = 0.4;
const IMAGE_SPINE_MIN_HEIGHT_FACTOR = 0.8;
const IMAGE_SPINE_MAX_HEIGHT_FACTOR = 0.95;

function seededNormalized(book: Book, salt: string): number {
  const source = `${book.id}-${book.title}-${salt}`;
  let hash = 0;

  for (let i = 0; i < source.length; i += 1) {
    hash = source.charCodeAt(i) + ((hash << 5) - hash);
  }

  return Math.abs(hash % 1000) / 1000;
}

export function getImageSpineHeightFactor(book: Book): number {
  const normalizedHeight = seededNormalized(book, 'image-height');
  return IMAGE_SPINE_MIN_HEIGHT_FACTOR
    + normalizedHeight * (IMAGE_SPINE_MAX_HEIGHT_FACTOR - IMAGE_SPINE_MIN_HEIGHT_FACTOR);
}

/**
 * Display box for a spine that has a real image.
 *
 * Books stand shoulder to shoulder on a shelf, so the box has to keep the
 * image's aspect ratio: any mismatch is either letterboxed — a transparent
 * sliver between neighbouring spines — or cropped away by `contentFit="cover"`,
 * which reads as a spine zoomed in until its title runs off the ends.
 *
 * So the ratio is never traded away. The height sets the size, and the width
 * follows from it; when that width falls outside `widthRange` the *height* is
 * re-derived from the bound so the box slides along the natural ratio instead
 * of being stretched onto a fixed width. The two ends resolve differently when
 * the ratio and the range still disagree: a spine too wide for the cap is drawn
 * shorter than the shelf's minimum (a loosely cropped, cover-shaped image reads
 * as a short book rather than eating half the row), while a spine too thin for
 * the minimum width just stays thin rather than growing past the top of the
 * shelf. Either way the artwork is shown whole.
 *
 * `desiredHeight` is the height the caller wants before the ratio is honoured;
 * it is clamped into `heightRange` here.
 */
export function getImageSpineSize(
  naturalWidth: number,
  naturalHeight: number,
  desiredHeight: number,
  widthRange: { min: number; max: number },
  heightRange: { min: number; max: number }
): { width: number; height: number } {
  const clampHeight = (value: number) =>
    Math.max(heightRange.min, Math.min(heightRange.max, value));

  let height = clampHeight(desiredHeight);

  if (naturalWidth <= 0 || naturalHeight <= 0) {
    return { width: widthRange.min, height: Math.round(height) };
  }

  const aspectRatio = naturalWidth / naturalHeight;
  const width = height * aspectRatio;

  if (width < widthRange.min) {
    // Grow along the ratio until the spine is thick enough to see, stopping at
    // the tallest a book may stand on this shelf.
    height = Math.min(heightRange.max, widthRange.min / aspectRatio);
  } else if (width > widthRange.max) {
    // Shrink along the ratio onto the width cap. This only ever lowers the
    // height, so the box still fits the shelf — and it is allowed below the
    // shelf's minimum height, since holding that minimum here would mean
    // cropping the image back to the cap's proportions.
    height = widthRange.max / aspectRatio;
  }

  // Round the height first and take the width from the rounded value, so the
  // box lands as close to the natural ratio as whole pixels allow.
  const roundedHeight = Math.max(1, Math.round(height));

  return {
    width: Math.max(1, Math.round(roundedHeight * aspectRatio)),
    height: roundedHeight,
  };
}

export function getPlaceholderSpineFactors(book: Book): { widthFactor: number; heightFactor: number } {
  const normalizedWidth = seededNormalized(book, 'placeholder-width');
  const normalizedHeight = seededNormalized(book, 'placeholder-height');

  // Keep per-book randomness deterministic while reducing extreme size differences.
  const compressVariation = (value: number) => 0.5 + (value - 0.5) * PLACEHOLDER_VARIATION_SCALE;

  return {
    widthFactor: compressVariation(normalizedWidth),
    heightFactor: compressVariation(normalizedHeight),
  };
}

export function getPlaceholderSpineSize(
  book: Book,
  widthRange: { min: number; max: number },
  heightRange: { min: number; max: number }
): { width: number; height: number } {
  const { widthFactor, heightFactor } = getPlaceholderSpineFactors(book);

  return {
    width: Math.round(widthRange.min + widthFactor * (widthRange.max - widthRange.min)),
    height: Math.round(heightRange.min + heightFactor * (heightRange.max - heightRange.min)),
  };
}
