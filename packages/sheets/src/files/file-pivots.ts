// Pivot tables as a file holds them (docs/specs/029-sheets/standard-mapping.md "Pivot tables in the file", D604 to
// D607): each pivot table by position, its source by its sheet's name and range, its fields by their column's place in
// the source, the source's headers and items its standard form names, and the size of its output. Each format's
// writer and reader maps this (xlsx-pivots.ts, ods-pivots.ts); LiveDoc's record beside the standard form is the
// pivot table exact, and the standard form's fingerprint says whether another app changed it since.
import { formatRange, parseRangeText, type GridRange } from '../address';
import { makeAxisIds, type Rand } from '../ids';
import { cellAddress } from './xlsx-parts';
import { scalarOf } from '../formula/values';
import type { Workbook } from '../engine/workbook';
import { isSheetObject } from '../objects/sheet-objects';
import type {
  SheetPivot,
  SheetPivotFilter,
  SheetPivotGroup,
  SheetPivotValue,
} from '../objects/sheet-pivot';
import {
  isPivotArray,
  pivotAnchorsOf,
  pivotBox,
  readPivotSource,
  type PivotBox,
} from '../pivot/pivot-resolve';
import type { PivotSource, PivotSummary } from '../pivot/pivot-spec';
import { sourceFromText, sourceSheetOf, splitSheetText } from '../rules/rule-source';
import type { Sheet, SheetLayout } from '../sheet';
import { quoteSheet, type SheetsCtx } from '../formula/stored';
import { fileValueOf, type FileCell, type FileValue } from './workbook-file';
import { formatCodeOf } from './number-format-code';
import { validationFingerprint } from './validation-standard';
import type { FilePivotHides } from './pivot-standard';

/** A source column's item: its value (null for a blank cell) and its text as shown. */
export type PivotItem = { v: FileValue | null; shown: string };

/** A group, value or filter as a file holds it: its column by its place in the source, from 0. */
export type FilePivotGroup = Omit<SheetPivotGroup, 'col'> & { col: number };
export type FilePivotValue =
  | (Omit<Extract<SheetPivotValue, { col: string }>, 'col'> & { col: number })
  | Extract<SheetPivotValue, { formula: string }>;
export type FilePivotFilter =
  | (Omit<Extract<SheetPivotFilter, { formula?: undefined }>, 'col'> & { col: number })
  | (Omit<Extract<SheetPivotFilter, { formula: string }>, 'col'> & { col: number });

/** A pivot table's fields, by their column's place in the source. */
export type FilePivotFields = {
  rows?: FilePivotGroup[];
  columns?: FilePivotGroup[];
  values?: FilePivotValue[];
  filters?: FilePivotFilter[];
  valuesAsRows?: true;
};

export type FilePivot = {
  // The cell its output starts at.
  at: { r: number; c: number };
  // Its source: a range of its own sheet (`sheet` null) or of another by name.
  source: { sheet: string | null; range: GridRange };
  fields: FilePivotFields;
  // The source's header texts, one a column.
  headers: string[];
  // Each source column's distinct items in source order, for a row, column or filter column; none for the rest.
  items: (PivotItem[] | undefined)[];
  // The size of its output (its anchor alone when it shows none).
  output: { rows: number; cols: number };
  // Read from another app's standard form: the items its filters by values hide, matched when the sheets are made.
  hides?: FilePivotHides[];
};

/** What the standard form of a format holds of a pivot table: its output's place, its source, and its fields. */
export type PivotStandard = { location: GridRange; source: string; fields: readonly string[] };

/** The fingerprint of a standard form: its place, its source, then its fields, each a line (D607). */
export const pivotFingerprint = (standard: PivotStandard): string =>
  validationFingerprint([formatRange(standard.location), standard.source, ...standard.fields]);

/** A source as the standard forms name it: `Sales!A1:F25`, its sheet's name as written there. */
export const pivotSourceText = (sheet: string, range: GridRange): string =>
  `${quoteSheet(sheet)}!${formatRange(range)}`;

