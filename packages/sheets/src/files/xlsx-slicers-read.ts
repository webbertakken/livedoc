// Slicers read from XLSX (docs/specs/029-sheets/standard-mapping.md "Filters in the file", XLSX slicers read, LiveDoc's
// record of slicers): a file's table slicers are the sheets' own when all of them can be (D489), their parts and
// `ext`s then LiveDoc's to write again; LiveDoc's record brings back what Excel's form cannot say, read whenever it
// parses (D490). The writer is xlsx-slicers.ts.
import {
  attributeOf,
  childElement,
  childElements,
  parseXml,
  type XmlElement,
} from '@livedoc/office-packages';
import type { FileSlicer } from './file-slicers';
import type { FileAt, KeptContent, KeptPart } from './kept-content';
import { keptLocalName } from './kept-content';
import { readSlicerRecord } from './slicer-record';
import type { FileLoss, FileSheet } from './workbook-file';
import type { AnchorPlace } from './xlsx-charts-read';
import { tableDataRange } from './xlsx-filters';
import {
  SLICER_CACHE_NAME,
  SLICER_CACHE_RELATIONSHIP,
  SLICER_RELATIONSHIP,
  TABLE_SLICER_CACHE_EXT,
  WORKBOOK_SLICER_CACHES_EXT,
  WORKSHEET_SLICER_LIST_EXT,
  X14_NS,
  X15_NS,
} from './xlsx-slicers';
import type { KeptTable } from './xlsx-tables';

/** One of a file's table slicers: its sheet, name, caption, its table's name and its column's place in the table. */
type ExcelSlicer = { sheet: number; name: string; caption: string; table: string; at: number };

/** A file's table slicers, when every slicer it holds is one (D489); else the sheets holding any. */
export type XlsxSlicersHeld =
  | { readable: true; slicers: ExcelSlicer[]; parts: Set<string> }
  | { readable: false; sheets: Set<number> };

const decode = (part: KeptPart) => new TextDecoder().decode(part.data);
const partName = (target: string) => target.replace(/^\//, '');

// A part's root, parsed; null when it does not parse.
function rootOf(part: KeptPart | undefined): XmlElement | null {
  const parsed = part && parseXml(decode(part));
  return parsed && parsed.ok ? parsed.root : null;
}

// A slicer cache's name and its table's: null for one that is not a table's (a pivot table's).
function tableCacheOf(
  root: XmlElement | null,
): { name: string; tableId: number; column: number } | null {
  if (!root || root.uri !== X14_NS || root.local !== 'slicerCacheDefinition') return null;
  const name = attributeOf(root, '', 'name');
  const extLst = childElement(root, X14_NS, 'extLst');
  const ext = (extLst ? childElements(extLst) : []).find(
    (e) => e.local === 'ext' && attributeOf(e, '', 'uri') === TABLE_SLICER_CACHE_EXT,
  );
  const cache = ext && childElement(ext, X15_NS, 'tableSlicerCache');
  const tableId = Number(cache && attributeOf(cache, '', 'tableId'));
  const column = Number(cache && attributeOf(cache, '', 'column'));
  if (!name || !Number.isInteger(tableId) || !Number.isInteger(column)) return null;
  return { name, tableId, column };
}

/**
 * The file's table slicers (`tables` its table parts before they were read, `read` the sheets with the tables read):
 * readable when every slicer cache the workbook lists is a table's, every slicer names one, and each names a column
 * of a table read on its own sheet.
 */
export function xlsxSlicersHeld(
  kept: KeptContent<FileAt> | undefined,
  tables: readonly KeptTable[],
  read: readonly FileSheet[],
): XlsxSlicersHeld | null {
  if (!kept) return null;
  const parts = new Map(kept.parts.map((p) => [p.name, p]));
  const cacheRels = kept.relationships.filter(
    (r) => r.from === 'workbook' && r.type === SLICER_CACHE_RELATIONSHIP,
  );
  const sheetRels = kept.relationships.filter(
    (r) => r.from === 'sheet' && r.type === SLICER_RELATIONSHIP,
  );
  if (cacheRels.length + sheetRels.length === 0) return null;
  const sheets = new Set(sheetRels.map((r) => r.at.sheet!));
  const none: XlsxSlicersHeld = { readable: false, sheets };
  const used = new Set<string>();
  const caches = new Map<string, { tableId: number; column: number }>();
  for (const rel of cacheRels) {
    const name = partName(rel.target);
    const cache = !rel.external && tableCacheOf(rootOf(parts.get(name)));
    if (!cache) return none;
    caches.set(cache.name, cache);
    used.add(name);
  }
  const slicers: ExcelSlicer[] = [];
  for (const rel of sheetRels) {
    const name = partName(rel.target);
    const root = !rel.external && rootOf(parts.get(name));
    if (!root || root.uri !== X14_NS || root.local !== 'slicers') return none;
    used.add(name);
    for (const e of childElements(root)) {
      const slicerName = attributeOf(e, '', 'name');
      const cache = caches.get(attributeOf(e, '', 'cache') ?? '');
      const table = cache && tables.find((t) => t.table?.id === cache.tableId);
      if (e.local !== 'slicer' || !slicerName || !cache || !table?.table) return none;
      const at = table.table.colIds.indexOf(cache.column);
      const own = read[table.sheet]?.tables?.some((t) => t.name === table.table!.name);
      if (at < 0 || table.sheet !== rel.at.sheet || !own) return none;
      slicers.push({
        sheet: rel.at.sheet,
        name: slicerName,
        caption: attributeOf(e, '', 'caption') ?? '',
        table: table.table.name,
        at,
      });
    }
  }
  return { readable: true, slicers, parts: used };
}

/** The slicer names each sheet's drawing may hold, for the chart reader. */
export const slicerNamesBySheet = (held: XlsxSlicersHeld | null, sheet: number): Set<string> =>
  new Set(held?.readable ? held.slicers.filter((s) => s.sheet === sheet).map((s) => s.name) : []);

// A text matched as itself inside a regular expression.
const escapeRegExp = (text: string) => text.replace(/[\\^$.*+?()[\]{}|-]/g, (m) => `\\${m}`);

// An `extLst` item's XML without its `ext` of one uri; null when none is left.
function withoutExt(xml: string, uri: string): string | null {
  const ext = new RegExp(
    `<((?:[\\w.-]+:)?ext)\\b[^>]*\\buri="${escapeRegExp(uri)}"[^>]*>[\\s\\S]*?</\\1>`,
  );
  const out = xml.replace(ext, '');
  return /<(?:[\w.-]+:)?ext\b/.test(out) ? out : null;
}

/** Kept content without the table slicers read (their parts, relationships, `ext`s, cache names); none when empty. */
export function keptWithoutSlicers(
  kept: KeptContent<FileAt>,
  held: Extract<XlsxSlicersHeld, { readable: true }>,
): KeptContent<FileAt> | undefined {
  const items = kept.items.flatMap((item) => {
    const local = keptLocalName(item.xml);
    if (item.place === 'workbook' && local === 'definedName') {
      const name = /\sname="([^"]*)"/.exec(item.xml)?.[1] ?? '';
      return SLICER_CACHE_NAME.test(name) && /#N\/A/.test(item.xml) ? [] : [item];
    }
    if (local !== 'extLst' || (item.place !== 'workbook' && item.place !== 'worksheet'))
      return [item];
    const uri = item.place === 'workbook' ? WORKBOOK_SLICER_CACHES_EXT : WORKSHEET_SLICER_LIST_EXT;
    const xml = withoutExt(item.xml, uri);
    return xml === null ? [] : [{ ...item, xml }];
  });
  const relationships = kept.relationships.filter(
    (r) => r.type !== SLICER_CACHE_RELATIONSHIP && r.type !== SLICER_RELATIONSHIP,
  );
  const parts = kept.parts.filter((p) => !held.parts.has(p.name));
  if (items.length + relationships.length + parts.length === 0) return undefined;
  return { ...kept, items, relationships, parts };
}

