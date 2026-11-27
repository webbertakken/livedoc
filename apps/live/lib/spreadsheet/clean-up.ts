// Data › Data Clean-up and Data › Randomise Range's words and choices (docs/specs/029-sheets/data-tools.md "Remove
// Duplicates", "Trim Whitespace", "Randomise Range"): the range a tool works on, Remove Duplicates' columns as its
// dialog offers them, and what each says when done. The work itself is the engine's (`removeDuplicates`, ...).
import {
  columnLetters,
  currentRegion,
  formatRange,
  type Grid,
  type GridRange,
} from '@livedoc/sheets';

// The selection's last range, or the filled block around a single cell, as Create a Filter's.
export function cleanUpRange(range: GridRange, grid: Grid): GridRange {
  const single = range.r1 === range.r2 && range.c1 === range.c2;
  return single ? currentRegion({ r: range.r1, c: range.c1 }, grid) : range;
}

export function selectedRangeLine(range: GridRange): string {
  return `Selected range: ${formatRange(range)}`;
}

export type DuplicateColumn = { col: number; label: string };

// `Column A`, or with a header row `Column A - Name` (a blank header by its letter alone).
export function duplicateColumns(
  range: GridRange,
  header: boolean,
  headerText: (col: number) => string,
): DuplicateColumn[] {
  const columns: DuplicateColumn[] = [];
  for (let col = range.c1; col <= range.c2; col++) {
    const name = `Column ${columnLetters(col)}`;
    const text = header ? headerText(col).trim() : '';
    columns.push({ col, label: text ? `${name} - ${text}` : name });
  }
  return columns;
}

const rows = (n: number, what: string) => `${n} ${what} row${n === 1 ? '' : 's'}`;

export function duplicatesRemovedLine(removed: number, kept: number): string {
  if (removed === 0) return 'No duplicate rows found.';
  return `${rows(removed, 'duplicate')} found and removed. ${rows(kept, 'unique')} remain${kept === 1 ? 's' : ''}.`;
}

export function whitespaceTrimmedLine(trimmed: number): string {
  if (trimmed === 0) return 'No whitespace to trim';
  return `${trimmed} cell${trimmed === 1 ? '' : 's'} trimmed`;
}

// A number in [0, 1) from the browser's cryptographic source, so every shuffle is equally likely (D464).
export function cryptoRandom(): number {
  const word = new Uint32Array(1);
  crypto.getRandomValues(word);
  return word[0]! / 2 ** 32;
}
