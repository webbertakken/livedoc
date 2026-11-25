// marks.md "Changing a mark": a file's mark changed or deleted here is drawn no more as the file says; the page is
// drawn without it, and the file is left as it was.
import { beforeAll, describe, expect, it } from 'vitest';
import type { PageBitmap, PdfEngine } from '../engine-contract';
import { rawPdf, readerWasm } from '../testing/fixtures';
import { createPdfEngine } from './index';

let engine: PdfEngine;

beforeAll(async () => {
  engine = await createPdfEngine({ wasm: readerWasm() });
});

// Two filled squares the file draws itself, red at 100 and blue at 300 (the page is 612 by 792).
const square = (name: string, left: number, colour: string) =>
  `<< /Type /Annot /Subtype /Square /NM (${name}) /Rect [${left} 600 ${left + 100} 700] /C [${colour}] /IC [${colour}] /F 4 /AP << /N 7 0 R >> >>`;
const twoSquares = () =>
  rawPdf([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> /Annots [4 0 R 5 0 R 6 0 R] >>',
    square('red', 100, '1 0 0'),
    square('blue', 300, '0 0 1'),
    '<< /Type /Annot /Subtype /Square /Rect [450 600 550 700] /C [0 1 0] /IC [0 1 0] /F 4 /AP << /N 8 0 R >> >>',
    '<< /Type /XObject /Subtype /Form /BBox [0 0 100 100] /Length 33 >>\nstream\n1 0 0 rg 0 0 100 100 re f\nendstream',
    '<< /Type /XObject /Subtype /Form /BBox [0 0 100 100] /Length 33 >>\nstream\n0 1 0 rg 0 0 100 100 re f\nendstream',
  ]);

/** Whether the drawn page is coloured, not paper, at a point of page space. */
const inked = (drawn: PageBitmap | null, x: number, y: number) => {
  const at = ((drawn!.height - y) * drawn!.width + x) * 4;
  const [r, g, b] = drawn!.rgba.slice(at, at + 3);
  return r! + g! + b! < 600;
};

describe('the file’s own marks hidden', () => {
  it('draws the page without the marks named, by their own name or their object, and every other as before', async () => {
    const opened = await engine.open(twoSquares());
    expect(opened.ok).toBe(true);
    const before = await engine.drawPage(0, 1);
    expect([150, 350, 500].map((x) => inked(before, x, 650))).toEqual([true, true, true]);

    await engine.hideMarks(['red', 'o:6']);
    const hidden = await engine.drawPage(0, 1);
    expect([150, 350, 500].map((x) => inked(hidden, x, 650))).toEqual([false, true, false]);
    const tile = await engine.drawTile(0, 1, 0, { x: 100, y: 92, width: 100, height: 100 });
    expect(inked(tile, 50, 50)).toBe(false);

    await engine.hideMarks([]);
    const shown = await engine.drawPage(0, 1);
    expect([150, 350, 500].map((x) => inked(shown, x, 650))).toEqual([true, true, true]);
  });

  it('leaves the marks as the file says them, and a file opened after hides none', async () => {
    await engine.open(twoSquares());
    await engine.hideMarks(['red']);
    expect((await engine.fileMarks(0)).map((mark) => mark.id)).toEqual(['red', 'blue', 'o:6']);
    await engine.open(twoSquares());
    expect(inked(await engine.drawPage(0, 1), 150, 650)).toBe(true);
  });
});
