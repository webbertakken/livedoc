// Filters read from XLSX (docs/specs/029-sheets/standard-mapping.md "Filters in the file"): the worksheet's
// `autoFilter` and the `customSheetView`s holding one, each `filterColumn` as its standard column, the workbook's views
// naming them, and LiveDoc's record weighed against them; the writer is xlsx-filters.ts.
import {
  attributeOf,
  childElement,
  childElements,
  type XmlElement,
} from '@livedoc/office-packages';
import type { GridRange } from '../address';
import type { FileFilter, FileFilterColumn, FileFilterView } from './file-filters';
import { filteredFromHidden } from './file-lines';
import { filtersFound } from './filter-record';
import type { StandardColumn, StandardOp, StandardTest } from './filter-standard';
import { LIVEDOC_SPREADSHEET_NS } from './validation-standard';
import { FILTER_DATABASE_NAME, xlsxHeld } from './xlsx-filters';
import { readSqref } from './xlsx-format-rules';
import type { FileLoss, FileSheet } from './workbook-file';

// A filter view's range, by its `guid` (Google's and Excel's form).
const VIEW_NAME =
  /^Z_([0-9A-F]{8})_([0-9A-F]{4})_([0-9A-F]{4})_([0-9A-F]{4})_([0-9A-F]{12})_\.wvu\.FilterData$/i;

const READ_OPERATOR: Record<string, StandardOp> = {
  equal: 'eq',
  notEqual: 'neq',
  greaterThan: 'gt',
  greaterThanOrEqual: 'gte',
  lessThan: 'lt',
  lessThanOrEqual: 'lte',
};

// A wildcard text's parts: its text between unescaped `*`s, and whether it holds an unescaped `?`.
function wildParts(val: string): { parts: string[]; question: boolean } {
  const parts: string[] = [];
  let part = '';
  let question = false;
  for (let i = 0; i < val.length; i++) {
    const ch = val[i]!;
    if (ch === '~' && i + 1 < val.length) part += val[++i];
    else if (ch === '*') {
      parts.push(part);
      part = '';
    } else {
      if (ch === '?') question = true;
      part += ch;
    }
  }
  parts.push(part);
  return { parts, question };
}

// A `customFilter` as a test; null when LiveDoc has none for it.
function testOf(element: XmlElement): StandardTest | null {
  const op = READ_OPERATOR[attributeOf(element, '', 'operator') ?? 'equal'];
  const val = attributeOf(element, '', 'val') ?? '';
  if (!op) return null;
  if (op !== 'eq' && op !== 'neq') return { op, v: val };
  // Excel writes a blank test as a space.
  if (val.trim() === '') return { op: op === 'eq' ? 'empty' : 'notEmpty', v: '' };
  const { parts, question } = wildParts(val);
  if (question) return null;
  if (parts.length === 1) return { op, v: parts[0]! };
  if (parts.length === 3 && parts[0] === '' && parts[2] === '')
    return { op: op === 'eq' ? 'contains' : 'notContains', v: parts[1]! };
  if (op === 'neq' || parts.length !== 2) return null;
  if (parts[1] === '') return { op: 'begins', v: parts[0]! };
  if (parts[0] === '') return { op: 'ends', v: parts[1]! };
  return null;
}

const DAYS = new Set(['today', 'tomorrow', 'yesterday']);

/** A `filterColumn`'s standard column; null for a form LiveDoc has no condition for (a top ten, a colour filter). */
export function readXlsxFilterColumn(column: XmlElement, ns: string): StandardColumn | null {
  const forms = childElements(column).filter((e) => e.uri === ns);
  if (forms.length !== 1) return null;
  const form = forms[0]!;
  if (form.local === 'filters') {
    const items = childElements(form).filter((e) => e.uri === ns);
    if (items.some((e) => e.local !== 'filter')) return null;
    const values = items.map((e) => attributeOf(e, '', 'val') ?? '');
    const blank = ['1', 'true'].includes(attributeOf(form, '', 'blank') ?? '');
    return blank ? { values, blank: true } : { values };
  }
  if (form.local === 'dynamicFilter') {
    const type = attributeOf(form, '', 'type') ?? '';
    return DAYS.has(type) ? { day: type as 'today' } : null;
  }
  if (form.local !== 'customFilters') return null;
  const tests = childElements(form)
    .filter((e) => e.uri === ns && e.local === 'customFilter')
    .map(testOf);
  if (tests.length === 0 || tests.length > 2 || tests.some((t) => t === null)) return null;
  const and = ['1', 'true'].includes(attributeOf(form, '', 'and') ?? '');
  return tests.length === 2 && !and
    ? { tests: tests as StandardTest[], or: true }
    : { tests: tests as StandardTest[] };
}

const ref = (text: string | undefined): GridRange | null => {
  const [range] = (text === undefined ? null : readSqref(text.replace(/\$/g, ''))) ?? [];
  return range ?? null;
};