// The columns a group or filter names, whose items a standard form lists.
function itemColumns(fields: FilePivotFields): Set<number> {
  return new Set([
    ...(fields.rows ?? []).map((g) => g.col),
    ...(fields.columns ?? []).map((g) => g.col),
    ...(fields.filters ?? []).map((f) => f.col),
  ]);
}

// A pivot table's fields by place in its source; a field on a column outside it is left out (as the engine does).
function fieldsOf(pivot: SheetPivot, box: PivotBox): FilePivotFields {
  const place = new Map<string, number>();
  for (let c = box.c1; c <= box.c2; c++) place.set(box.sheet.layout.cols[c]!, c - box.c1);
  const at = (col: string) => place.get(col);
  const groups = (list: readonly SheetPivotGroup[] | undefined) =>
    (list ?? []).flatMap((g) => {
      const col = at(g.col);
      return col === undefined ? [] : [{ ...g, col }];
    });
  const values = (pivot.values ?? []).flatMap((v): FilePivotValue[] => {
    if (v.formula !== undefined) return [v];
    const col = at(v.col);
    return col === undefined ? [] : [{ ...v, col }];
  });
  const filters = (pivot.filters ?? []).flatMap((f): FilePivotFilter[] => {
    const col = at(f.col);
    return col === undefined ? [] : [{ ...f, col }];
  });
  const rows = groups(pivot.rows);
  const columns = groups(pivot.columns);
  return {
    ...(rows.length ? { rows } : {}),
    ...(columns.length ? { columns } : {}),
    ...(values.length ? { values } : {}),
    ...(filters.length ? { filters } : {}),
    ...(pivot.valuesAsRows ? { valuesAsRows: true as const } : {}),
  };
}

// Each column's distinct items in source order, for the columns a standard form lists the items of.
function itemsOf(
  rows: PivotSource['rows'],
  width: number,
  cols: ReadonlySet<number>,
): (PivotItem[] | undefined)[] {
  const out: (PivotItem[] | undefined)[] = [];
  for (let c = 0; c < width; c++) {
    if (!cols.has(c)) {
      out.push(undefined);
      continue;
    }
    const seen = new Map<string, PivotItem>();
    for (const row of rows) {
      const cell = row[c]!;
      const v = fileValueOf(cell.v) ?? null;
      const key = v === null ? '' : `${v.k}:${String(v.v)}`;
      if (!seen.has(key)) seen.set(key, { v, shown: cell.shown });
    }
    out.push([...seen.values()]);
  }
  return out;
}

/**
 * A sheet's pivot tables as a file holds them, and the cells their outputs cache: every value a pivot table shows but
 * its anchor's own input, in the number format it shows with. A pivot table whose source is gone is left out, named.
 */
export function filePivotsOf(
  engine: Workbook,
  sheet: Sheet,
  sheets: readonly Sheet[],
  locale: string,
): { pivots: FilePivot[]; cells: FileCell[]; unwritten: number } {
  const pivots: FilePivot[] = [];
  const cells: FileCell[] = [];
  let unwritten = 0;
  const lookup = {
    own: sheet,
    byId: (id: string) => sheets.find((s) => s.id === id),
    byTitle: (title: string) => sheets.find((s) => s.title === title),
  };
  for (const { r, c, pivot } of pivotAnchorsOf(sheet)) {
    const box = pivotBox(pivot, lookup);
    if (!box) {
      unwritten++;
      continue;
    }
    const read = readPivotSource(box, (sr, sc) => engine.value(box.sheet.id, sr, sc), locale);
    const fields = fieldsOf(pivot, box);
    const result = engine.formulaResult(sheet.id, r, c);
    const output = isPivotArray(result)
      ? {
          rows: result.rows.length,
          cols: result.rows.reduce((n, row) => Math.max(n, row.length), 1),
        }
      : { rows: 1, cols: 1 };
    pivots.push({
      at: { r, c },
      source: {
        sheet: box.sheet.id === sheet.id ? null : box.sheet.title,
        range: { r1: box.r1, c1: box.c1, r2: box.r2, c2: box.c2 },
      },
      fields,
      headers: [...read.source.header],
      items: itemsOf(read.source.rows, read.source.header.length, itemColumns(fields)),
      output,
    });
    for (let dr = 0; dr < output.rows; dr++)
      for (let dc = 0; dc < output.cols; dc++) {
        const value = fileValueOf(scalarOf(engine.value(sheet.id, r + dr, c + dc)));
        if (!value) continue;
        const format = formatCodeOf(engine.pivotFormatAt(sheet.id, r + dr, c + dc), locale);
        cells.push({ r: r + dr, c: c + dc, value, ...(format ? { format } : {}) });
      }
  }
  return { pivots, cells, unwritten };
}

