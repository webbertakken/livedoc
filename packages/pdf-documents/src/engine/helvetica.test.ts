// The surface lays out a Text's words with helvetica.ts's widths and the bake writes them with its codes
// (docs/specs/035-pdf-documents/marks.md "In the file"): both must be Helvetica's own, as the writer knows them.
import { Standard14Font } from '@libpdf/core';
import { describe, expect, it } from 'vitest';
import { Helvetica } from '../helvetica';

const helvetica = Standard14Font.of('Helvetica');

describe('helvetica.ts', () => {
  it('holds Helvetica’s width for every character it writes, as the writer measures it', () => {
    const written = Array.from({ length: 0x2200 }, (_, at) => at).filter(Helvetica.writes);
    expect(written.length).toBe(218);
    for (const codePoint of written)
      expect([codePoint, Helvetica.width(codePoint)]).toEqual([
        codePoint,
        Math.round(helvetica.widthOfTextAtSize(String.fromCodePoint(codePoint), 1000)),
      ]);
  });
});
