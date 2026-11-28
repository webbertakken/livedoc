// The selection in a drawn order (docs/specs/029-sheets/data-tools.md "The drawn order", D493-D494): the range being
// picked is held as runs of stored rows; what a paste or a fill reaches is the rectangle they make on screen. These
// turn one into the other. Without an order, drawn rows are stored rows and both are the same range.
import { DrawnOrder, type GridRange, type Selection } from '@livedoc/sheets';
import type { Geometry } from './sheet-geometry';

type Order = Pick<Geometry, 'order' | 'drawnOf' | 'storedAt'>;

/** The ranges of the one being picked: the last, or its runs. */
export function pickedRanges(sel: Selection): GridRange[] {
  return sel.ranges.slice(sel.ranges.length - (sel.tail ?? 1));
}

/** The rectangle on screen the range being picked makes, in drawn rows. */
export function drawnRect(g: Order, sel: Selection): GridRange {
  const picked = pickedRanges(sel);
  const drawn = picked.flatMap((x) => [g.drawnOf(x.r1), g.drawnOf(x.r2)]);
  return {
    r1: Math.min(...drawn),
    r2: Math.max(...drawn),
    c1: Math.min(...picked.map((x) => x.c1)),
    c2: Math.max(...picked.map((x) => x.c2)),
  };
}

/** A rectangle in drawn rows as the stored ranges it covers: one range, or runs under an order. */
export function storedRanges(g: Order, rect: GridRange): GridRange[] {
  if (!g.order) return [rect];
  return DrawnOrder.runs(g.order, rect.r1, rect.r2).map((run) => ({ ...rect, ...run }));
}

/** A rectangle in drawn rows selected: its runs, the active cell its top left drawn (or `active` when given). */
export function selectDrawn(
  g: Order,
  rect: GridRange,
  active?: { r: number; c: number },
): Selection {
  const ranges = storedRanges(g, rect);
  const corner = { r: g.storedAt(rect.r1), c: rect.c1 };
  return {
    ranges,
    active: active ?? corner,
    anchor: corner,
    ...(ranges.length > 1 ? { tail: ranges.length } : {}),
  };
}

/** The stored rows the rectangle's rows are, in the order drawn. */
export function rowsDrawn(g: Order, rect: GridRange): number[] {
  return Array.from({ length: rect.r2 - rect.r1 + 1 }, (_, i) => g.storedAt(rect.r1 + i));
}

/** Whether rows follow each other in the sheet, first to last. */
export function sideBySide(rows: readonly number[]): boolean {
  return rows.every((r, i) => i === 0 || r === rows[i - 1]! + 1);
}
