// Slicers in XLSX (docs/specs/029-sheets/standard-mapping.md "Filters in the file", XLSX slicers): every slicer in
// LiveDoc's record, and one over a table exactly also as Excel's table slicer, as Google writes one: a slicer cache a
// table column listed in the workbook's `ext` with its `SlicerCache_` name, each sheet's slicers in one slicers part
// listed in its worksheet's `ext`, and an anchor in its drawing. The default stays the record's (D488); the reader is
// xlsx-slicers-read.ts.
import { escapeXmlAttribute, type OoxmlPart, type Relationship } from '@livedoc/office-packages';
import type { GridRange } from '../address';
import { tableFormulaName } from '../tables/table';
import type { FileSlicer } from './file-slicers';
import type { FileTable } from './file-tables';
import type { FileLoss, FileSheet } from './workbook-file';
import { EMU_PER_PX } from './xlsx-charts';
import { tableDataRange } from './xlsx-filters';
import type { XlsxKeptWriter } from './xlsx-kept-write';
import { xlsxTablesOf } from './xlsx-tables';

export const SLICER_CACHE_RELATIONSHIP =
  'http://schemas.microsoft.com/office/2007/relationships/slicerCache';
export const SLICER_RELATIONSHIP = 'http://schemas.microsoft.com/office/2007/relationships/slicer';
export const SLICER_CACHE_CONTENT_TYPE = 'application/vnd.ms-excel.slicerCache+xml';
export const SLICER_CONTENT_TYPE = 'application/vnd.ms-excel.slicer+xml';
export const X14_NS = 'http://schemas.microsoft.com/office/spreadsheetml/2009/9/main';
export const X15_NS = 'http://schemas.microsoft.com/office/spreadsheetml/2010/11/main';
export const SLICER_DRAWING_NS = 'http://schemas.microsoft.com/office/drawing/2010/slicer';
const SLE15_NS = 'http://schemas.microsoft.com/office/drawing/2012/slicer';
const MC_NS = 'http://schemas.openxmlformats.org/markup-compatibility/2006';
const SML_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';

/** The `ext` uris Excel holds table slicers under: the cache's table, the workbook's caches, a worksheet's slicers. */
export const TABLE_SLICER_CACHE_EXT = '{2F2917AC-EB37-4324-AD4E-5DD8C200BD13}';
export const WORKBOOK_SLICER_CACHES_EXT = '{46BE6895-7355-4a93-B00E-2C351335B9C9}';
export const WORKSHEET_SLICER_LIST_EXT = '{3A4CF648-6AED-40f4-86FF-DC5316D8AED3}';

/** A slicer cache's defined name: Excel's, `#N/A`. */
export const SLICER_CACHE_NAME = /^SlicerCache_/i;

// A slicer item's row in a slicer part, Google's (26 px).
const SLICER_ROW_HEIGHT_EMU = 247_650;

const same = (a: GridRange, b: GridRange) =>
  a.r1 === b.r1 && a.c1 === b.c1 && a.r2 === b.r2 && a.c2 === b.c2;

/** The table a slicer's range is exactly (its whole range or its header and data rows), by its place; else -1. */
export function slicerTableAt(slicer: FileSlicer, tables: readonly FileTable[]): number {
  const range = slicer.range;
  if (!range || slicer.c === undefined || slicer.c < range.c1 || slicer.c > range.c2) return -1;
  return tables.findIndex((t) => same(t.range, range) || same(tableDataRange(t), range));
}

/** One of Excel's table slicers a sheet writes: its name, its table by place and column by place in the table. */
type TableSlicer = { slicer: FileSlicer; table: number; col: number; caption: string };

export type XlsxSlicerPlan = {
  // By sheet: its slicers as the record holds them (a table slicer named), and its Excel table slicers.
  sheets: { slicers: FileSlicer[]; excel: TableSlicer[] }[];
};

// Whether the workbook keeps Excel slicers from its file: LiveDoc's own then stay in its record (D489).
const keepsSlicers = (kept: XlsxKeptWriter, sheets: number) =>
  kept.relationships('workbook').some((r) => r.type === SLICER_CACHE_RELATIONSHIP) ||
  Array.from({ length: sheets }, (_, i) => kept.relationships('sheet', i)).some((rels) =>
    rels.some((r) => r.type === SLICER_RELATIONSHIP),
  );

