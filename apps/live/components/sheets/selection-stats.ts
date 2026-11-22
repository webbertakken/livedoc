// What a selection holds, counted (docs/specs/029-sheets/sheet.md "Selection"; surface.md "Sheet bar"): the sum, the
// cells that hold anything, the numbers, the least and the most, over the cells that show (rows a filter hides are
// left out), and given up past SELECTION_CELLS_MAX cells. Read by the Plan Sheet's status bar and a spreadsheet's
// summary.
import type { GridRange } from '@livedoc/sheets';

/** The most cells a selection is counted over; past it, "Too many cells". */
export const SELECTION_CELLS_MAX = 100_000;

export type SelectionStats = {
  sum: number;
  count: number;
  numbers: number;
  min: number;
  max: number;
};

/** Where the counted cells come from: the selection, the sheet's extent and values, and which rows show. */
export type SelectionSource = {
  ranges: readonly GridRange[];
  extent: { rows: number; cols: number };
  value: (r: number, c: number) => unknown;
  hiddenRow: (r: number) => boolean;
};

export function countSelection(source: SelectionSource): SelectionStats | 'too-many' {
  let sum = 0;
  let numbers = 0;
  let count = 0;
  let seen = 0;
  let min = Infinity;
  let max = -Infinity;
  const { extent } = source;
  for (const g of source.ranges) {
    const r2 = Math.min(g.r2, extent.rows - 1);
    const c2 = Math.min(g.c2, extent.cols - 1);
    for (let r = g.r1; r <= r2; r++) {
      if (source.hiddenRow(r)) continue;
      for (let col = g.c1; col <= c2; col++) {
        if (++seen > SELECTION_CELLS_MAX) return 'too-many';
        const v = source.value(r, col);
        if (v === null || v === undefined || v === '') continue;
        count++;
        if (typeof v === 'number') {
          sum += v;
          numbers++;
          if (v < min) min = v;
          if (v > max) max = v;
        }
      }
    }
  }
  return { sum, count, numbers, min, max };
}
