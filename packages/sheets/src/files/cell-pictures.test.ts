// docs/specs/029-sheets/standard-mapping.md "Pictures in a cell" (D634): a cell's picture written as Excel's rich value
// in XLSX and as a frame filling its cell in ODF, read back as the cell's picture; one without its bytes left out and
// named, the cell written without it; another rich value keeps its cached value; read pictures stored on opening.
import { describe, expect, it } from 'vitest';
import { ByteBudget, listZip, readZipEntry } from '@livedoc/office-packages';
import { solidPng, writeTestZip } from '@livedoc/office-packages/testing';
import { cellKey, emptyLayout, emptySheet, type Sheet } from '../sheet';
import { pictureInput } from '../images/cell-picture';
import { WorkbookRecord } from '../workbook-record';
import { cellPictureIds, type FilePictureFetch, type FilePictureFetches } from './file-pictures';
import { picturesPlaced, type PictureStore } from './import-pictures';
import { readOds } from './ods-read';
import { writeFlatOds } from './ods-write';
import { odfFlatWithKept } from '../testing/kept-files';
import { readXlsx } from './xlsx-read';
import { writeWorkbook } from './write-workbook';
import { sheetsFromFile, type FileLoss } from './workbook-file';
import { xlsxMetadataXml } from './xlsx-cell-pictures';

let n = 7;
const rand = () => (n = (n * 16807) % 2147483647) / 2147483647;
const record = WorkbookRecord.create({ locale: 'en-GB', timeZone: 'UTC' });

const RED = solidPng(30, 20, [200, 0, 0]);
const BLUE = solidPng(8, 8, [0, 0, 200]);
const bytes: FilePictureFetches = new Map<string, FilePictureFetch>([
  ['g-red', { data: RED, type: 'image/png' as const }],
  ['g-blue', { data: BLUE, type: 'image/png' as const }],
  ['g-big', 'too_large' as const],
]);

// Sheet1 with pictures at B2 (red, alt), C3 (blue), B4 (red again, alt), D1 holding 5, E1 a spilling formula.
function sheetWith(over: Record<string, ReturnType<typeof pictureInput>> = {}): Sheet {
  const layout = emptyLayout(rand, 6, 6);
  const sheet = emptySheet({ id: 'sheetOne1', tabId: 't1', title: 'Sheet1', layout });
  const at = (a1: string) =>
    cellKey(layout.rows[Number(a1.slice(1)) - 1]!, layout.cols[a1.charCodeAt(0) - 65]!);
  const inputs = {
    B2: pictureInput('g-red', 'A red & "box"'),
    C3: pictureInput('g-blue'),
    B4: pictureInput('g-red', 'A red & "box"'),
    ...over,
  };
  for (const [a1, input] of Object.entries(inputs)) sheet.cells.set(at(a1), { input });
  sheet.cells.set(at('D1'), { input: { n: 5 }, format: { b: true } });
  return sheet;
}

async function entriesOf(data: Uint8Array<ArrayBuffer>): Promise<Map<string, Uint8Array>> {
  const listed = listZip(data);
  if (!listed.ok) throw new Error(listed.refusal);
  const out = new Map<string, Uint8Array>();
  for (const entry of listed.entries) {
    const read = await readZipEntry(data, entry, new ByteBudget(50_000_000));
    if (read.ok) out.set(entry.name, read.bytes);
  }
  return out;
}
const text = (b: Uint8Array | undefined) => new TextDecoder().decode(b);
const encode = (s: string) => new TextEncoder().encode(s);

async function edited(
  data: Uint8Array<ArrayBuffer>,
  name: string,
  change: (xml: string) => string,
) {
  const entries = await entriesOf(data);
  const was = text(entries.get(name));
  const now = change(was);
  if (now === was) throw new Error(`${name} unchanged`);
  entries.set(name, encode(now));
  return writeTestZip([...entries].map(([k, d]) => ({ name: k, data: d })));
}

async function readBack(data: Uint8Array<ArrayBuffer>, format: 'xlsx' | 'ods') {
  const got = format === 'xlsx' ? await readXlsx(data) : await readOds(data);
  if (!got.ok) throw new Error(got.rejection);
  return got;
}

const pictured = (file: Awaited<ReturnType<typeof readBack>>['file']) =>
  file.sheets[0]!.cells.filter((c) => c.readPicture).map((c) => ({
    r: c.r,
    c: c.c,
    alt: c.readPicture!.alt,
    w: c.readPicture!.natural.width,
  }));

