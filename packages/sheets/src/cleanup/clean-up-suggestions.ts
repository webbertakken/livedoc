// Data › Data Clean-up › Clean-up Suggestions (docs/specs/029-sheets/data-tools.md "Clean-up Suggestions", D466): over
// the open sheet's used range below its frozen rows, the duplicates, extra spaces and numbers stored as text it finds,
// each with what applying it writes. Pure.
import type { GridRange } from '../address';
import type { Workbook } from '../engine/workbook';
import { cellKey } from '../sheet';
import type { CellChange, SheetWrite } from '../store';
import { readTypedInput } from '../typed-input';
import { removeDuplicates } from './remove-duplicates';
import { trimWhitespace } from './trim-whitespace';

export type CleanUpSuggestion =
  | { kind: 'duplicates'; range: GridRange; count: number; write: SheetWrite }
  | { kind: 'spaces'; range: GridRange; count: number; write: SheetWrite }
  | { kind: 'textNumbers'; col: number; count: number; write: SheetWrite };

// The used range below the frozen rows, or null on an empty sheet.
export function suggestionRange(wb: Workbook, sheetId: string): GridRange | null {
  const sheet = wb.sheet(sheetId);
  if (!sheet) return null;
  const { rows, cols } = wb.extent(sheetId);
  const r1 = sheet.layout.frozenRows ?? 0;
  if (rows <= r1 || cols < 1) return null;
  return { r1, c1: 0, r2: rows - 1, c2: cols - 1 };
}

// A column's cells holding a number as text, when most of its filled cells are numbers: each read as typed.
function textNumbers(wb: Workbook, sheetId: string, range: GridRange, col: number): CellChange[] {
  const sheet = wb.sheet(sheetId)!;
  const colId = sheet.layout.cols[col]!;
  const ctx = wb.ctxFor(sheetId);
  let numbers = 0;
  let filled = 0;
  const changes: CellChange[] = [];
  for (let r = range.r1; r <= range.r2; r++) {
    const rowId = sheet.layout.rows[r]!;
    const cell = sheet.cells.get(cellKey(rowId, colId));
    const value = wb.value(sheetId, r, col);
    if (value === null || value === '') continue;
    filled++;
    if (typeof value === 'number') {
      numbers++;
      continue;
    }
    const input = cell?.input;
    if (!input || !('s' in input) || cell.format?.nf === 'text') continue;
    const read = readTypedInput(input.s.trim(), wb.locale, ctx);
    if (read.kind !== 'value' || !('n' in read.input)) continue;
    changes.push({ r: rowId, c: colId, i: read.input });
  }
  return numbers + changes.length > filled / 2 && numbers > 0 ? changes : [];
}

export function cleanUpSuggestions(wb: Workbook, sheetId: string): CleanUpSuggestion[] {
  const range = suggestionRange(wb, sheetId);
  if (!range) return [];
  const out: CleanUpSuggestion[] = [];
  const cols = Array.from({ length: range.c2 - range.c1 + 1 }, (_, i) => range.c1 + i);
  const dupes = removeDuplicates(wb, sheetId, range, cols, false);
  if (dupes && !('refused' in dupes) && dupes.write)
    out.push({ kind: 'duplicates', range, count: dupes.removed, write: dupes.write });
  const spaces = trimWhitespace(wb, sheetId, range);
  if (spaces.write) out.push({ kind: 'spaces', range, count: spaces.trimmed, write: spaces.write });
  for (const col of cols) {
    const changes = textNumbers(wb, sheetId, range, col);
    if (changes.length)
      out.push({
        kind: 'textNumbers',
        col,
        count: changes.length,
        write: { kind: 'cells', cells: changes },
      });
  }
  return out;
}
