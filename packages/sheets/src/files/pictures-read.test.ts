// docs/specs/029-sheets/standard-mapping.md "Pictures in the file", Reading (D628): a picture over the cells of PNG,
// JPEG, GIF or WebP bytes the file holds is read back with its place, size and alt text, from XLSX, ODF and flat ODF,
// beside the drawing's charts; any other drawing keeps every drawing of its sheet, as before; the entries a read
// picture took leave the kept content unless kept content still names them.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ByteBudget, listZip, readZipEntry } from '@livedoc/office-packages';
import { solidPng, writeTestZip } from '@livedoc/office-packages/testing';
import { emptyLayout, emptySheet, type Sheet } from '../sheet';
import type { SheetImage } from '../objects/sheet-image';
import { WorkbookRecord } from '../workbook-record';
import { readablePicture, type FilePictureFetches } from './file-pictures';
import { readOds } from './ods-read';
import { readXlsx } from './xlsx-read';
import { writeWorkbook } from './write-workbook';

let n = 9;
const rand = () => (n = (n * 16807) % 2147483647) / 2147483647;
const record = WorkbookRecord.create({ locale: 'en-GB', timeZone: 'UTC' });

const RED = solidPng(30, 20, [200, 0, 0]);
const BLUE = solidPng(8, 8, [0, 0, 200]);
const GIF = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 5, 0, 7, 0, 0, 0, 0]);

