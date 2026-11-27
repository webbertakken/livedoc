// Data › Data Clean-up › Trim Whitespace (docs/specs/029-sheets/data-tools.md "Trim Whitespace", D460), as Google's
// trimWhitespace: typed text loses the spaces at its ends (other Unicode spaces too, never a no-break space) and runs
// of spaces inside become one; tabs, line breaks and no-break spaces inside stay, formulas are left, text stays text.
import type { GridRange } from '../address';
import type { Workbook } from '../engine/workbook';
import { cellKey } from '../sheet';
import type { CellChange, SheetWrite } from '../store';

// A space at a text's end: a Unicode space separator, never a no-break one (U+00A0, U+202F).
const END_SPACE =
  /^[\u0020\u1680\u2000-\u200a\u205f\u3000]+|[\u0020\u1680\u2000-\u200a\u205f\u3000]+$/g;
const INNER_RUN = / {2,}/g;

export function trimmedText(text: string): string {
  return text.replace(END_SPACE, '').replace(INNER_RUN, ' ');
}

export type WhitespaceTrimmed = { write: SheetWrite | null; trimmed: number };

export function trimWhitespace(wb: Workbook, sheetId: string, range: GridRange): WhitespaceTrimmed {
  const sheet = wb.sheet(sheetId);
  if (!sheet) return { write: null, trimmed: 0 };
  const { rows, cols } = sheet.layout;
  const cells: CellChange[] = [];
  for (let r = range.r1; r <= range.r2; r++)
    for (let c = range.c1; c <= range.c2; c++) {
      const input = sheet.cells.get(cellKey(rows[r]!, cols[c]!))?.input;
      if (!input || !('s' in input)) continue;
      const next = trimmedText(input.s);
      if (next === input.s) continue;
      cells.push({ r: rows[r]!, c: cols[c]!, i: next === '' ? null : { ...input, s: next } });
    }
  return { write: cells.length ? { kind: 'cells', cells } : null, trimmed: cells.length };
}
