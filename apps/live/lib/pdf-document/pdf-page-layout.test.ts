// docs/specs/035-pdf-documents/reading-surface.md "The pages" (Page display, Zoom): where a PDF document's pages lie
// for a view, and what lies under a point of it.
import { describe, expect, it } from 'vitest';
import { PageName, type PageInfo } from '@livedoc/pdf-documents';
import { PdfPageLayout, PDF_PAGES_GAP_PX, PDF_PAGES_PAD_PX } from './pdf-page-layout';
import type { PdfPageDisplay } from './pdf-view';

const page = (width: number, height: number, at = 0): PageInfo => ({
  name: PageName.ofObject(at + 1),
  width,
  height,
  rotation: 0,
  label: null,
});
// US Letter: 816 by 1,056 CSS pixels at 100%.
const letters = (count: number) => Array.from({ length: count }, (_, at) => page(612, 792, at));
const display = (across: 1 | 2, continuous = true, cover = false): PdfPageDisplay => ({
  across,
  continuous,
  cover,
});
const VIEW = { width: 1000, height: 800 };

describe('the rows of a page display', () => {
  it('puts one page in a row, or two', () => {
    expect(PdfPageLayout.rows(3, display(1))).toEqual([[0], [1], [2]]);
    expect(PdfPageLayout.rows(4, display(2))).toEqual([
      [0, 1],
      [2, 3],
    ]);
  });

  it('leaves the last place empty where the pages are odd', () => {
    expect(PdfPageLayout.rows(5, display(2))).toEqual([
      [0, 1],
      [2, 3],
      [4, null],
    ]);
  });

  // "With Show cover page the first page stands alone on the right, and the pairs start at the second."
  it('stands the cover page alone on the right and pairs from the second', () => {
    expect(PdfPageLayout.rows(5, display(2, true, true))).toEqual([
      [null, 0],
      [1, 2],
      [3, 4],
    ]);
    expect(PdfPageLayout.rows(4, display(2, true, true))).toEqual([
      [null, 0],
      [1, 2],
      [3, null],
    ]);
    expect(PdfPageLayout.rows(1, display(2, true, true))).toEqual([[null, 0]]);
  });

  // "With one page across it changes nothing."
  it('changes nothing for a cover page with one page across', () => {
    expect(PdfPageLayout.rows(2, display(1, true, true))).toEqual([[0], [1]]);
  });

  it('has no row for no page', () => {
    expect(PdfPageLayout.rows(0, display(2, true, true))).toEqual([]);
  });

  it('finds the row a page is in', () => {
    const rows = PdfPageLayout.rows(5, display(2, true, true));
    expect([0, 1, 2, 3, 4].map((index) => PdfPageLayout.rowOf(rows, index))).toEqual([
      0, 1, 1, 2, 2,
    ]);
    expect(PdfPageLayout.rowOf(rows, 9)).toBe(0);
  });
});

