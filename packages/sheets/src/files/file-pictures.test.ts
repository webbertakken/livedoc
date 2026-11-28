// docs/specs/029-sheets/standard-mapping.md "Pictures in the file" (D626): a sheet's images over cells written as
// pictures over the cells in XLSX, ODF and flat ODF, their bytes the download read; a picture without them, past the
// budget, or on a sheet keeping its file's drawing, left out and named.
import { describe, expect, it } from 'vitest';
import { ByteBudget, listZip, readZipEntry } from '@livedoc/office-packages';
import { emptyLayout, emptySheet, type Sheet } from '../sheet';
import type { SheetImage } from '../objects/sheet-image';
import { WorkbookRecord } from '../workbook-record';
import { excelFileWithKept, odfFlatWithKept } from '../testing/kept-files';
import {
  filePicturesOf,
  filePictureType,
  picturesWithinBudget,
  PICTURE_FILE_BYTES_MAX,
  type FilePictureFetches,
} from './file-pictures';
import { importReport } from './import-report';
import { importReportLine } from './import-report-copy';
import { writeWorkbook } from './write-workbook';
import { writeFlatOds } from './ods-write';
import { readOds } from './ods-read';
import { readXlsx } from './xlsx-read';
import { writeXlsx } from './xlsx-write';
import type { WorkbookFile } from './workbook-file';

let n = 9;
const rand = () => (n = (n * 16807) % 2147483647) / 2147483647;
const record = WorkbookRecord.create({ locale: 'en-GB', timeZone: 'UTC' });

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 9]);

function sheetWith(
  images: Omit<SheetImage, 'at' | 'kind'>[],
  at: [number, number] = [1, 2],
): Sheet {
  const layout = emptyLayout(rand, 6, 6);
  const anchor = { r: layout.rows[at[0]]!, c: layout.cols[at[1]]!, dx: 4, dy: 8 };
  return emptySheet({
    id: 'sheetOne1',
    tabId: 't1',
    title: 'Sheet1',
    layout: {
      ...layout,
      objects: images.map((x) => ({ ...x, kind: 'image' as const, at: anchor })),
    },
  });
}

const cat = { id: 'img1', width: 200, height: 100, imageId: 'g-cat', alt: 'A cat & "co"' };
const dog = { id: 'img2', width: 40, height: 40, imageId: 'g-dog' };
const bytes: FilePictureFetches = new Map([
  ['g-cat', { data: PNG, type: 'image/png' as const }],
  ['g-dog', { data: JPEG, type: 'image/jpeg' as const }],
]);

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

describe('filePicturesOf', () => {
  it('places each image by its anchor cell and offset, with its size and alt text', () => {
    expect(filePicturesOf(sheetWith([cat, dog]))).toEqual([
      { imageId: 'g-cat', at: { r: 1, c: 2, dx: 4, dy: 8 }, width: 200, height: 100, alt: cat.alt },
      { imageId: 'g-dog', at: { r: 1, c: 2, dx: 4, dy: 8 }, width: 40, height: 40 },
    ]);
  });

  it('holds none for a sheet without images', () => {
    expect(filePicturesOf(sheetWith([]))).toEqual([]);
  });
});

describe('picturesWithinBudget', () => {
  it('takes pictures in paint order while the total holds, none after the first past it', () => {
    expect([
      ...picturesWithinBudget(
        [
          ['a', 40],
          ['b', 50],
          ['c', 5],
        ],
        60,
      ),
    ]).toEqual(['a']);
  });

  it('holds 50 MB by default', () => {
    expect(PICTURE_FILE_BYTES_MAX).toBe(52_428_800);
    expect(picturesWithinBudget([['a', PICTURE_FILE_BYTES_MAX]]).has('a')).toBe(true);
  });
});

describe('filePictureType', () => {
  it('takes the types a file holds, never another', () => {
    expect(filePictureType('image/webp')).toBe('image/webp');
    expect(filePictureType('image/svg+xml')).toBeNull();
    expect(filePictureType(undefined)).toBeNull();
  });
});

