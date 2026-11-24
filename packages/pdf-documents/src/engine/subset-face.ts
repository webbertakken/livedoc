// A mark face cut to the glyphs a bake's marks use (docs/specs/035-pdf-documents/marks.md "In the file": a subset of
// only the glyphs its marks use, glyph ids kept). Every other glyph is left empty, so a glyph keeps its id and the
// content's codes need no map; what a PDF never reads of a TrueType face (its character map, its layout tables) is
// dropped. Pure.
import { Sfnt, type SfntTables } from './sfnt';

/** The tables a PDF's TrueType font program keeps: the outlines, their metrics, the face's names and hinting. */
const KEPT = new Set([
  'head',
  'hhea',
  'maxp',
  'hmtx',
  'OS/2',
  'name',
  'cvt ',
  'fpgm',
  'prep',
  'gasp',
]);

// A composite glyph's component flags (the OpenType `glyf` table).
const ARGS_ARE_WORDS = 0x0001;
const HAS_SCALE = 0x0008;
const MORE_COMPONENTS = 0x0020;
const HAS_X_AND_Y_SCALE = 0x0040;
const HAS_TWO_BY_TWO = 0x0080;

/** Where each glyph's outline starts in `glyf`, and where the last ends. */
function locations(tables: SfntTables): number[] {
  const loca = tables.get('loca')!;
  const data = new DataView(loca.buffer, loca.byteOffset, loca.byteLength);
  const long =
    new DataView(tables.get('head')!.buffer, tables.get('head')!.byteOffset).getInt16(50) === 1;
  return Array.from({ length: Sfnt.glyphCount(tables) + 1 }, (_, glyph) =>
    long ? data.getUint32(glyph * 4) : data.getUint16(glyph * 2) * 2,
  );
}

/** The glyphs a composite glyph is built of. */
function componentsOf(outline: Uint8Array): number[] {
  const data = new DataView(outline.buffer, outline.byteOffset, outline.byteLength);
  if (outline.length === 0 || data.getInt16(0) >= 0) return [];
  const components: number[] = [];
  let at = 10;
  for (;;) {
    const flags = data.getUint16(at);
    components.push(data.getUint16(at + 2));
    at += 4 + (flags & ARGS_ARE_WORDS ? 4 : 2);
    if (flags & HAS_SCALE) at += 2;
    else if (flags & HAS_X_AND_Y_SCALE) at += 4;
    else if (flags & HAS_TWO_BY_TWO) at += 8;
    if (!(flags & MORE_COMPONENTS)) return components;
  }
}

/** The face as a TrueType font holding only `glyphs` (and `.notdef`, and what they are built of), each at its id. */
export function subsetFace(tables: SfntTables, glyphs: Iterable<number>): Uint8Array<ArrayBuffer> {
  const glyf = tables.get('glyf')!;
  const starts = locations(tables);
  const count = starts.length - 1;
  const outline = (glyph: number) => glyf.subarray(starts[glyph], starts[glyph + 1]);
  const kept = new Set<number>();
  const pending = [0, ...glyphs].filter((glyph) => glyph >= 0 && glyph < count);
  while (pending.length > 0) {
    const glyph = pending.pop()!;
    if (kept.has(glyph)) continue;
    kept.add(glyph);
    pending.push(...componentsOf(outline(glyph)));
  }
  const padded = (length: number) => (length + 3) & ~3;
  const size = [...kept].reduce((sum, glyph) => sum + padded(outline(glyph).length), 0);
  const cut = new Uint8Array(size);
  const loca = new Uint8Array((count + 1) * 4);
  const where = new DataView(loca.buffer);
  let offset = 0;
  for (let glyph = 0; glyph < count; glyph += 1) {
    where.setUint32(glyph * 4, offset);
    if (!kept.has(glyph)) continue;
    cut.set(outline(glyph), offset);
    offset += padded(outline(glyph).length);
  }
  where.setUint32(count * 4, offset);
  const head = tables.get('head')!.slice();
  // The cut glyphs are located by four-byte offsets.
  new DataView(head.buffer).setInt16(50, 1);
  // A version 3 `post` names no glyph: a PDF reads glyphs by id.
  const post = tables.get('post')!.slice(0, 32);
  new DataView(post.buffer).setUint32(0, 0x00030000);
  const out = new Map([...tables].filter(([tag]) => KEPT.has(tag)));
  out.set('head', head);
  out.set('post', post);
  out.set('glyf', cut);
  out.set('loca', loca);
  return Sfnt.build(out);
}