const RED_AT_B2 = { r: 1, c: 1, alt: 'A red & "box"', w: 30 };
const BLUE_AT_C3 = { r: 2, c: 2, alt: undefined, w: 8 };
const RED_AT_B4 = { r: 3, c: 1, alt: 'A red & "box"', w: 30 };

describe('cellPictureIds', () => {
  it('lists the images a sheet’s cells hold, each once, and none for a sheet without', () => {
    expect(cellPictureIds(sheetWith())).toEqual(['g-red', 'g-blue']);
    expect(cellPictureIds(emptySheet({ id: 's', tabId: 't', title: 'S' }))).toEqual([]);
  });
});

describe('xlsxMetadataXml', () => {
  it('is none without dynamic arrays or rich values, and holds either or both as Excel writes them', () => {
    expect(xlsxMetadataXml(false, 0)).toBeNull();
    const dynamic = xlsxMetadataXml(true, 0)!;
    expect(dynamic).toContain('<cellMetadata count="1"><bk><rc t="1" v="0"/></bk></cellMetadata>');
    expect(dynamic).not.toContain('valueMetadata');
    const rich = xlsxMetadataXml(false, 2)!;
    expect(rich).toContain('<metadataTypes count="1"><metadataType name="XLRICHVALUE"');
    expect(rich).toContain('<xlrd:rvb i="1"/>');
    expect(rich).toContain(
      '<valueMetadata count="2"><bk><rc t="1" v="0"/></bk><bk><rc t="1" v="1"/></bk>',
    );
    const both = xlsxMetadataXml(true, 1)!;
    expect(both).toContain('<metadataTypes count="2">');
    expect(both).toContain('<valueMetadata count="1"><bk><rc t="2" v="0"/></bk></valueMetadata>');
    expect(both.indexOf('<cellMetadata')).toBeLessThan(both.indexOf('<valueMetadata'));
  });
});

