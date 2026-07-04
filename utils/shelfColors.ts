import { Wood } from '@/constants/theme';

export interface ShelfColors {
  shelfColor: string;
  shelfBackColor: string;
  /** Plank surface gradient (top → bottom) */
  plankGradient: readonly [string, string];
  /** Cabinet frame gradient (top → bottom) */
  frameGradient: readonly [string, string];
  /** 1px outer cabinet edge */
  frameEdge: string;
  /** Warm lit back panel gradient behind the books (top → bottom) */
  backGradient: readonly [string, string];
}

const DEFAULT_SHELF_COLOR = Wood.plankTop;
const DEFAULT_BACK_COLOR = Wood.plankBottom;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function normalizeHex(color?: string): string | null {
  if (!color) return null;
  const normalized = color.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(normalized)) {
    return normalized;
  }

  if (/^#[0-9a-fA-F]{3}$/.test(normalized)) {
    const r = normalized.charAt(1);
    const g = normalized.charAt(2);
    const b = normalized.charAt(3);
    return `#${r}${r}${g}${g}${b}${b}`;
  }

  return null;
}

function adjustHexBrightness(color: string, amount: number): string {
  const normalized = normalizeHex(color);
  if (!normalized) return DEFAULT_BACK_COLOR;

  const channels = [1, 3, 5].map((index) => {
    const value = parseInt(normalized.slice(index, index + 2), 16);
    return clamp(Math.round(value + amount), 0, 255);
  });

  return `#${channels
    .map((value) => {
      const hex = value.toString(16);
      return hex.length === 1 ? `0${hex}` : hex;
    })
    .join('')}`;
}

export function getShelfColors(coverColor?: string): ShelfColors {
  const shelfColor = normalizeHex(coverColor) || DEFAULT_SHELF_COLOR;
  const isDefault = shelfColor === DEFAULT_SHELF_COLOR;

  if (isDefault) {
    return {
      shelfColor,
      shelfBackColor: DEFAULT_BACK_COLOR,
      plankGradient: [Wood.plankTop, Wood.plankBottom],
      frameGradient: [Wood.frameTop, Wood.frameBottom],
      frameEdge: Wood.frameEdge,
      backGradient: [Wood.backTop, Wood.backBottom],
    };
  }

  // Custom cover colors tint the plank and frame; the back panel stays a warm
  // lit wall so books remain readable against it.
  return {
    shelfColor,
    shelfBackColor: adjustHexBrightness(shelfColor, -36),
    plankGradient: [adjustHexBrightness(shelfColor, 8), adjustHexBrightness(shelfColor, -32)],
    frameGradient: [adjustHexBrightness(shelfColor, 18), adjustHexBrightness(shelfColor, -18)],
    frameEdge: adjustHexBrightness(shelfColor, 56),
    backGradient: [Wood.backTop, Wood.backBottom],
  };
}
