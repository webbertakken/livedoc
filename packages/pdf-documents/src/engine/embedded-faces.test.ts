import { PDF, PdfArray, type PdfDict, type PdfNumber, type PdfStream } from '@libpdf/core';
import { describe, expect, it } from 'vitest';
import { typesetterOf } from '../testing/fixtures';
import { embeddedFaces, subsetTag, toUnicodeCMap, widthsOf } from './embedded-faces';

// marks.md "In the file": each face used, once, a subset with its W and its ToUnicode.
describe('the mark faces a bake writes', () => {
  it('tags a subset by the glyphs it holds', () => {
    expect(subsetTag('a', [3, 1, 2])).toMatch(/^[A-Z]{6}$/);
    expect(subsetTag('a', [3, 1, 2])).toBe(subsetTag('a', [1, 2, 3]));
    expect(subsetTag('a', [1, 2, 4])).not.toBe(subsetTag('a', [1, 2, 3]));
    // Two slices of one family holding the same glyph ids are told apart.
    expect(subsetTag('noto-sans-jp-4-400', [1, 2])).not.toBe(
      subsetTag('noto-sans-jp-5-400', [1, 2]),
    );
  });

  it('maps each glyph back to its characters, a hundred to a block', () => {
    const glyphs = new Map<number, string>(Array.from({ length: 101 }, (_, at) => [at + 1, 'a']));
    glyphs.set(500, 'ff');
    glyphs.set(501, '😀');
    const cmap = toUnicodeCMap(glyphs);
    expect(cmap.match(/beginbfchar/g)).toHaveLength(2);
    expect(cmap).toContain('100 beginbfchar');
    expect(cmap).toContain('<01F4> <00660066>');
    expect(cmap).toContain('<01F5> <D83DDE00>');
  });

  it('writes the advances as runs of consecutive glyphs', () => {
    const widths = widthsOf(
      new Map([
        [7, 500],
        [3, 600.4],
        [4, 250],
      ]),
    );
    const plain = (item: unknown): unknown =>
      item instanceof PdfArray ? item.toArray().map(plain) : (item as PdfNumber).value;
    expect(plain(widths)).toEqual([3, [600, 250], 7, [500]]);
  });

  it('writes each face used once, its font whole once every mark is added', async () => {
    const pdf = PDF.create();
    pdf.addPage({ width: 612, height: 792 });
    const typesetter = await typesetterOf(['noto-sans-greek-400']);
    const faces = embeddedFaces(pdf, typesetter);
    const run = typesetter.shape({ face: 'noto-sans-greek-400', text: 'Ωמ' }, false);
    const ref = faces.use('noto-sans-greek-400', run.glyphs);
    expect(faces.use('noto-sans-greek-400', run.glyphs)).toBe(ref);
    // The Hebrew letter is not the Greek face's: its missing box, counted each time it is set.
    expect(faces.finish()).toEqual({ missing: 2 });
    const font = pdf.getObject(ref) as PdfDict;
    expect(font.getName('Subtype')?.value).toBe('Type0');
    expect(font.getName('Encoding')?.value).toBe('Identity-H');
    expect(font.getName('BaseFont')?.value).toMatch(/^[A-Z]{6}\+NotoSans-Regular$/);
    const descendant = pdf.getObject(font.getArray('DescendantFonts')!.at(0) as never) as PdfDict;
    expect(descendant.getName('Subtype')?.value).toBe('CIDFontType2');
    expect(descendant.get('W')).toBeInstanceOf(PdfArray);
    expect(descendant.getName('CIDToGIDMap')?.value).toBe('Identity');
    const map = pdf.getObject(font.get('ToUnicode') as never) as PdfStream;
    expect(new TextDecoder().decode(map.getDecodedData())).toContain('<03A9>');
  });
});
