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
 * image's aspect ratio: any mismatch is letterboxed by the image itself and
 * shows up as a transparent sliver between neighbouring spines. Sizing from
 * the height alone leaves such a mismatch every time the width clamps (and a
 * sub-pixel one from rounding even when it doesn't), so when a clamp forces
 * the width, the height is recomputed from it and re-clamped to bring the box
 * back onto the natural ratio.
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
    Math.max(heightRange.min, Math.min(heightRange.max, Math.round(value)));

  let height = clampHeight(desiredHeight);

  if (naturalWidth <= 0 || naturalHeight <= 0) {
    return { width: widthRange.min, height };
  }

  const aspectRatio = naturalWidth / naturalHeight;
  let width = Math.round(height * aspectRatio);

  if (width < widthRange.min) {
    width = widthRange.min;
    height = clampHeight(width / aspectRatio);
  } else if (width > widthRange.max) {
    width = widthRange.max;
    height = clampHeight(width / aspectRatio);
  }

  return { width, height };
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
