// The frame a formula is worked out in: what it reads of its workbook, each read noted against the formula reading
// (its `reader`; NO_CELL keeps nothing). The workbook gives its parts once, as a FrameSource.
import type { CardSource } from '../cards';
import type { FormulaMeaning } from '../formula/meaning';
import type { ImportAccess, ImportRequest } from '../imports/import-request';
import type { ImportRead } from './import-book';
import { childrenOf, type Node } from '../formula/ast';
import { renderFormula, storedAst, type SheetsCtx } from '../formula/stored';
import { formulaSyntaxOf, formulaToLocale } from '../formula/locale-syntax';
import { filterTest, type FilterReads, type FilterTest } from '../filter';
import type { Value } from '../formula/values';
import { colWidth, layoutIndex } from '../layout';
import { cellKey, type CellInput, type Sheet } from '../sheet';
import { NO_CELL, type CellNo } from './cell-numbers';
import type { CellAt, Frame, RangeRef } from './frame';
import { workOutWith } from './what-if';

/** What a frame reads of its workbook. */
export type FrameSource = {
  readonly locale: string;
  readonly meaning: FormulaMeaning;
  // Every formula an array context (a Plan Sheet's dynamic arrays), not only ARRAYFORMULA's.
  readonly arraysWhole: boolean;
  readonly now: () => number;
  readonly rand: () => number;
  cards(): CardSource | null;
  ctx(sheetId: string): SheetsCtx;
  extent(sheetId: string): { rows: number; cols: number };
  sheet(sheetId: string): Sheet | undefined;
  // What a sheet's filter reads beyond its cells' values (filter-reads.ts).
  filterReads(sheetId: string): FilterReads;
  sheetCount(): number;
  sheetNumber(sheetId: string): number;
  input(sheetId: string, r: number, c: number): CellInput | undefined;
  // A cell's value, the read noted for `reader` unless null.
  cell(sheetId: string, r: number, c: number, reader: CellNo | null): Value;
  // A cell's number, given on first sight; NO_CELL off its sheet's grid.
  noAt(sheetId: string, r: number, c: number): CellNo;
  claimOf(owner: CellNo): RangeRef | undefined;
  // The formula cells that read a cell, by its value or through a range.
  readersOf(at: CellAt): CellAt[];
  noteRange(reader: CellNo, range: RangeRef): void;
  // Spend reads from the top-level read's budget: false once it is spent.
  spend(reads: number): boolean;
  volatile(reader: CellNo, name: string): void;
  readsCards(reader: CellNo): void;
  importOf(reader: CellNo, request: ImportRequest): ImportRead | null;
  importAccess(reader: CellNo): ImportAccess | null;
  watchNow<T>(run: () => T): [T, boolean];
};

function calls(node: Node, name: string): boolean {
  return (node.k === 'call' && node.name === name) || childrenOf(node).some((n) => calls(n, name));
}

/** The frame of the formula `reader`, sitting in (row, col) of `sheetId`. */
export function cellFrame(
  src: FrameSource,
  reader: CellNo,
  sheetId: string,
  row: number,
  col: number,
): Frame {
  // Each sheet's filter test, made once for the formula when it first asks.
  const filters = new Map<string, FilterTest | null>();
  const filterOf = (s: string): FilterTest | null => {
    // A range's sheet exists: a reference to a removed sheet is #REF! before any function reads it.
    if (!filters.has(s)) filters.set(s, filterTest(src.sheet(s)!, src.filterReads(s)));
    return filters.get(s)!;
  };
  // Hidden by hand or collapsed in a group: SUBTOTAL's 101 to 111 leave both out.
  const hiddenOf = (s: string): ReadonlySet<string> => layoutIndex(src.sheet(s)!.layout).hiddenRows;
  return {
    sheetId,
    row,
    col,
    ctx: src.ctx(sheetId),
    locale: src.locale,
    meaning: src.meaning,
    arrays: src.arraysWhole,
    cell: (s, r, c, inRange) => src.cell(s, r, c, inRange ? null : reader),
    extent: (s) => src.extent(s),
    isFormula: (s, r, c) => {
      const input = src.input(s, r, c);
      return !!input && 'f' in input;
    },
    format: (s, r, c) => {
      const layout = src.sheet(s)?.layout;
      const rowId = layout?.rows[r];
      const colId = layout?.cols[c];
      return rowId && colId ? src.sheet(s)!.cells.get(cellKey(rowId, colId))?.format : undefined;
    },
    colWidth: (s, c) => {
      const layout = src.sheet(s)?.layout;
      const colId = layout?.cols[c];
      return layout && colId ? colWidth(layout, colId) : 0;
    },
    sheetCount: () => src.sheetCount(),
    sheetNumber: (s) => src.sheetNumber(s),
    rowHidden: (s, r) => {
      const test = filterOf(s);
      if (test?.(r, (rr, cc) => src.cell(s, rr, cc, reader))) return 'filtered';
      return hiddenOf(s).has(src.sheet(s)!.layout.rows[r]!) ? 'hidden' : null;
    },
    formulaCalls: (s, r, c, name) => {
      const input = src.input(s, r, c);
      const ast = input && 'f' in input ? storedAst(input.f) : null;
      return !!ast && calls(ast, name);
    },
    formulaText: (s, r, c) => {
      const input = src.input(s, r, c);
      // As the formula bar shows it, in the locale's syntax (formulas.md "Locale").
      return input && 'f' in input
        ? formulaToLocale(renderFormula(input.f, src.ctx(s)), formulaSyntaxOf(src.locale))
        : null;
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
    workOut: (target, swaps) => workOutWith(src, reader, target, swaps),
    volatile: (name) => src.volatile(reader, name),
    readsCards: () => src.readsCards(reader),
    importOf: (request) => src.importOf(reader, request),
    importAccess: () => src.importAccess(reader),
    watchNow: (run) => src.watchNow(run),
  };
}
