// Pivot tables in ODF, read back (docs/specs/029-sheets/standard-mapping.md "Pivot tables in the file", D607): a data
// pilot table holding LiveDoc's record, whose fingerprint is its standard form's as read, is its sheet's pivot table
// again and leaves the kept `table:data-pilot-tables`; any other stays the file's own, as it came.
import {
  attributeOf,
  childElement,
  childElements,
  type XmlElement,
  type XmlParsed,
} from '@livedoc/office-packages';
import { columnIndex, type GridRange } from '../address';
import {
  pivotFingerprint,
  pivotSourceText,
  readPivotRecord,
  type FilePivot,
  type PivotStandard,
} from './file-pivots';
import type { FileAt, KeptItem } from './kept-content';
import { LIVEDOC_SPREADSHEET_NS } from './validation-standard';
import type { FileLoss, FileSheet } from './workbook-file';

const TABLE = 'urn:oasis:names:tc:opendocument:xmlns:table:1.0';

// One end of an ODF range address: its sheet (quotes undone; none when left out), column and row.
const END = /^(?:(?:'((?:[^']|'')*)'|([^.']*))\.)?\$?([A-Za-z]{1,3})\$?(\d+)$/;

/** An ODF range address (`'Sales'.A1:'Sales'.F25`, `Sales.$A$1:.$F$25`): its sheet and its cells; null for another. */
export function parseOdfRange(text: string): { sheet: string; range: GridRange } | null {
  const [from, to] = text.split(':');
  const a = from ? END.exec(from) : null;
  const b = to ? END.exec(to) : null;
  const sheet = a && (a[1] !== undefined ? a[1].replace(/''/g, "'") : a[2]);
  if (!a || !b || !sheet) return null;
  const r1 = Number(a[4]) - 1;
  const r2 = Number(b[4]) - 1;
  const c1 = columnIndex(a[3]!.toUpperCase());
  const c2 = columnIndex(b[3]!.toUpperCase());
  if (r1 < 0 || r2 < r1 || c2 < c1) return null;
  return { sheet, range: { r1, c1, r2, c2 } };
}

/** A data pilot table's standard form, its sheet, and LiveDoc's record beside it; null when it holds no record. */
export function readOdsDataPilot(
  table: XmlElement,
): {
  sheet: string;
  standard: PivotStandard;
  pages: number;
  record: string;
  fingerprint: string;
} | null {
  const record = attributeOf(table, LIVEDOC_SPREADSHEET_NS, 'pivot');
  const fingerprint = attributeOf(table, LIVEDOC_SPREADSHEET_NS, 'pivot-fingerprint');
  const target = parseOdfRange(attributeOf(table, TABLE, 'target-range-address') ?? '');
  const range = childElement(table, TABLE, 'source-cell-range');
  const source = parseOdfRange(
    range ? (attributeOf(range, TABLE, 'cell-range-address') ?? '') : '',
  );
  if (record === undefined || fingerprint === undefined || !target || !source) return null;
  const by: Record<string, string[]> = { row: [], column: [], page: [], data: [] };
  for (const field of childElements(table)) {
    if (field.local !== 'data-pilot-field' || field.uri !== TABLE) continue;
    if (attributeOf(field, TABLE, 'is-data-layout-field') === 'true') continue;
    const name = attributeOf(field, TABLE, 'source-field-name') ?? '';
    const orientation = attributeOf(field, TABLE, 'orientation') ?? '';
    const fn = attributeOf(field, TABLE, 'function') ?? 'auto';
    by[orientation]?.push(orientation === 'data' ? `data ${name} ${fn}` : `${orientation} ${name}`);
  }
  const fields = [...by.row!, ...by.column!, ...by.page!, ...by.data!];
  return {
    sheet: target.sheet,
    standard: {
      location: target.range,
      source: pivotSourceText(source.sheet, source.range),
      fields,
    },
    pages: by.page!.length,
    record,
    fingerprint,
  };
}

/**
 * The sheets' pivot tables LiveDoc wrote and no app changed since (D607), and the kept items without them: each read
 * one leaves the kept `table:data-pilot-tables`, which goes when none is left. A record another app's change left
 * behind is named (`pivot_changed`, logged only).
 */
export function readOdsPivots(
  parsed: XmlParsed,
  spreadsheet: XmlElement,
  sheets: readonly FileSheet[],
  items: readonly KeptItem<FileAt>[],
  losses: FileLoss[],
): { sheets: FileSheet[]; items: KeptItem<FileAt>[] } {
  const holder = childElement(spreadsheet, TABLE, 'data-pilot-tables');
  if (!holder) return { sheets: [...sheets], items: [...items] };
  const found = new Map<number, FilePivot[]>();
  const read: string[] = [];
  for (const table of childElements(holder)) {
    const pilot = table.local === 'data-pilot-table' ? readOdsDataPilot(table) : null;
    const at = pilot ? sheets.findIndex((s) => s.name === pilot.sheet) : -1;
    if (!pilot || at < 0) continue;
    const record =
      pilot.fingerprint === pivotFingerprint(pilot.standard) ? readPivotRecord(pilot.record) : null;
    if (!record) {
      losses.push({ k: 'pivot_changed', sheet: pilot.sheet });
      continue;
    }
    const { location } = pilot.standard;
    found.set(at, [
      ...(found.get(at) ?? []),
      {
        ...record,
        headers: [],
        items: [],
        output: {
          rows: location.r2 - location.r1 + 1 - (pilot.pages ? pilot.pages + 1 : 0),
          cols: location.c2 - location.c1 + 1,
        },
      },
    ]);
    read.push(parsed.source.slice(table.start, table.end));
  }
  if (read.length === 0) return { sheets: [...sheets], items: [...items] };
  const whole = parsed.source.slice(holder.start, holder.end);
  const out = items.flatMap((item) => {
    if (item.xml !== whole) return [item];
    const xml = read.reduce((x, t) => x.replace(t, ''), item.xml);
    return /<[\w.-]+:data-pilot-table\b/.test(xml) ? [{ ...item, xml }] : [];
  });
  return {
    sheets: sheets.map((s, i) => (found.has(i) ? { ...s, pivots: found.get(i)! } : s)),
    items: out,
  };
}
