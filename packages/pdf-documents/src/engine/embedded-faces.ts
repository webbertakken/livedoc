// The mark faces a bake writes into the file (docs/specs/035-pdf-documents/marks.md "In the file"): each face used,
// once, as a `Type0` font over a `CIDFontType2`, `Identity-H`, its codes the glyph ids; its program a subset of only
// the glyphs the bake's marks use, ids kept; its `W` their advances; its `ToUnicode` each glyph's characters. A face's
// font is named as soon as an appearance sets words in it, and written whole once every mark is added.
import {
  PdfArray,
  PdfDict,
  PdfName,
  PdfNumber,
  PdfStream,
  PdfString,
  type PDF,
  type PdfRef,
} from '@libpdf/core';
import { subsetFace } from './subset-face';
import type { ShapedGlyph, Typesetter } from './typesetter';

/** A CMap's ranges and characters are written at most this many to a block, as the CMap format asks. */
const CMAP_BLOCK = 100;
/** The font descriptor's flags: symbolic, as a font whose codes are glyph ids. */
const SYMBOLIC = 4;
/** A stem width for a face of regular weight, which the descriptor must give and no reader of these faces reads. */
const STEM = 80;

const hex4 = (n: number): string => n.toString(16).toUpperCase().padStart(4, '0');

/** Characters as a CMap writes them: UTF-16, big-endian, in hex. */
const utf16 = (text: string): string =>
  Array.from({ length: text.length }, (_, at) => hex4(text.charCodeAt(at))).join('');

/** A six-letter subset tag made from the face and the glyphs a subset holds: the same of both, the same tag. */
export function subsetTag(face: string, glyphs: Iterable<number>): string {
  let hash = 0x811c9dc5;
  for (const character of face) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  for (const glyph of [...glyphs].sort((a, b) => a - b)) {
    hash ^= glyph;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  let tag = '';
  for (let n = 0; n < 6; n += 1) {
    tag += String.fromCharCode(65 + (hash % 26));
    hash = Math.floor(hash / 26) + n * 7919;
  }
  return tag;
}

/** The `ToUnicode` CMap: each glyph's characters. */
export function toUnicodeCMap(characters: ReadonlyMap<number, string>): string {
  const entries = [...characters].sort(([a], [b]) => a - b);
  const blocks: string[] = [];
  for (let at = 0; at < entries.length; at += CMAP_BLOCK) {
    const block = entries.slice(at, at + CMAP_BLOCK);
    blocks.push(
      `${block.length} beginbfchar`,
      ...block.map(([glyph, text]) => `<${hex4(glyph)}> <${utf16(text)}>`),
      'endbfchar',
    );
  }
  return [
    '/CIDInit /ProcSet findresource begin',
    '12 dict begin',
    'begincmap',
    '/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def',
    '/CMapName /Adobe-Identity-UCS def',
    '/CMapType 2 def',
    '1 begincodespacerange',
    '<0000> <FFFF>',
    'endcodespacerange',
    ...blocks,
    'endcmap',
    'CMapName currentdict /CMap defineresource pop',
    'end',
    'end',
  ].join('\n');
}

/** The `W` array: runs of consecutive glyph ids, each with its advance in thousandths. */
export function widthsOf(advances: ReadonlyMap<number, number>): PdfArray {
  const out = new PdfArray([]);
  let run: PdfArray | null = null;
  let last = -2;
  for (const glyph of [...advances.keys()].sort((a, b) => a - b)) {
    if (glyph !== last + 1 || !run) {
      run = new PdfArray([]);
      out.push(PdfNumber.of(glyph));
      out.push(run);
    }
    run.push(PdfNumber.of(Math.round(advances.get(glyph)!)));
    last = glyph;
  }
  return out;
}

export type EmbeddedFaces = {
  /** The font an appearance names for a face, its glyphs taken as set: one font a face a bake. */
  readonly use: (face: string, glyphs: readonly ShapedGlyph[]) => PdfRef;
  /** Writes each face used, subset to its glyphs; answers how many glyphs were the missing box. */
  readonly finish: () => { readonly missing: number };
};

export function embeddedFaces(pdf: PDF, typesetter: Typesetter): EmbeddedFaces {
  const used = new Map<string, { ref: PdfRef; dict: PdfDict; characters: Map<number, string> }>();
  let missing = 0;
  return {
    use: (face, glyphs) => {
      let entry = used.get(face);
      if (!entry) {
        const dict = PdfDict.of({ Type: PdfName.of('Font'), Subtype: PdfName.of('Type0') });
        entry = { ref: pdf.register(dict), dict, characters: new Map([[0, '']]) };
        used.set(face, entry);
      }
      for (const { glyph, text } of glyphs) {
        if (glyph === 0) missing += 1;
        // A glyph keeps the characters it was first shaped from.
        if (!entry.characters.has(glyph) || entry.characters.get(glyph) === '')
          entry.characters.set(glyph, text);
      }
      return entry.ref;
    },
    finish: () => {
      for (const [id, { dict, characters }] of used) {
        const { tables, metrics, advances } = typesetter.face(id);
        const glyphs = [...characters.keys()];
        const name = `${subsetTag(id, glyphs)}+${metrics.postScriptName}`;
        const program = subsetFace(tables, glyphs);
        const file = pdf.register(
          PdfStream.fromDict({ Length1: PdfNumber.of(program.length) }, program),
        );
        const descriptor = PdfDict.of({
          Type: PdfName.of('FontDescriptor'),
          FontName: PdfName.of(name),
          Flags: PdfNumber.of(SYMBOLIC),
          FontBBox: new PdfArray(metrics.bbox.map((n) => PdfNumber.of(n))),
          ItalicAngle: PdfNumber.of(0),
          Ascent: PdfNumber.of(metrics.ascent),
          Descent: PdfNumber.of(metrics.descent),
          CapHeight: PdfNumber.of(metrics.capHeight),
          StemV: PdfNumber.of(STEM),
          FontFile2: file,
        });
        const descendant = PdfDict.of({
          Type: PdfName.of('Font'),
          Subtype: PdfName.of('CIDFontType2'),
          BaseFont: PdfName.of(name),
          CIDSystemInfo: PdfDict.of({
            Registry: PdfString.fromString('Adobe'),
            Ordering: PdfString.fromString('Identity'),
            Supplement: PdfNumber.of(0),
          }),
          FontDescriptor: pdf.register(descriptor),
          W: widthsOf(new Map(glyphs.map((glyph) => [glyph, advances[glyph]!]))),
          CIDToGIDMap: PdfName.of('Identity'),
        });
        const words = new Map([...characters].filter(([, text]) => text !== ''));
        dict.set('BaseFont', PdfName.of(name));
        dict.set('Encoding', PdfName.of('Identity-H'));
        dict.set('DescendantFonts', new PdfArray([pdf.register(descendant)]));
        dict.set(
          'ToUnicode',
          pdf.register(PdfStream.fromDict({}, new TextEncoder().encode(toUnicodeCMap(words)))),
        );
      }
      return { missing };
    },
  };
}
