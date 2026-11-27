// Data › Data Clean-up › Remove Duplicates (docs/specs/029-sheets/data-tools.md "Remove Duplicates", D460), as
// Google's deleteDuplicates: rows compare by the chosen columns' values, text case aside, a number by its value
// however it came, spaces counting, empty equal to empty; the first of each set is kept, the kept rows move up inside
// the range and the rows left at its foot are cleared.
import type { GridRange } from '../address';
import type { Workbook } from '../engine/workbook';
import { isError, scalarOf, type Scalar } from '../formula/values';
import { MERGE_SORT_REFUSAL, sortSplitsMerge, type MergeRefusal } from '../merge-guards';
import type { SheetWrite } from '../store';
import { rearrangeRows } from './range-rows';

export type DuplicatesRemoved = {
  write: SheetWrite | null;
  // Rows compared (below a header row), rows removed and rows kept.
  compared: number;
  removed: number;
  kept: number;
};

// A value as Remove Duplicates compares it.
export function duplicateKey(v: Scalar): string {
  if (v === null || v === '') return 'e';
  if (typeof v === 'number') return `n${v}`;
  if (typeof v === 'string') return `s${v.toLocaleLowerCase()}`;
  if (typeof v === 'boolean') return `b${v}`;
  return isError(v) ? `x${v.e}` : 'e';
}

// The rows of `range` (below its header row when `header`) that are kept: offsets from its first data row, in order.
export function uniqueRows(
  wb: Workbook,
  sheetId: string,
  range: GridRange,
  cols: readonly number[],
  header: boolean,
): { first: number; kept: number[]; compared: number } {
  const first = range.r1 + (header ? 1 : 0);
  const seen = new Set<string>();
  const kept: number[] = [];
  for (let r = first; r <= range.r2; r++) {
    const key = cols.map((c) => duplicateKey(scalarOf(wb.value(sheetId, r, c)))).join('\u0000');
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(r - first);
  }
  return { first, kept, compared: Math.max(0, range.r2 - first + 1) };
}

export function removeDuplicates(
  wb: Workbook,
  sheetId: string,
  range: GridRange,
  cols: readonly number[],
  header: boolean,
): DuplicatesRemoved | MergeRefusal | null {
  const sheet = wb.sheet(sheetId);
  if (!sheet || !cols.length) return null;
  const { first, kept, compared } = uniqueRows(wb, sheetId, range, cols, header);
  const removed = compared - kept.length;
  if (removed > 0 && sortSplitsMerge(sheet.layout, first, range.r2, range.c1, range.c2))
    return { refused: MERGE_SORT_REFUSAL };
  const write = removed > 0 ? rearrangeRows(wb, sheetId, range, first, kept) : null;
  return { write, compared, removed, kept: kept.length };
}
