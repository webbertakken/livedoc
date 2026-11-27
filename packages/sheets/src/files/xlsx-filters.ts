// Filters in XLSX (docs/specs/029-sheets/standard-mapping.md "Filters in the file"): the sheet's filter as the
// worksheet's `autoFilter` with Excel's hidden `_xlnm._FilterDatabase` name, each filter view as Google writes one (a
// `customSheetView` holding an `autoFilter`, a hidden `Z_<guid>_.wvu.FilterData` name and a `customWorkbookView`
// naming it), each column's standard column (filter-standard.ts) as a `filterColumn`, and LiveDoc's record
// (`livedoc:filters`) in the worksheet's LiveDoc `ext`.
import {
  attributeOf,
  childElement,
  childElements,
  escapeXmlAttribute,
  type XmlElement,
} from '@livedoc/office-packages';
import { formatRange, type GridRange } from '../address';
import { a1Text, FILE_LAST_COL } from './a1-text';
import {
  filterFingerprint,
  filterRecordText,
  filtersFound,
  type FileFilter,
  type FileFilterColumn,
  type FileFilterView,
} from './file-filters';
import type { StandardColumn, StandardOp, StandardTest } from './filter-standard';
import { readSqref } from './xlsx-format-rules';
import { LIVEDOC_SPREADSHEET_NS } from './validation-standard';
import { filteredFromHidden } from './file-lines';
import type { FileLoss, FileSheet } from './workbook-file';

/** Excel's own name for a sheet's filter range. */
export const FILTER_DATABASE_NAME = '_xlnm._FilterDatabase';
// A filter view's range, by its `guid` (Google's and Excel's form).
const VIEW_NAME =
  /^Z_([0-9A-F]{8})_([0-9A-F]{4})_([0-9A-F]{4})_([0-9A-F]{4})_([0-9A-F]{12})_\.wvu\.FilterData$/i;

/** XLSX holds every standard column. */
export const xlsxHeld = (std: StandardColumn): StandardColumn => std;

// ------------------------------------------------------------------------------------------------ writing

const OPERATOR: Record<StandardOp, string | null> = {
  eq: null,
  neq: 'notEqual',
  gt: 'greaterThan',
  gte: 'greaterThanOrEqual',
  lt: 'lessThan',
  lte: 'lessThanOrEqual',
  contains: null,
  notContains: 'notEqual',
  begins: null,
  ends: null,
  empty: null,
  notEmpty: 'notEqual',
};

// A text with Excel's wildcards (`*`, `?`) and its escape (`~`) escaped.
const escapeWild = (text: string) => text.replace(/[*?~]/g, (m) => `~${m}`);

function wildcardOf(t: StandardTest): string {
  switch (t.op) {
    case 'contains':
    case 'notContains':
      return `*${escapeWild(t.v)}*`;
    case 'begins':
      return `${escapeWild(t.v)}*`;
    case 'ends':
      return `*${escapeWild(t.v)}`;
    case 'empty':
    case 'notEmpty':
      return '';
    case 'eq':
    case 'neq':
      return escapeWild(t.v);
    default:
      return t.v;
  }
}

const customFilterXml = (t: StandardTest) => {
  const op = OPERATOR[t.op];
  return `<customFilter${op ? ` operator="${op}"` : ''} val="${escapeXmlAttribute(wildcardOf(t))}"/>`;
};

/** A column's standard column as a `filterColumn`, `colId` its place in the filter's range. */
export function xlsxFilterColumnXml(colId: number, std: StandardColumn): string {
  let inner: string;
  if ('values' in std)
    inner =
      std.values.length === 0
        ? `<filters${std.blank ? ' blank="1"' : ''}/>`
        : `<filters${std.blank ? ' blank="1"' : ''}>${std.values
            .map((v) => `<filter val="${escapeXmlAttribute(v)}"/>`)
            .join('')}</filters>`;
  else if ('day' in std) inner = `<dynamicFilter type="${std.day}"/>`;
  else
    inner = `<customFilters${std.tests.length > 1 && !std.or ? ' and="1"' : ''}>${std.tests
      .map(customFilterXml)
      .join('')}</customFilters>`;
  return `<filterColumn colId="${colId}">${inner}</filterColumn>`;
}

// A filter's range cut to Excel's last column; null when it starts past it.
function inExcel(range: GridRange): GridRange | null {
  if (range.c1 >= FILE_LAST_COL) return null;
  return { ...range, c2: Math.min(range.c2, FILE_LAST_COL - 1) };
}