/** The positions a read pivot table's output covers: its cached cells, which the engine works out again. */
export function pivotCachePositions(pivots: readonly FilePivot[] | undefined): Set<string> {
  const out = new Set<string>();
  for (const p of pivots ?? [])
    for (let dr = 0; dr < p.output.rows; dr++)
      for (let dc = 0; dc < p.output.cols; dc++) out.add(`${p.at.r + dr},${p.at.c + dc}`);
  return out;
}

/** A source as LiveDoc's record names it: its range alone on the own sheet, else after its sheet's name. */
const sourceText = (source: FilePivot['source']): string =>
  source.sheet === null ? formatRange(source.range) : pivotSourceText(source.sheet, source.range);

/** LiveDoc's record of a pivot table, as JSON: its place, its source and its fields (D604). */
export function pivotRecordText(p: FilePivot): string {
  return JSON.stringify({
    at: cellAddress(p.at.r, p.at.c),
    source: sourceText(p.source),
    ...p.fields,
  });
}

/** A record read back: its place, its source and its fields; null when it is not one. */
export type PivotRecord = Pick<FilePivot, 'at' | 'source' | 'fields'>;

const FIELD_KEYS = new Set(['rows', 'columns', 'values', 'filters', 'valuesAsRows']);

export function readPivotRecord(text: string): PivotRecord | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const { at, source, ...fields } = raw as Record<string, unknown>;
  const place = typeof at === 'string' ? parseRangeText(at) : null;
  if (!place || place.r1 !== place.r2 || place.c1 !== place.c2) return null;
  if (typeof source !== 'string' || !Object.keys(fields).every((k) => FIELD_KEYS.has(k)))
    return null;
  const split = splitSheetText(source);
  const range = parseRangeText(split.range);
  if (!range) return null;
  return {
    at: { r: place.r1, c: place.c1 },
    source: { sheet: split.title, range },
    fields,
  };
}

// A pivot table of the model: its fields on its source's column ids `cols` by place (a calculated field names none);
// null when a field names a column outside them, or the model refuses it (a malformed option, past its bounds).
function pivotOnColumns(
  f: FilePivotFields,
  cols: readonly string[],
  base: Pick<SheetPivot, 'id' | 'at' | 'source'>,
): SheetPivot | null {
  const list = (items: unknown): unknown[] | null | undefined => {
    if (items === undefined) return undefined;
    if (!Array.isArray(items)) return null;
    const out = items.map((x: unknown) => {
      if (typeof x !== 'object' || x === null) return null;
      const field = x as { col?: unknown };
      if (field.col === undefined) return x;
      const col = typeof field.col === 'number' ? cols[field.col] : undefined;
      return col === undefined ? null : { ...field, col };
    });
    return out.some((x) => x === null) ? null : out;
  };
  const rows = list(f.rows);
  const columns = list(f.columns);
  const values = list(f.values);
  const filters = list(f.filters);
  if (rows === null || columns === null || values === null || filters === null) return null;
  const pivot = {
    ...base,
    kind: 'pivot',
    ...(rows ? { rows } : {}),
    ...(columns ? { columns } : {}),
    ...(values ? { values } : {}),
    ...(filters ? { filters } : {}),
    ...(f.valuesAsRows !== undefined ? { valuesAsRows: f.valuesAsRows } : {}),
  };
  return isSheetObject(pivot, base.id) ? pivot : null;
}

