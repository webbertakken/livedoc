// The surface lays out a Text's words with helvetica.ts's widths, and a stamp's name with helvetica-bold.ts's, and the
// bake writes them with their codes (docs/specs/035-pdf-documents/marks.md "In the file"; "Stamps": LiveDoc's style):
// each must be its face's own, as the writer knows it.
import { Standard14Font } from '@libpdf/core';
import { describe, expect, it } from 'vitest';
import { Helvetica } from '../helvetica';
import { HelveticaBold } from '../helvetica-bold';

const helvetica = Standard14Font.of('Helvetica');
const bold = Standard14Font.of('Helvetica-Bold');
const written = Array.from({ length: 0x2200 }, (_, at) => at).filter(Helvetica.writes);

describe('helvetica.ts', () => {
  it('holds Helvetica’s width for every character it writes, as the writer measures it', () => {
    expect(written.length).toBe(218);
    for (const codePoint of written)
      expect([codePoint, Helvetica.width(codePoint)]).toEqual([
        codePoint,
        Math.round(helvetica.widthOfTextAtSize(String.fromCodePoint(codePoint), 1000)),
      ]);
  });
});

describe('helvetica-bold.ts', () => {
  it('holds Helvetica Bold’s width for every character Helvetica writes, as the writer measures it', () => {
    for (const codePoint of written)
      expect([codePoint, HelveticaBold.width(codePoint)]).toEqual([
        codePoint,
        Math.round(bold.widthOfTextAtSize(String.fromCodePoint(codePoint), 1000)),
      ]);
  });

  it('writes Helvetica’s characters at Helvetica’s codes, a character it cannot write as the stand-in', () => {
    expect(HelveticaBold.writes(0x4e00)).toBe(false);
    expect(HelveticaBold.code(0x20ac)).toBe(0x80);
    expect(HelveticaBold.width(0x4e00)).toBe(HelveticaBold.width('?'.codePointAt(0)!));
    expect(HelveticaBold.ascent).toBe(Helvetica.ascent);
  });
});
