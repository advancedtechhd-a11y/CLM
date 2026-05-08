import type { WidgetLayout } from "./types";

/**
 * v1 strategy: place new widget at column 0, one row below the lowest existing
 * widget. No collision detection — react-grid-layout's vertical compactor
 * handles it.
 */
export function findEmptySpot(
  layout: WidgetLayout[]
): { x: number; y: number } {
  if (layout.length === 0) return { x: 0, y: 0 };
  const maxY = Math.max(...layout.map((w) => w.y + w.h));
  return { x: 0, y: maxY };
}
