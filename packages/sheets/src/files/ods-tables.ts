// Tables in ODF (docs/specs/029-sheets/standard-mapping.md "Tables in the file"): each table a `table:database-range`
// in the spreadsheet's one `table:database-ranges`, as LibreOffice writes one; OpenFormula has no table reference, so a
// formula reading a table is written with the plain absolute ranges it reads, and LiveDoc's record on the
// `table:table` (`livedoc:tables`, `livedoc:tables-fingerprint`) restores its table references while its fingerprint
// holds. A database range LiveDoc does not hold stays the file's own.
import {
  attributeOf,
  childElement,
  childElements,
  escapeXmlAttribute,
  ODF_NS,
  type XmlElement,
} from '@livedoc/office-packages';
import { formatA1 } from '../address';
import { tableFormulaName } from '../tables/table';
import {
  heldTables,
  tableFingerprint,
  tableRecordText,
  tablesFound,
  type FileTable,
  type TableCandidate,
} from './file-tables';
import { parseOdfRef } from './ods-charts-read';
import {
  ANONYMOUS_RANGE,
  odsFilterRange,
  odsFilterTable,
  odsFilterXml,
  readOdsFilter,
} from './ods-filters';
import type { FileFilter } from './file-filters';
import { fromOpenFormula, toOpenFormula } from './open-formula';
import { LIVEDOC_SPREADSHEET_NS } from './validation-standard';
import type { FileCell, FileLoss, FileSheet, WorkbookFile } from './workbook-file';

const { table: TABLE } = ODF_NS;

/** The formula text an ODF cell holds for a file cell: its plain form when it reads a table. */
export const odsFormulaOf = (cell: FileCell): string | null =>
  cell.formula === undefined ? null : toOpenFormula(cell.plain ?? cell.formula);

// A cell's line of the fingerprint: its place and its formula as a reader reads it back from what is written.
const refLine = (a1: string, formula: string) => `${a1} ${formula}`;

/** The formulas a sheet's record restores: each written cell reading a table, its formula in Google's syntax. */
function recordedRefs(sheet: FileSheet): { refs: Record<string, string>; lines: string[] } {
  const refs: Record<string, string> = {};
  const lines: string[] = [];
  for (const cell of sheet.cells) {
    if (cell.plain === undefined || cell.formula === undefined) continue;
    const written = odsFormulaOf(cell);
    const read = written === null ? null : fromOpenFormula(written);
    if (read === null) continue;
    const a1 = formatA1(cell.r, cell.c);
    refs[a1] = cell.formula;
    lines.push(refLine(a1, read));
  }
  return { refs, lines };
}

/**
 * A sheet's record of its tables as `table:table` attributes; none for a sheet without tables. `declared` when the
 * table's other attributes (its protections' record) declare LiveDoc's namespace already.
 */
export function odsTableRecordAttributes(sheet: FileSheet, declared: boolean): string {
  const tables = sheet.tables ?? [];
  if (tables.length === 0) return '';
  const { refs, lines } = recordedRefs(sheet);
  return (
    (declared ? '' : ` xmlns:livedoc="${LIVEDOC_SPREADSHEET_NS}"`) +
    ` livedoc:tables="${escapeXmlAttribute(tableRecordText(tables, refs))}"` +
    ` livedoc:tables-fingerprint="${tableFingerprint(tables, lines)}"`
  );
}

/** Whether a table's attribute is LiveDoc's record of its tables (so not kept). */
export const isOdsTableRecordAttribute = (a: { uri: string; local: string }): boolean =>
  a.uri === LIVEDOC_SPREADSHEET_NS && (a.local === 'tables' || a.local === 'tables-fingerprint');

const quoted = (sheet: string) => `'${sheet.replace(/'/g, "''")}'`;

/** The workbook's tables as `table:database-range`s, by their sheets' names, then each sheet's filter. */
export function odsDatabaseRanges(file: WorkbookFile): string[] {
  const filters = file.sheets.flatMap((sheet, i) => odsFilterRange(sheet, i) ?? []);
  return file.sheets
    .flatMap((sheet) =>
      (sheet.tables ?? []).map((t) => {
        const at = quoted(sheet.name);
        const range = `${at}.${formatA1(t.range.r1, t.range.c1)}:${at}.${formatA1(t.range.r2, t.range.c2)}`;
        // The sheet's filter over exactly this table is the table's own (D481).
        const filter =
          sheet.filter && odsFilterTable(sheet) === t ? odsFilterXml(sheet.filter, t.range.c1) : '';
        const open =
          `<table:database-range table:name="${escapeXmlAttribute(tableFormulaName(t.name))}"` +
          ` table:target-range-address="${escapeXmlAttribute(range)}" table:contains-header="true"` +
          ` table:display-filter-buttons="true"`;
        return filter ? `${open}>${filter}</table:database-range>` : `${open}/>`;
      }),
    )
    .concat(filters);
}

const HOLDER = /^<([\w.-]+:database-ranges)\b([^>]*?)(\/?)>/;

/**
 * The kept content after the tables with the workbook's own database ranges in its one `table:database-ranges`: inside
 * the kept one, after its children; else one of their own after the named ranges (the schema's order).
 */
