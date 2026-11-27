// Tables in XLSX (docs/specs/029-sheets/standard-mapping.md "Tables in the file", D452, D453): each table a table part
// linked from its worksheet's `tableParts`, its header cells its column names as text, LiveDoc's exact record in the
// worksheet's LiveDoc `ext`, fingerprinted. Read, each kept table part LiveDoc holds leaves the kept content and
// becomes the sheet's table; any other stays the file's own, written back as it came.
import {
  attributeOf,
  childElement,
  childElements,
  escapeXmlAttribute,
  OOXML_CONTENT_TYPES,
  parseXml,
  RELATIONSHIP_TYPES,
  XML_DECLARATION,
  type OoxmlPart,
  type Relationship,
} from '@livedoc/office-packages';
import { formatRange } from '../address';
import { tableFormulaName } from '../tables/table';
import { FILE_LAST_COL } from './a1-text';
import {
  heldTables,
  tableFingerprint,
  tableRecordText,
  tablesFound,
  type FileTable,
  type TableCandidate,
} from './file-tables';
import { keptLocalName, type FileAt, type KeptContent } from './kept-content';
import { withDxfsNamed } from './xlsx-kept-read';
import { readSqref } from './xlsx-format-rules';
import { SPREADSHEETML_NS } from './xlsx-parts';
import { LIVEDOC_SPREADSHEET_NS } from './validation-standard';
import type { FileCell, FileLoss, FileSheet } from './workbook-file';

/** The table style LiveDoc names: its look is the table's banding, written as format rules. */
export const XLSX_TABLE_STYLE = 'TableStyleLight1';

const decode = (data: Uint8Array) => new TextDecoder().decode(data);

/** A kept table part: its sheet, the worksheet's relationship to it, its part's name and what it reads as. */
type KeptTable = {
  sheet: number;
  relId: string;
  part: string;
  // Its table as read; null when it does not read as one LiveDoc could hold (it reaches other parts, say).
  table: (TableCandidate & { columns: string[]; id: number }) | null;
};

// A table part read: its name, cells, header and total rows and column names; null when it is not one.
function readTablePart(xml: string): KeptTable['table'] {
  const parsed = parseXml(xml);
  if (!parsed.ok || parsed.root.local !== 'table' || parsed.root.uri !== SPREADSHEETML_NS)
    return null;
  const root = parsed.root;
  const name = attributeOf(root, '', 'displayName') ?? attributeOf(root, '', 'name');
  const ranges = readSqref(attributeOf(root, '', 'ref') ?? '');
  if (!name || ranges?.length !== 1) return null;
  const holder = childElement(root, SPREADSHEETML_NS, 'tableColumns');
  const columns = (holder ? childElements(holder) : [])
    .filter((e) => e.local === 'tableColumn')
    .map((e) => attributeOf(e, '', 'name') ?? '');
  return {
    name,
    range: ranges[0]!,
    columns,
    header: (attributeOf(root, '', 'headerRowCount') ?? '1') !== '0',
    total: Number(attributeOf(root, '', 'totalsRowCount') ?? 0) > 0,
    id: Number(attributeOf(root, '', 'id') ?? 0),
  };
}

const TABLE_PART = /<(?:[\w.-]+:)?tablePart\b[^>]*?\s(?:[\w.-]+:)?id="([^"]*)"[^>]*\/>/g;

