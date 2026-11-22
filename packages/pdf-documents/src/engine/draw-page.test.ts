// docs/specs/035-pdf-documents/security.md "Abuse cases" (a decompression bomb draws at most PDF_MAX_PAGE_PIXELS);
// reading-surface.md "The pages". The size alone, so the ceiling is proven without a picture of a gibibyte.
import { describe, expect, it } from 'vitest';
import { PDF_MAX_PAGE_PIXELS, PDF_MAX_PAGE_POINTS } from '../limits';
import { drawnSize } from './draw-page';

const pixels = (size: { width: number; height: number }) => size.width * size.height;

describe('drawnSize', () => {
  it('is the page at the scale asked, in whole pixels', () => {
    expect(drawnSize(612, 792, 0.5)).toEqual({ width: 306, height: 396 });
    expect(drawnSize(595.28, 841.89, 1.5)).toEqual({ width: 892, height: 1262 });
  });

  it('never passes the pixel ceiling, whatever scale is asked', () => {
    const sides = [1, 8, 3.7, 612, 792, 9000.2, PDF_MAX_PAGE_POINTS];
    for (const width of sides)
      for (const height of sides)
        for (const scale of [1e6, 1e9, Number.MAX_VALUE])
          expect(pixels(drawnSize(width, height, scale))).toBeLessThanOrEqual(PDF_MAX_PAGE_PIXELS);
  });

  it('fills the ceiling when more is asked: the scale gives way, the page still shows', () => {
    const drawn = drawnSize(8, 8, 1e9);
    expect(drawn).toEqual({ width: 16_384, height: 16_384 });
    expect(pixels(drawn)).toBe(PDF_MAX_PAGE_PIXELS);
  });

  it('holds to a ceiling it is handed', () => {
    expect(drawnSize(8, 8, 1e9, 4096)).toEqual({ width: 64, height: 64 });
    expect(drawnSize(612, 792, 1, 4096)).toEqual({ width: 56, height: 72 });
  });

  it('reads a scale that is no size as 1', () => {
    for (const scale of [Number.NaN, 0, -2, Number.POSITIVE_INFINITY])
      expect(drawnSize(8, 12, scale)).toEqual({ width: 8, height: 12 });
  });

  it('draws one pixel at least', () => {
    expect(drawnSize(8, 8, 1e-9)).toEqual({ width: 1, height: 1 });
  });
});