export function withDatabaseRanges(after: readonly string[], own: readonly string[]): string[] {
  if (own.length === 0) return [...after];
  const at = after.findIndex((xml) => HOLDER.test(xml));
  if (at < 0) {
    const names = after.findIndex((xml) => /^<[\w.-]+:named-expressions\b/.test(xml));
    const holder = `<table:database-ranges>${own.join('')}</table:database-ranges>`;
    return [...after.slice(0, names + 1), holder, ...after.slice(names + 1)];
  }
  const m = HOLDER.exec(after[at]!)!;
  const xml = m[3]
    ? `<${m[1]}${m[2]}>${own.join('')}</${m[1]}>`
    : after[at]!.slice(0, after[at]!.lastIndexOf('</')) +
      own.join('') +
      after[at]!.slice(after[at]!.lastIndexOf('</'));
  return after.with(at, xml);
}

/** A spreadsheet's database ranges as tables: by sheet, each held one's element and table. */
export type OdsTablesRead = {
  // The database ranges LiveDoc holds, read (so not kept).
  read: Set<XmlElement>;
  // By sheet (its place in `titles`), its tables' standard form in order.
  standard: FileTable[][];
  // By sheet, its filter's standard form: its unnamed database range (standard-mapping.md "Filters in the file").
  filters: (FileFilter | undefined)[];
};

/**
 * The spreadsheet's database ranges LiveDoc holds as tables (`titles` the sheets read, `names` the workbook's named
 * ranges): one with a header over one sheet's cells, of a name the rules take; any other is named (`table_unread`)
 * and stays kept, but a sheet's own unnamed one, an autofilter's, which is the sheet's filter.
 */
export function readOdsDatabaseRanges(
  spreadsheet: XmlElement,
  titles: readonly string[],
  names: readonly string[],
  losses: FileLoss[],
): OdsTablesRead {
  const holder = childElement(spreadsheet, TABLE, 'database-ranges');
  const found: { element: XmlElement; sheet: number; candidate: TableCandidate }[] = [];
  const filters: OdsTablesRead['filters'] = titles.map(() => undefined);
  const filtered = new Set<XmlElement>();
  for (const element of holder ? childElements(holder) : []) {
    if (element.uri !== TABLE || element.local !== 'database-range') continue;
    const name = attributeOf(element, TABLE, 'name') ?? '';
    const ref = parseOdfRef(attributeOf(element, TABLE, 'target-range-address') ?? '');
    const sheet = ref ? titles.indexOf(ref.sheet) : -1;
    if (ANONYMOUS_RANGE.test(name)) {
      // One a sheet; another on a sheet already filtered, or on none, stays the file's own.
      if (!ref || sheet < 0 || filters[sheet]) continue;
      const filter = childElement(element, TABLE, 'filter');
      filters[sheet] = { range: ref.range, cols: filter ? readOdsFilter(filter, ref.range) : [] };
      filtered.add(element);
      continue;
    }
    if (!ref || sheet < 0) {
      losses.push({ k: 'table_unread', sheet: ref?.sheet ?? '', name });
      continue;
    }
    const header = attributeOf(element, TABLE, 'contains-header') !== 'false';
    found.push({ element, sheet, candidate: { name, range: ref.range, header, total: false } });
  }
  const bySheet = titles.map((_, i) => found.filter((f) => f.sheet === i));
  const held = heldTables(
    bySheet.map((list) => list.map((f) => f.candidate)),
    names,
  );
  const out: OdsTablesRead = { read: filtered, standard: titles.map(() => []), filters };
  bySheet.forEach((list, i) =>
    list.forEach((f, at) => {
      if (!held[i]![at]) {
        losses.push({ k: 'table_unread', sheet: titles[i]!, name: f.candidate.name });
        return;
      }
      out.read.add(f.element);
      out.standard[i]!.push({ name: f.candidate.name, range: f.candidate.range, columns: [] });
      // A table's own `table:filter` is the sheet's filter over it (D481), unless the sheet has another.
      const filter = childElement(f.element, TABLE, 'filter');
      if (filter && !filters[i])
        filters[i] = { range: f.candidate.range, cols: readOdsFilter(filter, f.candidate.range) };
    }),
  );
  return out;
}

/** LiveDoc's record of a `table:table`'s tables, if it holds one. */
export function readOdsTableRecord(
  table: XmlElement,
): { text: string; fingerprint: string | undefined } | undefined {
  const text = attributeOf(table, LIVEDOC_SPREADSHEET_NS, 'tables');
  return text === undefined
    ? undefined
    : { text, fingerprint: attributeOf(table, LIVEDOC_SPREADSHEET_NS, 'tables-fingerprint') };
}

/**
 * A sheet with its tables: LiveDoc's record while its fingerprint holds, its recorded formulas restored on their
 * cells; else the standard form (`tables_changed` when a record was dropped).
 */
export function withOdsTables(
  sheet: FileSheet,
  standard: FileTable[],
  record: { text: string; fingerprint: string | undefined } | undefined,
  losses: FileLoss[],
): FileSheet {
  if (standard.length === 0 && !record) return sheet;
  const byA1 = new Map(sheet.cells.map((c) => [formatA1(c.r, c.c), c]));
  const found = tablesFound({
    standard,
    ...(record ? { record } : {}),
    refLine: (a1) => {
      const formula = byA1.get(a1)?.formula;
      return formula === undefined ? null : refLine(a1, formula);
    },
  });
  if (found.changed) losses.push({ k: 'tables_changed', sheet: sheet.name });
  if (found.tables.length === 0) return sheet;
  const refs = found.refs ?? {};
  const cells = Object.keys(refs).length
    ? sheet.cells.map((c) => {
        const formula = refs[formatA1(c.r, c.c)];
        return formula === undefined ? c : { ...c, formula };
      })
    : sheet.cells;
  return { ...sheet, cells, tables: found.tables };
}
