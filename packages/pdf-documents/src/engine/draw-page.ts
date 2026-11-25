// Drawing a page (docs/specs/035-pdf-documents/reading-surface.md "The pages"): the page as the file says, the file's
// own marks and its fields as the file drew them included, never past the pixel ceiling.
import {
  type PageBitmap,
  type PageMatrix,
  type PagePoint,
  type PageTurns,
  type TileRect,
} from '../engine-contract';
import { PDF_MAX_PAGE_PIXELS } from '../limits';
import { idOf } from './read-marks';
import { clampSide, type ReaderFile } from './reader-file';

// FPDFBitmap_BGRA; FPDF_ANNOT draws the file's own marks, FPDF_REVERSE_BYTE_ORDER answers RGBA.
const BITMAP_BGRA = 4;
const RENDER_FLAGS = 0x01 | 0x10;
const WHITE = 0xffffffff;
// The annotation flag that keeps a mark from being drawn.
const HIDDEN = 2;
// The scale FPDF_PageToDevice is asked at, so its whole-number answers keep a thousandth of a point.
const MATRIX_PRECISION = 1000;
const MATRIX_PROBE = 1000;

// The picture a page is drawn into, in view points (the page's size, its sides swapped for an odd turn), and its turns.
type Turned = { width: number; height: number; turns: PageTurns };

function toDevice(file: ReaderFile, page: number, view: Turned, x: number, y: number): PagePoint {
  const { p } = file;
  const out = file.alloc(8);
  p.FPDF_PageToDevice(
    page,
    0,
    0,
    Math.round(view.width * MATRIX_PRECISION),
    Math.round(view.height * MATRIX_PRECISION),
    view.turns,
    x,
    y,
    out,
    out + 4,
  );
  const point = {
    x: file.runtime.getValue(out, 'i32') / MATRIX_PRECISION,
    y: file.runtime.getValue(out + 4, 'i32') / MATRIX_PRECISION,
  };
  file.free(out);
  return point;
}

function matrixOf(file: ReaderFile, page: number, view: Turned): PageMatrix {
  const origin = toDevice(file, page, view, 0, 0);
  const alongX = toDevice(file, page, view, MATRIX_PROBE, 0);
  const alongY = toDevice(file, page, view, 0, MATRIX_PROBE);
  return [
    (alongX.x - origin.x) / MATRIX_PROBE,
    (alongX.y - origin.y) / MATRIX_PROBE,
    (alongY.x - origin.x) / MATRIX_PROBE,
    (alongY.y - origin.y) / MATRIX_PROBE,
    origin.x,
    origin.y,
  ];
}

/**
 * The picture a page of `pageWidth` by `pageHeight` points is drawn as, in pixels: the page at the scale asked, a scale
 * that is no size read as 1. A draw never passes the pixel ceiling: the scale gives way, the page still shows.
 */
export function drawnSize(
  pageWidth: number,
  pageHeight: number,
  scale: number,
  ceiling = PDF_MAX_PAGE_PIXELS,
): { width: number; height: number } {
  const asked = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const fit = Math.min(asked, Math.sqrt(ceiling / (pageWidth * pageHeight)));
  return {
    width: Math.max(1, Math.floor(pageWidth * fit)),
    height: Math.max(1, Math.floor(pageHeight * fit)),
  };
}

// The widest a whole page is reckoned at for a tile: the reader takes its size as a 32-bit whole number.
const MAX_WHOLE_PX = 2 ** 30;

/**
 * Draws with the file's own marks the file names hidden (marks.md "Changing a mark": one changed or deleted here) kept
 * from the picture: each is flagged hidden for the draw alone, and its own flags given back after it.
 */
function withMarksHidden<T>(file: ReaderFile, page: number, draw: () => T): T {
  const { p, marksHidden } = file;
  if (marksHidden.size === 0) return draw();
  const held: { annotation: number; flags: number }[] = [];
  for (let n = 0, count = p.FPDFPage_GetAnnotCount(page); n < count; n += 1) {
    const annotation = p.FPDFPage_GetAnnot(page, n);
    if (!annotation) continue;
    if (!marksHidden.has(idOf(file, annotation))) {
      p.FPDFPage_CloseAnnot(annotation);
      continue;
    }
    const flags = p.FPDFAnnot_GetFlags(annotation);
    p.FPDFAnnot_SetFlags(annotation, flags | HIDDEN);
    held.push({ annotation, flags });
  }
  try {
    return draw();
  } finally {
    for (const { annotation, flags } of held) {
      p.FPDFAnnot_SetFlags(annotation, flags);
      p.FPDFPage_CloseAnnot(annotation);
    }
  }
}

/** A page's size as drawn turned: on its side for an odd turn. */
function turnedView(pageWidth: number, pageHeight: number, turns: PageTurns): Turned {
  const sideways = turns % 2 === 1;
  return {
    width: sideways ? pageHeight : pageWidth,
    height: sideways ? pageWidth : pageHeight,
    turns,
  };
}