function sheetWith(images: Omit<SheetImage, 'at' | 'kind'>[]): Sheet {
  const layout = emptyLayout(rand, 6, 6);
  const anchor = { r: layout.rows[1]!, c: layout.cols[2]!, dx: 4, dy: 8 };
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

const red = { id: 'img1', width: 200, height: 100, imageId: 'g-red', alt: 'A red box' };
const blue = { id: 'img2', width: 40, height: 40, imageId: 'g-blue' };
const bytes: FilePictureFetches = new Map([
  ['g-red', { data: RED, type: 'image/png' as const }],
  ['g-blue', { data: BLUE, type: 'image/png' as const }],
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
const encode = (s: string) => new TextEncoder().encode(s);

// A written package with one entry's text changed.
async function edited(
  data: Uint8Array<ArrayBuffer>,
  name: string,
  change: (xml: string) => string,
): Promise<Uint8Array<ArrayBuffer>> {
  const entries = await entriesOf(data);
  const was = text(entries.get(name));
  const now = change(was);
  if (now === was) throw new Error(`${name} unchanged`);
  entries.set(name, encode(now));
  return writeTestZip([...entries].map(([n, d]) => ({ name: n, data: d })));
}

const written = (format: 'xlsx' | 'ods' | 'fods', images = [red, blue]) =>
  writeWorkbook([sheetWith(images)], record, 'Pics', format, undefined, bytes).data;

async function readBack(data: Uint8Array<ArrayBuffer>, format: 'xlsx' | 'ods') {
  const got = format === 'xlsx' ? await readXlsx(data) : await readOds(data);
  if (!got.ok) throw new Error(got.rejection);
  return got.file;
}

const redRead = {
  at: { r: 1, c: 2, dx: 4, dy: 8 },
  width: 200,
  height: 100,
  alt: 'A red box',
  bytes: RED,
  type: 'image/png',
  natural: { width: 30, height: 20 },
};
const blueRead = {
  at: { r: 1, c: 2, dx: 4, dy: 8 },
  width: 40,
  height: 40,
  bytes: BLUE,
  type: 'image/png',
  natural: { width: 8, height: 8 },
};

describe('readablePicture', () => {
  it('takes PNG, JPEG, GIF and WebP by their header, with their pixels', () => {
    expect(readablePicture(RED)).toEqual({ type: 'image/png', natural: { width: 30, height: 20 } });
    expect(readablePicture(GIF)).toEqual({ type: 'image/gif', natural: { width: 5, height: 7 } });
  });

  it('refuses any other bytes, and a picture past the pixels a read takes', () => {
    expect(readablePicture(encode('<svg/>'))).toBeNull();
    const huge = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0xff, 0xff, 0xff, 0xff]);
    expect(readablePicture(huge)).toBeNull();
  });
});

describe('pictures read from XLSX', () => {
  it('reads each picture with its place, size and alt text, the drawing and media leaving the kept content', async () => {
    const file = await readBack(written('xlsx'), 'xlsx');
    expect(file.sheets[0]!.readPictures).toEqual([redRead, blueRead]);
    const names = (file.kept?.parts ?? []).map((p) => p.name);
    expect(names.filter((x) => /drawing|media/.test(x))).toEqual([]);
  });

  it('reads a title when the picture has no description, and a two-cell anchor by its corners', async () => {
    const data = await edited(written('xlsx', [blue]), 'xl/drawings/drawing1.xml', (xml) =>
      xml
        .replace(/name="Picture 1"/, 'name="Picture 1" title="Blue"')
        .replace(
          /<xdr:oneCellAnchor>(<xdr:from>.*?<\/xdr:from>)<xdr:ext [^>]*\/>/,
          '<xdr:twoCellAnchor editAs="oneCell">$1<xdr:to><xdr:col>3</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>2</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>',
        )
        .replace('</xdr:oneCellAnchor>', '</xdr:twoCellAnchor>'),
    );
    const [picture] = (await readBack(data, 'xlsx')).sheets[0]!.readPictures!;
    expect(picture).toMatchObject({ alt: 'Blue', at: { r: 1, c: 2, dx: 4, dy: 8 } });
    expect(picture!.width).toBeGreaterThan(16);
  });

  const DRAWING = 'xl/drawings/drawing1.xml';
  const RELS = 'xl/drawings/_rels/drawing1.xml.rels';
  it.each([
    ['a picture of another format', RELS, (x: string) => x.replace('image1.png', 'image9.emf')],
    ['a linked picture', DRAWING, (x: string) => x.replace('r:embed="rId1"', 'r:link="rId1"')],
    [
      'a picture naming no part',
      DRAWING,
      (x: string) => x.replace('r:embed="rId1"', 'r:embed="rId99"'),
    ],
    [
      'a cropped picture',
      DRAWING,
      (x: string) => x.replace('<a:stretch>', '<a:srcRect l="1000"/><a:stretch>'),
    ],
    ['a turned picture', DRAWING, (x: string) => x.replace('<a:xfrm>', '<a:xfrm rot="5400000">')],
    ['a shape', DRAWING, (x: string) => x.replace('<xdr:pic>', '<xdr:sp/><xdr:pic>')],
    ['an unreadable drawing', DRAWING, (x: string) => x.replace('</xdr:wsDr>', '')],
  ])('keeps the drawing whole beside %s', async (_, entry, change) => {
    const file = await readBack(await edited(written('xlsx', [red]), entry, change), 'xlsx');
    expect(file.sheets[0]!.readPictures).toBeUndefined();
    expect(file.kept?.parts.map((p) => p.name)).toContain(DRAWING);
  });

  it('reads a picture whose crop crops nothing', async () => {
    const data = await edited(written('xlsx', [red]), DRAWING, (x) =>
      x.replace('<a:stretch>', '<a:srcRect/><a:stretch>'),
    );
    expect((await readBack(data, 'xlsx')).sheets[0]!.readPictures).toHaveLength(1);
  });

  it('keeps a picture’s media another kept drawing still names', async () => {
    const two = [sheetWith([red]), { ...sheetWith([red]), id: 'sheetTwo2', title: 'Sheet2' }];
    const data = writeWorkbook(two, record, 'Pics', 'xlsx', undefined, bytes).data;
    const entries = await entriesOf(data);
    const second = [...entries.keys()].find((k) => /drawings\/drawing2\.xml$/.test(k))!;
    const file = await readBack(
      await edited(data, second, (x) => x.replace('<xdr:pic>', '<xdr:sp/><xdr:pic>')),
      'xlsx',
    );
    expect(file.sheets[0]!.readPictures).toHaveLength(1);
    expect(file.sheets[1]!.readPictures).toBeUndefined();
    expect(file.kept?.parts.map((p) => p.name)).toContain('xl/media/image1.png');
  });
});

describe('pictures read from ODF', () => {
  it('reads each picture of a package with its place, size and alt text, its entry leaving the kept content', async () => {
    const file = await readBack(written('ods'), 'ods');
    expect(file.sheets[0]!.readPictures).toEqual([redRead, blueRead]);
    expect(
      (file.kept?.parts ?? []).map((p) => p.name).filter((x) => x.startsWith('Pictures/')),
    ).toEqual([]);
  });

  it('reads a flat file’s inline pictures', async () => {
    const file = await readBack(written('fods'), 'ods');
    expect(file.sheets[0]!.readPictures).toEqual([redRead, blueRead]);
  });

  it('reads a title when the frame has no description', async () => {
    const data = await edited(written('ods', [red]), 'content.xml', (xml) =>
      xml.replace('<svg:desc>A red box</svg:desc>', '<svg:title>Red</svg:title>'),
    );
    expect((await readBack(data, 'ods')).sheets[0]!.readPictures![0]!.alt).toBe('Red');
  });

  it.each([
    [
      'a turned frame',
      (x: string) => x.replace('<draw:frame ', '<draw:frame draw:transform="rotate (1)" '),
    ],
    [
      'a frame holding text too',
      (x: string) => x.replace('</draw:frame>', '<draw:text-box/></draw:frame>'),
    ],
    ['a picture of another format', (x: string) => x.replace('Pictures/1.png', 'Pictures/9.svm')],
    ['a picture naming no bytes', (x: string) => x.replace(/ xlink:href="Pictures\/1\.png"/, '')],
  ])('keeps every drawing beside %s', async (_, change) => {
    const data = await edited(written('ods', [red]), 'content.xml', change);
    const file = await readBack(data, 'ods');
    expect(file.sheets[0]!.readPictures).toBeUndefined();
  });

  it('keeps a flat file’s drawing whose inline bytes do not read', async () => {
    const flat = text(written('fods', [red])).replace(
      /<office:binary-data>[^<]*<\/office:binary-data>/,
      '<office:binary-data>!!</office:binary-data>',
    );
    const file = await readBack(encode(flat), 'ods');
    expect(file.sheets[0]!.readPictures).toBeUndefined();
  });

  it('keeps a picture’s entry kept content still names', async () => {
    const data = await edited(written('ods', [red]), 'content.xml', (xml) =>
      xml.replace(
        '<draw:frame ',
        '<draw:frame draw:name="Other" svg:width="1cm" svg:height="1cm"><draw:image xlink:href="Pictures/1.png"/><draw:text-box/></draw:frame><draw:frame ',
      ),
    );
    const file = await readBack(data, 'ods');
    expect(file.sheets[0]!.readPictures).toBeUndefined();
    expect(file.kept?.parts.map((p) => p.name)).toContain('Pictures/1.png');
  });
});

describe('other apps’ pictures', () => {
  const corpus = (path: string) =>
    new Uint8Array(readFileSync(join(import.meta.dirname, '..', '..', 'corpus', path)));
  it.each([
    'libreoffice/pictures.ods',
    'libreoffice/pictures.xlsx',
    'google/pictures.ods',
    'google/pictures.xlsx',
  ])('reads %s’s two pictures at their cells, near their sizes', async (path) => {
    const file = await readBack(corpus(path), path.endsWith('.xlsx') ? 'xlsx' : 'ods');
    const read = file.sheets[0]!.readPictures!;
    expect(read.map((p) => [p.at.r, p.at.c, p.natural])).toEqual([
      [1, 1, { width: 60, height: 40 }],
      [4, 3, { width: 24, height: 24 }],
    ]);
    // Each app rounds a size its own way, LibreOffice's XLSX by its anchor's corners: within 8 px.
    expect(read.map((p) => [Math.round(p.width / 8), Math.round(p.height / 8)])).toEqual([
      [15, 10],
      [6, 6],
    ]);
  });
});
