// Create Pivot Table (docs/specs/029-sheets/pivot-tables.md "Making one"): the Data Range it opens with, and what its
// fields say when Create is pressed: the source and where the pivot table goes, or the refusal of one field.
import {
  formatRange,
  posRangeOf,
  quoteSheet,
  sourceFromText,
  type GridRange,
  type IdRange,
  type RuleSource,
  type Sheet,
  type SheetHandle,
  type SheetPivot,
  type SheetsCtx,
  type Workbook,
} from '@livedoc/sheets';
import { chartRangeOf } from '@/components/sheets/sheet-charts';

export const PIVOT_RANGE_WHY = 'Type a range like Sheet1!A1:F25';
export const PIVOT_HEADER_WHY = 'The range needs a header row and a row of data';
export const PIVOT_LOCATION_WHY = 'Type a cell like Sheet1!H1';
export const PIVOT_SHEET_BASE = 'Pivot Table';

/** A source written with its sheet's name, as the dialog and the editor show it (`Sheet1!A1:F25`). */
export function pivotRangeText(
  sheet: Pick<SheetHandle, 'title' | 'layout'>,
  range: IdRange,
): string {
  const p = posRangeOf(sheet.layout, range);
  return p ? `${quoteSheet(sheet.title)}!${formatRange(p)}` : '';
}

/** The Data Range the dialog opens with: the selection, or the data region round the active cell; '' when none. */
export function pivotCreateStart(
  wb: Workbook,
  sheet: Sheet,
  selection: { ranges: readonly GridRange[]; active: { r: number; c: number } },
): string {
  const pick = chartRangeOf(wb, sheet, selection);
  return pick ? pivotRangeText(sheet, pick.range) : '';
}

/** A range typed with or without its sheet's name: that sheet and the range by ids; null when it does not read. */
export function readSheetRange(
  ctx: SheetsCtx,
  text: string,
): { sheet: SheetHandle; range: IdRange; rows: number } | null {
  const src = sourceFromText(ctx, text);
  if (!src) return null;
  const { s, st: _st, ...range } = src;
  const sheet = s === undefined ? ctx.own : ctx.byId(s)!;
  const p = posRangeOf(sheet.layout, range)!;
  return { sheet, range, rows: p.r2 - p.r1 + 1 };
}

/** A source as a pivot table on `pivotSheetId` keeps it: on its own sheet with no `s`. */
export function sourceFor(pivotSheetId: string, sheetId: string, range: IdRange): RuleSource {
  return sheetId === pivotSheetId ? range : { ...range, s: sheetId };
}

export type PivotInsertTo = 'new' | 'existing';

export type PivotCreatePlan =
  | { ok: true; sourceSheetId: string; source: IdRange; to: { kind: 'new' } }
  | {
      ok: true;
      sourceSheetId: string;
      source: IdRange;
      to: { kind: 'existing'; sheetId: string; at: { r: string; c: string } };
    }
  | { ok: false; field: 'range' | 'location'; why: string };

/** What Create does with the fields as typed (`ctx` the open sheet's). */
export function readPivotCreate(
  ctx: SheetsCtx,
  rangeText: string,
  insertTo: PivotInsertTo,
  locationText: string,
): PivotCreatePlan {
  const src = readSheetRange(ctx, rangeText);
  if (!src) return { ok: false, field: 'range', why: PIVOT_RANGE_WHY };
  if (src.rows < 2) return { ok: false, field: 'range', why: PIVOT_HEADER_WHY };
  const base = { ok: true as const, sourceSheetId: src.sheet.id, source: src.range };
  if (insertTo === 'new') return { ...base, to: { kind: 'new' } };
  const at = readSheetRange(ctx, locationText);
  if (!at) return { ok: false, field: 'location', why: PIVOT_LOCATION_WHY };
  return {
    ...base,
    to: { kind: 'existing', sheetId: at.sheet.id, at: { r: at.range.r1, c: at.range.c1 } },
  };
}

/** A new pivot table with no fields yet. */
export function newSheetPivot(
  id: string,
  pivotSheetId: string,
  at: { r: string; c: string },
  plan: { sourceSheetId: string; source: IdRange },
): SheetPivot {
  return {
    id,
    kind: 'pivot',
    at,
    source: sourceFor(pivotSheetId, plan.sourceSheetId, plan.source),
  };
}
