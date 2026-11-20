// The frame a formula is worked out in: what it reads of its workbook, each read noted against the formula reading
// (its `reader`; NO_CELL keeps nothing). The workbook gives its parts once, as a FrameSource.
import type { CardSource } from '../cards';
import type { SheetsCtx } from '../formula/stored';
import type { Value } from '../formula/values';
import type { CellInput, Sheet } from '../sheet';
import { NO_CELL, type CellNo } from './cell-numbers';
import type { Frame, RangeRef } from './frame';

/** What a frame reads of its workbook. */
export type FrameSource = {
  readonly locale: string;
  // Every formula an array context (a Plan Sheet's dynamic arrays), not only ARRAYFORMULA's.
  readonly arraysWhole: boolean;
  readonly now: () => number;
  readonly rand: () => number;
  cards(): CardSource | null;
  ctx(sheetId: string): SheetsCtx;
  extent(sheetId: string): { rows: number; cols: number };
  sheet(sheetId: string): Sheet | undefined;
  input(sheetId: string, r: number, c: number): CellInput | undefined;
  // A cell's value, the read noted for `reader` unless null.
  cell(sheetId: string, r: number, c: number, reader: CellNo | null): Value;
  // A cell's number, given on first sight; NO_CELL off its sheet's grid.
  noAt(sheetId: string, r: number, c: number): CellNo;
  claimOf(owner: CellNo): RangeRef | undefined;
  noteRange(reader: CellNo, range: RangeRef): void;
  // Spend reads from the top-level read's budget: false once it is spent.
  spend(reads: number): boolean;
  volatile(reader: CellNo): void;
  readsCards(reader: CellNo): void;
};

/** The frame of the formula `reader`, sitting in (row, col) of `sheetId`. */
export function cellFrame(
  src: FrameSource,
  reader: CellNo,
  sheetId: string,
  row: number,
  col: number,
): Frame {
  return {
    sheetId,
    row,
    col,
    ctx: src.ctx(sheetId),
    locale: src.locale,
    arrays: src.arraysWhole,
    cell: (s, r, c, inRange) => src.cell(s, r, c, inRange ? null : reader),
    extent: (s) => src.extent(s),
    isFormula: (s, r, c) => {
      const input = src.input(s, r, c);
      return !!input && 'f' in input;
    },
    grid: (s) => {
      const sh = src.sheet(s);
      return sh ? { rows: sh.layout.rows.length, cols: sh.layout.cols.length } : undefined;
    },
    spillOf: (s, r, c): RangeRef | null => {
      const owner = src.noAt(s, r, c);
      if (owner === NO_CELL) return null;
      // Reading the cell works its spill out, and notes it.
      src.cell(s, r, c, reader);
      const claim = src.claimOf(owner);
      return claim ? { ...claim } : null;
    },
    noteRange: (range) => src.noteRange(reader, range),
    spend: (n) => src.spend(n),
    now: src.now,
    rand: src.rand,
    cards: src.cards(),
    volatile: () => src.volatile(reader),
    readsCards: () => src.readsCards(reader),
  };
}
