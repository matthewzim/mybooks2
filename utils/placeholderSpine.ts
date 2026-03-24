import type { Book } from '@/types';

const PLACEHOLDER_VARIATION_SCALE = 0.4;

function seededNormalized(book: Book, salt: string): number {
  const source = `${book.id}-${book.title}-${salt}`;
  let hash = 0;

  for (let i = 0; i < source.length; i += 1) {
    hash = source.charCodeAt(i) + ((hash << 5) - hash);
  }

  return Math.abs(hash % 1000) / 1000;
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
