// Pivot tables in XLSX, read back (docs/specs/029-sheets/standard-mapping.md "Pivot tables in the file", D607): a
// sheet's kept pivot table part holding LiveDoc's record, whose fingerprint is its standard form's as read, is the
// sheet's pivot table again; its part, its cache and their relationships leave the kept content. Any other pivot table
// stays the file's own, as it came.
import {
  RELATIONSHIP_TYPES,
  attributeOf,
  childElement,
  childElements,
  parseXml,
  resolvePartName,
  transitionalType,
  type XmlElement,
} from '@livedoc/office-packages';
import { parseRangeText } from '../address';
import {
  pivotFingerprint,
  pivotSourceText,
  readPivotRecord,
  type FilePivot,
  type PivotStandard,
} from './file-pivots';
import type { FileAt, KeptContent, KeptPart } from './kept-content';
import { LIVEDOC_SPREADSHEET_NS } from './validation-standard';
import type { FileLoss, FileSheet } from './workbook-file';
import { SPREADSHEETML_NS } from './xlsx-parts';

const text = (part: KeptPart) => new TextDecoder().decode(part.data);

const own = (e: XmlElement | undefined, local: string) =>
  e ? childElement(e, SPREADSHEETML_NS, local) : undefined;

// An element's children; none for an element that is not there.
const kids = (e: XmlElement | undefined) => (e ? childElements(e) : []);

// The `x` (or `fld`) of each child of a list, in order.
const indexes = (list: XmlElement | undefined, attr: string) =>
  kids(list).map((f) => Number(attributeOf(f, '', attr)));

/** A cache definition's source (`Sales!A1:F25`) and its fields' names; null when it is not a worksheet's. */
export function readXlsxCache(xml: string): { source: string; names: string[] } | null {
  const parsed = parseXml(xml);
  if (!parsed.ok) return null;
  const ws = own(own(parsed.root, 'cacheSource'), 'worksheetSource');
  const ref = ws && attributeOf(ws, '', 'ref');
  const sheet = ws && attributeOf(ws, '', 'sheet');
  const range = ref ? parseRangeText(ref) : null;
  if (!range || sheet === undefined) return null;
  const names = kids(own(parsed.root, 'cacheFields')).map((f) => attributeOf(f, '', 'name') ?? '');
  return { source: pivotSourceText(sheet, range), names };
}

/**
 * A pivot table part's standard form, its cache read by `cache`, and LiveDoc's record beside it; null when it holds
 * no record, or its place or cache cannot be read.
 */
export function readXlsxPivotTable(
  xml: string,
  cache: { source: string; names: readonly string[] },
): { standard: PivotStandard; record: string; fingerprint: string } | null {
  const parsed = parseXml(xml);
  if (!parsed.ok) return null;
  const root = parsed.root;
  const ext = kids(own(root, 'extLst')).find(
    (e) => e.local === 'ext' && attributeOf(e, '', 'uri') === LIVEDOC_SPREADSHEET_NS,
  );
  const mark = ext && childElement(ext, LIVEDOC_SPREADSHEET_NS, 'pivot');
  const record = mark && attributeOf(mark, '', 'record');
  const fingerprint = mark && attributeOf(mark, '', 'fingerprint');
  const place = own(root, 'location');
  const ref = place && attributeOf(place, '', 'ref');
  const location = ref ? parseRangeText(ref) : null;
  if (record === undefined || fingerprint === undefined || !location) return null;
  const name = (x: number) => cache.names[x] ?? '';
  const data = kids(own(root, 'dataFields')).map(
    (d) =>
      `data ${name(Number(attributeOf(d, '', 'fld')))} ${attributeOf(d, '', 'subtotal') ?? 'sum'}`,
  );
  const fields = [
    ...indexes(own(root, 'rowFields'), 'x')
      .filter((x) => x >= 0)
      .map((x) => `row ${name(x)}`),
    ...indexes(own(root, 'colFields'), 'x')
      .filter((x) => x >= 0)
      .map((x) => `column ${name(x)}`),
    ...indexes(own(root, 'pageFields'), 'fld').map((x) => `page ${name(x)}`),
    ...data,
  ];
  return { standard: { location, source: cache.source, fields }, record, fingerprint };
}