/** A filter's (or a view's) `autoFilter`, its sort as its `sortState` (Google's form). */
export function xlsxAutoFilterXml(
  range: GridRange,
  cols: readonly FileFilterColumn[],
  sort: FileFilterView['sort'] = [],
): string {
  const columns = cols
    .filter((x) => x.std && x.c >= range.c1 && x.c <= range.c2)
    .map((x) => xlsxFilterColumnXml(x.c - range.c1, x.std!))
    .join('');
  const keys = sort.filter((k) => k.c >= range.c1 && k.c <= range.c2);
  const state = keys.length
    ? `<sortState ref="${formatRange(range)}">${keys
        .map(
          (k) =>
            `<sortCondition${k.desc ? ' descending="1"' : ''} ref="${formatRange({ ...range, c1: k.c, c2: k.c })}"/>`,
        )
        .join('')}</sortState>`
    : '';
  const ref = formatRange(range);
  return columns || state
    ? `<autoFilter ref="${ref}">${columns}${state}</autoFilter>`
    : `<autoFilter ref="${ref}"/>`;
}

/** A view's `guid` (D479): the sheet's place in four hex digits, the view's id in hex, padded, as Excel writes one. */
export function filterViewGuid(sheet: number, key: string): string {
  const hex = (
    sheet.toString(16).padStart(4, '0') +
    [...key].map((ch) => ch.charCodeAt(0).toString(16).padStart(2, '0')).join('')
  )
    .padEnd(32, '0')
    .slice(0, 32)
    .toUpperCase();
  return `{${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}}`;
}

const rangeName = (title: string, range: GridRange) =>
  escapeXmlAttribute(a1Text({ sheet: title, ...range, a: 15 }, true));

/** What a sheet's filter and views write: its worksheet's children, its record, the workbook's names and views. */
export type XlsxFiltersOut = {
  own: { name: string; xml: string }[];
  record: string | null;
  names: string[];
  views: string[];
};

/** A sheet's filter and filter views as XLSX (`index` its place, `title` its name as written). */
export function xlsxFiltersOut(sheet: FileSheet, index: number, title: string): XlsxFiltersOut {
  const out: XlsxFiltersOut = { own: [], record: null, names: [], views: [] };
  const filter = sheet.filter && inExcel(sheet.filter.range);
  const views = (sheet.filterViews ?? []).flatMap((v) => {
    const range = inExcel(v.range);
    return range ? [{ ...v, range }] : [];
  });
  // Excel refuses a sheet's `autoFilter` over a table's cells: such a filter is LiveDoc's record's alone.
  const beside = (sheet.tables ?? []).some(
    (t) =>
      filter &&
      t.range.r1 <= filter.r2 &&
      filter.r1 <= t.range.r2 &&
      t.range.c1 <= filter.c2 &&
      filter.c1 <= t.range.c2,
  );
  const standardFilter = beside ? null : filter;
  if (standardFilter) {
    out.own.push({
      name: 'autoFilter',
      xml: xlsxAutoFilterXml(standardFilter, sheet.filter!.cols),
    });
    out.names.push(
      `<definedName name="${FILTER_DATABASE_NAME}" localSheetId="${index}" hidden="1">${rangeName(title, standardFilter)}</definedName>`,
    );
  }
  if (views.length) {
    const each = views.map((v, i) => {
      const guid = filterViewGuid(index, v.key ?? String(i));
      const bare = guid.slice(1, -1).replace(/-/g, '_');
      out.names.push(
        `<definedName name="Z_${bare}_.wvu.FilterData" localSheetId="${index}" hidden="1">${rangeName(title, v.range)}</definedName>`,
      );
      out.views.push(
        `<customWorkbookView name="${escapeXmlAttribute(v.name)}" guid="${guid}" activeSheetId="${index}" maximized="1" windowWidth="0" windowHeight="0"/>`,
      );
      return `<customSheetView guid="${guid}" filter="1" showAutoFilter="1">${xlsxAutoFilterXml(v.range, v.cols, v.sort)}</customSheetView>`;
    });
    out.own.push({
      name: 'customSheetViews',
      xml: `<customSheetViews>${each.join('')}</customSheetViews>`,
    });
  }
  if (filter || views.length) {
    const standard = standardFilter
      ? { range: standardFilter, cols: sheet.filter!.cols }
      : undefined;
    const text = filterRecordText(filter ? { ...sheet.filter!, range: filter } : undefined, views);
    const fingerprint = filterFingerprint(standard, views, xlsxHeld);
    out.record = `<livedoc:filters record="${escapeXmlAttribute(text)}" fingerprint="${fingerprint}"/>`;
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ reading

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
function autoFilterOf(
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
