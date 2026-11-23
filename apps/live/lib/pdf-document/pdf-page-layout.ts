// Where a PDF document's pages lie for a view (docs/specs/035-pdf-documents/reading-surface.md "The pages": Page
// display, Zoom): the rows of a page display, the scale of a zoom for a view's size, every page's box at that scale,
// and what lies under a point. Pure: the surface sets the boxes it is given, and scrolls where it is told, so Go to,
// a zoom about the pointer and the page in view all read this one model.
import {
  PDF_FIT_WIDTH_MAX,
  PDF_ZOOM_MAX,
  PDF_ZOOM_MIN,
  type PageInfo,
} from '@livedoc/pdf-documents';
import type { PdfPageDisplay, PdfZoom } from './pdf-view';

/** A point is 1/72 inch and a CSS pixel 1/96: at 100% a page shows at its true size. */
export const CSS_PER_POINT = 96 / 72;
/** The ground around the pages, in CSS pixels: the shell's. */
export const PDF_PAGES_PAD_PX = 24;
/** The gap between two rows, and between the two pages of a row: the shell's. */
export const PDF_PAGES_GAP_PX = 16;

/** The pages side by side, by index; null is a place left empty (beside a cover page, after a last odd page). */
export type PdfRow = readonly (number | null)[];
export type PdfViewport = { readonly width: number; readonly height: number };
export type PdfPoint = { readonly x: number; readonly y: number };
/** The widest and the tallest page of a file, in points. */
export type PdfExtent = { readonly widest: number; readonly tallest: number };

/** A page's box in the layout, in CSS pixels from the layout's own corner. */
export type PdfPageBox = {
  readonly index: number;
  readonly row: number;
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
};

/** A page, and how far across and down it: 0 its left or top edge, 1 its right or bottom; past them just off it. */
export type PdfPlace = { readonly index: number; readonly across: number; readonly down: number };

export type PdfPageLayout = {
  /** What scrolls: never smaller than the view, so a layout smaller than it is placed by this model, not by CSS. */
  readonly width: number;
  readonly height: number;
  /** The pages laid out, in the file's order: every page, or the shown row's. */
  readonly boxes: readonly PdfPageBox[];
};

const clampScale = (scale: number): number => Math.min(PDF_ZOOM_MAX, Math.max(PDF_ZOOM_MIN, scale));

const between = (value: number, least: number, most: number): number =>
  Math.min(Math.max(value, least), Math.max(least, most));

// How far a point is from a box along one axis: nothing inside it.
const off = (at: number, start: number, length: number): number =>
  Math.max(start - at, 0, at - (start + length));

