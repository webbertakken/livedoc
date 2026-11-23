// A span of rows or columns as the menus name it (docs/specs/029-sheets/grid-and-editing.md "Rows, columns and
// cells"): "row 3", "rows 2 - 4", "column B", "columns B - D", as Google's do.
import { columnLetters } from '@livedoc/sheets';

export type LineAxis = 'r' | 'c';

export function lineSpan(axis: LineAxis, a: number, b: number): string {
  const name = (p: number) => (axis === 'r' ? String(p + 1) : columnLetters(p));
  const noun = axis === 'r' ? 'row' : 'column';
  return a === b ? `${noun} ${name(a)}` : `${noun}s ${name(a)} - ${name(b)}`;
}

/** How many lines, with their noun: "1 row", "3 columns". */
export function lineCount(axis: LineAxis, n: number): string {
  return `${n} ${axis === 'r' ? 'row' : 'column'}${n === 1 ? '' : 's'}`;
}
