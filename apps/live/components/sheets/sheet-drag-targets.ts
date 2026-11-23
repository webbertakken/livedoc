// Where a drag on the cells lands (docs/specs/029-sheets/sheet.md "Fill"; grid-and-editing.md "Fill and move"):
// the fill handle's target, and the selection's border that a mouse grabs to move its cells (D145).
import type { GridRange, Selection } from '@livedoc/sheets';
import type { Geometry } from './sheet-geometry';
import { rectOf } from './SheetSelectionLayer';

// How close to a selection's edge a mouse grabs it to move its cells (D145).
export const BORDER_GRAB_PX = 4;

/** The fill's target for a pointer over cell `at`: the source grown in the one direction the pointer has gone
 *  furthest from it, or cut back to `at` while the pointer is back inside it. */
export function fillTargetFor(s: GridRange, at: { r: number; c: number }): GridRange {
  const down = at.r - s.r2;
  const up = s.r1 - at.r;
  const right = at.c - s.c2;
  const left = s.c1 - at.c;
  const best = Math.max(down, up, right, left);
  if (best > 0) {
    if (best === down) return { ...s, r2: at.r };
    if (best === up) return { ...s, r1: at.r };
    if (best === right) return { ...s, c2: at.c };
    return { ...s, c1: at.c };
  }
  if (at.r >= s.r1 && at.r < s.r2 && at.c >= s.c1 && at.c <= s.c2) return { ...s, r2: at.r };
  if (at.c >= s.c1 && at.c < s.c2 && at.r >= s.r1 && at.r <= s.r2) return { ...s, c2: at.c };
  return s;
}

/** The range whose border is under a point (in the grid area's own coordinates, under the headers), if the
 *  selection is one range of cells short of whole rows or columns; null elsewhere. */
export function borderGrabAt(
  g: Geometry,
  sel: Selection,
  grid: { rows: number; cols: number },
  scroll: { top: number; left: number },
  x: number,
  y: number,
): GridRange | null {
  if (sel.ranges.length !== 1 || x < 0 || y < 0) return null;
  const range = sel.ranges[0]!;
  if (range.r1 === 0 && range.r2 >= grid.rows - 1) return null;
  if (range.c1 === 0 && range.c2 >= grid.cols - 1) return null;
  const r = rectOf(g, range, scroll);
  const near = (p: number, a: number, b: number) =>
    p >= a - BORDER_GRAB_PX && p <= b + BORDER_GRAB_PX;
  if (!near(x, r.x, r.x + r.w) || !near(y, r.y, r.y + r.h)) return null;
  const onEdge =
    Math.abs(x - r.x) <= BORDER_GRAB_PX ||
    Math.abs(x - (r.x + r.w)) <= BORDER_GRAB_PX ||
    Math.abs(y - r.y) <= BORDER_GRAB_PX ||
    Math.abs(y - (r.y + r.h)) <= BORDER_GRAB_PX;
  return onEdge ? range : null;
}