const PIVOT_CACHE = (relId: string) =>
  new RegExp(`<(?:[\\w.-]+:)?pivotCache\\b[^>]*?\\s[\\w.-]+:id="${relId}"[^>]*/>`);

/**
 * The sheets' pivot tables LiveDoc wrote and no app changed since (D607), and the kept content without them; a
 * record another app's change left behind is named (`pivot_changed`, logged only).
 */
export function readXlsxPivots(
  sheets: readonly FileSheet[],
  kept: KeptContent<FileAt> | undefined,
  losses: FileLoss[],
): { sheets: FileSheet[]; kept: KeptContent<FileAt> | undefined } {
  if (!kept) return { sheets: [...sheets], kept };
  const byName = new Map(kept.parts.map((p) => [p.name, p]));
  const gone = new Set<string>();
  const goneRels = new Set<unknown>();
  const out = sheets.map((sheet, i) => {
    const pivots: FilePivot[] = [];
    for (const rel of kept.relationships) {
      if (rel.from !== 'sheet' || rel.at.sheet !== i || rel.external) continue;
      if (transitionalType(rel.type) !== RELATIONSHIP_TYPES.pivotTable) continue;
      const table = byName.get(rel.target.replace(/^\//, ''));
      const cacheRel = table?.rels.find(
        (r) => transitionalType(r.type) === RELATIONSHIP_TYPES.pivotCacheDefinition && !r.external,
      );
      const cacheName = cacheRel && resolvePartName(table!.name, cacheRel.target);
      const cachePart = cacheName ? byName.get(cacheName) : undefined;
      const cache = cachePart && readXlsxCache(text(cachePart));
      const read = cache && readXlsxPivotTable(text(table!), cache);
      if (!read) continue;
      const record =
        read.fingerprint === pivotFingerprint(read.standard) ? readPivotRecord(read.record) : null;
      if (!record) {
        losses.push({ k: 'pivot_changed', sheet: sheet.name });
        continue;
      }
      const { location } = read.standard;
      pivots.push({
        ...record,
        headers: [],
        items: [],
        output: { rows: location.r2 - location.r1 + 1, cols: location.c2 - location.c1 + 1 },
      });
      goneRels.add(rel);
      gone.add(table!.name);
      gone.add(cacheName!);
    }
    return pivots.length ? { ...sheet, pivots } : sheet;
  });
  if (gone.size === 0) return { sheets: out, kept };
  // A cache another kept pivot table still reads stays with it.
  for (const part of kept.parts)
    if (!gone.has(part.name))
      for (const r of part.rels) {
        const name = r.external ? undefined : resolvePartName(part.name, r.target);
        if (name && transitionalType(r.type) === RELATIONSHIP_TYPES.pivotCacheDefinition)
          gone.delete(name);
      }
  const cacheRels = kept.relationships.filter(
    (r) => r.from === 'workbook' && gone.has(r.target.replace(/^\//, '')),
  );
  for (const r of cacheRels) goneRels.add(r);
  const items = kept.items.flatMap((item) => {
    if (item.place !== 'workbook' || !/^<(?:[\w.-]+:)?pivotCaches\b/.test(item.xml)) return [item];
    const xml = cacheRels.reduce((x, r) => x.replace(PIVOT_CACHE(r.id), ''), item.xml);
    return /<(?:[\w.-]+:)?pivotCache\b/.test(xml) ? [{ ...item, xml }] : [];
  });
  const parts = kept.parts.filter((p) => !gone.has(p.name));
  const relationships = kept.relationships.filter((r) => !goneRels.has(r));
  // A file that keeps nothing else reads as the model alone.
  if (items.length === 0 && parts.length === 0 && relationships.length === 0)
    return { sheets: out, kept: undefined };
  return { sheets: out, kept: { ...kept, items, parts, relationships } };
}
