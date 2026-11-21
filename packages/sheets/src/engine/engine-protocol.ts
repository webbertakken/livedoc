// What the page and its Web Worker say to each other (docs/specs/029-sheets/formulas.md "Recalculation"). The page
// sends its sheets and every change to them; the Worker, the only engine, answers with which cells are waiting and
// then their new values, in parts. Every message the page sends carries a rising \`rev\`; an answer names the last rev
// it has taken in, so values worked out before a sheet's rows or columns moved are dropped.
import type { Value } from '../formula/values';
import type { ImportAnswer, ImportAsk } from '../imports/import-request';
import type { SheetCellJson, SheetJson } from '../sheet-json';
import type { Iteration } from './loops';

export type EngineLimits = 'plan' | 'spreadsheet';

export type EngineIn =
  | {
      t: 'load';
      rev: number;
      sheets: SheetJson[];
      locale: string;
      limits: EngineLimits;
      iteration: Iteration;
      // A spreadsheet's imports (imports.md): fetched by the page, access allowed or not; absent, none are fetched.
      imports?: 'allowed' | 'blocked';
    }
  // A sheet's cells changed: each named cell as it is now (no input and no format: emptied).
  | { t: 'cells'; rev: number; sheetId: string; cells: SheetCellJson[] }
  // Anything else about a sheet changed (rows, columns, title), or a sheet is new: the whole sheet.
  | { t: 'sheet'; rev: number; sheet: SheetJson }
  | { t: 'remove'; rev: number; sheetId: string }
  | { t: 'iteration'; rev: number; iteration: Iteration }
  | { t: 'tick'; rev: number }
  // An import's answer, for the ask of that key.
  | { t: 'imported'; rev: number; key: string; answer: ImportAnswer }
  | { t: 'imports-allowed'; rev: number }
  // The hour is up: every import still read is asked again.
  | { t: 'imports-refresh'; rev: number };

/** A formula cell's value: [row, column, value], its whole array when it spills. */
export type CellValue = [number, number, Value];

export type EngineOut =
  // Cells whose value changed and whose new value is on its way; \`all\`: every formula cell.
  | { t: 'stale'; rev: number; sheetId: string; cells: [number, number][] }
  | { t: 'stale-all'; rev: number }
  | { t: 'values'; rev: number; sheetId: string; cells: CellValue[] }
  // Every waiting cell has its value.
  | { t: 'settled'; rev: number }
  // Imports for the page to fetch and answer with `imported`.
  | { t: 'imports'; rev: number; asks: ImportAsk[] };
