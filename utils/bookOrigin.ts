/**
 * Where a tapped book sits on screen, so the 3D book viewer can lift it out
 * of that exact spot and fly it back there when it is put away.
 */

import type { View } from 'react-native';

export interface BookOrigin {
  /** Window coordinates of the spine's bounding box */
  x: number;
  y: number;
  width: number;
  height: number;
  /** True when the book lies flat on the shelf (its top points left) */
  flat?: boolean;
}

/**
 * Measure a pressed spine in window coordinates. Calls back with `undefined`
 * when the view can't be measured, so the press still opens the book.
 */
export function measureBookOrigin(
  view: View | null,
  flat: boolean,
  callback: (origin: BookOrigin | undefined) => void
): void {
  if (!view || typeof view.measureInWindow !== 'function') {
    callback(undefined);
    return;
  }
  view.measureInWindow((x, y, width, height) => {
    if (!width || !height || [x, y, width, height].some((value) => !Number.isFinite(value))) {
      callback(undefined);
      return;
    }
    callback({ x, y, width, height, flat });
  });
}
