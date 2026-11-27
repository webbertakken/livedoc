// Another app's pivot table, read from its standard form (docs/specs/029-sheets/standard-mapping.md "Pivot tables in
// the file", D608, D609): what each format's reader finds (xlsx-pivots-read.ts, ods-pivots-read.ts) said once in the
// model's terms. A field's subtotals turn the next group's Show Totals off, the inverse of `subtotalsOf`; a filter's
// hidden items are matched to the source's cells when the sheets are made, as only then their shown texts are known.
import type { GridRange } from '../address';
import type { PivotGrouping, PivotShowAs, PivotSummary } from '../pivot/pivot-spec';
import {
  modelHoldsFields,
  type FilePivot,
  type FilePivotGroup,
  type FilePivotValue,
} from './file-pivots';
import type { FileValue } from './workbook-file';

/** An item a standard form hides: by its value (XLSX's cache) or by its text as shown (ODF's member name). */
export type PivotHidden = { v: FileValue | null } | { shown: string };

/** A filter by values as a standard form says it: the items of a source column it hides. */
export type FilePivotHides = { col: number; hides: PivotHidden[] };

/** A row or column field as a standard form says it, by its column's place in the source. */
export type StandardGroup = {
  col: number;
  grouping?: PivotGrouping;
  desc?: boolean;
  // Whether the field shows its items' subtotals (the next group's Show Totals).
  subtotals: boolean;
  repeat?: boolean;
  sortBy?: { value: number; item?: string[] };
};

/** A value as a standard form says it, and the label the other app gave it. */
export type StandardValue = (
  { col: number; formula?: undefined } | { formula: string; name: string; col?: undefined }
) & { summary: PivotSummary; showAs?: PivotShowAs; label?: string };

/** A pivot table as a standard form says it. */
export type StandardPivot = {
  at: { r: number; c: number };
  // The cells the other app's output covers, from `at`.
  output: { rows: number; cols: number };
  source: { sheet: string | null; range: GridRange };
  // The source's header texts, one a column.
  headers: readonly string[];
  rows: readonly StandardGroup[];
  columns: readonly StandardGroup[];
  values: readonly StandardValue[];
  // The items each column's filter hides; a column hiding none is no filter.
  hides: readonly FilePivotHides[];
  valuesAsRows: boolean;
  // Whether the outermost row group and column group show their grand totals.
  grand: { rows: boolean; cols: boolean };
};

/** LiveDoc's own label for a value of a source column: `SUM of Units`. */
export const ownValueLabel = (summary: PivotSummary, header: string): string =>
  `${summary} of ${header}`;

// Each group's options: its Show Totals the field outside its subtotals (the outermost's the grand totals).
function groupsOf(list: readonly StandardGroup[], grand: boolean): FilePivotGroup[] {
  return list.map((g, i) => {
    const totals = i === 0 ? grand : list[i - 1]!.subtotals;
    return {
      col: g.col,
      ...(g.grouping ? { grouping: g.grouping } : {}),
      ...(g.desc ? { desc: true as const } : {}),
      ...(g.sortBy ? { sortBy: g.sortBy } : {}),
      ...(totals ? {} : { totals: false as const }),
      ...(g.repeat ? { repeat: true as const } : {}),
    };
  });
}

function valueOf(v: StandardValue, headers: readonly string[]): FilePivotValue {
  const showAs = v.showAs ? { showAs: v.showAs } : {};
  if (v.formula !== undefined)
    return { formula: v.formula, summary: v.summary, name: v.name, ...showAs };
  const named = v.label !== undefined && v.label !== ownValueLabel(v.summary, headers[v.col] ?? '');
  return { col: v.col, summary: v.summary, ...showAs, ...(named ? { name: v.label } : {}) };
}

/** A pivot table a standard form says, as the file holds LiveDoc's: its fields, its hidden items to match. */
export function filePivotOfStandard(p: StandardPivot): FilePivot {
  const rows = groupsOf(p.rows, p.grand.rows);
  const columns = groupsOf(p.columns, p.grand.cols);
  const values = p.values.map((v) => valueOf(v, p.headers));
  const hides = p.hides.filter((h) => h.hides.length > 0);
  return {
    at: p.at,
    source: p.source,
    fields: {
      ...(rows.length ? { rows } : {}),
      ...(columns.length ? { columns } : {}),
      ...(values.length ? { values } : {}),
      ...(p.valuesAsRows && values.length > 1 ? { valuesAsRows: true as const } : {}),
    },
    headers: [...p.headers],
    items: [],
    output: p.output,
    ...(hides.length ? { hides } : {}),
  };
}

/** A standard form's pivot table when the model holds it (its options, its bounds); null for one it refuses (D609). */
export function heldPivotOfStandard(p: StandardPivot | null): FilePivot | null {
  const pivot = p && filePivotOfStandard(p);
  return pivot && modelHoldsFields(pivot.fields, p.headers.length) ? pivot : null;
}

// Whether a source cell's value is the one an item names: the same kind and value, a blank cell a blank item.
const sameValue = (a: FileValue | null, b: FileValue | null) =>
  a === null || b === null ? a === b : a.k === b.k && a.v === b.v;

/** A value's text as LibreOffice names an unformatted member: its number in full, TRUE or FALSE, the text itself. */
export const plainText = (v: FileValue | null | undefined): string =>
  v == null ? '' : v.k === 'b' ? (v.v ? 'TRUE' : 'FALSE') : String(v.v);

/**
 * A pivot table's filters by values, its hidden items matched to its source's cells (`cellAt`, by the source sheet's
 * row and column), each shown as `shownOf` shows it: a filter showing the texts of the cells it does not hide, none for
 * a column it hides nothing of (D608).
 */
export function pivotHidesResolved(
  p: FilePivot,
  cellAt: (r: number, c: number) => FileValue | null,
  shownOf: (r: number, c: number) => string,
): FilePivot {
  if (!p.hides) return p;
  const { range } = p.source;
  const filters = p.hides.flatMap(({ col, hides }) => {
    const c = range.c1 + col;
    const shows: string[] = [];
    let hid = false;
    for (let r = range.r1 + 1; r <= range.r2; r++) {
      const v = cellAt(r, c);
      const shown = shownOf(r, c);
      const hidden = hides.some((h) =>
        'v' in h ? sameValue(h.v, v) : h.shown === shown || h.shown === plainText(v),
      );
      if (hidden) hid = true;
      else if (!shows.includes(shown)) shows.push(shown);
    }
    return hid ? [{ col, cond: { values: shows } }] : [];
  });
  const { hides: _, ...rest } = p;
  return filters.length ? { ...rest, fields: { ...rest.fields, filters } } : rest;
}
