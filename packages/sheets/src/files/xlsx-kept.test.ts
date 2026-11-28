// docs/specs/029-sheets/standard-mapping.md "Unknown content": XLSX's kept content read, written back in place, its
// relationships and parts with it, D108, D110 and D112.
import {
  OOXML_CONTENT_TYPES,
  readOoxmlPackage,
  RELATIONSHIP_TYPES,
  writeOoxmlPackage,
} from '@livedoc/office-packages';
import { describe, expect, it } from 'vitest';
import type { KeptContent } from './kept-content';
import { ownIds } from './xlsx-kept-write';
import { readXlsx } from './xlsx-read';
import { writeXlsx } from './xlsx-write';
import type { FileRead, WorkbookFile } from './workbook-file';
import {
  BOOK_VIEWS,
  CALC,
  DRAWING,
  DXFS,
  excelFileWithKept,
  GLOBAL_NAME,
  LOCAL_NAME,
  MARGINS,
  MC,
  MERGES,
  PIVOTS,
  REVISION,
  RULES,
  SHEET_VIEWS,
  XR,
} from '../testing/kept-files';

const encode = (text: string) => new TextEncoder().encode(text);
const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
async function readOk(bytes: Uint8Array<ArrayBuffer>): Promise<Extract<FileRead, { ok: true }>> {
  const read = await readXlsx(bytes);
  if (!read.ok) throw new Error(read.rejection);
  return read;
}

async function partsOf(bytes: Uint8Array<ArrayBuffer>): Promise<Map<string, string>> {
  const read = await readOoxmlPackage(bytes);
  if (!read.ok) throw new Error(read.rejection);
  return new Map([...read.package.parts].map(([name, data]) => [name, decode(data)]));
}

const placed = (kept: KeptContent | undefined) =>
  (kept?.items ?? []).map((i) => `${i.place}@${i.at.sheet ?? ''}:${i.xml}`).sort();
const related = (kept: KeptContent | undefined) =>
  (kept?.relationships ?? [])
    .map((r) => `${r.from}@${r.at.sheet ?? ''} ${r.id} ${r.target}${r.external ? ' external' : ''}`)
    .sort();