describe('the scale of a zoom', () => {
  const extent = PdfPageLayout.extent(letters(3));

  it('reads the widest and the tallest page, each from whichever page it is', () => {
    expect(PdfPageLayout.extent([page(612, 792), page(1224, 300), page(200, 2000)])).toEqual({
      widest: 1224,
      tallest: 2000,
    });
    expect(PdfPageLayout.extent([])).toEqual({ widest: 1, tallest: 1 });
  });

  // "Actual size is 100%: a point is 1/72 inch and a CSS pixel 1/96."
  it('takes a scale as it is', () => {
    expect(PdfPageLayout.scale(1.5, extent, 1, VIEW)).toBe(1.5);
  });

  // "Fit width fits the widest row to the view."
  it('fits the widest row to the width, the ground either side left free', () => {
    expect(PdfPageLayout.scale('fit-width', extent, 1, VIEW)).toBeCloseTo(
      (1000 - 2 * PDF_PAGES_PAD_PX) / 816,
      9,
    );
    expect(PdfPageLayout.scale('fit-width', extent, 2, VIEW)).toBeCloseTo(
      (1000 - 2 * PDF_PAGES_PAD_PX - PDF_PAGES_GAP_PX) / (2 * 816),
      9,
    );
  });

  // "Never past PDF_FIT_WIDTH_MAX, so a page on a wide window is not drawn larger than it reads well."
  it('never fits a width past 200%', () => {
    expect(PdfPageLayout.scale('fit-width', extent, 1, { width: 4000, height: 800 })).toBe(2);
  });

  // "Fit page fits the widest and the tallest row, so every row shows whole."
  it('fits the page to whichever of the width and the height is tighter', () => {
    expect(PdfPageLayout.scale('fit-page', extent, 1, VIEW)).toBeCloseTo(
      (800 - 2 * PDF_PAGES_PAD_PX) / 1056,
      9,
    );
    expect(PdfPageLayout.scale('fit-page', extent, 1, { width: 400, height: 4000 })).toBeCloseTo(
      (400 - 2 * PDF_PAGES_PAD_PX) / 816,
      9,
    );
    // A small page in a large window may pass 200%: the whole page still shows.
    const stamp = PdfPageLayout.extent([page(72, 72)]);
    expect(PdfPageLayout.scale('fit-page', stamp, 1, VIEW)).toBeCloseTo(752 / 96, 9);
  });

  // "Limits": PDF_ZOOM_MIN, PDF_ZOOM_MAX.
  it('keeps a fitted zoom within 10% and 6400%', () => {
    expect(PdfPageLayout.scale('fit-width', extent, 1, { width: 60, height: 60 })).toBe(0.1);
    expect(PdfPageLayout.scale('fit-page', extent, 1, { width: 0, height: 0 })).toBe(0.1);
    const speck = PdfPageLayout.extent([page(1, 1)]);
    expect(PdfPageLayout.scale('fit-page', speck, 1, VIEW)).toBe(64);
  });
});

describe('where the pages lie', () => {
  const lay = (
    pages: readonly PageInfo[],
    shows: PdfPageDisplay,
    scale: number,
    shown: number | null = null,
    viewport = VIEW,
  ) =>
    PdfPageLayout.lay({
      pages,
      rows: PdfPageLayout.rows(pages.length, shows),
      scale,
      viewport,
      shown,
    });

  it('stacks the rows of a continuous display, each page in the middle of a view wider than it', () => {
    const layout = lay(letters(2), display(1), 1);
    expect(layout.boxes).toEqual([
      { index: 0, row: 0, left: 92, top: 24, width: 816, height: 1056 },
      { index: 1, row: 1, left: 92, top: 24 + 1056 + 16, width: 816, height: 1056 },
    ]);
    expect(layout.width).toBe(1000);
    expect(layout.height).toBe(24 + 1056 + 16 + 1056 + 24);
  });

  it('is as wide as its widest row and the ground around it where that is wider than the view', () => {
    const layout = lay([page(612, 792), page(306, 396, 1)], display(1), 2);
    expect(layout.width).toBe(1632 + 48);
    expect(layout.boxes[0]).toMatchObject({ left: 24, width: 1632 });
    // A narrower page stays in the middle.
    expect(layout.boxes[1]).toMatchObject({ left: 24 + (1632 - 816) / 2, width: 816 });
  });

  it('is never smaller than the view', () => {
    const layout = lay([page(72, 72)], display(1), 1);
    expect([layout.width, layout.height]).toEqual([1000, 800]);
    // The rows of a continuous display start at the top.
    expect(layout.boxes[0]).toMatchObject({ left: 452, top: 24, width: 96, height: 96 });
  });

  // "Two pages across meet at the row's middle, each in a place as wide as the file's widest page."
  it('meets two pages at the middle of their row', () => {
    const layout = lay(letters(3), display(2), 1, null, { width: 2000, height: 800 });
    expect(layout.boxes.map((box) => [box.index, box.row, box.left, box.top])).toEqual([
      [0, 0, 1000 - 8 - 816, 24],
      [1, 0, 1008, 24],
      [2, 1, 1000 - 8 - 816, 24 + 1056 + 16],
    ]);
    expect(lay(letters(3), display(2), 1).width).toBe(2 * 816 + 16 + 48);
  });

  it('keeps a smaller page against the middle and in the middle of its row’s height', () => {
    const pages = [page(306, 396), page(612, 792, 1)];
    const layout = lay(pages, display(2), 1, null, { width: 2000, height: 800 });
    expect(layout.boxes[0]).toEqual({
      index: 0,
      row: 0,
      left: 1000 - 8 - 408,
      top: 24 + (1056 - 528) / 2,
      width: 408,
      height: 528,
    });
    expect(layout.boxes[1]).toMatchObject({ left: 1008, top: 24 });
  });

  it('stands the cover page right of the middle', () => {
    const layout = lay(letters(3), display(2, true, true), 1, null, { width: 2000, height: 800 });
    expect(layout.boxes.map((box) => [box.index, box.row, box.left])).toEqual([
      [0, 0, 1008],
      [1, 1, 1000 - 8 - 816],
      [2, 1, 1008],
    ]);
  });

  // "Single page and Two pages show the row in view alone."
  it('lays out the shown row alone, in the middle of a view larger than it', () => {
    const layout = lay(letters(3), display(1, false), 0.5, 1);
    expect(layout.boxes).toEqual([
      { index: 1, row: 1, left: (1000 - 408) / 2, top: (800 - 528) / 2, width: 408, height: 528 },
    ]);
    expect([layout.width, layout.height]).toEqual([1000, 800]);
  });

  it('starts a shown row taller than the view at the top', () => {
    const layout = lay(letters(3), display(2, false), 1, 1);
    expect(layout.boxes.map((box) => [box.index, box.top])).toEqual([[2, 24]]);
    expect(layout.height).toBe(1056 + 48);
  });

  it('lays out nothing for a row that is not there', () => {
    expect(lay(letters(3), display(1, false), 1, 7).boxes).toEqual([]);
    expect(lay([], display(1), 1).boxes).toEqual([]);
  });
});