/** Puts the reader's bitmap into a picture of its own, and lets the bitmap go. */
function pictureOf(
  file: ReaderFile,
  bitmap: number,
  width: number,
  height: number,
): Uint8ClampedArray<ArrayBuffer> {
  const { p } = file;
  const buffer = p.FPDFBitmap_GetBuffer(bitmap);
  const stride = p.FPDFBitmap_GetStride(bitmap);
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let row = 0; row < height; row += 1)
    rgba.set(
      file.heap.subarray(buffer + row * stride, buffer + row * stride + width * 4),
      row * width * 4,
    );
  p.FPDFBitmap_Destroy(bitmap);
  return rgba;
}

/** The matrix a page is drawn with, turned `turns` quarters, whatever the scale; null where there is no such page. */
export function pageMatrix(
  file: ReaderFile,
  index: number,
  turns: PageTurns = 0,
): PageMatrix | null {
  const { p } = file;
  return file.withPage(index, (page) =>
    matrixOf(
      file,
      page,
      turnedView(
        clampSide(p.FPDF_GetPageWidthF(page)),
        clampSide(p.FPDF_GetPageHeightF(page)),
        turns,
      ),
    ),
  );
}

/**
 * Draws a page, turned `turns` quarters clockwise by the reader itself, so the matrix places a mark on the turned
 * picture; `ceiling` is the most pixels its picture may hold, the limit's own unless a test hands a smaller.
 */
export function drawPage(
  file: ReaderFile,
  index: number,
  scale: number,
  ceiling?: number,
  turns: PageTurns = 0,
): PageBitmap | null {
  const { p } = file;
  return file.withFormPage(index, (page, form) => {
    const pageWidth = clampSide(p.FPDF_GetPageWidthF(page));
    const pageHeight = clampSide(p.FPDF_GetPageHeightF(page));
    const view = turnedView(pageWidth, pageHeight, turns);
    const { width, height } = drawnSize(view.width, view.height, scale, ceiling);
    const bitmap = p.FPDFBitmap_CreateEx(width, height, BITMAP_BGRA, 0, 0);
    if (!bitmap) return null;
    p.FPDFBitmap_FillRect(bitmap, 0, 0, width, height, WHITE);
    withMarksHidden(file, page, () => {
      p.FPDF_RenderPageBitmap(bitmap, page, 0, 0, width, height, turns, RENDER_FLAGS);
      // The reader leaves a file's fields to its form: without this a filled form shows empty boxes.
      if (form) p.FPDF_FFLDraw(form, bitmap, page, 0, 0, width, height, turns, RENDER_FLAGS);
    });
    const rgba = pictureOf(file, bitmap, width, height);
    return { width, height, rgba, toView: matrixOf(file, page, view) };
  });
}

/**
 * Draws a tile: the whole page reckoned at `scale` and turned, the bitmap only `rect` of it, so the reader draws no
 * more than the tile. A tile past the page is cut at its edge; one with nothing left, or past the pixel ceiling, is
 * none.
 */
export function drawTile(
  file: ReaderFile,
  index: number,
  scale: number,
  turns: PageTurns,
  rect: TileRect,
): PageBitmap | null {
  const { p } = file;
  return file.withFormPage(index, (page, form) => {
    const view = turnedView(
      clampSide(p.FPDF_GetPageWidthF(page)),
      clampSide(p.FPDF_GetPageHeightF(page)),
      turns,
    );
    if (!Number.isFinite(scale) || scale <= 0) return null;
    const whole = {
      width: Math.round(view.width * scale),
      height: Math.round(view.height * scale),
    };
    if (whole.width > MAX_WHOLE_PX || whole.height > MAX_WHOLE_PX) return null;
    const x = Math.max(0, Math.floor(rect.x));
    const y = Math.max(0, Math.floor(rect.y));
    const width = Math.min(Math.floor(rect.x + rect.width), whole.width) - x;
    const height = Math.min(Math.floor(rect.y + rect.height), whole.height) - y;
    if (width < 1 || height < 1 || width * height > PDF_MAX_PAGE_PIXELS) return null;
    const bitmap = p.FPDFBitmap_CreateEx(width, height, BITMAP_BGRA, 0, 0);
    if (!bitmap) return null;
    p.FPDFBitmap_FillRect(bitmap, 0, 0, width, height, WHITE);
    withMarksHidden(file, page, () => {
      p.FPDF_RenderPageBitmap(bitmap, page, -x, -y, whole.width, whole.height, turns, RENDER_FLAGS);
      if (form)
        p.FPDF_FFLDraw(form, bitmap, page, -x, -y, whole.width, whole.height, turns, RENDER_FLAGS);
    });
    const rgba = pictureOf(file, bitmap, width, height);
    return { width, height, rgba, toView: matrixOf(file, page, view) };
  });
}