/**
 * Which slicers are Excel's table slicers too, each named `Slicer_<n>` over the workbook: over a table exactly, on a
 * sheet keeping no drawing from its file, in a workbook keeping no slicers from its file. Every other is the record's
 * alone, counted (`slicers_unwritten`, logged).
 */
export function xlsxSlicerPlan(
  sheets: readonly FileSheet[],
  kept: XlsxKeptWriter,
  losses: FileLoss[],
): XlsxSlicerPlan {
  const blocked = keepsSlicers(kept, sheets.length);
  let n = 0;
  return {
    sheets: sheets.map((sheet, i) => {
      const tables = xlsxTablesOf(sheet);
      const excel: TableSlicer[] = [];
      const drawn = !blocked && !kept.keepsWorksheetChild('drawing', i);
      const slicers = (sheet.slicers ?? []).map(({ name: _, ...slicer }) => {
        const table = drawn ? slicerTableAt(slicer, tables) : -1;
        if (table < 0) return slicer;
        const t = tables[table]!;
        const col = slicer.c! - t.range.c1;
        const named = { ...slicer, name: `Slicer_${++n}` };
        excel.push({ slicer: named, table, col, caption: slicer.title || t.columns[col]! });
        return named;
      });
      const unseen = slicers.length - excel.length;
      if (unseen > 0) losses.push({ k: 'slicers_unwritten', sheet: sheet.name, count: unseen });
      return { slicers, excel };
    }),
  };
}

/** A table slicer's anchor in its sheet's drawing: Excel's slicer frame, Google's fallback shape (`id` its shape id). */
export function xlsxSlicerAnchorXml(slicer: FileSlicer, id: number): string {
  const name = escapeXmlAttribute(slicer.name!);
  const from = `<xdr:from><xdr:col>${slicer.at.c}</xdr:col><xdr:colOff>${slicer.at.dx * EMU_PER_PX}</xdr:colOff><xdr:row>${slicer.at.r}</xdr:row><xdr:rowOff>${slicer.at.dy * EMU_PER_PX}</xdr:rowOff></xdr:from>`;
  return [
    '<xdr:oneCellAnchor>',
    from,
    `<xdr:ext cx="${slicer.width * EMU_PER_PX}" cy="${slicer.height * EMU_PER_PX}"/>`,
    `<mc:AlternateContent xmlns:mc="${MC_NS}">`,
    `<mc:Choice xmlns:sle15="${SLE15_NS}" Requires="sle15">`,
    '<xdr:graphicFrame macro="">',
    `<xdr:nvGraphicFramePr><xdr:cNvPr id="${id}" name="${name}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr>`,
    '<xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>',
    `<a:graphic><a:graphicData uri="${SLICER_DRAWING_NS}"><sle:slicer xmlns:sle="${SLICER_DRAWING_NS}" name="${name}"/></a:graphicData></a:graphic>`,
    '</xdr:graphicFrame>',
    '</mc:Choice>',
    '<mc:Fallback>',
    `<xdr:sp macro="" textlink=""><xdr:nvSpPr><xdr:cNvPr id="${id}" name=""/><xdr:cNvSpPr><a:spLocks noTextEdit="1"/></xdr:cNvSpPr></xdr:nvSpPr>`,
    '<xdr:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:prstClr val="white"/></a:solidFill>',
    '<a:ln w="1"><a:solidFill><a:prstClr val="green"/></a:solidFill></a:ln></xdr:spPr>',
    '<xdr:txBody><a:bodyPr horzOverflow="clip" vertOverflow="clip"/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="1100"/>',
    '<a:t>This shape represents a table slicer. Table slicers are not supported in this version of Excel.</a:t>',
    '</a:r></a:p></xdr:txBody></xdr:sp>',
    '</mc:Fallback>',
    '</mc:AlternateContent>',
    '<xdr:clientData fLocksWithSheet="0"/>',
    '</xdr:oneCellAnchor>',
  ].join('');
}

/** What the table slicers add to a workbook beside its drawings. */
export type XlsxSlicerParts = {
  parts: OoxmlPart[];
  // The workbook's caches by part (its relationships' targets), and their defined names.
  caches: string[];
  names: string[];
  // By sheet: its relationship to its slicers part and its worksheet `ext`.
  sheets: ({ rels: Relationship[]; ext: string } | null)[];
};