/**
 * The model's pivot table of a file's: on `layout`'s cells, its source by `ctx`'s sheets; null when its place or
 * source is not there, or the model refuses it (a field outside the source, a malformed option).
 */
export function sheetPivotOf(
  p: PivotRecord,
  layout: SheetLayout,
  ctx: SheetsCtx,
  id: string,
): SheetPivot | null {
  const r = layout.rows[p.at.r];
  const c = layout.cols[p.at.c];
  const source = sourceFromText(ctx, sourceText(p.source));
  if (!r || !c || !source) return null;
  const cols = sourceSheetOf(ctx, source)!.layout.cols.slice(
    p.source.range.c1,
    p.source.range.c2 + 1,
  );
  return pivotOnColumns(p.fields, cols, { id, at: { r, c }, source });
}

/** Whether the model holds a pivot table of `fields` over a source `width` columns wide (its options, its bounds). */
export function modelHoldsFields(fields: FilePivotFields, width: number): boolean {
  const cols = Array.from({ length: width }, (_, i) => `c${String(i).padStart(5, '0')}`);
  const source = { r1: 'r00000', c1: 'c00000', r2: 'r00001', c2: cols[width - 1]! };
  return (
    pivotOnColumns(fields, cols, { id: 'p00000', at: { r: 'r00000', c: 'c00000' }, source }) !==
    null
  );
}

/** A sheet's pivot tables read from its file, each a new id; one the model refuses is left out, counted. */
export function sheetPivotsFromFile(
  pivots: readonly PivotRecord[] | undefined,
  layout: SheetLayout,
  ctx: SheetsCtx,
  rand: Rand,
  taken: ReadonlySet<string>,
): { pivots: SheetPivot[]; refused: number } {
  const out: SheetPivot[] = [];
  let refused = 0;
  for (const p of pivots ?? []) {
    const id = makeAxisIds(1, rand, new Set([...taken, ...out.map((x) => x.id)]))[0]!;
    const made = sheetPivotOf(p, layout, ctx, id);
    if (made) out.push(made);
    else refused++;
  }
  return { pivots: out, refused };
}

/** Why another app's pivot table works more simply than LiveDoc's (D606). */
export type PivotSimplified =
  | 'summary'
  | 'custom-summary'
  | 'calculated-field'
  | 'sort-by-value'
  | 'grouping'
  | 'filter-by-condition'
  | 'filter-by-formula'
  | 'repeat-labels';

// The summaries each format has a function for (D605).
const XLSX_LACKS: ReadonlySet<PivotSummary> = new Set(['MEDIAN', 'COUNTUNIQUE']);
const ODF_LACKS: ReadonlySet<PivotSummary> = new Set(['COUNTUNIQUE']);

/** Whether a format's standard form has a function for a summary. */
export const standardHasSummary = (summary: PivotSummary, format: 'xlsx' | 'odf'): boolean =>
  !(format === 'xlsx' ? XLSX_LACKS : ODF_LACKS).has(summary);

/** What a format's standard form leaves out of a pivot table, in the order the words list them. */
export function pivotSimplified(
  fields: FilePivotFields,
  format: 'xlsx' | 'odf',
): PivotSimplified[] {
  const out = new Set<PivotSimplified>();
  const groups = [...(fields.rows ?? []), ...(fields.columns ?? [])];
  for (const v of fields.values ?? []) {
    if (v.summary === 'CUSTOM') out.add('custom-summary');
    else if (!standardHasSummary(v.summary, format)) out.add('summary');
    if (v.formula !== undefined && format === 'odf') out.add('calculated-field');
  }
  if (groups.some((g) => g.sortBy)) out.add('sort-by-value');
  if (groups.some((g) => g.grouping)) out.add('grouping');
  for (const f of fields.filters ?? []) {
    if (f.formula !== undefined) out.add('filter-by-formula');
    else if (f.cond.values === undefined) out.add('filter-by-condition');
  }
  if (format === 'xlsx' && (fields.rows ?? []).some((g) => g.repeat)) out.add('repeat-labels');
  return PIVOT_SIMPLIFIED.filter((x) => out.has(x));
}

