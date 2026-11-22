// docs/specs/035-pdf-documents/reading-surface.md "The pages": one draw at a time, the page asked for last first.
import { describe, expect, it } from 'vitest';
import {
  PageName,
  PDF_PAGE_PICTURE_MAX_PIXELS,
  type PageBitmap,
  type PageInfo,
} from '@livedoc/pdf-documents';
import { pdfPageDrawer, pictureScale } from './pdf-page-drawer';

const bitmap = (index: number): PageBitmap => ({
  width: index,
  height: 1,
  rgba: new Uint8ClampedArray(4),
  toView: [1, 0, 0, 1, 0, 0],
});

function engine() {
  const asked: number[] = [];
  const waiting: (() => void)[] = [];
  return {
    asked,
    // Finishes the draw under way.
    finish: () => waiting.shift()?.(),
    drawPage: (index: number) => {
      asked.push(index);
      return new Promise<PageBitmap | null>((resolve) =>
        waiting.push(() => resolve(index === 13 ? null : bitmap(index))),
      );
    },
  };
}

const tick = () => new Promise<void>((resolve) => setTimeout(resolve));

describe('the page drawer', () => {
  it('draws one page at a time, the latest asked first', async () => {
    const pdf = engine();
    const drawer = pdfPageDrawer(pdf);
    const drawn = [1, 2, 3].map((index) => drawer.draw(index, 1));
    expect(pdf.asked).toEqual([1]);
    pdf.finish();
    await tick();
    expect(pdf.asked).toEqual([1, 3]);
    pdf.finish();
    await tick();
    pdf.finish();
    expect((await Promise.all(drawn)).map((page) => page?.width)).toEqual([1, 2, 3]);
    expect(pdf.asked).toEqual([1, 3, 2]);
  });

  it('never draws a page given up before its turn', async () => {
    const pdf = engine();
    const drawer = pdfPageDrawer(pdf);
    const first = drawer.draw(1, 1);
    const passed = drawer.draw(2, 1);
    drawer.forget(2);
    drawer.forget(7);
    expect(await passed).toBeNull();
    pdf.finish();
    expect((await first)?.width).toBe(1);
    await tick();
    expect(pdf.asked).toEqual([1]);
  });

  it('takes a page asked again in its earlier ask’s place', async () => {
    const pdf = engine();
    const drawer = pdfPageDrawer(pdf);
    void drawer.draw(1, 1);
    const earlier = drawer.draw(2, 1);
    const later = drawer.draw(2, 2);
    expect(await earlier).toBeNull();
    pdf.finish();
    await tick();
    pdf.finish();
    expect((await later)?.width).toBe(2);
    expect(pdf.asked).toEqual([1, 2]);
  });

  it('answers a page that cannot be drawn with nothing, and goes on', async () => {
    const pdf = engine();
    const drawer = pdfPageDrawer(pdf);
    const bad = drawer.draw(13, 1);
    pdf.finish();
    expect(await bad).toBeNull();
    const good = drawer.draw(4, 1);
    pdf.finish();
    expect((await good)?.width).toBe(4);
  });
});

// "Limits": PDF_PAGE_PICTURE_MAX_PIXELS bounds the whole-page picture.
describe('pictureScale', () => {
  const letter: PageInfo = { name: PageName.ofObject(3), width: 612, height: 792, label: null };

  it('draws at what the screen asks while the picture fits', () => {
    expect(pictureScale(letter, 96 / 72, 2)).toBeCloseTo(2.667, 3);
  });

  it('cuts the scale so the picture stays within the limit', () => {
    const scale = pictureScale(letter, 8, 2);
    expect(scale).toBeLessThan(16);
    expect(612 * 792 * scale * scale).toBeCloseTo(PDF_PAGE_PICTURE_MAX_PIXELS, -2);
  });
});
