// How far a freeze may reach (docs/specs/029-sheets/grid-and-editing.md "The grid", sheet.md "Freeze"): never past
// the fixed limits (D16), nor past the lines that leave a third of the grid to scroll; and where a dragged bar drops.
// Both are searches of the prefix sums, so a million rows cost what a hundred do.
import { SHEET_FREEZE_COLS_MAX, SHEET_FREEZE_ROWS_MAX } from '@livedoc/sheets';
import type { Geometry } from './sheet-geometry';

/** The share of the grid's cells a freeze may hold: the rest, a third, is left to scroll. */
export const FREEZE_SHARE = 2 / 3;

type Axis = 'r' | 'c';

// The most lines whose far edge lies within `limit` px: the largest k with offsets[k] <= limit.
function linesWithin(offsets: Float64Array, limit: number): number {
  let lo = 0;
  let hi = offsets.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (offsets[mid]! <= limit) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

// The first boundary at or past `at`: the smallest k with offsets[k] >= at.
function firstFrom(offsets: Float64Array, at: number): number {
  let lo = 0;
  let hi = offsets.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (offsets[mid]! >= at) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

/**
 * The most lines a freeze may keep on an axis: the fixed limit, one line short of the whole sheet, and the lines
 * that fit in two thirds of the grid's cells. A grid not measured yet (no size) is held by the fixed limits only.
 */
export function freezeLimit(g: Geometry, view: { width: number; height: number }, axis: Axis) {
  const offsets = axis === 'r' ? g.rows : g.cols;
  const fixed = Math.max(
    0,
    Math.min(axis === 'r' ? SHEET_FREEZE_ROWS_MAX : SHEET_FREEZE_COLS_MAX, offsets.length - 2),
  );
  if (!view.width || !view.height) return fixed;
  const cells = axis === 'r' ? view.height - g.headH : view.width - g.headW;
  return Math.min(fixed, linesWithin(offsets, Math.max(0, cells) * FREEZE_SHARE));
}

/** The line boundary nearest `at` px along an axis (the first of equal ones, past hidden lines' zero sizes). */
export function nearestBoundary(offsets: Float64Array, at: number): number {
  const after = firstFrom(offsets, at);
  if (after === 0) return 0;
  const before = firstFrom(offsets, offsets[after - 1]!);
  return at - offsets[before]! <= offsets[after]! - at ? before : after;
}

// How close to the frozen edge's bar a press grabs it.
const FREEZE_GRAB_PX = 3;

/** The frozen edge's bar under a point of the grid's frame, on the headers (or the corner's edges when nothing is
 *  frozen): dragged to change the freeze (sheet.md "Freeze"). */
export function freezeEdgeUnder(g: Geometry, x: number, y: number): Axis | null {
  const fx = g.headW + g.frozenWidth;
  const fy = g.headH + g.frozenHeight;
  if (y < g.headH && Math.abs(x - fx) <= FREEZE_GRAB_PX) return 'c';
  if (x < g.headW && Math.abs(y - fy) <= FREEZE_GRAB_PX) return 'r';
  return null;
}

/** How many lines a freeze dropped at a point of the grid's frame keeps: up to the boundary nearest it. */
export function freezeCountAt(
  g: Geometry,
  view: { width: number; height: number },
  scroll: { top: number; left: number },
  axis: Axis,
  x: number,
  y: number,
): number {
  const offs = axis === 'c' ? g.cols : g.rows;
  const p = axis === 'c' ? x - g.headW : y - g.headH;
  const frozen = axis === 'c' ? g.frozenWidth : g.frozenHeight;
  const at = p < frozen ? p : p + (axis === 'c' ? scroll.left : scroll.top);
  return Math.min(nearestBoundary(offs, at), freezeLimit(g, view, axis));
}

/** Where a freeze of `count` lines draws its bar, in the grid area's own coordinates. */
export function freezeLineAt(
  g: Geometry,
  scroll: { top: number; left: number },
  axis: Axis,
  count: number,
): number {
  const offs = axis === 'c' ? g.cols : g.rows;
  const frozen = axis === 'c' ? g.frozenWidth : g.frozenHeight;
  return offs[count]! - (offs[count]! < frozen ? 0 : axis === 'c' ? scroll.left : scroll.top);
}
