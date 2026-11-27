// Another app's pivot table in XLSX, read from its standard form (docs/specs/029-sheets/standard-mapping.md "Pivot
// tables in the file", D608, D609): a pivot table part and its cache definition, as Excel, LibreOffice and Google Sheets
// write them, in the model's terms; null for one the model cannot hold, which stays the file's own.
import { attributeOf, childElements, parseXml, type XmlElement } from '@livedoc/office-packages';
import { parseRangeText } from '../address';
import type { PivotShowAs, PivotSummary } from '../pivot/pivot-spec';
import { isoDateSerial } from './ods-read';
import type {
  FilePivotHides,
  PivotHidden,
  StandardGroup,
  StandardPivot,
  StandardValue,
} from './pivot-standard';
import type { FileValue } from './workbook-file';

/** The values' place among a pivot table's fields: `-2`, as an unsigned int in a pivot area's references. */
export const XLSX_DATA_FIELD = 4294967294;

// Each subtotal function back to its summary (D608); none is SUM.
const SUMMARY: Readonly<Record<string, PivotSummary>> = {
  sum: 'SUM',
  count: 'COUNTA',
  countNums: 'COUNT',
  average: 'AVERAGE',
  max: 'MAX',
  min: 'MIN',
  product: 'PRODUCT',
  stdDev: 'STDEV',
  stdDevp: 'STDEVP',
  var: 'VAR',
  varp: 'VARP',
};

const SHOW_AS: Readonly<Record<string, PivotShowAs | null>> = {
  normal: null,
  percentOfRow: 'row',
  percentOfCol: 'column',
  percentOfTotal: 'total',
};

// A child of `e` in its own namespace, as the Transitional and Strict forms each keep one.
const kid = (e: XmlElement | undefined, local: string) =>
  e ? childElements(e).find((c) => c.local === local && c.uri === e.uri) : undefined;
const kids = (e: XmlElement | undefined, local: string) =>
  e ? childElements(e).filter((c) => c.local === local && c.uri === e.uri) : [];
const at = (e: XmlElement, name: string) => attributeOf(e, '', name);
const off = (v: string | undefined) => v === '0' || v === 'false';
const on = (v: string | undefined) => v === '1' || v === 'true';

// A shared item's value: null for a blank one, undefined for one LiveDoc cannot read.
function itemValue(e: XmlElement): FileValue | null | undefined {
  const v = at(e, 'v') ?? '';
  switch (e.local) {
    case 'm':
      return null;
    case 's':
      return { k: 's', v };
    case 'n':
      return Number.isFinite(Number(v)) && v !== '' ? { k: 'n', v: Number(v) } : undefined;
    case 'b':
      return { k: 'b', v: on(v) };
    case 'e':
      return { k: 'e', v: v as Extract<FileValue, { k: 'e' }>['v'] };
    case 'd': {
      const serial = isoDateSerial(v);
      return serial === null ? undefined : { k: 'n', v: serial };
    }
    default:
      return undefined;
  }
}

type CacheField = {
  name: string;
  formula?: string;
  database: boolean;
  grouped: boolean;
  items: (FileValue | null | undefined)[];
};

type Cache = { sheet: string; ref: string; fields: CacheField[] };

function readCache(root: XmlElement): Cache | null {
  const source = kid(root, 'cacheSource');
  const ws = kid(source, 'worksheetSource');
  const ref = ws && at(ws, 'ref');
  const sheet = ws && at(ws, 'sheet');
  if (!source || (at(source, 'type') ?? 'worksheet') !== 'worksheet' || !ref || !sheet) return null;
  const fields = kids(kid(root, 'cacheFields'), 'cacheField').map((f): CacheField => {
    const shared = kid(f, 'sharedItems');
    const formula = at(f, 'formula');
    return {
      name: at(f, 'name') ?? '',
      ...(formula !== undefined ? { formula } : {}),
      database: !off(at(f, 'databaseField')),
      grouped: kid(f, 'fieldGroup') !== undefined,
      items: shared ? childElements(shared).map(itemValue) : [],
    };
  });
  return { sheet, ref, fields };
}

type PivotField = {
  axis?: string;
  desc: boolean;
  subtotals: boolean;
  // Its items in order, each a shared item's place, and whether it is hidden; totals and the like left out.
  items: { x: number; hidden: boolean }[];
  scope?: XmlElement;
};

function readPivotField(f: XmlElement): PivotField {
  const scope = kid(f, 'autoSortScope');
  return {
    ...(at(f, 'axis') !== undefined ? { axis: at(f, 'axis') } : {}),
    desc: at(f, 'sortType') === 'descending',
    subtotals: !off(at(f, 'defaultSubtotal')),
    items: kids(kid(f, 'items'), 'item')
      .filter((i) => at(i, 't') === undefined || at(i, 't') === 'data')
      .map((i) => ({ x: Number(at(i, 'x')), hidden: on(at(i, 'h')) })),
    ...(scope ? { scope } : {}),
  };
}

const fieldList = (e: XmlElement | undefined, local: string, attr: string) =>
  kids(e, local).map((f) => Number(at(f, attr)));

/**
 * A pivot table part's standard form over its cache, on sheet `own` of a workbook of `sheets`; null when the model
 * cannot hold it (a source not a range of the workbook, a grouped field, a calculated item, a Show As LiveDoc lacks,
 * an item it cannot find).
 */