describe('a place in the pages', () => {
  const pages = letters(3);
  const rows = PdfPageLayout.rows(3, display(1));
  const at = (scale: number) =>
    PdfPageLayout.lay({ pages, rows, scale, viewport: VIEW, shown: null });

  it('names the page under a point and how far across and down it', () => {
    const place = PdfPageLayout.placeAt(at(1), { x: 92 + 408, y: 24 + 264 });
    expect(place).toEqual({ index: 0, across: 0.5, down: 0.25 });
  });

  it('names the nearest page for a point between two', () => {
    // Four pixels under page one, twelve over page two.
    const place = PdfPageLayout.placeAt(at(1), { x: 500, y: 24 + 1056 + 4 });
    expect(place?.index).toBe(0);
    expect(place?.down).toBeCloseTo(1 + 4 / 1056, 9);
    expect(PdfPageLayout.placeAt(at(1), { x: 500, y: 24 + 1056 + 12 })?.index).toBe(1);
  });

  it('names no place where there is no page', () => {
    const none = PdfPageLayout.lay({ pages: [], rows: [], scale: 1, viewport: VIEW, shown: null });
    expect(PdfPageLayout.placeAt(none, { x: 0, y: 0 })).toBeNull();
    expect(PdfPageLayout.pointOf(none, { index: 0, across: 0, down: 0 })).toBeNull();
  });

  it('finds the point of a place again', () => {
    const layout = at(1.5);
    const point = { x: 310, y: 2400 };
    const place = PdfPageLayout.placeAt(layout, point)!;
    expect(PdfPageLayout.pointOf(layout, place)?.x).toBeCloseTo(310, 9);
    expect(PdfPageLayout.pointOf(layout, place)?.y).toBeCloseTo(2400, 9);
  });

  // "A zoom from the menus, the keys or the page bar keeps the middle of the view where it is; the wheel and a pinch
  // keep what is under the pointer."
  it('scrolls so a place stays under the same point of the view across a zoom', () => {
    const before = at(1);
    // The view scrolled 1,500 down; the pointer 300 across and 200 down the view.
    const place = PdfPageLayout.placeAt(before, { x: 300, y: 1700 })!;
    const after = at(2);
    const scroll = PdfPageLayout.scrollTo(after, place, { x: 300, y: 200 }, VIEW);
    const point = PdfPageLayout.pointOf(after, place)!;
    expect(point.x - scroll.left).toBeCloseTo(300, 9);
    expect(point.y - scroll.top).toBeCloseTo(200, 9);
  });

  it('never scrolls past the pages', () => {
    const layout = at(1);
    const first = { index: 0, across: 0, down: 0 };
    expect(PdfPageLayout.scrollTo(layout, first, { x: 500, y: 400 }, VIEW)).toEqual({
      left: 0,
      top: 0,
    });
    const last = { index: 2, across: 1, down: 1 };
    expect(PdfPageLayout.scrollTo(layout, last, { x: 0, y: 0 }, VIEW)).toEqual({
      left: 0,
      top: layout.height - 800,
    });
  });

  // "The page bar": Go to puts a page's top at the view's top, the ground over it showing.
  it('scrolls a page to the top of the view', () => {
    const layout = at(1);
    expect(PdfPageLayout.scrollToPage(layout, 1, VIEW)).toEqual({ left: 0, top: 1056 + 16 });
    expect(PdfPageLayout.scrollToPage(layout, 0, VIEW)).toEqual({ left: 0, top: 0 });
    expect(PdfPageLayout.scrollToPage(layout, 9, VIEW)).toBeNull();
  });
});

