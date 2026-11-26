// Data › Sort Range › Advanced Range Sorting Options (docs/specs/029-sheets/data-tools.md "Sort"): the dialog's title,
// the columns it offers (a header row's headers when the range has one), and its sort keys as they are added and
// removed. The sort itself is the engine's (`sortRange`).
import { columnLetters, type GridRange, type SortKey } from '@livedoc/sheets';

export type SortRangeColumn = { col: number; label: string };

const cellName = (r: number, c: number) => `${columnLetters(c)}${r + 1}`;

export function sortRangeTitle(range: GridRange): string {
  return `Sort range from ${cellName(range.r1, range.c1)} to ${cellName(range.r2, range.c2)}`;
}

export function sortRangeColumns(
  range: GridRange,
  header: boolean,
  headerText: (col: number) => string,
): SortRangeColumn[] {
  const columns: SortRangeColumn[] = [];
  for (let col = range.c1; col <= range.c2; col++) {
    const text = header ? headerText(col).trim() : '';
    columns.push({ col, label: text || `Column ${columnLetters(col)}` });
  }
  return columns;
}

export function sortRangeStart(range: GridRange, active: { r: number; c: number }): SortKey[] {
  const col = active.c >= range.c1 && active.c <= range.c2 ? active.c : range.c1;
  return [{ col, ascending: true }];
}

export function addSortKey(keys: readonly SortKey[], range: GridRange): SortKey[] {
  const used = new Set(keys.map((k) => k.col));
  let col = range.c1;
  for (let c = range.c1; c <= range.c2; c++)
    if (!used.has(c)) {
      col = c;
      break;
    }
  return [...keys, { col, ascending: true }];
}

// The first key stays: a sort has at least one.
export function removeSortKey(keys: readonly SortKey[], at: number): readonly SortKey[] {
  return at === 0 ? keys : keys.filter((_, i) => i !== at);
}