/**
 * Each sheet with its slicers: LiveDoc's record's (`records` by sheet), each naming a table slicer the file holds
 * taking its place, range, column and title from the file; then the file's other table slicers (`places` their
 * anchors by sheet). A record's entry that does not parse is named (`slicer_unread`); a sheet whose Excel slicers stay
 * kept is named once (`slicers_kept`).
 */
export function withXlsxSlicers(
  sheets: readonly FileSheet[],
  held: XlsxSlicersHeld | null,
  places: readonly ReadonlyMap<string, AnchorPlace>[] | undefined,
  records: readonly (string | undefined)[],
  losses: FileLoss[],
): FileSheet[] {
  return sheets.map((sheet, i) => {
    const record =
      records[i] === undefined ? { slicers: [], unread: 0 } : readSlicerRecord(records[i]);
    for (let n = 0; n < record.unread; n++) losses.push({ k: 'slicer_unread', sheet: sheet.name });
    if (held && !held.readable && held.sheets.has(i))
      losses.push({ k: 'slicers_kept', sheet: sheet.name });
    const excel = new Map<string, FileSlicer>();
    if (held?.readable)
      for (const s of held.slicers.filter((x) => x.sheet === i)) {
        const made = excelSlicer(s, sheet, places?.[i]?.get(s.name));
        if (made) excel.set(s.name, made);
      }
    const used = new Set<string>();
    const slicers = record.slicers.flatMap((s): FileSlicer[] => {
      if (!held?.readable || !s.name) return [s];
      const own = excel.get(s.name);
      if (!own) return [];
      used.add(s.name);
      return [
        {
          ...own,
          ...(s.filter ? { filter: s.filter } : {}),
          ...(s.pivots === false ? { pivots: false as const } : {}),
        },
      ];
    });
    for (const [name, s] of excel) if (!used.has(name)) slicers.push(s);
    return slicers.length ? { ...sheet, slicers } : sheet;
  });
}

// A table slicer as the sheet's: over its table's header and data rows by its column, at its anchor; its caption its
// title unless it is the column's name. Null when its table or its anchor is missing (allPlaced checks first).
function excelSlicer(
  s: ExcelSlicer,
  sheet: FileSheet,
  place: AnchorPlace | undefined,
): FileSlicer | null {
  const table = sheet.tables?.find((t) => t.name === s.table);
  if (!table || !place || s.at >= table.columns.length) return null;
  const name = table.columns[s.at];
  return {
    ...place,
    range: tableDataRange(table),
    c: table.range.c1 + s.at,
    ...(s.caption && s.caption !== name ? { title: s.caption } : {}),
    name: s.name,
  };
}

/** Whether the chart reader found every table slicer's anchor, so the slicers can be read. */
export function allPlaced(
  held: Extract<XlsxSlicersHeld, { readable: true }>,
  places: readonly ReadonlyMap<string, AnchorPlace>[] | undefined,
): boolean {
  return held.slicers.every((s) => places?.[s.sheet]?.has(s.name));
}
