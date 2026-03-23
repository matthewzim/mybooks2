export interface ShelfColors {
  shelfColor: string;
  shelfBackColor: string;
}

const DEFAULT_SHELF_COLOR = '#8B4513';
const DEFAULT_BACK_COLOR = '#654321';

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

  return {
    shelfColor,
    shelfBackColor: shelfColor === DEFAULT_SHELF_COLOR
      ? DEFAULT_BACK_COLOR
      : adjustHexBrightness(shelfColor, -36),
  };
}
