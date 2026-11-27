// Data › Randomise Range (docs/specs/029-sheets/data-tools.md "Randomise Range", D460, D464), as Google's
// randomizeRange: the range's rows shuffled, each row's cells together, inside the range only.
import type { GridRange } from '../address';
import type { Workbook } from '../engine/workbook';
import { MERGE_SORT_REFUSAL, sortSplitsMerge, type MergeRefusal } from '../merge-guards';
import type { SheetWrite } from '../store';
import { rearrangeRows } from './range-rows';

// Fisher-Yates over `count` offsets; `random` returns [0, 1).
export function shuffledOrder(count: number, random: () => number): number[] {
  const order = Array.from({ length: count }, (_, i) => i);
  for (let i = count - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return order;
}

export function randomiseRange(
  wb: Workbook,
  sheetId: string,
  range: GridRange,
  random: () => number,
): SheetWrite | MergeRefusal | null {
  const sheet = wb.sheet(sheetId);
  const count = range.r2 - range.r1 + 1;
  if (!sheet || count < 2) return null;
  if (sortSplitsMerge(sheet.layout, range.r1, range.r2, range.c1, range.c2))
    return { refused: MERGE_SORT_REFUSAL };
  return rearrangeRows(wb, sheetId, range, range.r1, shuffledOrder(count, random));
}
