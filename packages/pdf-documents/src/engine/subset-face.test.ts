import { describe, expect, it } from 'vitest';
import { markFaceFiles } from '../testing/fixtures';
import { Sfnt, type SfntTables } from './sfnt';
import { subsetFace } from './subset-face';
import { woffTables } from './woff';

const faceOf = async (weight: 400 | 700) =>
  woffTables(await markFaceFiles(`noto-sans/files/noto-sans-latin-ext-${weight}-normal.woff`));

/** Each glyph's outline in a face. */
function outlines(tables: SfntTables): Uint8Array[] {
  const loca = tables.get('loca')!;
  const data = new DataView(loca.buffer, loca.byteOffset, loca.byteLength);
  const long =
    new DataView(tables.get('head')!.buffer, tables.get('head')!.byteOffset).getInt16(50) === 1;
  const at = (glyph: number) => (long ? data.getUint32(glyph * 4) : data.getUint16(glyph * 2) * 2);
  return Array.from({ length: Sfnt.glyphCount(tables) }, (_, glyph) =>
    tables.get('glyf')!.subarray(at(glyph), at(glyph + 1)),
  );
}

const composite = (outline: Uint8Array) =>
  outline.length > 0 && new DataView(outline.buffer, outline.byteOffset).getInt16(0) < 0;

// marks.md "In the file": a subset of only the glyphs its marks use, glyph ids kept.
describe('a mark face cut to the glyphs used', () => {
  it('keeps the glyphs asked for, the missing box and what they are built of, each at its id', async () => {
    const tables = await faceOf(400);
    const all = outlines(tables);
    const built = all.findIndex(composite);
    expect(built).toBeGreaterThan(0);
    const plain = all.findIndex(
      (outline, glyph) => glyph > 0 && outline.length > 0 && !composite(outline),
    );
    const cut = Sfnt.tables(subsetFace(tables, [built, plain, -1, 1e6]));
    const kept = outlines(cut);
    expect(kept).toHaveLength(all.length);
    // Each outline as it was, padded to a four-byte boundary.
    const same = (glyph: number) =>
      expect(kept[glyph]!.subarray(0, all[glyph]!.length)).toEqual(all[glyph]);
    same(0);
    same(built);
    same(plain);
    // Every component of the composite glyph is kept with it; any other glyph is empty.
    const components = kept.filter((outline) => outline.length > 0).length;
    expect(components).toBeGreaterThan(3);
    expect(
      kept.filter(
        (outline, glyph) => outline.length > 0 && glyph !== 0 && glyph !== built && glyph !== plain,
      ).length,
    ).toBe(components - 3);
  });

  it('drops what a PDF never reads of a face, and is a fraction of its size', async () => {
    const tables = await faceOf(700);
    const whole = Sfnt.build(tables);
    const cut = subsetFace(tables, [5, 6, 7]);
    const kept = Sfnt.tables(cut);
    expect([...kept.keys()]).toEqual(
      expect.arrayContaining([
        'OS/2',
        'glyf',
        'head',
        'hhea',
        'hmtx',
        'loca',
        'maxp',
        'name',
        'post',
      ]),
    );
    for (const dropped of ['cmap', 'GSUB', 'GPOS', 'GDEF', 'STAT'])
      expect(kept.has(dropped)).toBe(false);
    expect(new DataView(kept.get('post')!.buffer, kept.get('post')!.byteOffset).getUint32(0)).toBe(
      0x00030000,
    );
    expect(Sfnt.advances(kept)).toEqual(Sfnt.advances(tables));
    expect(cut.length).toBeLessThan(whole.length / 2);
  });

  it('cuts a face already cut, and follows a composite whose parts are scaled', async () => {
    const u16 = (...values: number[]) => values.flatMap((v) => [(v >> 8) & 255, v & 255]);
    // Glyph 1 is built of 2 (word arguments, one scale), 3 (two scales) and 4 (a two by two matrix).
    const composite = [
      ...u16(0xffff, 0, 0, 0, 0),
      ...u16(0x0001 | 0x0008 | 0x0020, 2, 0, 0, 0x4000),
      ...u16(0x0040 | 0x0020, 3, 0, 0x4000, 0x4000),
      ...u16(0x0080, 4, 0, 0x4000, 0, 0, 0x4000),
    ];
    const simple = u16(1, 0, 0, 0, 0);
    const glyphs = [simple, composite, simple, simple, simple, simple];
    const starts = glyphs.reduce((all, glyph) => [...all, all.at(-1)! + glyph.length], [0]);
    const head = new Uint8Array(54);
    new DataView(head.buffer).setInt16(50, 1);
    const tables = new Map<string, Uint8Array>([
      ['head', head],
      ['maxp', new Uint8Array([0, 0, 0x50, 0, ...u16(6)])],
      ['loca', new Uint8Array(starts.flatMap((at) => [0, 0, ...u16(at)]))],
      ['glyf', new Uint8Array(glyphs.flat())],
      ['post', new Uint8Array(32)],
    ]);
    const kept = outlines(Sfnt.tables(subsetFace(tables, [1, 2])));
    expect(kept.map((outline) => outline.length > 0)).toEqual([
      true,
      true,
      true,
      true,
      true,
      false,
    ]);
  });
});
