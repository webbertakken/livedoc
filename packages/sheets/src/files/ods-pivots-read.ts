// Pivot tables in ODF, read (docs/specs/029-sheets/standard-mapping.md "Pivot tables in the file", D607 to D609): a data
// pilot table holding LiveDoc's record, whose fingerprint is its standard form's as read, is its sheet's pivot table
// again; any other is read from its standard form when the model holds it. Either leaves the kept
// `table:data-pilot-tables`; one the model cannot hold stays the file's own, as it came.
import {
  attributeOf,
  childElement,
  childElements,
  type XmlElement,
  type XmlParsed,
} from '@livedoc/office-packages';
import {
  pivotFingerprint,
  pivotSourceText,
  readPivotRecord,
  type FilePivot,
  type PivotStandard,
} from './file-pivots';
import type { GridRange } from '../address';
import { heldPivotOfStandard, plainText } from './pivot-standard';
import { parseOdfRange, readOdsStandard } from './ods-pivot-standard';
import type { FileAt, KeptItem } from './kept-content';
import { LIVEDOC_SPREADSHEET_NS } from './validation-standard';
import type { FileLoss, FileSheet } from './workbook-file';

const TABLE = 'urn:oasis:names:tc:opendocument:xmlns:table:1.0';

/** A data pilot table's standard form, its sheet, and LiveDoc's record beside it; null when it holds no record. */
export function readOdsDataPilot(table: XmlElement): {
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

// A source's header texts: each cell of its first row as its value reads, blank for none.
function headerTexts(sheet: FileSheet, range: GridRange): string[] {
  const out = Array.from({ length: range.c2 - range.c1 + 1 }, () => '');
  for (const cell of sheet.cells)
    if (cell.r === range.r1 && cell.c >= range.c1 && cell.c <= range.c2)
      out[cell.c - range.c1] = plainText(cell.value);
  return out;
}

/**
 * The sheets' pivot tables, and the kept items without them: each LiveDoc wrote and no app changed since by its
 * record (D607), any other from its standard form when the model holds it (D608); each read one leaves the kept
 * `table:data-pilot-tables`, which goes when none is left. A record another app's change left behind is named
 * (`pivot_changed`, logged only), and a pivot table the model cannot hold stays kept, named (`pivot_unread`, D609).
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
  const names = sheets.map((s) => s.name);
  const add = (at: number, p: FilePivot) => found.set(at, [...(found.get(at) ?? []), p]);
  for (const table of childElements(holder)) {
    if (table.local !== 'data-pilot-table' || table.uri !== TABLE) continue;
    const pilot = readOdsDataPilot(table);
    const at = pilot ? names.indexOf(pilot.sheet) : -1;
    const record =
      pilot && at >= 0 && pilot.fingerprint === pivotFingerprint(pilot.standard)
        ? readPivotRecord(pilot.record)
        : null;
    if (pilot && at >= 0 && !record) losses.push({ k: 'pivot_changed', sheet: pilot.sheet });
    if (record) {
      const { location } = pilot!.standard;
      add(at, {
        ...record,
        headers: [],
        items: [],
        output: {
          rows: location.r2 - location.r1 + 1 - (pilot!.pages ? pilot!.pages + 1 : 0),
          cols: location.c2 - location.c1 + 1,
        },
      });
    } else {
      // Another app's pivot table, or one it changed, is read from its standard form when the model holds it (D608).
      const standard = readOdsStandard(table, names, (name, range) =>
        headerTexts(sheets[names.indexOf(name)]!, range),
      );
      const held = heldPivotOfStandard(standard);
      if (!standard || !held) {
        const target = parseOdfRange(attributeOf(table, TABLE, 'target-range-address') ?? '');
        losses.push({
          k: 'pivot_unread',
          sheet: target?.sheet ?? attributeOf(table, TABLE, 'name') ?? '',
        });
        continue;
      }
      add(names.indexOf(standard.sheet), held);
    }
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
