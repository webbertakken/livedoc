// Rows rearranged inside a range (docs/specs/029-sheets/data-tools.md "Sort", "Clean-up, split, randomise, stats"):
// Sort Range, Remove Duplicates and Randomise Range move only the range's cells, inputs and formats, each formula
// shifted with its row; cells beside the range never move.
import type { GridRange } from '../address';
import type { Workbook } from '../engine/workbook';
import { shiftForCopy } from '../formula/stored';
import { cellKey } from '../sheet';
import type { CellChange, SheetWrite } from '../store';

// The write that puts source row `first + order[k]` at row `first + k` for each k, and clears the range's rows past
// the order's end (values, formulas and formats), or null when nothing moves. `first` is the range's first row to
// rearrange (below a header row it keeps).
export function rearrangeRows(
  wb: Workbook,
  sheetId: string,
  range: GridRange,
  first: number,
  order: readonly number[],
): SheetWrite | null {
  const sheet = wb.sheet(sheetId);
  if (!sheet) return null;
  const { rows, cols } = sheet.layout;
  const ctx = wb.ctxFor(sheetId);
  const cells: CellChange[] = [];
  for (let k = 0; first + k <= range.r2; k++) {
    const toRow = first + k;
    const from = order[k];
    if (from === undefined) {
      for (let c = range.c1; c <= range.c2; c++)
        if (sheet.cells.get(cellKey(rows[toRow]!, cols[c]!)))
          cells.push({ r: rows[toRow]!, c: cols[c]!, i: null, f: null });
      continue;
    }
    const fromRow = first + from;
    if (fromRow === toRow) continue;
    for (let c = range.c1; c <= range.c2; c++) {
      const src = sheet.cells.get(cellKey(rows[fromRow]!, cols[c]!));
      const input = src?.input;
      const i =
        input && 'f' in input
          ? { f: shiftForCopy(input.f, toRow - fromRow, 0, ctx) }
          : (input ?? null);
      cells.push({ r: rows[toRow]!, c: cols[c]!, i, f: src?.format ?? null });
    }
  }
  return cells.length ? { kind: 'cells', cells } : null;
}
