// A workbook whole (docs/specs/029-sheets/spreadsheet.md "What a workbook holds"): its record, its sheets in tab
// order, its styles, protections, objects and kept content. What a file maps to and from and what a migration makes;
// never stored whole (the room keeps each part in its own table, sheet-store.md "In a spreadsheet").
import type { Sheet } from '../sheet';
import type { WorkbookRecord } from '../workbook-record';
import { StyleTable } from './cell-style';
import { SheetName } from './sheet-name';
import { SheetLimits } from '../sheet-limits';
import type { WorkbookLimitRefusal } from './workbook-limits';
import type { KeptPart, Protection, WorkbookObject } from './workbook-parts';

export type WorkbookModel = {
  readonly record: WorkbookRecord;
  readonly sheets: readonly Sheet[];
  readonly styles: StyleTable;
  readonly protections: readonly Protection[];
  readonly objects: readonly WorkbookObject[];
  readonly kept: readonly KeptPart[];
};

// What breaks a workbook's invariants, each named with what it is about.
export type WorkbookProblem =
  | { readonly k: 'no_sheets' }
  | { readonly k: 'sheet_name_invalid' | 'sheet_name_taken'; readonly sheetId: string }
  | { readonly k: WorkbookLimitRefusal }
  | { readonly k: 'part_orphaned'; readonly id: string; readonly sheetId: string };

function problems(model: WorkbookModel): WorkbookProblem[] {
  const out: WorkbookProblem[] = [];
  if (model.sheets.length === 0) out.push({ k: 'no_sheets' });
  const taken: string[] = [];
  for (const sheet of model.sheets) {
    const named = SheetName.check(sheet.title, taken);
    if (named.ok) taken.push(named.name);
    else out.push({ k: named.refusal, sheetId: sheet.id });
  }
  const limit = SheetLimits.workbookRefusal(
    SheetLimits.spreadsheet,
    model.sheets.map((s) => ({ rows: s.layout.rows.length, cols: s.layout.cols.length })),
  );
  if (limit) out.push({ k: limit });
  const ids = new Set(model.sheets.map((s) => s.id));
  for (const part of [...model.protections, ...model.objects])
    if (!ids.has(part.sheetId))
      out.push({ k: 'part_orphaned', id: part.id, sheetId: part.sheetId });
  for (const kept of model.kept)
    if (kept.anchor.at !== 'workbook' && !ids.has(kept.anchor.sheetId))
      out.push({ k: 'part_orphaned', id: kept.id, sheetId: kept.anchor.sheetId });
  return out;
}

export const WorkbookModel = {
  /** A workbook of these sheets, nothing else in it yet. */
  create: (record: WorkbookRecord, sheets: readonly Sheet[]): WorkbookModel => ({
    record,
    sheets,
    styles: StyleTable.empty(),
    protections: [],
    objects: [],
    kept: [],
  }),

  /** Every way the workbook breaks its invariants; none for a sound one. */
  problems,
} as const;