describe('pictures written to XLSX', () => {
  it('draws each picture after a one-cell anchor, naming one media part an image', async () => {
    const twice = sheetWith([cat, dog, { ...cat, id: 'img3' }]);
    const out = writeWorkbook([twice], record, 'Pics', 'xlsx', undefined, bytes);
    expect(out.losses).toEqual([]);
    const entries = await entriesOf(out.data);
    expect(entries.get('xl/media/image1.png')).toEqual(PNG);
    expect(entries.get('xl/media/image2.jpeg')).toEqual(JPEG);
    expect([...entries.keys()].filter((k) => k.startsWith('xl/media/'))).toHaveLength(2);
    const drawing = text(entries.get('xl/drawings/drawing1.xml'));
    expect(drawing.match(/<xdr:pic>/g)).toHaveLength(3);
    expect(drawing).toContain(
      '<xdr:from><xdr:col>2</xdr:col><xdr:colOff>38100</xdr:colOff><xdr:row>1</xdr:row><xdr:rowOff>76200</xdr:rowOff></xdr:from>',
    );
    expect(drawing).toContain('<xdr:ext cx="1905000" cy="952500"/>');
    expect(drawing).toContain('name="Picture 1" descr="A cat &amp; &quot;co&quot;"');
    expect(drawing).toContain('<a:blip r:embed="rId1"/>');
    const rels = text(entries.get('xl/drawings/_rels/drawing1.xml.rels'));
    expect(rels).toContain('Target="../media/image1.png"');
    expect(rels.match(/relationships\/image"/g)).toHaveLength(3);
    expect(text(entries.get('[Content_Types].xml'))).toContain('image/jpeg');
    expect(text(entries.get('xl/worksheets/sheet1.xml'))).toMatch(/<drawing r:id="rId\d+"\/>/);
  });

  it('leaves a picture out without its bytes or past the budget, naming each', () => {
    const partial: FilePictureFetches = new Map([['g-dog', 'too_large']]);
    const out = writeWorkbook([sheetWith([cat, dog])], record, 'Pics', 'xlsx', undefined, partial);
    expect(out.losses).toEqual([
      { k: 'picture_unwritten', sheet: 'Sheet1', why: 'unavailable' },
      { k: 'picture_unwritten', sheet: 'Sheet1', why: 'too_large' },
    ]);
  });

  it('writes no drawing for a sheet whose pictures all lack their bytes', async () => {
    const out = writeWorkbook([sheetWith([cat])], record, 'Pics', 'xlsx');
    const entries = await entriesOf(out.data);
    expect([...entries.keys()].some((k) => k.startsWith('xl/drawings/'))).toBe(false);
  });

  it('leaves out every picture of a sheet keeping its file’s own drawing', async () => {
    const got = await readXlsx(excelFileWithKept());
    if (!got.ok) throw new Error(got.rejection);
    const read = got.file;
    const file: WorkbookFile = {
      ...read,
      sheets: read.sheets.map((s, i) =>
        i === 0 ? { ...s, pictures: filePicturesOf(sheetWith([cat])) } : s,
      ),
      pictureBytes: bytes,
    };
    const out = writeXlsx(file, 'kept');
    expect(out.losses).toContainEqual({
      k: 'picture_unwritten',
      sheet: read.sheets[0]!.name,
      why: 'kept_drawing',
    });
  });
});

describe('pictures written to ODF', () => {
  it('frames each picture in its anchor cell after the cell’s charts, one entry an image', async () => {
    const out = writeWorkbook(
      [sheetWith([cat, dog, { ...cat, id: 'img3' }])],
      record,
      'Pics',
      'ods',
      undefined,
      bytes,
    );
    expect(out.losses).toEqual([]);
    const entries = await entriesOf(out.data);
    expect(entries.get('Pictures/1.png')).toEqual(PNG);
    expect(entries.get('Pictures/2.jpeg')).toEqual(JPEG);
    const content = text(entries.get('content.xml'));
    expect(content.match(/<draw:frame /g)).toHaveLength(3);
    expect(content).toContain(
      '<draw:frame draw:z-index="0" draw:name="Picture 1" svg:x="0.106cm" svg:y="0.212cm" svg:width="5.292cm" svg:height="2.646cm"><draw:image xlink:href="Pictures/1.png" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/><svg:desc>A cat &amp; "co"</svg:desc></draw:frame>',
    );
    expect(content.match(/Pictures\/1\.png/g)).toHaveLength(2);
    expect(text(entries.get('META-INF/manifest.xml'))).toContain(
      'manifest:full-path="Pictures/2.jpeg" manifest:media-type="image/jpeg"',
    );
  });

  it('holds the bytes inline in a flat file', () => {
    const out = writeWorkbook([sheetWith([dog])], record, 'Pics', 'fods', undefined, bytes);
    expect(new TextDecoder().decode(out.data)).toContain(
      '<draw:image><office:binary-data>/9j/CQ==</office:binary-data></draw:image>',
    );
  });

  it('wraps long inline bytes at 76 characters', () => {
    const big = new Map([['g-dog', { data: new Uint8Array(120), type: 'image/png' as const }]]);
    const out = writeWorkbook([sheetWith([dog])], record, 'Pics', 'fods', undefined, big);
    const inline = /<office:binary-data>([^<]*)</.exec(new TextDecoder().decode(out.data))![1]!;
    expect(inline.split('\n').map((l) => l.length)).toEqual([76, 76, 8]);
  });

  it('leaves out every picture of a sheet keeping its file’s own shapes', async () => {
    const got = await readOds(new TextEncoder().encode(odfFlatWithKept()));
    if (!got.ok) throw new Error(got.rejection);
    const read = got.file;
    const file: WorkbookFile = {
      ...read,
      sheets: read.sheets.map((s, i) =>
        i === 0 ? { ...s, pictures: filePicturesOf(sheetWith([cat])) } : s,
      ),
      pictureBytes: bytes,
    };
    const out = writeFlatOds(file, 'kept');
    expect(out.losses).toContainEqual({
      k: 'picture_unwritten',
      sheet: read.sheets[0]!.name,
      why: 'kept_drawing',
    });
  });
});

describe('the report of pictures left out', () => {
  it('counts the pictures and names their sheets', () => {
    const lines = importReport([
      { k: 'picture_unwritten', sheet: 'Sheet1', why: 'unavailable' },
      { k: 'picture_unwritten', sheet: 'Sheet1', why: 'too_large' },
    ]);
    expect(lines.map(importReportLine)).toEqual([
      "2 pictures over the cells are left out: unreadable, past 50 MB of pictures, or on a sheet keeping the file's own drawings: Sheet1",
    ]);
  });
});
