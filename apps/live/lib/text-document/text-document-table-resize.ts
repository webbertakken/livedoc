// Resizing a table by dragging its borders (docs/specs/034-text-documents/tables.md "Working in a table", Resize): the
// border under the pointer, and the columns' widths or the row's height a drag gives. Pure; widths and heights in
// points, positions in any one unit.
import { MIN_COLUMN_WIDTH_PT } from './text-document-table-properties';

/** How near a cell's right or bottom edge the pointer is over its border, in CSS pixels (default). */
export const TABLE_BORDER_SLOP_PX = 4;
/** A row's least height set by dragging its border, in points (default). */
export const MIN_ROW_HEIGHT_PT = 6;

/** A cell's box. */
export type CellBox = {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
};

/** The border of `cell` the point is over: its right one (first), its bottom one, or none. */
export function borderAt(
  cell: CellBox,
  x: number,
  y: number,
  slop = TABLE_BORDER_SLOP_PX,
): 'right' | 'bottom' | null {
  const near = (a: number, b: number) => Math.abs(a - b) <= slop;
  if (near(x, cell.right) && y >= cell.top && y <= cell.bottom + slop) return 'right';
  if (near(y, cell.bottom) && x >= cell.left && x <= cell.right) return 'bottom';
  return null;
}

const round = (value: number) => Math.round(value * 100) / 100;

/**
 * The widths after the right border of column `column` moves by `delta`: between two columns it moves width from one
 * to the other (the table keeps its width); the last column's widens or narrows it and the table. Each at least 0.1 in.
 */
export function resizedColumns(widths: readonly number[], column: number, delta: number): number[] {
  const next = [...widths];
  const own = widths[column];
  if (own === undefined) return next;
  const neighbour = widths[column + 1];
  if (neighbour === undefined) {
    next[column] = round(Math.max(MIN_COLUMN_WIDTH_PT, own + delta));
    return next;
  }
  const moved = Math.min(
    neighbour - MIN_COLUMN_WIDTH_PT,
    Math.max(MIN_COLUMN_WIDTH_PT - own, delta),
  );
  next[column] = round(own + moved);
  next[column + 1] = round(neighbour - moved);
  return next;
}

/** A row's minimum height after its bottom border moves by `delta` from `height` (as drawn), to a quarter point. */
export const resizedRow = (height: number, delta: number): number =>
  Math.max(MIN_ROW_HEIGHT_PT, Math.round((height + delta) * 4) / 4);