export const PdfPageLayout = {
  rows: (count: number, { across, cover }: PdfPageDisplay): PdfRow[] => {
    if (across === 1 || count === 0) return Array.from({ length: count }, (_, index) => [index]);
    const rows: PdfRow[] = [];
    // A cover page is a row whose left place is empty: the pairs start at the second page.
    for (let left = cover ? -1 : 0; left < count; left += 2)
      rows.push([left < 0 ? null : left, left + 1 < count ? left + 1 : null]);
    return rows;
  },

  /** The row a page is in; the first where it is in none. */
  rowOf: (rows: readonly PdfRow[], index: number): number =>
    Math.max(
      0,
      rows.findIndex((row) => row.includes(index)),
    ),

  // A loop, never a spread: a file may hold a hundred thousand pages.
  extent: (pages: readonly PageInfo[]): PdfExtent =>
    pages.reduce<PdfExtent>(
      (extent, page) => ({
        widest: Math.max(extent.widest, page.width),
        tallest: Math.max(extent.tallest, page.height),
      }),
      { widest: 1, tallest: 1 },
    ),

  /** The scale a zoom is in a view of this size: 1 is 100%. */
  scale: (zoom: PdfZoom, extent: PdfExtent, across: 1 | 2, viewport: PdfViewport): number => {
    if (typeof zoom === 'number') return zoom;
    const gap = across === 2 ? PDF_PAGES_GAP_PX : 0;
    const width =
      (viewport.width - 2 * PDF_PAGES_PAD_PX - gap) / (across * extent.widest * CSS_PER_POINT);
    if (zoom === 'fit-width') return clampScale(Math.min(width, PDF_FIT_WIDTH_MAX));
    const height = (viewport.height - 2 * PDF_PAGES_PAD_PX) / (extent.tallest * CSS_PER_POINT);
    return clampScale(Math.min(width, height));
  },

  /** Every page's box at a scale: all the rows down the view, or the `shown` row alone. */
  lay: ({
    pages,
    rows,
    scale,
    viewport,
    shown,
  }: {
    pages: readonly PageInfo[];
    rows: readonly PdfRow[];
    scale: number;
    viewport: PdfViewport;
    // The one row a display that is not continuous shows; null: every row.
    shown: number | null;
  }): PdfPageLayout => {
    const px = scale * CSS_PER_POINT;
    const laid = shown === null ? rows.map((_, at) => at) : rows[shown] ? [shown] : [];
    // Two across: each page in a place as wide as the file's widest, so the pairs line up down the file.
    const place = PdfPageLayout.extent(pages).widest * px;
    const sizeOf = (index: number | null) => {
      const page = index === null ? undefined : pages[index];
      return page ? { width: page.width * px, height: page.height * px } : null;
    };
    const rowWidth = (row: PdfRow) =>
      row.length === 1 ? (sizeOf(row[0]!)?.width ?? 0) : 2 * place + PDF_PAGES_GAP_PX;
    const rowHeight = (row: PdfRow) =>
      Math.max(0, ...row.map((index) => sizeOf(index)?.height ?? 0));

    const heights = laid.map((at) => rowHeight(rows[at]!));
    const natural = {
      width:
        laid.reduce((widest, at) => Math.max(widest, rowWidth(rows[at]!)), 0) +
        2 * PDF_PAGES_PAD_PX,
      height:
        heights.reduce((sum, height) => sum + height, 0) +
        Math.max(0, laid.length - 1) * PDF_PAGES_GAP_PX +
        2 * PDF_PAGES_PAD_PX,
    };
    const width = Math.max(viewport.width, natural.width);
    const height = Math.max(viewport.height, natural.height);
    const middle = width / 2;
    // A row shown alone sits in the middle of a view taller than it; rows down the view start at its top.
    let top = PDF_PAGES_PAD_PX + (shown === null ? 0 : (height - natural.height) / 2);

    const boxes: PdfPageBox[] = [];
    laid.forEach((at, nth) => {
      const row = rows[at]!;
      row.forEach((index, column) => {
        const size = sizeOf(index);
        if (index === null || !size) return;
        const left =
          row.length === 1
            ? middle - size.width / 2
            : column === 0
              ? middle - PDF_PAGES_GAP_PX / 2 - size.width
              : middle + PDF_PAGES_GAP_PX / 2;
        boxes.push({
          index,
          row: at,
          left,
          top: top + (heights[nth]! - size.height) / 2,
          ...size,
        });
      });
      top += heights[nth]! + PDF_PAGES_GAP_PX;
    });
    return { width, height, boxes };
  },

  /** The page under a point of the layout, or the nearest to it; null where no page is laid out. */
  placeAt: (layout: PdfPageLayout, point: PdfPoint): PdfPlace | null => {
    let nearest: PdfPageBox | null = null;
    let least = Infinity;
    for (const box of layout.boxes) {
      const far = Math.hypot(off(point.x, box.left, box.width), off(point.y, box.top, box.height));
      if (far >= least) continue;
      nearest = box;
      least = far;
      if (far === 0) break;
    }
    if (!nearest) return null;
    return {
      index: nearest.index,
      across: (point.x - nearest.left) / nearest.width,
      down: (point.y - nearest.top) / nearest.height,
    };
  },

  /** The page in view: of the row nearest a point down the layout (the view's middle), its left page; null where no
   *  page is laid out (reading-surface.md "The page bar"). */
  pageInView: (layout: PdfPageLayout, middle: PdfPoint): number | null => {
    // A row reaches from its highest page's top to its lowest page's bottom.
    const spans = new Map<number, { top: number; bottom: number; left: PdfPageBox }>();
    for (const box of layout.boxes) {
      const span = spans.get(box.row);
      if (!span) spans.set(box.row, { top: box.top, bottom: box.top + box.height, left: box });
      else {
        span.top = Math.min(span.top, box.top);
        span.bottom = Math.max(span.bottom, box.top + box.height);
        if (box.left < span.left.left) span.left = box;
      }
    }
    let best: PdfPageBox | null = null;
    let least = Infinity;
    for (const span of spans.values()) {
      const far = off(middle.y, span.top, span.bottom - span.top);
      if (far < least) {
        best = span.left;
        least = far;
      }
    }
    return best?.index ?? null;
  },

  /** Where a place is in the layout; null where its page is not laid out. */
  pointOf: (layout: PdfPageLayout, place: PdfPlace): PdfPoint | null => {
    const box = layout.boxes.find((candidate) => candidate.index === place.index);
    if (!box) return null;
    return { x: box.left + place.across * box.width, y: box.top + place.down * box.height };
  },

  /** How far to scroll so a place lies under `focus`, a point of the view; never past the pages. */
  scrollTo: (
    layout: PdfPageLayout,
    place: PdfPlace,
    focus: PdfPoint,
    viewport: PdfViewport,
  ): { left: number; top: number } => {
    const point = PdfPageLayout.pointOf(layout, place) ?? { x: 0, y: 0 };
    return {
      left: between(point.x - focus.x, 0, layout.width - viewport.width),
      top: between(point.y - focus.y, 0, layout.height - viewport.height),
    };
  },

  /** How far to scroll so a page starts at the view's corner, the ground around it showing; null: not laid out. */
  scrollToPage: (
    layout: PdfPageLayout,
    index: number,
    viewport: PdfViewport,
  ): { left: number; top: number } | null => {
    if (!layout.boxes.some((box) => box.index === index)) return null;
    return PdfPageLayout.scrollTo(
      layout,
      { index, across: 0, down: 0 },
      { x: PDF_PAGES_PAD_PX, y: PDF_PAGES_PAD_PX },
      viewport,
    );
  },
} as const;