describe('the page in view', () => {
  // "The page in view is the one under the middle of the view; of a row of two, the left one."
  it('is the page under the middle of the view', () => {
    const layout = PdfPageLayout.lay({
      pages: letters(3),
      rows: PdfPageLayout.rows(3, display(1)),
      scale: 1,
      viewport: VIEW,
      shown: null,
    });
    expect(PdfPageLayout.pageInView(layout, { x: 500, y: 400 })).toBe(0);
    expect(PdfPageLayout.pageInView(layout, { x: 500, y: 24 + 1056 + 16 + 10 })).toBe(1);
    expect(PdfPageLayout.pageInView(layout, { x: 0, y: 99_999 })).toBe(2);
  });

  it('is the nearer page where the middle falls between two', () => {
    const layout = PdfPageLayout.lay({
      pages: letters(2),
      rows: PdfPageLayout.rows(2, display(1)),
      scale: 1,
      viewport: VIEW,
      shown: null,
    });
    expect(PdfPageLayout.pageInView(layout, { x: 500, y: 24 + 1056 + 4 })).toBe(0);
    expect(PdfPageLayout.pageInView(layout, { x: 500, y: 24 + 1056 + 12 })).toBe(1);
  });

  it('is the left page of a row of two, wherever across the middle is', () => {
    const layout = PdfPageLayout.lay({
      pages: letters(4),
      rows: PdfPageLayout.rows(4, display(2)),
      scale: 0.5,
      viewport: VIEW,
      shown: null,
    });
    expect(PdfPageLayout.pageInView(layout, { x: 900, y: 100 })).toBe(0);
    expect(PdfPageLayout.pageInView(layout, { x: 900, y: 24 + 528 + 16 + 10 })).toBe(2);
  });

  it('is the cover page alone in its row', () => {
    const layout = PdfPageLayout.lay({
      pages: letters(3),
      rows: PdfPageLayout.rows(3, display(2, true, true)),
      scale: 0.5,
      viewport: VIEW,
      shown: null,
    });
    expect(PdfPageLayout.pageInView(layout, { x: 100, y: 100 })).toBe(0);
  });

  it('is none where no page is laid out', () => {
    const none = PdfPageLayout.lay({ pages: [], rows: [], scale: 1, viewport: VIEW, shown: null });
    expect(PdfPageLayout.pageInView(none, { x: 0, y: 0 })).toBeNull();
  });
});
