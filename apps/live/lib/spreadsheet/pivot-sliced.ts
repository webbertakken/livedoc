// Pivot tables under this person's slicers (docs/specs/029-sheets/pivot-tables.md "In the grid", "Sliced", D629): each
// pivot table whose source is a slicer's range exactly, Apply to Pivot Tables ticked, worked out again from the rows
// the person's slicers keep and drawn in its output's place, blank where it is smaller; the cells keep everyone's.
import {
  filteredOutRows,
  slicersOverPivot,
  type CellFormat,
  type GridRange,
  type OwnSlicerFilters,
  type PivotArray,
  type Sheet,
  type SheetPivot,
  type Value,
  type Workbook,
} from '@livedoc/sheets';
import { debugLog } from '@/lib/debug-log';

/** A drawn cell of a sliced pivot table: its value, and the number format its output gives it. */
export type DrawnPivotCell = { v: Value; fmt: CellFormat | undefined };

/** What this person's sliced pivot tables draw: a cell of one, or undefined for any cell they do not cover. */
export type DrawnPivots = { at(r: number, c: number): DrawnPivotCell | undefined };

/** The cells a list of sliced outputs draws, each over the rectangle everyone's output fills. */
export function drawnPivotsOf(
  sliced: readonly { rect: GridRange; drawn: PivotArray }[],
): DrawnPivots | null {
  if (sliced.length === 0) return null;
  return {
    at: (r, c) => {
      const s = sliced.find(
        ({ rect }) => r >= rect.r1 && r <= rect.r2 && c >= rect.c1 && c <= rect.c2,
      );
      if (!s) return undefined;
      const [dr, dc] = [r - s.rect.r1, c - s.rect.c1];
      return { v: s.drawn.rows[dr]?.[dc] ?? null, fmt: s.drawn.fmts[dr]?.[dc] };
    },
  };
}

/** This person's sliced pivot tables on `sheet`, or null when their slicers hide no row of any pivot table's source. */
export function slicedPivotsOf(
  workbook: Workbook,
  sheet: Sheet,
  own: OwnSlicerFilters,
): DrawnPivots | null {
  const pivots = (sheet.layout.objects ?? []).filter((x): x is SheetPivot => x.kind === 'pivot');
  const sliced = pivots.flatMap((pivot) => {
    const slicers = slicersOverPivot(sheet.layout, pivot.source, own);
    if (slicers.length === 0) return [];
    const hidden = filteredOutRows(workbook, sheet.id, null, slicers);
    if (hidden.size === 0) return [];
    const out = workbook.pivotOutputSliced(sheet.id, pivot.id, hidden);
    debugLog(
      `[sheet-pivots] sliced sheet=${sheet.id} pivot=${pivot.id} hidden=${hidden.size} drawn=${out !== null}`,
    );
    return out ? [out] : [];
  });
  return drawnPivotsOf(sliced);
}

/** A cell's value as this person sees it: a sliced pivot table's where one covers it, else the workbook's. */
export const drawnValue = (
  drawn: DrawnPivots | null | undefined,
  workbook: Workbook,
  sheetId: string,
  r: number,
  c: number,
): Value => {
  const cell = drawn?.at(r, c);
  return cell ? cell.v : workbook.value(sheetId, r, c);
};

/** A cell's format as its value is shown: its own, with a sliced pivot table's number format where it sets none. */
export const drawnFormat = (
  drawn: DrawnPivots | null | undefined,
  workbook: Workbook,
  sheetId: string,
  r: number,
  c: number,
  own: CellFormat | undefined,
): CellFormat | undefined => {
  const cell = drawn?.at(r, c);
  if (!cell) return workbook.shownFormat(sheetId, r, c, own);
  return own?.nf || !cell.fmt ? own : { ...own, ...cell.fmt };
};
