// What the evaluator and the functions see while working out one formula (docs/specs/029-sheets/formulas.md
// "Workbook
// and recalculation"). The workbook provides it; functions never reach the workbook itself.
import type { CardSource } from '../cards';
import type { SheetsCtx } from '../formula/stored';
import type { Value } from '../formula/values';
import type { CellFormat } from '../sheet';

// A rectangle of one sheet, by positions, inclusive.
export type RangeRef = { sheetId: string; r1: number; c1: number; r2: number; c2: number };

// What evaluating a node gives: a value, or a reference a function may want as a reference (ROW, INDEX, OFFSET).
export type RefValue = { ref: RangeRef };
// A union of references (formulas.md "Reference operators"): read by the functions that take references, #VALUE!
// anywhere a value goes.
export type AreasValue = { areas: RangeRef[] };
export type EvalValue = Value | RefValue | AreasValue;

export function isRef(v: EvalValue): v is RefValue {
  return typeof v === 'object' && v !== null && 'ref' in v;
}

export function isAreas(v: EvalValue): v is AreasValue {
  return typeof v === 'object' && v !== null && 'areas' in v;
}

export type Frame = {
  // The formula's own cell.
  sheetId: string;
  row: number;
  col: number;
  ctx: SheetsCtx;
  locale: string;
  // Whether ranges and arrays are taken whole where one value goes (formulas.md "Arrays and spills"): inside
  // ARRAYFORMULA, an array literal or an array argument, and everywhere on a Plan Sheet; else they intersect.
  arrays: boolean;
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
  // How many sheets the workbook holds (SHEETS).
  sheetCount(): number;
  // The grid size of a sheet.
  grid(sheetId: string): { rows: number; cols: number } | undefined;
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
  // Mark the formula volatile (it recalculates on every change) or a card reader.
  volatile(): void;
  readsCards(): void;
};