/** A file's kept table parts, each sheet's in its `tableParts`' order. */
export function keptTables(kept: KeptContent | undefined): KeptTable[] {
  if (!kept || kept.standard !== 'ooxml') return [];
  const parts = new Map(kept.parts.map((p) => [p.name, p]));
  const out: KeptTable[] = [];
  for (const item of kept.items) {
    if (item.place !== 'worksheet' || keptLocalName(item.xml) !== 'tableParts') continue;
    const sheet = item.at.sheet!;
    for (const [, relId] of item.xml.matchAll(TABLE_PART)) {
      const rel = kept.relationships.find(
        (r) => r.from === 'sheet' && r.at.sheet === sheet && r.id === relId && !r.external,
      );
      const part = rel && parts.get(rel.target.replace(/^\//, ''));
      if (!rel || !part) continue;
      out.push({
        sheet,
        relId: relId!,
        part: part.name,
        table: part.rels.length ? null : readTablePart(decode(part.data)),
      });
    }
  }
  return out;
}

/** Kept content without some of its table parts: each one's `tablePart`, relationship and part gone. */
export function keptWithoutTables(
  kept: KeptContent<FileAt>,
  gone: readonly Pick<KeptTable, 'sheet' | 'relId' | 'part'>[],
): KeptContent<FileAt> {
  if (gone.length === 0) return kept;
  const goes = (sheet: number | undefined, id: string) =>
    gone.some((g) => g.sheet === sheet && g.relId === id);
  const items = kept.items.flatMap((item) => {
    if (item.place !== 'worksheet' || keptLocalName(item.xml) !== 'tableParts') return [item];
    let left = 0;
    const xml = item.xml.replace(TABLE_PART, (m, id: string) => {
      if (goes(item.at.sheet, id)) return '';
      left++;
      return m;
    });
    if (left === 0) return [];
    return [{ ...item, xml: xml.replace(/(\scount=")\d+"/, `$1${left}"`) }];
  });
  const relationships = kept.relationships.filter(
    (r) => !(r.from === 'sheet' && goes(r.at.sheet, r.id)),
  );
  const reached = new Set(relationships.map((r) => r.target.replace(/^\//, '')));
  const parts = kept.parts.filter(
    (p) => reached.has(p.name) || !gone.some((g) => g.part === p.name),
  );
  // A differential format only a table part named goes with it.
  return withDxfsNamed({ ...kept, items, relationships, parts });
}

/**
 * The tables a file's kept table parts make: each one LiveDoc holds (D447; free of the workbook's `names`) leaves the
 * kept content for its sheet's `tables`, LiveDoc's record (`records`, by sheet) taken while its fingerprint holds;
 * any other is named (`table_unread`) and stays kept.
 */
export function readXlsxTables(
  sheets: readonly FileSheet[],
  kept: KeptContent<FileAt> | undefined,
  records: readonly ({ text: string; fingerprint: string | undefined } | undefined)[],
  names: readonly string[],
  losses: FileLoss[],
): { sheets: FileSheet[]; kept: KeptContent<FileAt> | undefined } {
  const all = keptTables(kept);
  const bySheet = sheets.map((_, i) => all.filter((t) => t.sheet === i));
  const held = heldTables(
    bySheet.map((list) =>
      list.map(
        (t) =>
          t.table ?? {
            name: '',
            range: { r1: 0, c1: 0, r2: 0, c2: 0 },
            header: false,
            total: false,
          },
      ),
    ),
    names,
  );
  const taken: KeptTable[] = [];
  const out = sheets.map((sheet, i) => {
    const standard: FileTable[] = [];
    bySheet[i]!.forEach((t, at) => {
      if (!held[i]![at] || !t.table) {
        losses.push({ k: 'table_unread', sheet: sheet.name, name: t.table?.name ?? t.part });
        return;
      }
      taken.push(t);
      const { name, range, columns, total } = t.table;
      standard.push({ name, range, columns, ...(total ? { total: true as const } : {}) });
    });
    const record = records[i];
    const found = tablesFound({ standard, ...(record ? { record } : {}) });
    if (found.changed) losses.push({ k: 'tables_changed', sheet: sheet.name });
    return found.tables.length ? { ...sheet, tables: found.tables } : sheet;
  });
  return { sheets: out, kept: kept && keptWithoutTables(kept, taken) };
}

/**
 * Kept content at a write without the kept tables an own table's name takes (D453): dropped, counted. `own` the
 * sheets' tables' formula names, upper case.
 */
export function keptBesideOwnTables(
  kept: KeptContent<FileAt> | undefined,
  own: ReadonlySet<string>,
): { kept: KeptContent<FileAt> | undefined; dropped: number } {
  if (!kept || own.size === 0) return { kept, dropped: 0 };
  const gone = keptTables(kept).filter((t) => {
    const name = t.table?.name ?? readTableName(kept, t.part);
    return name !== null && own.has(name.toUpperCase());
  });
  return { kept: keptWithoutTables(kept, gone), dropped: gone.length };
}

// A kept table part's name, read however else it reads; null when it has none.
function readTableName(kept: KeptContent, part: string): string | null {
  const data = kept.parts.find((p) => p.name === part)?.data;
  const m = data && /\sdisplayName="([^"]*)"/.exec(decode(data));
  return m ? m[1]! : null;
}

// A header cell's text as Excel holds it: its own text while it reads as its column's name (spaces around it aside),
// else the name (D452).
function headerText(cell: FileCell | undefined, name: string): string {
  const v = cell?.formula === undefined ? cell?.value : undefined;
  return v?.k === 's' && v.v.trim() === name ? v.v : name;
}

/** A sheet's tables Excel's columns hold, each column named as its header cell is written (D452). */
export function xlsxTablesOf(sheet: FileSheet): FileTable[] {
  const tables = (sheet.tables ?? []).filter((t) => t.range.c2 < FILE_LAST_COL);
  if (tables.length === 0) return tables;
  const rows = new Set(tables.map((t) => t.range.r1));
  const at = new Map(sheet.cells.filter((c) => rows.has(c.r)).map((c) => [`${c.r},${c.c}`, c]));
  return tables.map((t) => ({
    ...t,
    columns: t.columns.map((name, i) =>
      headerText(at.get(`${t.range.r1},${t.range.c1 + i}`), name),
    ),
  }));
}

/** A sheet's cells with each table's header cells its column names, text, as Excel holds a header (D452). */
export function withTextHeaders(sheet: FileSheet): FileCell[] {
  const tables = xlsxTablesOf(sheet);
  if (tables.length === 0) return sheet.cells;
  const headers = new Map<string, string>();
  for (const t of tables)
    t.columns.forEach((name, i) => headers.set(`${t.range.r1},${t.range.c1 + i}`, name));
  const out: FileCell[] = [];
  for (const cell of sheet.cells) {
    const key = `${cell.r},${cell.c}`;
    const name = headers.get(key);
    if (name === undefined) {
      out.push(cell);
      continue;
    }
    headers.delete(key);
    const { formula: _f, spans: _s, ...rest } = cell;
    out.push(
      cell.formula === undefined && cell.value?.k === 's' && cell.value.v === name
        ? cell
        : { ...rest, value: { k: 's', v: name } },
    );
  }
  for (const [key, name] of headers) {
    const [r, c] = key.split(',').map(Number);
    out.push({ r: r!, c: c!, value: { k: 's', v: name } });
  }
  return out;
}

// A table part's XML: its cells, header row, total row, filter over all but the total row, columns and style.
function tableXml(t: FileTable, id: number): string {
  const name = escapeXmlAttribute(tableFormulaName(t.name));
  const data = { ...t.range, r2: t.total ? t.range.r2 - 1 : t.range.r2 };
  const columns = t.columns
    .map((c, i) => `<tableColumn id="${i + 1}" name="${escapeXmlAttribute(c)}"/>`)
    .join('');
  return [
    `<table xmlns="${SPREADSHEETML_NS}" id="${id}" name="${name}" displayName="${name}" ref="${formatRange(t.range)}"`,
    ` headerRowCount="1"${t.total ? ' totalsRowCount="1"' : ''}>`,
    `<autoFilter ref="${formatRange(data)}"/>`,
    `<tableColumns count="${t.columns.length}">${columns}</tableColumns>`,
    `<tableStyleInfo name="${XLSX_TABLE_STYLE}" showFirstColumn="0" showLastColumn="0" showRowStripes="1"`,
    ' showColumnStripes="0"/></table>',
  ].join('');
}

/** A workbook's own table parts: by sheet, its `tableParts` and relationships; the parts; each sheet's record. */
export type XlsxTableParts = {
  sheets: ({ tableParts: string; rels: Relationship[]; record: string } | null)[];
  parts: OoxmlPart[];
};

/**
 * The table parts a workbook's tables add: named past the parts the file kept, ids past every kept table's, each
 * sheet's relationships from `relIds` (its worksheet's next free id).
 */
export function xlsxTableParts(
  sheets: readonly FileSheet[],
  kept: KeptContent | undefined,
  keptParts: readonly OoxmlPart[],
  relIds: (sheet: number) => () => string,
): XlsxTableParts {
  const takenNames = new Set(keptParts.map((p) => p.name));
  let id = Math.max(0, ...keptTables(kept).map((t) => t.table?.id ?? 0));
  let n = 0;
  const out: XlsxTableParts = { sheets: [], parts: [] };
  sheets.forEach((sheet, i) => {
    const tables = xlsxTablesOf(sheet);
    if (tables.length === 0) {
      out.sheets.push(null);
      return;
    }
    const nextId = relIds(i);
    const rels: Relationship[] = [];
    for (const t of tables) {
      do n++;
      while (takenNames.has(`xl/tables/table${n}.xml`));
      const name = `xl/tables/table${n}.xml`;
      out.parts.push({
        name,
        contentType: OOXML_CONTENT_TYPES.table,
        data: new TextEncoder().encode(`${XML_DECLARATION}\n${tableXml(t, ++id)}\n`),
      });
      rels.push({
        id: nextId(),
        type: RELATIONSHIP_TYPES.table,
        target: `../tables/table${n}.xml`,
      });
    }
    const fingerprint = tableFingerprint(tables);
    out.sheets.push({
      tableParts: `<tableParts count="${rels.length}">${rels.map((r) => `<tablePart r:id="${r.id}"/>`).join('')}</tableParts>`,
      rels,
      record: `<livedoc:tables record="${escapeXmlAttribute(tableRecordText(tables))}" fingerprint="${fingerprint}"/>`,
    });
  });
  return out;
}

/** LiveDoc's record of a worksheet's tables in its LiveDoc `ext`, if it holds one. */
export function readXlsxTableRecord(
  ext: ReturnType<typeof childElement>,
): { text: string; fingerprint: string | undefined } | undefined {
  const record = ext && childElement(ext, LIVEDOC_SPREADSHEET_NS, 'tables');
  const text = record && attributeOf(record, '', 'record');
  return text === undefined
    ? undefined
    : { text, fingerprint: attributeOf(record!, '', 'fingerprint') };
}