describe('pictures in cells written to XLSX', () => {
  it('writes each as a rich value, one a picture and alt text, one media part an image', async () => {
    const out = writeWorkbook([sheetWith()], record, 'Pics', 'xlsx', undefined, bytes);
    expect(out.losses).toEqual([]);
    const entries = await entriesOf(out.data);
    const sheet = text(entries.get('xl/worksheets/sheet1.xml'));
    expect(sheet).toContain('<c r="B2" t="e" vm="1"><v>#VALUE!</v></c>');
    expect(sheet).toContain('<c r="C3" t="e" vm="2"><v>#VALUE!</v></c>');
    expect(sheet).toContain('<c r="B4" t="e" vm="1"><v>#VALUE!</v></c>');
    const values = text(entries.get('xl/richData/rdrichvalue.xml'));
    expect(values).toContain('<rv s="0"><v>0</v><v>5</v><v>A red &amp; "box"</v></rv>');
    expect(values).toContain('<rv s="1"><v>1</v><v>5</v></rv>');
    const structures = text(entries.get('xl/richData/rdrichvaluestructure.xml'));
    expect(structures.match(/<s t="_localImage">/g)).toHaveLength(2);
    expect(text(entries.get('xl/richData/richValueRel.xml'))).toContain('<rel r:id="rId2"/>');
    const rels = text(entries.get('xl/richData/_rels/richValueRel.xml.rels'));
    expect(rels).toContain('Target="../media/image1.png"');
    expect(entries.get('xl/media/image1.png')).toEqual(RED);
    expect(entries.get('xl/media/image2.png')).toEqual(BLUE);
    expect(text(entries.get('xl/metadata.xml'))).toContain('<valueMetadata count="2">');
    expect(entries.has('xl/richData/rdRichValueTypes.xml')).toBe(true);
    const workbookRels = text(entries.get('xl/_rels/workbook.xml.rels'));
    expect(workbookRels).toContain('relationships/rdRichValue"');
    expect(workbookRels).toContain('2022/10/relationships/richValueRel');
    expect(text(entries.get('[Content_Types].xml'))).toContain(
      'application/vnd.ms-excel.rdrichvalue+xml',
    );
  });

  it('names an image once however many alt texts it is placed with', async () => {
    const sheet = sheetWith({ B4: pictureInput('g-red') });
    const entries = await entriesOf(
      writeWorkbook([sheet], record, 'P', 'xlsx', undefined, bytes).data,
    );
    const values = text(entries.get('xl/richData/rdrichvalue.xml'));
    expect(values).toContain('<rv s="1"><v>1</v><v>5</v></rv><rv s="1"><v>0</v><v>5</v></rv>');
    expect(text(entries.get('xl/richData/richValueRel.xml')).match(/<rel /g)).toHaveLength(2);
  });

  it('leaves out a picture without its bytes, naming it, its cell written without it', async () => {
    const sheet = sheetWith({ C3: pictureInput('g-gone'), B4: pictureInput('g-big') });
    const out = writeWorkbook([sheet], record, 'Pics', 'xlsx', undefined, bytes);
    expect(out.losses).toEqual([
      { k: 'picture_unwritten', sheet: 'Sheet1', why: 'unavailable' },
      { k: 'picture_unwritten', sheet: 'Sheet1', why: 'too_large' },
    ]);
    const entries = await entriesOf(out.data);
    const xml = text(entries.get('xl/worksheets/sheet1.xml'));
    expect(xml).not.toContain('r="C3"');
    expect(xml).not.toContain('r="B4"');
    expect(text(entries.get('xl/richData/rdrichvalue.xml'))).toContain('count="1"');
  });

  it('writes no rich data when no picture has its bytes', async () => {
    const out = writeWorkbook([sheetWith()], record, 'Pics', 'xlsx', undefined, new Map());
    const entries = await entriesOf(out.data);
    expect([...entries.keys()].some((k) => k.startsWith('xl/richData/'))).toBe(false);
    expect(entries.has('xl/metadata.xml')).toBe(false);
  });

  it('reads each back as its cell’s picture with its alt text', async () => {
    const out = writeWorkbook([sheetWith()], record, 'Pics', 'xlsx', undefined, bytes);
    const read = await readBack(out.data, 'xlsx');
    expect(pictured(read.file)).toEqual([RED_AT_B2, BLUE_AT_C3, RED_AT_B4]);
    expect(read.file.sheets[0]!.cells.find((c) => c.r === 1 && c.c === 1)!.value).toBeUndefined();
    expect(read.file.kept?.parts.some((p) => p.name.startsWith('xl/richData/')) ?? false).toBe(
      false,
    );
    expect(read.losses).toEqual([]);
  });

  it('reads Excel’s structure keys in any order, and a cell of another rich value as its cached value', async () => {
    const out = writeWorkbook([sheetWith()], record, 'Pics', 'xlsx', undefined, bytes);
    let data = await edited(out.data, 'xl/richData/rdrichvaluestructure.xml', (xml) =>
      xml
        .replace(
          '<k n="_rvRel:LocalImageIdentifier" t="i"/><k n="CalcOrigin" t="i"/></s>',
          '<k n="CalcOrigin" t="i"/><k n="_rvRel:LocalImageIdentifier" t="i"/></s>',
        )
        .replace('<s t="_localImage"><k n="_rvRel', '<s t="_linkedEntity"><k n="_rvRel'),
    );
    data = await edited(data, 'xl/richData/rdrichvalue.xml', (xml) =>
      xml.replace('<rv s="1"><v>1</v><v>5</v></rv>', '<rv s="1"><v>5</v><v>1</v></rv>'),
    );
    const read = await readBack(data, 'xlsx');
    expect(pictured(read.file)).toEqual([BLUE_AT_C3]);
    expect(read.file.sheets[0]!.cells.find((c) => c.r === 1 && c.c === 1)!.value).toEqual({
      k: 'e',
      v: '#VALUE!',
    });
  });

  it.each([
    [
      'a picture of another format',
      'xl/richData/_rels/richValueRel.xml.rels',
      (x: string) => x.replace('image2.png', 'image9.emf'),
    ],
    [
      'a rich value naming no relationship',
      'xl/richData/richValueRel.xml',
      (x: string) => x.replace('<rel r:id="rId2"/>', ''),
    ],
    [
      'relationships naming no bytes',
      'xl/richData/_rels/richValueRel.xml.rels',
      (x: string) => x.replace(/<Relationship [^>]*image2\.png"\/>/, ''),
    ],
  ])('leaves a cell empty for %s, named', async (_, entry, change) => {
    const out = writeWorkbook([sheetWith()], record, 'Pics', 'xlsx', undefined, bytes);
    const read = await readBack(await edited(out.data, entry, change), 'xlsx');
    expect(pictured(read.file)).toEqual([RED_AT_B2, RED_AT_B4]);
    const c3 = read.file.sheets[0]!.cells.find((c) => c.r === 2 && c.c === 2);
    expect(c3?.value).toBeUndefined();
    expect(read.losses).toContainEqual({ k: 'picture_unread', sheet: 'Sheet1', why: 'unreadable' });
  });

  it('leaves every cell empty, named, when the rich value relationships have no relationships part', async () => {
    const out = writeWorkbook([sheetWith()], record, 'Pics', 'xlsx', undefined, bytes);
    const entries = await entriesOf(out.data);
    entries.delete('xl/richData/_rels/richValueRel.xml.rels');
    const data = writeTestZip([...entries].map(([k, d]) => ({ name: k, data: d })));
    const read = await readBack(data, 'xlsx');
    expect(pictured(read.file)).toEqual([]);
    expect(read.losses.filter((l) => l.k === 'picture_unread')).toHaveLength(3);
  });

  it.each([
    [
      'no metadata',
      'xl/_rels/workbook.xml.rels',
      (x: string) => x.replace(/<Relationship [^>]*sheetMetadata"[^>]*\/>/, ''),
    ],
    [
      'a value block of another type',
      'xl/metadata.xml',
      (x: string) => x.replace('<rc t="1" v="0"/>', '<rc t="2" v="0"/>'),
    ],
    [
      'a block naming no rich value',
      'xl/metadata.xml',
      (x: string) => x.replace('<xlrd:rvb i="0"/>', '<xlrd:rvb i="x"/>'),
    ],
    [
      'a cell naming no block',
      'xl/worksheets/sheet1.xml',
      (x: string) => x.replace('vm="1"', 'vm="9"'),
    ],
    [
      'no value metadata',
      'xl/metadata.xml',
      (x: string) => x.replace(/<valueMetadata.*<\/valueMetadata>/, ''),
    ],
    [
      'a block holding no rich value',
      'xl/metadata.xml',
      (x: string) =>
        x.replace(
          /<bk><extLst><ext uri="\{3e2802c4[^"]*"><xlrd:rvb i="0"\/><\/ext><\/extLst><\/bk>/,
          '<bk/>',
        ),
    ],
    [
      'unreadable rich values',
      'xl/richData/rdrichvalue.xml',
      (x: string) => x.replace('</rvData>', ''),
    ],
    [
      'a rich value naming no relationship index',
      'xl/richData/rdrichvalue.xml',
      (x: string) => x.replace('<rv s="0"><v>0</v>', '<rv s="0"><v>x</v>'),
    ],
  ])('reads cached values with %s', async (_, entry, change) => {
    const out = writeWorkbook([sheetWith()], record, 'Pics', 'xlsx', undefined, bytes);
    const read = await readBack(await edited(out.data, entry, change), 'xlsx');
    const b2 = read.file.sheets[0]!.cells.find((c) => c.r === 1 && c.c === 1);
    expect(b2?.readPicture).toBeUndefined();
    expect(b2?.value).toEqual({ k: 'e', v: '#VALUE!' });
  });
});

describe('pictures in cells written to ODF', () => {
  it('frames each in its cell, filling it and ending in it, and reads it back', async () => {
    const out = writeWorkbook([sheetWith()], record, 'Pics', 'ods', undefined, bytes);
    expect(out.losses).toEqual([]);
    const entries = await entriesOf(out.data);
    const content = text(entries.get('content.xml'));
    expect(content).toContain(
      `table:end-cell-address="'Sheet1'.B2" table:end-x="3.175cm" table:end-y="0.741cm" svg:x="0cm" svg:y="0cm" svg:width="3.175cm" svg:height="0.741cm"`,
    );
    expect(content).toContain('<svg:desc>A red &amp; "box"</svg:desc>');
    expect([...entries.keys()].filter((k) => k.startsWith('Pictures/'))).toHaveLength(2);
    const read = await readBack(out.data, 'ods');
    expect(pictured(read.file)).toEqual([RED_AT_B2, BLUE_AT_C3, RED_AT_B4]);
    expect(read.file.sheets[0]!.readPictures).toBeUndefined();
    expect(read.file.kept?.parts.some((p) => p.name.startsWith('Pictures/')) ?? false).toBe(false);
  });

  it('reads a picture in a cell with a format of its own', async () => {
    const sheet = sheetWith();
    const key = [...sheet.cells.keys()][0]!;
    sheet.cells.set(key, { ...sheet.cells.get(key)!, format: { bg: '#ff0000' } });
    const read = await readBack(
      writeWorkbook([sheet], record, 'P', 'ods', undefined, bytes).data,
      'ods',
    );
    const b2 = read.file.sheets[0]!.cells.find((c) => c.r === 1 && c.c === 1)!;
    expect(b2.readPicture?.alt).toBe('A red & "box"');
    expect(b2.style).toBeDefined();
  });

  it('reads a flat file’s inline picture in its cell', async () => {
    const out = writeWorkbook([sheetWith()], record, 'Pics', 'fods', undefined, bytes);
    const got = await readOds(out.data);
    if (!got.ok) throw new Error(got.rejection);
    expect(pictured(got.file)).toEqual([RED_AT_B2, BLUE_AT_C3, RED_AT_B4]);
  });

  it('reads a frame ending in another cell, or set into its cell, as a picture over the cells', async () => {
    const out = writeWorkbook(
      [sheetWith({ B4: pictureInput('g-blue') })],
      record,
      'P',
      'ods',
      undefined,
      bytes,
    );
    const data = await edited(out.data, 'content.xml', (xml) =>
      xml
        .replace(`table:end-cell-address="'Sheet1'.B2"`, `table:end-cell-address="'Sheet1'.C3"`)
        .replace(/(end-cell-address="'Sheet1'\.C3"[^>]*?)svg:x="0cm"/, '$1svg:x="0.5cm"'),
    );
    const read = await readBack(data, 'ods');
    expect(pictured(read.file)).toEqual([{ ...BLUE_AT_C3 }, { r: 3, c: 1, alt: undefined, w: 8 }]);
    expect(read.file.sheets[0]!.readPictures).toHaveLength(1);
  });

  it('leaves out a picture without its bytes, named', async () => {
    const out = writeWorkbook(
      [sheetWith({ C3: pictureInput('g-gone') })],
      record,
      'P',
      'ods',
      undefined,
      bytes,
    );
    expect(out.losses).toEqual([{ k: 'picture_unwritten', sheet: 'Sheet1', why: 'unavailable' }]);
  });

  it('leaves out every picture in a cell of a sheet keeping its file’s own shapes, named', async () => {
    const got = await readOds(new TextEncoder().encode(odfFlatWithKept()));
    if (!got.ok) throw new Error(got.rejection);
    const first = got.file.sheets[0]!;
    const cells = [...first.cells, { r: 40, c: 0, picture: { imageId: 'g-red' } }];
    const file = { ...got.file, sheets: [{ ...first, cells }], pictureBytes: bytes };
    const out = writeFlatOds(file, 'kept');
    expect(out.losses).toContainEqual({
      k: 'picture_unwritten',
      sheet: first.name,
      why: 'kept_drawing',
    });
    expect(out.data).not.toContain('Picture in cell');
  });
});

describe('pictures in cells stored on opening', () => {
  const store =
    (refuse: Set<number>): PictureStore =>
    async ({ natural }) =>
      refuse.has(natural.width)
        ? { ok: false, why: 'gallery_full' }
        : { ok: true, imageId: `got-${natural.width}` };

  it('puts each stored picture in its cell, its format kept, and leaves one not stored empty, named', async () => {
    const out = writeWorkbook([sheetWith()], record, 'Pics', 'xlsx', undefined, bytes);
    const read = await readBack(out.data, 'xlsx');
    const made = sheetsFromFile(read.file, 'en-GB', rand);
    expect(made.pictures).toHaveLength(3);
    const losses: FileLoss[] = [];
    const placed = await picturesPlaced(made.sheets, made.pictures!, store(new Set([8])), losses);
    expect(placed).toMatchObject({ placed: 2, left: 1 });
    expect(losses).toEqual([{ k: 'picture_unread', sheet: 'Sheet1', why: 'gallery_full' }]);
    const sheet = placed.sheets[0]!;
    const inputs = sheet.cells.filter((c) => c.i && 'img' in c.i).map((c) => c.i);
    expect(inputs).toEqual([
      { img: { id: 'got-30', alt: 'A red & "box"' } },
      { img: { id: 'got-30', alt: 'A red & "box"' } },
    ]);
    expect(sheet.cells.some((c) => c.i && 'e' in c.i)).toBe(false);
    expect(sheet.layout.objects).toBeUndefined();
  });

  it('keeps a cell’s format beside its picture', async () => {
    const sheets = [
      {
        id: 's1',
        title: 'S',
        layout: emptyLayout(rand, 2, 2),
        cells: [
          { r: 'q', c: 'c', i: { n: 1 } },
          { r: 'r', c: 'c', f: { b: true as const } },
        ],
      },
    ];
    const picture = {
      sheetId: 's1',
      bytes: RED,
      type: 'image/png' as const,
      natural: { width: 30, height: 20 },
      place: { cell: { r: 'r', c: 'c' } },
    };
    const placed = await picturesPlaced(sheets, [picture], store(new Set()), []);
    expect(placed.sheets[0]!.cells).toEqual([
      { r: 'q', c: 'c', i: { n: 1 } },
      { r: 'r', c: 'c', f: { b: true }, i: { img: { id: 'got-30' } } },
    ]);
  });
});