/** Every feature a standard form may leave out, in the order the words list them. */
export const PIVOT_SIMPLIFIED: readonly PivotSimplified[] = [
  'summary',
  'custom-summary',
  'calculated-field',
  'sort-by-value',
  'grouping',
  'filter-by-condition',
  'filter-by-formula',
  'repeat-labels',
];

/** The filters by values a standard form says: each column filtered with the shown texts it shows. */
export function valueFilters(fields: FilePivotFields): Map<number, ReadonlySet<string>> {
  const out = new Map<number, ReadonlySet<string>>();
  for (const f of fields.filters ?? [])
    if (f.formula === undefined && f.cond.values !== undefined && !out.has(f.col))
      out.set(f.col, new Set(f.cond.values));
  return out;
}

/** The columns a standard form puts on its page axis: filtered columns on no row or column, in filter order. */
export function pageColumns(fields: FilePivotFields): number[] {
  const axis = new Set([...(fields.rows ?? []), ...(fields.columns ?? [])].map((g) => g.col));
  const out: number[] = [];
  for (const f of fields.filters ?? [])
    if (!axis.has(f.col) && !out.includes(f.col)) out.push(f.col);
  return out;
}

/**
 * Each standard field's name: the source's headers, made unique as Excel makes them (a blank one `Column N`, a repeat
 * suffixed 2, 3, ...), then the calculated fields' names, unique among them too.
 */
export function pivotFieldNames(p: Pick<FilePivot, 'headers' | 'fields'>): string[] {
  const taken = new Set<string>();
  const unique = (name: string) => {
    let out = name;
    for (let n = 2; taken.has(out.toLowerCase()); n++) out = `${name}${n}`;
    taken.add(out.toLowerCase());
    return out;
  };
  const headers = p.headers.map((h, c) => unique(h.trim() === '' ? `Column ${c + 1}` : h));
  const calc = (p.fields.values ?? []).flatMap((v) => (v.formula === undefined ? [] : [v]));
  return [...headers, ...calc.map((v) => unique(v.name))];
}

/** A value's place among the standard fields: its column's, or its calculated field's after the headers. */
export function valueFieldIndex(p: Pick<FilePivot, 'headers' | 'fields'>, at: number): number {
  const values = p.fields.values!;
  const v = values[at]!;
  if (v.formula === undefined) return v.col;
  return p.headers.length + values.slice(0, at).filter((x) => x.formula !== undefined).length;
}

/**
 * The fields a standard form says, a line each for the fingerprint: each row, column and page field by name, then
 * each data field by name and function. `fn` gives a value's function in the format; a value it leaves out, none.
 */
export function pivotStandardFields(
  p: Pick<FilePivot, 'headers' | 'fields'>,
  names: readonly string[],
  fn: (v: FilePivotValue) => string | null,
): string[] {
  const out = [
    ...(p.fields.rows ?? []).map((g) => `row ${names[g.col]}`),
    ...(p.fields.columns ?? []).map((g) => `column ${names[g.col]}`),
    ...pageColumns(p.fields).map((c) => `page ${names[c]}`),
  ];
  (p.fields.values ?? []).forEach((v, i) => {
    const f = fn(v);
    if (f !== null) out.push(`data ${names[valueFieldIndex(p, i)]} ${f}`);
  });
  return out;
}

/** A value's label as the standard form names it, as Google Sheets exports one: `SUM of Units`. */
export const pivotValueLabel = (v: FilePivotValue, names: readonly string[], index: number) =>
  v.formula === undefined && v.name
    ? v.name
    : `${v.summary === 'CUSTOM' ? 'SUM' : v.summary} of ${names[index]}`;

/**
 * Whether a field on an axis shows its items' subtotals: a group's Show Totals totals the items of the group outside
 * it, so a field's subtotals are the next group's (the outermost group's are the grand totals).
 */
export const subtotalsOf = (groups: readonly { totals?: false }[], at: number): boolean =>
  groups[at + 1]?.totals !== false;
