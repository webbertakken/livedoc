// Data › Split Text to Columns (docs/specs/029-sheets/data-tools.md "Split Text to Columns", D460, D462), as Google's
// textToColumns: one column's cells split into the columns to their right, pieces in double quotes kept whole, each
// piece read as if typed, a formula split by its value; the block to the right written as wide as the most pieces,
// shorter rows clearing the rest. A number, or text with no separator, stays as it is.
import type { GridRange } from '../address';
import type { Workbook } from '../engine/workbook';
import { growGrid } from '../commands-paste';
import type { Rand } from '../ids';
import { cellKey, type CellInput } from '../sheet';
import { scalarOf, type Scalar } from '../formula/values';
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

// What a split started from, so another separator splits the original text again (the chip): each row's input and
// value as they were, and how wide the block the last split wrote.
export type SplitOrigin = {
  inputs: readonly (CellInput | null)[];
  values: readonly Scalar[];
  width: number;
};

export function splitOrigin(wb: Workbook, sheetId: string, range: GridRange): SplitOrigin | null {
  const sheet = wb.sheet(sheetId);
  if (!sheet) return null;
  const inputs: (CellInput | null)[] = [];
  const values: Scalar[] = [];
  const colId = sheet.layout.cols[range.c1]!;
  for (let r = range.r1; r <= range.r2; r++) {
    inputs.push(sheet.cells.get(cellKey(sheet.layout.rows[r]!, colId))?.input ?? null);
    values.push(scalarOf(wb.value(sheetId, r, range.c1)));
  }
  return { inputs, values, width: 1 };
}

export function splitTextToColumns(
  wb: Workbook,
  sheetId: string,
  range: GridRange,
  sep: SplitSeparator,
  rand: Rand = Math.random,
  // A split again from its origin: rows the separator leaves whole get their input back, and the last split's block
  // is cleared as far as it reached.
  origin?: SplitOrigin,
): TextSplit | SplitRefusal | null {
  const sheet = wb.sheet(sheetId);
  if (!sheet) return null;
  if (range.c1 !== range.c2) return { refused: 'columns' };
  const col = range.c1;
  const split = new Map<number, string[]>();
  let width = 1;
  for (let r = range.r1; r <= range.r2; r++) {
    const value = origin ? origin.values[r - range.r1] : scalarOf(wb.value(sheetId, r, col));
    const pieces = piecesOf(value, sep);
    if (!pieces) continue;
    split.set(r, pieces);
    width = Math.max(width, pieces.length);
  }
  const reach = Math.max(width, origin?.width ?? 1);
  if (reach < 2) return { write: null, rows: 0, width: 1, overwrites: false };
  const g = growGrid(wb, sheet, { r: range.r1, c: col }, range.r2 - range.r1 + 1, reach, rand);
  if (g.truncated) return { refused: 'full' };
  const ctx = wb.ctxFor(sheetId);
  const cells: CellChange[] = [];
  let overwrites = false;
  for (let r = range.r1; r <= range.r2; r++) {
    const pieces = split.get(r);
    const rowId = g.rowIds[r]!;
    if (!pieces && origin)
      cells.push({ r: rowId, c: g.colIds[col]!, i: origin.inputs[r - range.r1] ?? null });
    for (let j = pieces ? 0 : 1; j < reach; j++) {
      const colId = g.colIds[col + j]!;
      const piece = pieces?.[j] ?? '';
      const held = !!sheet.cells.get(cellKey(rowId, colId));
      if (j >= (origin?.width ?? 1) && held) overwrites = true;
      const read = piece === '' ? null : readTypedInput(piece, wb.locale, ctx);
      const input = read?.kind === 'value' ? read.input : null;
      if (!input && !held) continue;
      cells.push({ r: rowId, c: colId, i: input });
    }
  }
  const write: SheetWrite | null = g.changes.length
    ? { kind: 'layout', changes: g.changes, cells }
    : cells.length
      ? { kind: 'cells', cells }
      : null;
  return { write, rows: split.size, width, overwrites };
}
