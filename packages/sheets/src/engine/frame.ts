// What the evaluator and the functions see while working out one formula (docs/specs/029-sheets/formulas.md
// "Workbook
// and recalculation"). The workbook provides it; functions never reach the workbook itself.
import type { CardSource } from '../cards';
import type { PivotArray } from '../pivot/pivot-resolve';
import type { ImportAccess, ImportRequest } from '../imports/import-request';
import type { ImportRead } from './import-book';
import type { FormulaMeaning } from '../formula/meaning';
import type { SheetsCtx } from '../formula/stored';
import type { Value } from '../formula/values';
import type { CellFormat } from '../sheet';
import type { CellImage } from '../images/cell-image';
import type { Sparkline } from '../sparkline/sparkline-read';

// A rectangle of one sheet, by positions, inclusive.
export type RangeRef = { sheetId: string; r1: number; c1: number; r2: number; c2: number };

// What evaluating a node gives: a value, or a reference a function may want as a reference (ROW, INDEX, OFFSET).
export type RefValue = { ref: RangeRef };
// A union of references (formulas.md "Reference operators"): read by the functions that take references, #VALUE!
// anywhere a value goes.
export type AreasValue = { areas: RangeRef[] };
// A function made by LAMBDA (formulas.md "LAMBDA and LET"): its names, and its formula worked out with values for
// them. Never a cell's value: left uncalled it is #VALUE!.
export type Lambda = {
  readonly params: readonly string[];
  apply(values: readonly EvalValue[]): EvalValue;
};
export type LambdaValue = { lambda: Lambda };
export type EvalValue = Value | RefValue | AreasValue | LambdaValue;
// The names a formula declares (LET, LAMBDA), upper-cased, to their values.
export type Scope = ReadonlyMap<string, EvalValue>;

// One cell, by its sheet and position.
export type CellAt = { sheetId: string; r: number; c: number };
// A cell read as another value while a formula is worked out afresh (MULTIPLE.OPERATIONS).
export type Swap = { cell: CellAt; value: Value };

export function isRef(v: EvalValue): v is RefValue {
  return typeof v === 'object' && v !== null && 'ref' in v;
}

export function isAreas(v: EvalValue): v is AreasValue {
  return typeof v === 'object' && v !== null && 'areas' in v;
}

export function isLambda(v: EvalValue): v is LambdaValue {
  return typeof v === 'object' && v !== null && 'lambda' in v;
}

export type Frame = {
  // The formula's own cell.
  sheetId: string;
  row: number;
  col: number;
  ctx: SheetsCtx;
  locale: string;
  // Whose answer a formula both Google and the file's standard accept gives (formulas.md, the file's meaning).
  meaning: FormulaMeaning;
  // Whether ranges and arrays are taken whole where one value goes (formulas.md "Arrays and spills"): inside
  // ARRAYFORMULA, an array literal or an array argument, and everywhere on a Plan Sheet; else they intersect.
  arrays: boolean;
  // The names declared around the node being worked out (LET, LAMBDA); none outside them.
  scope?: Scope;
  // How many named function calls deep the node being worked out is (formulas.md "Named functions"); absent, none.
  fnDepth?: number;
  // A cell's value (worked out on demand). `inRange` when read as part of a noted range, so it is not noted on
  // its own as well.
  cell(sheetId: string, r: number, c: number, inRange?: boolean): Value;
  // How far a sheet is filled (rows and columns, positions + 1), for whole-column and open references.
  extent(sheetId: string): { rows: number; cols: number };
  // Whether a cell holds a formula (ISFORMULA).
  isFormula(sheetId: string, r: number, c: number): boolean;
  // A cell's own format (CELL, ISDATE); undefined when it has none. Read its value first, so a change to it is noted.
  format(sheetId: string, r: number, c: number): CellFormat | undefined;
  // A column's width in pixels (CELL's "width").
  colWidth(sheetId: string, c: number): number;
  // Whether any protection covers a cell (CELL's "protect").
  isProtected(sheetId: string, r: number, c: number): boolean;
  // How many sheets the workbook holds (SHEETS), and a sheet's place among them from 1 (SHEET); 0 for none.
  sheetCount(): number;
  sheetNumber(sheetId: string): number;
  // How a row is hidden (SUBTOTAL): by the sheet's filter (its filter cells read, so noted), by hand, or not.
  rowHidden(sheetId: string, r: number): 'filtered' | 'hidden' | null;
  // Whether a cell's formula calls a function (SUBTOTAL skips the subtotals inside its range).
  formulaCalls(sheetId: string, r: number, c: number, name: string): boolean;
  // A cell's formula as its formula bar shows it (FORMULATEXT); null when it holds none.
  formulaText(sheetId: string, r: number, c: number): string | null;
  // The grid size of a sheet.
  grid(sheetId: string): { rows: number; cols: number } | undefined;
  // The pivot table whose output covers a cell, and its output's top-left; null when none does (GETPIVOTDATA).
  pivotAt(
    sheetId: string,
    r: number,
    c: number,
  ): { out: PivotArray; r1: number; c1: number } | null;
  // The rectangle a spilling formula fills, for `B2#`; null when it does not spill.
  spillOf(sheetId: string, r: number, c: number): RangeRef | null;
  // Note a read of a whole range, for dependencies (cells read one by one note themselves).
  noteRange(range: RangeRef): void;
  // Count reads against the recalculation budget; false once it is spent.
  spend(reads: number): boolean;
  // Today and now in the viewer's local time, as serials.
  now(): number;
  rand(): number;
  cards: CardSource | null;
  // A formula cell's value worked out afresh with each swapped cell read as its stand-in (engine/what-if.ts).
  workOut(target: CellAt, swaps: readonly Swap[]): Value;
  // Mark the formula volatile (it recalculates on every change; `name` the function that makes it so) or a card reader.
  volatile(name: string): void;
  readsCards(): void;
  // An import's answer as the formula reads it (imports.md); null where no editor fetches for the engine.
  importOf(request: ImportRequest): ImportRead | null;
  // Whether the formula may fetch (IMAGE), the read noted; null where no editor fetches for the engine.
  importAccess(): ImportAccess | null;
  // What `run` gives, and whether it read NOW, RAND, RANDARRAY or RANDBETWEEN, directly or through cells.
  watchNow<T>(run: () => T): [T, boolean];
  // Set only while a cell's chart is asked for (Workbook.sparklineOf): each SPARKLINE worked out reports its chart.
  drawSparkline?: (chart: Sparkline) => void;
  // Set only while a cell's picture is asked for (Workbook.imageOf): each IMAGE reports its picture and its place in
  // its own answer (0, 0 when it gives one value), and each VLOOKUP, HLOOKUP and XLOOKUP the cell it found.
  drawImage?: (image: CellImage, at: readonly [number, number]) => void;
  foundCell?: (cell: CellAt) => void;
};

/** The hooks a formula is worked out again with to see what it draws, and its answer before it is read as a value. */
export type DrawHooks = Pick<Frame, 'drawSparkline' | 'drawImage' | 'foundCell'> & {
  answer?: (raw: EvalValue) => void;
};
