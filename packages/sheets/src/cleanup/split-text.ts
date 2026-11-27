// Data › Split Text to Columns (docs/specs/029-sheets/data-tools.md "Split Text to Columns", D460, D462), as Google's
// textToColumns: one column's cells split into the columns to their right, pieces in double quotes kept whole, each
// piece read as if typed, a formula split by its value; the block to the right written as wide as the most pieces,
// shorter rows clearing the rest. A number, or text with no separator, stays as it is.
import type { GridRange } from '../address';
import type { Workbook } from '../engine/workbook';
import { growGrid } from '../commands-paste';
import type { Rand } from '../ids';
import { cellKey } from '../sheet';
import { scalarOf } from '../formula/values';
import { readTypedInput } from '../typed-input';
import type { CellChange, SheetWrite } from '../store';

export type SplitSeparator =
  | { kind: 'detect' }
  | { kind: 'comma' }
  | { kind: 'semicolon' }
  | { kind: 'period' }
  | { kind: 'space' }
  | { kind: 'custom'; text: string };

export const SPLIT_SEPARATORS = [
  'detect',
  'comma',
  'semicolon',
  'period',
  'space',
  'custom',
] as const;

// Why a split cannot run: more than one column, or no room to the right within the sheet's limits.
export type SplitRefusal = { refused: 'columns' | 'full' };

export type TextSplit = {
  write: SheetWrite | null;
  // Rows split, the widest row's pieces, and whether the block to the right held anything it writes over.
  rows: number;
  width: number;
  overwrites: boolean;
};

const MARK: Record<Exclude<SplitSeparator['kind'], 'detect' | 'custom'>, string> = {
  comma: ',',
  semicolon: ';',
  period: '.',
  space: ' ',
};

function mark(sep: SplitSeparator): string {
  if (sep.kind === 'detect') return ',';
  if (sep.kind === 'custom') return sep.text;
  return MARK[sep.kind];
}

// A text's pieces at `by`, a piece wholly in double quotes keeping its separators (`""` inside it a quote).
export function splitPieces(text: string, by: string): string[] {
  if (!by) return [text];
  const pieces: string[] = [];
  let piece = '';
  let quoted = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        piece += '"';
        i += 2;
        continue;
      }
      if (ch === '"') quoted = false;
      else piece += ch;
      i++;
      continue;
    }
    if (ch === '"' && piece === '') {
      quoted = true;
      i++;
      continue;
    }
    if (text.startsWith(by, i)) {
      pieces.push(piece);
      piece = '';
      i += by.length;
      continue;
    }
    piece += ch;
    i++;
  }
  pieces.push(piece);
  return pieces;
}

// The pieces a cell's value gives, or null when it stays as it is (not text, or no separator in it).
function piecesOf(value: unknown, sep: SplitSeparator): string[] | null {
  if (typeof value !== 'string' || value === '') return null;
  const by = mark(sep);
  const pieces = splitPieces(value, by);
  if (pieces.length < 2) return null;
  // Detect Automatically takes a space after the comma with it (D462).
  return sep.kind === 'detect' ? pieces.map((p, i) => (i ? p.replace(/^ +/, '') : p)) : pieces;
}

export function splitTextToColumns(
  wb: Workbook,
  sheetId: string,
  range: GridRange,
  sep: SplitSeparator,
  rand: Rand = Math.random,
): TextSplit | SplitRefusal | null {
  const sheet = wb.sheet(sheetId);
  if (!sheet) return null;
  if (range.c1 !== range.c2) return { refused: 'columns' };
  const col = range.c1;
  const split = new Map<number, string[]>();
  let width = 1;
  for (let r = range.r1; r <= range.r2; r++) {
    const pieces = piecesOf(scalarOf(wb.value(sheetId, r, col)), sep);
    if (!pieces) continue;
    split.set(r, pieces);
    width = Math.max(width, pieces.length);
  }
  if (width < 2) return { write: null, rows: 0, width: 1, overwrites: false };
  const g = growGrid(wb, sheet, { r: range.r1, c: col }, range.r2 - range.r1 + 1, width, rand);
  if (g.truncated) return { refused: 'full' };
  const ctx = wb.ctxFor(sheetId);
  const cells: CellChange[] = [];
  let overwrites = false;
  for (let r = range.r1; r <= range.r2; r++) {
    const pieces = split.get(r);
    const rowId = g.rowIds[r]!;
    for (let j = pieces ? 0 : 1; j < width; j++) {
      const colId = g.colIds[col + j]!;
      const piece = pieces?.[j] ?? '';
      if (j > 0 && sheet.cells.get(cellKey(rowId, colId))) overwrites = true;
      const read = piece === '' ? null : readTypedInput(piece, wb.locale, ctx);
      const input = read?.kind === 'value' ? read.input : null;
      if (!input && !sheet.cells.get(cellKey(rowId, colId))) continue;
      cells.push({ r: rowId, c: colId, i: input });
    }
  }
  const write: SheetWrite = g.changes.length
    ? { kind: 'layout', changes: g.changes, cells }
    : { kind: 'cells', cells };
  return { write, rows: split.size, width, overwrites };
}