const encode = (xml: string) =>
  new TextEncoder().encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n${xml}\n`);

/**
 * The table slicers' parts: one cache a table column (`SlicerCache_<table>_Col_<column id>`, a name `taken` does not
 * hold), naming the table part's `id` (`tableIds` by sheet, in `xlsxTablesOf` order), and a slicers part a sheet.
 */
export function xlsxSlicerParts(
  sheets: readonly FileSheet[],
  plan: XlsxSlicerPlan,
  tableIds: readonly (readonly number[])[],
  sheetIds: (i: number) => () => string,
  taken: ReadonlySet<string>,
): XlsxSlicerParts {
  const out: XlsxSlicerParts = { parts: [], caches: [], names: [], sheets: [] };
  const caches = new Map<string, string>();
  const names = new Set([...taken].map((x) => x.toUpperCase()));
  let parts = 0;
  plan.sheets.forEach((p, i) => {
    if (p.excel.length === 0) {
      out.sheets.push(null);
      return;
    }
    const tables = xlsxTablesOf(sheets[i]!);
    const entries = p.excel.map((x) => {
      const table = tables[x.table]!;
      const tableId = tableIds[i]![x.table]!;
      const key = `${tableId},${x.col}`;
      let cache = caches.get(key);
      if (cache === undefined) {
        const stem = `SlicerCache_${tableFormulaName(table.name)}_Col_${x.col + 1}`;
        cache = stem;
        for (let k = 2; names.has(cache.toUpperCase()); k++) cache = `${stem}_${k}`;
        names.add(cache.toUpperCase());
        caches.set(key, cache);
        const n = caches.size;
        out.parts.push({
          name: `xl/slicerCaches/slicerCache${n}.xml`,
          contentType: SLICER_CACHE_CONTENT_TYPE,
          data: encode(
            `<x14:slicerCacheDefinition xmlns="${SML_NS}" xmlns:x14="${X14_NS}" xmlns:x15="${X15_NS}" name="${escapeXmlAttribute(cache)}" sourceName="${escapeXmlAttribute(table.columns[x.col]!)}"><x14:extLst><ext uri="${TABLE_SLICER_CACHE_EXT}"><x15:tableSlicerCache tableId="${tableId}" column="${x.col + 1}"/></ext></x14:extLst></x14:slicerCacheDefinition>`,
          ),
        });
        out.caches.push(`slicerCaches/slicerCache${n}.xml`);
        out.names.push(`<definedName name="${escapeXmlAttribute(cache)}">#N/A</definedName>`);
      }
      return `<x14:slicer name="${escapeXmlAttribute(x.slicer.name!)}" cache="${escapeXmlAttribute(cache)}" caption="${escapeXmlAttribute(x.caption)}" rowHeight="${SLICER_ROW_HEIGHT_EMU}"/>`;
    });
    const part = `slicer${++parts}.xml`;
    out.parts.push({
      name: `xl/slicers/${part}`,
      contentType: SLICER_CONTENT_TYPE,
      data: encode(
        `<x14:slicers xmlns="${SML_NS}" xmlns:x14="${X14_NS}">${entries.join('')}</x14:slicers>`,
      ),
    });
    const relId = sheetIds(i)();
    out.sheets.push({
      rels: [{ id: relId, type: SLICER_RELATIONSHIP, target: `../slicers/${part}` }],
      ext: `<ext uri="${WORKSHEET_SLICER_LIST_EXT}" xmlns:x14="${X14_NS}"><x14:slicerList><x14:slicer r:id="${relId}"/></x14:slicerList></ext>`,
    });
  });
  return out;
}

/** The workbook's caches: a relationship each (`nextId` the workbook's next free id), listed in its `ext`. */
export function xlsxSlicerCaches(
  caches: readonly string[],
  nextId: () => string,
): { rels: Relationship[]; ext: string | null } {
  const rels = caches.map((target) => ({ id: nextId(), type: SLICER_CACHE_RELATIONSHIP, target }));
  return {
    rels,
    ext: rels.length
      ? `<ext uri="${WORKBOOK_SLICER_CACHES_EXT}" xmlns:x14="${X14_NS}" xmlns:x15="${X15_NS}"><x15:slicerCaches>${rels.map((r) => `<x14:slicerCache r:id="${r.id}"/>`).join('')}</x15:slicerCaches></ext>`
      : null,
  };
}
