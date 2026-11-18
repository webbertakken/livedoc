// The sheet store on the wire (docs/specs/029-sheets/sheet-store.md, docs/specs/029-sheets/sheet-store.md
// "Interfaces and
// contracts"). Sheet shapes come from @livedoc/sheets; these are the request and response bodies. A sheet's
// cells travel as a list (a Map is not JSON).

import type {
  SheetCellJson,
  WorkbookRecord,
  SheetJson,
  SheetLayout,
  SheetPerson,
  SheetWrite,
} from '@livedoc/sheets';

export type { CellFormat, CellInput, SheetLayout, SheetPerson, SheetWrite } from '@livedoc/sheets';

// One stored cell (its row id, column id, input and format; neither means "nothing") and a whole sheet, as JSON.
export type SheetCellDto = SheetCellJson;
export type SheetDto = SheetJson;

export type SheetsResponse = { sheets: SheetDto[] };

export type SheetResponse = { sheet: SheetDto };

// A spreadsheet opened by viewport (docs/specs/029-sheets/sheet-store.md "In a spreadsheet", Loading by viewport):
// every sheet's head and layout, in tab order, and its cells of rows [0, rowsLoaded); the rest come by pages.
// `cellCount` is how many cells the sheet holds in all.
export type WorkbookSheetDto = SheetDto & { cellCount: number; rowsLoaded: number };

export type WorkbookResponse = { workbook: WorkbookRecord; sheets: WorkbookSheetDto[] };

// One page of a sheet's cells: those of the rows at positions [from, to) in its order at `rev`.
export type SheetCellsResponse = { rev: number; from: number; to: number; cells: SheetCellDto[] };

// A new sheet: a blank one (layout made by the client), one filled (a CSV, a paste, a restore), or a copy of
// another of the document's sheets (`copyOf`, its cells copied on the server).
export type SheetCreateRequest = {
  id?: string;
  tabId: string;
  title: string;
  layout?: SheetLayout;
  cells?: SheetCellDto[];
  copyOf?: string;
  // The editor's undo of a sheet deleted with its element: a sheet still stored under `id` on the tab is kept (its
  // waiting delete cancelled) and answered as it is; otherwise it is made from the body, up to a whole sheet's cells.
  restore?: true;
};

// One write. `wid` is the client's id for it, echoed on the room op so the writer knows its own; `undo` marks an
// undo or redo (never refused for a title its own undo puts back).
// `unchecked`: an import, a card table's sync or a template's start, stored as it is (data-validation.md "Where values
// are checked"); like `undo`, it skips only the validation rules' check.
export type SheetWriteRequest = {
  write: SheetWrite;
  wid?: string;
  undo?: boolean;
  unchecked?: boolean;
};

// The write as it landed, the sheet's new rev, and the stored state of every cell it touched (a cell with no `i`
// and no `f` is gone).
export type SheetWriteResponse = { applied: SheetWrite; rev: number; cells: SheetCellDto[] };

export const SHEET_ERRORS = [
  'sheet_not_found',
  'sheet_exists',
  'sheet_busy',
  'sheet_title_taken',
  'sheet_full',
  'sheets_full',
  'sheet_too_large',
  'input_too_long',
  'formula_invalid',
  'format_invalid',
  'axis_id_invalid',
  'title_invalid',
  'merge_invalid',
  'filter_invalid',
  'write_too_large',
  'write_invalid',
  // A value a Reject validation rule refuses; a sheet past its rules' limit (data-validation.md).
  'value_invalid',
  'rules_full',
  'tab_not_found',
  // A spreadsheet's sheet name against its rules, or another sheet's (docs/specs/029-sheets/spreadsheet.md "Limits").
  'sheet_name_invalid',
  'sheet_name_taken',
  // A span of rows that is not `<from>-<to>`, runs backwards or passes a page (SHEET_PAGE_ROWS).
  'rows_invalid',
] as const;
export type SheetError = (typeof SHEET_ERRORS)[number];

// The room op for a sheet write (a system op: only the api sends it). `applied` with `at`/`by` is the write to
// apply in order at `rev`; `created`/`deleted` say a sheet came or went; `refetch` (a write too large to relay)
// asks clients to fetch the sheet.
export type SheetsRoomOp = {
  kind: 'sheets';
  sheetId: string;
  tabId: string;
  rev: number;
  applied?: SheetWrite;
  at?: number;
  by?: SheetPerson;
  wid?: string;
  created?: true;
  deleted?: true;
  refetch?: true;
};

// Someone's selection on a sheet (an ephemeral presence op, never stored): ids, so it follows rows that move.
export type SheetPresenceOp = {
  kind: 'sheet-presence';
  tabId: string;
  sheetId: string;
  ranges: { r1: string; c1: string; r2: string; c2: string }[] | null;
  editing: boolean;
};
