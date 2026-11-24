// Dark pages' step in the engine's worker (docs/specs/035-pdf-documents/dark-pages.md "The recolouring"): a bitmap the
// reader drew, mirrored but for its page's photographs, put back as drawn. A page's photographs are judged once while
// the file is open: each picture drawn alone, its colours counted, so every tile and scale of one picture decides
// alike. A step that fails hands back the bitmap as drawn and says so; it never shows a half-recoloured tile.
import { DarkPages, type PixelBox } from '../dark-pages';
import type { PageBitmap, PageMatrix } from '../engine-contract';
import {
  DARK_PAGES_PAGE_PICTURE_SHARE,
  DARK_PAGES_PICTURE_MIN_SIDE,
  DARK_PAGES_PICTURE_SAMPLE_PX,
  PDF_MAX_TREE_DEPTH,
} from '../limits';
import { drawTile, pageMatrix } from './draw-page';
import type { PageBox, ReaderFile } from './reader-file';

// FPDF_PAGEOBJ_IMAGE and FPDF_PAGEOBJ_FORM.
const OBJECT_IMAGE = 3;
const OBJECT_FORM = 5;
// FPDF_IMAGEOBJ_METADATA: width and height (uint32), two DPIs (float), bits a pixel (uint32), colour space, mark id.
const METADATA_BYTES = 28;
const BITS_AT = 16;

/** Where a bitmap's pixels lie in view points: `factor` pixels a point, its top left at (`x`, `y`) pixels. */
export type DrawnPlace = { readonly factor: number; readonly x: number; readonly y: number };

/** A box of the page in view points, through the page's matrix: the box around its four corners. */
function inView(
  box: PageBox,
  toView: PageMatrix,
): { x0: number; y0: number; x1: number; y1: number } {
  const [a, b, c, d, e, f] = toView;
  const xs: number[] = [];
  const ys: number[] = [];
  for (const [x, y] of [
    [box.left, box.bottom],
    [box.left, box.top],
    [box.right, box.bottom],
    [box.right, box.top],
  ] as const) {
    xs.push(a * x + c * y + e);
    ys.push(b * x + d * y + f);
  }
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

/** The pictures of a page worth judging, in page points: more than a bit a pixel, large enough to be looked at. */
function picturesOf(file: ReaderFile, page: number): PageBox[] {
  const { p } = file;
  const found: PageBox[] = [];
  const meta = file.alloc(METADATA_BYTES);
  const bounds = file.alloc(16);
  const visit = (object: number, depth: number) => {
    const type = p.FPDFPageObj_GetType(object);
    if (type === OBJECT_FORM && depth < PDF_MAX_TREE_DEPTH) {
      const count = p.FPDFFormObj_CountObjects(object);
      for (let at = 0; at < count; at += 1) visit(p.FPDFFormObj_GetObject(object, at), depth + 1);
      return;
    }
    if (type !== OBJECT_IMAGE || !p.FPDFImageObj_GetImageMetadata(object, page, meta)) return;
    const width = file.runtime.getValue(meta, 'i32') >>> 0;
    const height = file.runtime.getValue(meta + 4, 'i32') >>> 0;
    const bits = file.runtime.getValue(meta + BITS_AT, 'i32') >>> 0;
    if (bits <= 1 || Math.min(width, height) < DARK_PAGES_PICTURE_MIN_SIDE) return;
    // Bounds the reader cannot give stay nothing: a box of no size, which no sample draws.
    file.heap.fill(0, bounds, bounds + 16);
    p.FPDFPageObj_GetBounds(object, bounds, bounds + 4, bounds + 8, bounds + 12);
    const [left, bottom, right, top] = [0, 4, 8, 12].map((at) =>
      file.held(file.runtime.getValue(bounds + at, 'float')),
    ) as [number, number, number, number];
    found.push({ left, bottom, right, top });
  };
  const count = p.FPDFPage_CountObjects(page);
  for (let at = 0; at < count; at += 1) visit(p.FPDFPage_GetObject(page, at), 0);
  file.free(meta);
  file.free(bounds);
  return found;
}

/** A page's photographs, in page points: judged once, then kept while the file is open. */
export function photographsOf(file: ReaderFile, index: number): readonly PageBox[] {
  const kept = file.photographs.get(index);
  if (kept) return kept;
  const toView = pageMatrix(file, index, 0);
  const { p } = file;
  const read = file.withPage(index, (page) => ({
    pictures: picturesOf(file, page),
    whole: p.FPDF_GetPageWidthF(page) * p.FPDF_GetPageHeightF(page),
  }));
  if (!toView || !read) return [];
  const photographs = read.pictures.filter((box) => {
    const area = (box.right - box.left) * (box.top - box.bottom);
    if (area > DARK_PAGES_PAGE_PICTURE_SHARE * read.whole) return false;
    const view = inView(box, toView);
    const scale = DARK_PAGES_PICTURE_SAMPLE_PX / Math.max(view.x1 - view.x0, view.y1 - view.y0);
    const sample = drawTile(file, index, scale, 0, {
      x: view.x0 * scale,
      y: view.y0 * scale,
      width: (view.x1 - view.x0) * scale,
      height: (view.y1 - view.y0) * scale,
    });
    return sample !== null && DarkPages.isPhotograph(sample.rgba);
  });
  file.photographs.set(index, photographs);
  return photographs;
}

/** A photograph's pixels in a bitmap drawn at `place`, cut to the bitmap; null where it falls outside. */
function pixelsOf(box: PageBox, bitmap: PageBitmap, place: DrawnPlace): PixelBox | null {
  const view = inView(box, bitmap.toView);
  const x0 = Math.max(0, Math.floor(view.x0 * place.factor - place.x));
  const y0 = Math.max(0, Math.floor(view.y0 * place.factor - place.y));
  const x1 = Math.min(bitmap.width, Math.ceil(view.x1 * place.factor - place.x));
  const y1 = Math.min(bitmap.height, Math.ceil(view.y1 * place.factor - place.y));
  return x1 > x0 && y1 > y0 ? { x0, y0, x1, y1 } : null;
}

/** A bitmap of page `index`, drawn at `place`, shown dark; the step is noted on the file for the engine to log. */
export function darkened(
  file: ReaderFile,
  index: number,
  bitmap: PageBitmap,
  place: DrawnPlace,
  mirror: typeof DarkPages.mirror = DarkPages.mirror,
): PageBitmap {
  const started = performance.now();
  try {
    const keep = photographsOf(file, index).flatMap((box) => pixelsOf(box, bitmap, place) ?? []);
    const rgba = mirror(bitmap.rgba, bitmap.width, keep);
    file.darkStep = { ms: performance.now() - started, pictures: keep.length };
    return { ...bitmap, rgba };
  } catch {
    file.darkStep = { failed: true };
    return bitmap;
  }
}

/** Where a whole page's bitmap lies: its width over the page's width as drawn, turned. */
export function pagePlace(
  file: ReaderFile,
  index: number,
  turns: number,
  width: number,
): DrawnPlace {
  const { p } = file;
  const side =
    file.withPage(index, (page) =>
      turns % 2 === 1 ? p.FPDF_GetPageHeightF(page) : p.FPDF_GetPageWidthF(page),
    ) ?? width;
  return { factor: width / side, x: 0, y: 0 };
}