// An `autoFilter` read: its range and columns (one LiveDoc cannot read has no standard column), and its sort.
export function autoFilterOf(
  element: XmlElement,
  ns: string,
): { range: GridRange; cols: FileFilterColumn[]; sort?: FileFilterView['sort'] } | null {
  const range = ref(attributeOf(element, '', 'ref'));
  if (!range) return null;
  const cols: FileFilterColumn[] = [];
  for (const column of childElements(element)) {
    if (column.uri !== ns || column.local !== 'filterColumn') continue;
    const colId = Number(attributeOf(column, '', 'colId'));
    if (!Number.isInteger(colId) || colId < 0 || range.c1 + colId > range.c2) continue;
    const std = readXlsxFilterColumn(column, ns);
    cols.push({ c: range.c1 + colId, ...(std ? { std } : {}) });
  }
  const state = childElement(element, ns, 'sortState');
  const sort = (state ? childElements(state) : []).flatMap((k) => {
    if (k.uri !== ns || k.local !== 'sortCondition') return [];
    const at = ref(attributeOf(k, '', 'ref'));
    if (!at) return [];
    const desc = ['1', 'true'].includes(attributeOf(k, '', 'descending') ?? '');
    return [{ c: at.c1, ...(desc ? { desc: true as const } : {}) }];
  });
  return { range, cols, ...(sort.length ? { sort } : {}) };
}

/** A worksheet's filter and filter views as read, with the elements LiveDoc holds (so not kept). */
export type XlsxFiltersRead = {
  filter?: FileFilter;
  // Each with its `guid`, which names it in the workbook's views.
  views: (FileFilterView & { guid: string })[];
  read: Set<XmlElement>;
  record?: { text: string; fingerprint: string | undefined };
};

/** A worksheet's `autoFilter` and the `customSheetView`s holding one; another custom view stays the file's. */
export function readXlsxFilters(
  root: XmlElement,
  ns: string,
  ext: XmlElement | undefined,
): XlsxFiltersRead {
  const out: XlsxFiltersRead = { views: [], read: new Set() };
  const auto = childElement(root, ns, 'autoFilter');
  const filter = auto && autoFilterOf(auto, ns);
  if (auto && filter) {
    out.filter = { range: filter.range, cols: filter.cols };
    out.read.add(auto);
  }
  const holder = childElement(root, ns, 'customSheetViews');
  for (const view of holder ? childElements(holder) : []) {
    if (view.uri !== ns || view.local !== 'customSheetView') continue;
    const inner = childElement(view, ns, 'autoFilter');
    const read = inner && autoFilterOf(inner, ns);
    const guid = attributeOf(view, '', 'guid');
    if (!read || !guid) continue;
    out.views.push({ name: '', ...read, guid: guid.toUpperCase() });
    out.read.add(view);
  }
  const record = ext && childElement(ext, LIVEDOC_SPREADSHEET_NS, 'filters');
  const text = record && attributeOf(record, '', 'record');
  if (text !== undefined)
    out.record = { text, fingerprint: record && attributeOf(record, '', 'fingerprint') };
  return out;
}

/** Whether a defined name is one LiveDoc writes for a filter it read: Excel's filter range, a read view's range. */
export function isFilterName(name: string, viewGuids: ReadonlySet<string>): boolean {
  if (name.toLowerCase() === FILTER_DATABASE_NAME.toLowerCase()) return true;
  const m = VIEW_NAME.exec(name);
  return m !== null && viewGuids.has(`{${m.slice(1).join('-')}}`.toUpperCase());
}

/** The workbook's `customWorkbookView`s naming read views: their names by `guid`, and their elements (so not kept). */
export function readXlsxWorkbookViews(
  workbook: XmlElement,
  ns: string,
  viewGuids: ReadonlySet<string>,
): { names: Map<string, string>; read: Set<XmlElement> } {
  const names = new Map<string, string>();
  const read = new Set<XmlElement>();
  const holder = childElement(workbook, ns, 'customWorkbookViews');
  for (const view of holder ? childElements(holder) : []) {
    const guid = (attributeOf(view, '', 'guid') ?? '').toUpperCase();
    if (view.uri !== ns || view.local !== 'customWorkbookView' || !viewGuids.has(guid)) continue;
    names.set(guid, attributeOf(view, '', 'name') ?? '');
    read.add(view);
  }
  return { names, read };
}

/**
 * A sheet read with its filter and views: each view named by its workbook view (`Filter N` without one), LiveDoc's
 * record taken while its fingerprint holds (`filters_changed` when dropped), and the hidden rows of a filter with a
 * condition read as the filter's (D478) but those the record hides by hand.
 */
export function withXlsxFilters(
  sheet: FileSheet,
  read: XlsxFiltersRead,
  names: ReadonlyMap<string, string>,
  losses: FileLoss[],
): FileSheet {
  if (!read.filter && read.views.length === 0 && !read.record) return sheet;
  const views = read.views.map(({ guid, ...v }, i) => ({
    ...v,
    name: names.get(guid) || `Filter ${i + 1}`,
  }));
  const found = filtersFound(
    { ...(read.filter ? { filter: read.filter } : {}), views },
    read.record,
    xlsxHeld,
  );
  if (found.changed) losses.push({ k: 'filters_changed', sheet: sheet.name });
  const f = found.filter;
  const byHand = new Set(f?.hidden ?? []);
  const lines =
    f && f.cols.length
      ? filteredFromHidden(sheet.lines, (p) => p > f.range.r1 && p <= f.range.r2 && !byHand.has(p))
      : sheet.lines;
  return {
    ...sheet,
    ...(lines ? { lines } : {}),
    ...(f ? { filter: f } : {}),
    ...(found.views.length ? { filterViews: found.views } : {}),
  };
}
