// A pivot table as its sheet keeps it (objects/sheet-pivot.ts), resolved for the engine (docs/specs/029-sheets/
// pivot-tables.md "In the grid", D503): its source's sheet and positions, its fields by their column's place in the
// source, its source read as values and shown texts, and its output's cells with the number formats they show in.
import { layoutIndex } from '../layout';
import { displayValue } from '../number-format';
import type { SheetPivot } from '../objects/sheet-pivot';
import { pivotWithout } from '../objects/sheet-pivot';
import { cellKey, type CellFormat, type Sheet } from '../sheet';
import { isArray, scalarOf, type Scalar, type Value, type ValueArray } from '../formula/values';
import type {
  PivotCell,
  PivotFormat,
  PivotGroupSpec,
  PivotOutput,
  PivotSource,
  PivotSpec,
} from './pivot-spec';

// The spec's words for a pivot table that cannot be worked out (pivot-tables.md "In the grid", "Errors and limits").
export const PIVOT_BLOCKED_BY = (a1: string) => `Results would overwrite ${a1}`;
export const PIVOT_PAST_EDGE = 'Results would run past the edge of the sheet';
export const PIVOT_NO_SOURCE = "The pivot table's source data was deleted";
export const PIVOT_TOO_LARGE = 'This pivot table is too large';
export const PIVOT_SOURCE_CELLS_MAX = 1_000_000;
export const PIVOT_OUTPUT_CELLS_MAX = 100_000;

/** Where a pivot table's source sits: its sheet and the positions of its corners. */
export type PivotBox = { sheet: Sheet; r1: number; c1: number; r2: number; c2: number };

/** The sheets a pivot table may read: its own, and the workbook's by id and by title. */
export type PivotSheets = {
  own: Sheet;
  byId: (id: string) => Sheet | undefined;
  byTitle: (title: string) => Sheet | undefined;
};

/** The source's sheet and positions; null when its sheet or a corner is gone. */
export function pivotBox(pivot: SheetPivot, sheets: PivotSheets): PivotBox | null {
  const src = pivot.source;
  if (!src) return null;
  const sheet =
    src.s !== undefined
      ? sheets.byId(src.s)
      : src.st !== undefined
        ? sheets.byTitle(src.st)
        : sheets.own;
  if (!sheet) return null;
  const ix = layoutIndex(sheet.layout);
  const ra = ix.rowPos.get(src.r1);
  const rb = ix.rowPos.get(src.r2);
  const ca = ix.colPos.get(src.c1);
  const cb = ix.colPos.get(src.c2);
  if (ra === undefined || rb === undefined || ca === undefined || cb === undefined) return null;
  return {
    sheet,
    r1: Math.min(ra, rb),
    r2: Math.max(ra, rb),
    c1: Math.min(ca, cb),
    c2: Math.max(ca, cb),
  };
}

/** The pivot table's fields by their column's place in the source; a field on a column outside it is left out. */
export function pivotSpecOf(pivot: SheetPivot, box: PivotBox): PivotSpec {
  const cols = box.sheet.layout.cols;
  const place = new Map<string, number>();
  for (let c = box.c1; c <= box.c2; c++) place.set(cols[c]!, c - box.c1);
  const fields = [
    ...(pivot.rows ?? []),
    ...(pivot.columns ?? []),
    ...(pivot.values ?? []),
    ...(pivot.filters ?? []),
  ];
  const outside = new Set(fields.map((x) => x.col).filter((id) => !place.has(id)));
  const kept = pivotWithout(pivot, outside);
  const group = ({ col, ...g }: NonNullable<SheetPivot['rows']>[number]): PivotGroupSpec => ({
    ...g,
    col: place.get(col)!,
  });
  return {
    rows: (kept.rows ?? []).map(group),
    columns: (kept.columns ?? []).map(group),
    values: (kept.values ?? []).map((v) => ({ ...v, col: place.get(v.col)! })),
    filters: (kept.filters ?? []).map((f) => ({ col: place.get(f.col)!, cond: f.cond })),
    ...(kept.valuesAsRows ? { valuesAsRows: true } : {}),
  };
}

// A cell's number format alone (its kind, decimals, currency and Custom code).
function numberFormat(format: CellFormat | undefined): CellFormat | undefined {
  if (!format?.nf) return undefined;
  const { nf, dp, cur, nc } = format;
  return {
    nf,
    ...(dp !== undefined ? { dp } : {}),
    ...(cur !== undefined ? { cur } : {}),
    ...(nc !== undefined ? { nc } : {}),
  };
}

/** The source read: its header's shown texts, its rows' values and shown texts, and each column's number format. */
export type PivotRead = { source: PivotSource; formats: (CellFormat | undefined)[] };

/** Read the source in `box`, each cell's value from `value`, shown in its own format in `locale`. */
export function readPivotSource(
  box: PivotBox,
  value: (r: number, c: number) => Value,
  locale: string,
): PivotRead {
  const { sheet } = box;
  const rows: PivotCell[][] = [];
  const header: string[] = [];
  const formats: (CellFormat | undefined)[] = [];
  for (let r = box.r1; r <= box.r2; r++) {
    const row: PivotCell[] = [];
    for (let c = box.c1; c <= box.c2; c++) {
      const raw = value(r, c);
      const v: Scalar = isArray(raw) ? scalarOf(raw) : raw;
      const format = sheet.cells.get(cellKey(sheet.layout.rows[r]!, sheet.layout.cols[c]!))?.format;
      const shown = displayValue(v, format, locale).text;
      if (r === box.r1) header.push(shown);
      else {
        row.push({ v, shown });
        if (!formats[c - box.c1]) formats[c - box.c1] = numberFormat(format);
      }
    }
    if (r > box.r1) rows.push(row);
  }
  formats.length = box.c2 - box.c1 + 1;
  return { source: { header, rows }, formats };
}

/** An output as the engine holds it: its values, and beside them each cell's number format, if it takes one. */
export type PivotArray = ValueArray & { fmts: (CellFormat | undefined)[][] };

export function isPivotArray(v: Value | undefined): v is PivotArray {
  return isArray(v) && 'fmts' in v;
}

const PERCENT: CellFormat = { nf: 'percent', dp: 2 };

/** The output as cells for the grid: values, and formats from its source columns' or as percentages. */
export function pivotArray(
  output: PivotOutput,
  formats: readonly (CellFormat | undefined)[],
): PivotArray {
  const formatOf = (fmt: PivotFormat | undefined) =>
    fmt === undefined ? undefined : fmt === 'percent' ? PERCENT : formats[fmt.col];
  return {
    rows: output.rows.map((row) => row.map((x) => x.v)),
    fmts: output.rows.map((row) => row.map((x) => formatOf(x.fmt))),
  };
}

/** A sheet's pivot tables at their anchors' positions (a pivot table whose anchor is off the grid is left out). */
export function pivotAnchorsOf(sheet: Sheet): { r: number; c: number; pivot: SheetPivot }[] {
  const pivots = (sheet.layout.objects ?? []).filter((x): x is SheetPivot => x.kind === 'pivot');
  if (!pivots.length) return [];
  const ix = layoutIndex(sheet.layout);
  return pivots.flatMap((pivot) => {
    const r = ix.rowPos.get(pivot.at.r);
    const c = ix.colPos.get(pivot.at.c);
    return r === undefined || c === undefined ? [] : [{ r, c, pivot }];
  });
}
