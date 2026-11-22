// Drawing a page (docs/specs/035-pdf-documents/reading-surface.md "The pages"): the page as the file says, the file's
// own marks and its fields as the file drew them included, never past the pixel ceiling.
import { type PageBitmap, type PageMatrix, type PagePoint } from '../engine-contract';
import { PDF_MAX_PAGE_PIXELS } from '../limits';
import { clampSide, type ReaderFile } from './reader-file';

// FPDFBitmap_BGRA; FPDF_ANNOT draws the file's own marks, FPDF_REVERSE_BYTE_ORDER answers RGBA.
const BITMAP_BGRA = 4;
const RENDER_FLAGS = 0x01 | 0x10;
const WHITE = 0xffffffff;
// The scale FPDF_PageToDevice is asked at, so its whole-number answers keep a thousandth of a point.
const MATRIX_PRECISION = 1000;
const MATRIX_PROBE = 1000;

function toDevice(
  file: ReaderFile,
  page: number,
  width: number,
  height: number,
  x: number,
  y: number,
): PagePoint {
  const { p } = file;
  const out = file.alloc(8);
  p.FPDF_PageToDevice(
    page,
    0,
    0,
    Math.round(width * MATRIX_PRECISION),
    Math.round(height * MATRIX_PRECISION),
    0,
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

function matrixOf(file: ReaderFile, page: number, width: number, height: number): PageMatrix {
  const origin = toDevice(file, page, width, height, 0, 0);
  const alongX = toDevice(file, page, width, height, MATRIX_PROBE, 0);
  const alongY = toDevice(file, page, width, height, 0, MATRIX_PROBE);
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

/** Draws a page; `ceiling` is the most pixels its picture may hold, the limit's own unless a test hands a smaller. */
export function drawPage(
  file: ReaderFile,
  index: number,
  scale: number,
  ceiling?: number,
): PageBitmap | null {
  const { p } = file;
  return file.withFormPage(index, (page, form) => {
    const pageWidth = clampSide(p.FPDF_GetPageWidthF(page));
    const pageHeight = clampSide(p.FPDF_GetPageHeightF(page));
    const { width, height } = drawnSize(pageWidth, pageHeight, scale, ceiling);
    const bitmap = p.FPDFBitmap_CreateEx(width, height, BITMAP_BGRA, 0, 0);
    if (!bitmap) return null;
    p.FPDFBitmap_FillRect(bitmap, 0, 0, width, height, WHITE);
    p.FPDF_RenderPageBitmap(bitmap, page, 0, 0, width, height, 0, RENDER_FLAGS);
    // The reader leaves a file's fields to its form: without this a filled form shows empty boxes.
    if (form) p.FPDF_FFLDraw(form, bitmap, page, 0, 0, width, height, 0, RENDER_FLAGS);
    const buffer = p.FPDFBitmap_GetBuffer(bitmap);
    const stride = p.FPDFBitmap_GetStride(bitmap);
    const rgba = new Uint8ClampedArray(width * height * 4);
    for (let row = 0; row < height; row += 1)
      rgba.set(
        file.heap.subarray(buffer + row * stride, buffer + row * stride + width * 4),
        row * width * 4,
      );
    p.FPDFBitmap_Destroy(bitmap);
    return { width, height, rgba, toView: matrixOf(file, page, pageWidth, pageHeight) };
  });
}