describe('XLSX kept content', () => {
  it('keeps what the reader does not read, its relationships and the parts they reach', async () => {
    const read = await readOk(excelFileWithKept());
    const kept = read.file.kept;
    expect(kept?.standard).toBe('ooxml');
    expect(placed(kept)).toEqual(
      [
        'workbook-attribute@:mc:Ignorable="xr x99"',
        `workbook@:${REVISION}`,
        `workbook@:${BOOK_VIEWS}`,
        `workbook@:${GLOBAL_NAME}`,
        `workbook@1:${LOCAL_NAME}`,
        `workbook@:${CALC}`,
        `workbook@:${PIVOTS}`,
        'sheet-attribute@1:xr:uid="{01}"',
        'worksheet-attribute@0:mc:Ignorable="x14ac xr"',
        'worksheet-attribute@1:mc:Ignorable="x14ac xr"',
        'worksheet-attribute@0:xr:uid="{00}"',
        'worksheet-attribute@1:xr:uid="{00}"',
        ...[0, 1].flatMap((s) => [
          `worksheet@${s}:${SHEET_VIEWS}`,
          `worksheet@${s}:${MERGES}`,
          `worksheet@${s}:${MARGINS}`,
          `worksheet@${s}:${DRAWING}`,
        ]),
        ...RULES.split('</conditionalFormatting>')
          .filter(Boolean)
          .map((rule) => `worksheet@0:${rule}</conditionalFormatting>`),
        `stylesheet@:${DXFS}`,
        'stylesheet@:<tableStyles count="0"/>',
      ].sort(),
    );
    // Columns are LiveDoc's to read and write (standard-mapping.md "Rows and columns in the file"), never kept.
    expect([...read.file.sheets[0]!.lines!.c!.lines]).toEqual([
      [0, { size: 140 }],
      [1, { size: 140 }],
    ]);
    // The controls naming a relationship not there are not kept (D108), nor the defined name of the chart sheet, never
    // read. The sheets' links are read (standard-mapping.md "Links in the file"): the first's to its address, the
    // second's naming rId3, which its part does not have, no link.
    expect(read.losses).toContainEqual({ k: 'kept_unread', count: 2 });
    expect(read.file.sheets[0]!.cells.find((c) => c.link)).toMatchObject({
      r: 1,
      c: 0,
      link: { href: 'https://example.com/' },
    });
    expect(read.file.sheets[1]!.cells.some((c) => c.link)).toBe(false);
    expect(read.losses).toContainEqual({ k: 'entries_dropped', entries: ['xl/vbaProject.bin'] });
    const ignorable = kept!.items.find((i) => i.place === 'workbook-attribute')!;
    expect(ignorable.ns).toEqual({ mc: MC, xr: XR });
    expect(related(kept)).toEqual(
      [
        'package@ rId4 /docProps/custom.xml',
        'workbook@ rId9 /xl/pivotCache/pivotCacheDefinition1.xml',
        'sheet@0 rId1 /xl/drawings/drawing1.xml',
        'sheet@1 rId1 /xl/drawings/drawing2.xml',
      ].sort(),
    );
    expect(kept!.parts.map((p) => `${p.name} ${p.type} ${p.rels.length}`).sort()).toEqual([
      'docProps/custom.xml application/vnd.openxmlformats-officedocument.custom-properties+xml 0',
      'xl/drawings/drawing1.xml application/vnd.openxmlformats-officedocument.drawing+xml 2',
      'xl/drawings/drawing2.xml application/vnd.openxmlformats-officedocument.drawing+xml 3',
      'xl/media/image1.png image/png 0',
      'xl/pivotCache/pivotCacheDefinition1.xml application/vnd.openxmlformats-officedocument.spreadsheetml.pivotCacheDefinition+xml 0',
    ]);
  });

  it('writes every kept item, relationship and part back, byte-equal, in the schema’s order', async () => {
    const read = await readOk(excelFileWithKept());
    const written = writeXlsx(read.file, 'T').data;
    const again = await readOk(written);
    // Byte-equal but for what names a sheet by its place, which names it by its place now (D112).
    const now = placed(read.file.kept).map((item) =>
      item
        .replace('localSheetId="2"', 'localSheetId="1"')
        .replace('activeTab="2"', 'activeTab="0"'),
    );
    expect(placed(again.file.kept)).toEqual(now.sort());
    expect(related(again.file.kept)).toEqual(related(read.file.kept));
    expect(again.file.kept!.parts.map((p) => p.name).sort()).toEqual(
      read.file.kept!.parts.map((p) => p.name).sort(),
    );
    const parts = await partsOf(written);
    const sheet = parts.get('xl/worksheets/sheet1.xml')!;
    const at = (text: string) => sheet.indexOf(text);
    expect(at('<dimension')).toBeLessThan(at(SHEET_VIEWS));
    expect(at('<cols>')).toBeLessThan(at('<sheetData>'));
    expect(at('</sheetData>')).toBeLessThan(at(MERGES));
    expect(at(MARGINS)).toBeLessThan(at(DRAWING));
    const book = parts.get('xl/workbook.xml')!;
    expect(book.indexOf(REVISION)).toBeLessThan(book.indexOf('<workbookPr/>'));
    expect(book.indexOf('<sheets>')).toBeLessThan(book.indexOf('<definedNames>'));
    expect(book).toContain('mc:Ignorable="xr x99"');
    expect(book).toContain(
      '<sheet name="Hidden" sheetId="2" state="hidden" xr:uid="{01}" r:id="rId2"/>',
    );
    // LiveDoc's own relationships are numbered past the kept ones.
    expect(book).toContain('<sheet name="Data" sheetId="1" r:id="rId1"/>');
    expect(parts.get('xl/styles.xml')).toContain(
      `</cellStyles>${DXFS}<tableStyles count="0"/></styleSheet>`,
    );
  });

  // D112: a defined name follows its sheet; a view's sheet past the last becomes the first shown (D182).
  it('numbers a defined name’s sheet by its place now, and a view’s past the last sheet as the first', async () => {
    const read = await readOk(excelFileWithKept());
    const swapped: WorkbookFile = {
      ...read.file,
      sheets: [read.file.sheets[1]!, read.file.sheets[0]!],
    };
    const kept = read.file.kept!;
    swapped.kept = {
      ...kept,
      items: kept.items.map((i) =>
        i.at.sheet === undefined ? i : { ...i, at: { sheet: 1 - i.at.sheet } },
      ),
      relationships: kept.relationships.map((r) =>
        r.at.sheet === undefined ? r : { ...r, at: { sheet: 1 - r.at.sheet } },
      ),
    };
    const book = (await partsOf(writeXlsx(swapped, 'T').data)).get('xl/workbook.xml')!;
    expect(book).toContain('<definedName name="Mine" localSheetId="0">Data!$B$1</definedName>');
    // The open sheet past the last becomes the first shown: Data, as Hidden is hidden (D182).
    expect(book).toContain('<workbookView activeTab="1" firstSheet="1"/>');
  });

  // D182: a kept view whose open sheet is hidden opens the first shown.
  it('opens the first shown sheet when a kept view opens a hidden one', async () => {
    const read = await readOk(excelFileWithKept());
    const kept = read.file.kept!;
    const file: WorkbookFile = {
      ...read.file,
      kept: {
        ...kept,
        items: kept.items.map((i) => ({
          ...i,
          xml: i.xml.replace('activeTab="2"', 'activeTab="1"'),
        })),
      },
    };
    const book = (await partsOf(writeXlsx(file, 'T').data)).get('xl/workbook.xml')!;
    expect(book).toContain('<workbookView activeTab="0" firstSheet="1"/>');
  });

  // standard-mapping.md "Written back in place": a part is written while a kept relationship still reaches it.
  it('leaves out the parts no kept relationship reaches', async () => {
    const read = await readOk(excelFileWithKept());
    const kept = read.file.kept!;
    const first: WorkbookFile = {
      sheets: [read.file.sheets[0]!],
      kept: { ...kept, relationships: kept.relationships.filter((r) => r.at.sheet !== 1) },
    };
    const parts = await partsOf(writeXlsx(first, 'T').data);
    expect(parts.has('xl/drawings/drawing1.xml')).toBe(true);
    expect(parts.has('xl/media/image1.png')).toBe(true);
    expect(parts.has('xl/drawings/drawing2.xml')).toBe(false);
    expect(parts.has('xl/calcChain.xml')).toBe(false);
  });

  // D108: a Strict file's content is named, not kept.
  it('names a Strict file’s content and keeps none of it', async () => {
    const strict = 'http://purl.oclc.org/ooxml/spreadsheetml/main';
    const bytes = writeOoxmlPackage(
      [
        {
          name: 'xl/workbook.xml',
          contentType: OOXML_CONTENT_TYPES.spreadsheet,
          data: encode(
            `<workbook xmlns="${strict}" xmlns:r="http://purl.oclc.org/ooxml/officeDocument/relationships">` +
              `${CALC}<sheets><sheet name="A" sheetId="1" r:id="rId1"/></sheets></workbook>`,
          ),
        },
        {
          name: 'xl/worksheets/sheet1.xml',
          contentType: OOXML_CONTENT_TYPES.worksheet,
          data: encode(`<worksheet xmlns="${strict}"><sheetData/>${MERGES}</worksheet>`),
        },
      ],
      new Map([
        ['', [{ id: 'rId1', type: RELATIONSHIP_TYPES.officeDocument, target: 'xl/workbook.xml' }]],
        [
          'xl/workbook.xml',
          [{ id: 'rId1', type: RELATIONSHIP_TYPES.worksheet, target: 'worksheets/sheet1.xml' }],
        ],
      ]),
    );
    const read = await readOk(bytes);
    expect(read.file.kept).toBeUndefined();
    expect(read.losses).toContainEqual({ k: 'kept_unread', count: 2 });
  });

  it('numbers LiveDoc’s own relationships past the kept ones', () => {
    const next = ownIds([
      { id: 'rId1', type: 't', target: 'a' },
      { id: 'rId3', type: 't', target: 'b' },
    ]);
    expect([next(), next(), next()]).toEqual(['rId2', 'rId4', 'rId5']);
  });
});
