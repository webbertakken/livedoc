import { describe, expect, it } from 'vitest';
import { markFaceFiles } from '../testing/fixtures';
import { checksum, Sfnt, TRUETYPE } from './sfnt';
import { NotWoff, sfntOfWoff, woffTables } from './woff';

const LATIN = 'noto-sans/files/noto-sans-latin-400-normal.woff';
const GREEK = 'noto-sans/files/noto-sans-greek-700-normal.woff';

// marks.md "Words in every script": the mark faces are served as WOFF 1.0 and embedded as the TrueType they wrap.
describe('a mark face as its tables', () => {
  it('reads a WOFF file as the tables of the TrueType it wraps', async () => {
    const tables = await woffTables(await markFaceFiles(LATIN));
    expect([...tables.keys()]).toEqual(
      expect.arrayContaining(['cmap', 'glyf', 'head', 'hhea', 'hmtx', 'loca', 'maxp', 'name']),
    );
    expect(Sfnt.glyphCount(tables)).toBe(281);
  });

  it('refuses a file that is no WOFF 1.0 by name', async () => {
    await expect(woffTables(new Uint8Array(64))).rejects.toBeInstanceOf(NotWoff);
    await expect(woffTables(new Uint8Array(8))).rejects.toThrow('not a WOFF 1.0 file');
  });

  it('builds an sfnt whose tables read back as they were, its head adjusted to the whole', async () => {
    const tables = await woffTables(await markFaceFiles(LATIN));
    const sfnt = await sfntOfWoff(await markFaceFiles(LATIN));
    expect(new DataView(sfnt.buffer).getUint32(0)).toBe(TRUETYPE);
    const again = Sfnt.tables(sfnt);
    for (const [tag, bytes] of tables) if (tag !== 'head') expect(again.get(tag)).toEqual(bytes);
    // The font's own checksum, its head's adjustment counted, is the standard's magic number.
    expect(checksum(sfnt)).toBe(0xb1b0afba);
  });

  it('reads each character a face has, and its advance', async () => {
    const tables = await woffTables(await markFaceFiles(LATIN));
    const characters = Sfnt.characters(tables);
    const advances = Sfnt.advances(tables);
    expect(advances[characters.get(0x41)!]).toBe(639);
    expect(advances[characters.get(0x20)!]).toBe(260);
    expect(characters.has(0x3b1)).toBe(false);
    const greek = Sfnt.characters(await woffTables(await markFaceFiles(GREEK)));
    expect(greek.has(0x3b1)).toBe(true);
  });

  it('reads what a font descriptor says of a face', async () => {
    const metrics = Sfnt.metrics(await woffTables(await markFaceFiles(LATIN)));
    expect(metrics).toMatchObject({ unitsPerEm: 1000, postScriptName: 'NotoSans-Regular' });
    expect(metrics.ascent).toBeGreaterThan(700);
    expect(metrics.descent).toBeLessThan(-200);
    expect(metrics.capHeight).toBe(714);
    expect(metrics.bbox[2]).toBeGreaterThan(metrics.bbox[0]);
  });

  it('reads a format 12 character map, a missing name and a version 1 OS/2 as the standard allows', () => {
    // A face of two glyphs, its character map format 12 alone, its name holding no PostScript name.
    const u16 = (...values: number[]) => values.flatMap((v) => [(v >> 8) & 255, v & 255]);
    const u32 = (...values: number[]) =>
      values.flatMap((v) => [...u16(v >>> 16), ...u16(v & 0xffff)]);
    const head = new Uint8Array(54);
    new DataView(head.buffer).setUint16(18, 2048);
    const hhea = new Uint8Array(36);
    new DataView(hhea.buffer).setInt16(4, 1638);
    new DataView(hhea.buffer).setUint16(34, 1);
    const tables = new Map<string, Uint8Array>([
      [
        'cmap',
        new Uint8Array([
          ...u16(0, 1),
          ...u16(3, 10),
          ...u32(12),
          ...u16(12, 0),
          ...u32(28, 0, 1),
          ...u32(0x1f600, 0x1f601, 1),
        ]),
      ],
      ['head', head],
      ['hhea', hhea],
      ['hmtx', new Uint8Array(u16(1000, 0))],
      ['maxp', new Uint8Array([...u32(0x5000), ...u16(3)])],
      ['name', new Uint8Array(u16(0, 0, 6))],
      ['OS/2', new Uint8Array(u16(1))],
    ]);
    expect([...Sfnt.characters(tables)]).toEqual([
      [0x1f600, 1],
      [0x1f601, 2],
    ]);
    expect(Sfnt.advances(tables)).toEqual([1000, 1000, 1000]);
    expect(Sfnt.metrics(tables)).toMatchObject({
      ascent: 800,
      capHeight: 800,
      postScriptName: 'LiveDocMarkFace',
    });
    expect(() => Sfnt.metrics(new Map())).toThrow('the face has no head table');
    expect(Sfnt.characters(new Map([['cmap', new Uint8Array(u16(0, 0))]]))).toEqual(new Map());
  });

  it('reads a format 4 map through its glyph array, a Macintosh name, and a face with no OS/2', () => {
    const u16 = (...values: number[]) => values.flatMap((v) => [(v >> 8) & 255, v & 255]);
    const u32 = (...values: number[]) =>
      values.flatMap((v) => [...u16(v >>> 16), ...u16(v & 0xffff)]);
    // Two segments: A and B through the glyph array (A is glyph 7, B none), then the closing 0xFFFF.
    const format4 = [
      ...u16(4, 32, 0, 4, 4, 1, 0),
      ...u16(0x42, 0xffff, 0),
      ...u16(0x41, 0xffff),
      ...u16(0, 1),
      ...u16(4, 0),
      ...u16(7, 0),
    ];
    const head = new Uint8Array(54);
    new DataView(head.buffer).setUint16(18, 1000);
    const hhea = new Uint8Array(36);
    new DataView(hhea.buffer).setInt16(4, 900);
    const name = [
      ...u16(0, 1, 18),
      ...u16(1, 0, 0, 6, 4, 0),
      ...'Mac!'.split('').map((c) => c.charCodeAt(0)),
    ];
    const tables = new Map<string, Uint8Array>([
      ['cmap', new Uint8Array([...u16(0, 1), ...u16(3, 1), ...u32(12), ...format4])],
      ['head', head],
      ['hhea', hhea],
      ['name', new Uint8Array(name)],
    ]);
    expect([...Sfnt.characters(tables)]).toEqual([[0x41, 7]]);
    expect(Sfnt.metrics(tables)).toMatchObject({ capHeight: 900, postScriptName: 'Mac!' });
  });

  it('sums a table whose length is no multiple of four as if padded, and builds a font with no head', () => {
    expect(checksum(new Uint8Array([1, 2, 3]))).toBe(0x01020300);
    expect(checksum(new Uint8Array([1]))).toBe(0x01000000);
    const built = Sfnt.build(new Map([['name', new Uint8Array([1, 2, 3])]]));
    expect(Sfnt.tables(built).get('name')).toEqual(new Uint8Array([1, 2, 3]));
  });
});