export function readXlsxStandard(
  tableXml: string,
  cacheXml: string,
  own: string,
  sheets: readonly string[],
): StandardPivot | null {
  const table = parseXml(tableXml);
  const cacheRead = parseXml(cacheXml);
  if (!table.ok || !cacheRead.ok) return null;
  const root = table.root;
  const cache = readCache(cacheRead.root);
  const range = cache && parseRangeText(cache.ref);
  const place = kid(root, 'location');
  const location = place ? parseRangeText(at(place, 'ref') ?? '') : null;
  if (!cache || !range || !location || !sheets.includes(cache.sheet)) return null;
  if (kid(root, 'calculatedItems')) return null;
  const width = range.c2 - range.c1 + 1;
  const fields = cache.fields;
  if (fields.length < width || fields.slice(0, width).some((f) => !f.database || f.grouped))
    return null;
  const pivotFields = kids(kid(root, 'pivotFields'), 'pivotField').map(readPivotField);
  const rowFields = fieldList(kid(root, 'rowFields'), 'field', 'x');
  const colFields = fieldList(kid(root, 'colFields'), 'field', 'x');
  const pageFields = fieldList(kid(root, 'pageFields'), 'pageField', 'fld');
  const axisFields = [...rowFields, ...colFields].filter((x) => x !== -2);
  if ([...axisFields, ...pageFields].some((x) => !(x >= 0 && x < width))) return null;
  // A field's item by its place in the field's list: its shared item's value.
  const itemAt = (f: number, i: number): FileValue | null | undefined => {
    const item = pivotFields[f]?.items[i];
    return item ? fields[f]!.items[item.x] : undefined;
  };
  const hides: FilePivotHides[] = [];
  for (const f of new Set([...axisFields, ...pageFields])) {
    const list: PivotHidden[] = [];
    for (const item of pivotFields[f]?.items ?? []) {
      if (!item.hidden) continue;
      const v = fields[f]!.items[item.x];
      if (v === undefined) return null;
      list.push({ v });
    }
    hides.push({ col: f, hides: list });
  }
  const values: StandardValue[] = [];
  for (const d of kids(kid(root, 'dataFields'), 'dataField')) {
    const fld = Number(at(d, 'fld'));
    const summary = SUMMARY[at(d, 'subtotal') ?? 'sum'];
    const showAs = SHOW_AS[at(d, 'showDataAs') ?? 'normal'];
    const field = fields[fld];
    if (!field || !summary || showAs === undefined || field.grouped) return null;
    const label = at(d, 'name');
    const common = {
      summary,
      ...(showAs ? { showAs } : {}),
      ...(label !== undefined ? { label } : {}),
    };
    if (fld < width) values.push({ col: fld, ...common });
    else if (field.formula !== undefined)
      values.push({ formula: `=${field.formula}`, name: field.name, ...common });
    else return null;
  }
  const group = (f: number): StandardGroup | null => {
    const pf = pivotFields[f];
    const sortBy = pf?.scope ? sortScope(pf.scope, colFields, itemAt) : undefined;
    if (sortBy === null) return null;
    return {
      col: f,
      ...(pf?.desc ? { desc: true } : {}),
      subtotals: pf?.subtotals ?? true,
      ...(sortBy ? { sortBy } : {}),
    };
  };
  const rows = rowFields.filter((x) => x !== -2).map(group);
  const columns = colFields.filter((x) => x !== -2).map(group);
  if (rows.includes(null) || columns.includes(null)) return null;
  const pages = pageFields.length ? pageFields.length + 1 : 0;
  const top = Math.max(0, location.r1 - pages);
  return {
    at: { r: top, c: location.c1 },
    output: { rows: location.r2 - top + 1, cols: location.c2 - location.c1 + 1 },
    source: { sheet: cache.sheet === own ? null : cache.sheet, range },
    headers: fields.slice(0, width).map((f) => f.name),
    rows: rows as StandardGroup[],
    columns: columns as StandardGroup[],
    values,
    hides,
    valuesAsRows: rowFields.includes(-2),
    grand: { rows: !off(at(root, 'rowGrandTotals')), cols: !off(at(root, 'colGrandTotals')) },
  };
}

/**
 * A sort by a value an `autoSortScope` names: the data field's place, then the column items its other references name,
 * outermost first, as their labels; undefined when it names no value; null when it names an item LiveDoc cannot find.
 */
function sortScope(
  scope: XmlElement,
  colFields: readonly number[],
  itemAt: (f: number, i: number) => FileValue | null | undefined,
): StandardGroup['sortBy'] | null | undefined {
  const refs = kids(kid(kid(scope, 'pivotArea'), 'references'), 'reference').map((r) => {
    const x = kid(r, 'x');
    return { field: Number(at(r, 'field')), x: x ? Number(at(x, 'v') ?? 0) : -1 };
  });
  const data = refs.find((r) => r.field === XLSX_DATA_FIELD || r.field === -2);
  if (!data) return undefined;
  if (data.x < 0) return null;
  const items: string[] = [];
  for (const f of colFields) {
    const ref = refs.find((r) => r.field === f);
    if (!ref) continue;
    const v = itemAt(f, ref.x);
    if (v === undefined) return null;
    items.push(v === null ? '' : String(v.v));
  }
  if (refs.length - 1 !== items.length) return null;
  return { value: data.x, ...(items.length ? { item: items } : {}) };
}
