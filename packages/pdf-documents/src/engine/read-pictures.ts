// A page's pictures handed over whole (docs/specs/035-pdf-documents/opening.md "What is read": a page's pictures):
// every image the page's content draws, those in form XObjects too, in the order drawn; where each is drawn in page
// points, and its bytes: a JPEG a browser shows as the file means it as the file holds it, any other as its pixels.
// Nothing of the page is drawn to read them.
import type { PageMatrix } from '../engine-contract';
import type { PagePicture, PagePictureBytes, PagePictures } from '../page-pictures';
import {
  PDF_MAX_TREE_DEPTH,
  PDF_PAGE_PICTURES_MAX,
  PDF_PICTURE_HANDED_MAX_PIXELS,
} from '../limits';
import type { ReaderFile } from './reader-file';

// FPDF_PAGEOBJ_IMAGE and FPDF_PAGEOBJ_FORM.
const OBJECT_IMAGE = 3;
const OBJECT_FORM = 5;
// FPDF_IMAGEOBJ_METADATA: width and height (uint32), two DPIs (float), bits a pixel (uint32), colour space, mark id.
const METADATA_BYTES = 28;
const COLOUR_SPACE_AT = 20;
// FPDF_COLORSPACE_DEVICEGRAY and FPDF_COLORSPACE_DEVICERGB: a JPEG in them shows in a browser as the file means it.
const SHOWN_AS_MEANT = new Set([1, 2]);
// FPDFBitmap_Gray, FPDFBitmap_BGR, FPDFBitmap_BGRx, FPDFBitmap_BGRA: bytes a pixel.
const PIXEL_BYTES: Readonly<Record<number, number>> = { 1: 1, 2: 3, 3: 4, 4: 4 };
// The filter's name a JPEG is held under, and room to read a filter's name.
const JPEG_FILTER = 'DCTDecode';
const FILTER_NAME_BYTES = 64;

/** What a page's pictures may hold: how many are listed, and the pixels one may decode. */
export type PictureLimits = { most: number; pixels: number };

const LIMITS: PictureLimits = {
  most: PDF_PAGE_PICTURES_MAX,
  pixels: PDF_PICTURE_HANDED_MAX_PIXELS,
};

/** `inner` then `outer`: a matrix of a form's content, carried onto the page through the form's own. */
function compose(inner: PageMatrix, outer: PageMatrix): PageMatrix {
  const [a, b, c, d, e, f] = inner;
  const [A, B, C, D, E, F] = outer;
  return [
    a * A + b * C,
    a * B + b * D,
    c * A + d * C,
    c * B + d * D,
    e * A + f * C + E,
    e * B + f * D + F,
  ];
}

const IDENTITY: PageMatrix = [1, 0, 0, 1, 0, 0];

/** The box around a matrix's unit square. */
function boxOf([a, b, c, d, e, f]: PageMatrix): PagePicture['box'] {
  const xs = [e, a + e, c + e, a + c + e];
  const ys = [f, b + f, d + f, b + d + f];
  return {
    left: Math.min(...xs),
    bottom: Math.min(...ys),
    right: Math.max(...xs),
    top: Math.max(...ys),
  };
}

/** An object's matrix as the reader holds it, each part held within reach of the page; null where none is read. */
function matrixOf(file: ReaderFile, object: number, at: number): PageMatrix | null {
  if (!file.p.FPDFPageObj_GetMatrix(object, at)) return null;
  return [0, 4, 8, 12, 16, 20].map((offset) =>
    file.held(file.runtime.getValue(at + offset, 'float')),
  ) as unknown as PageMatrix;
}

/** The names of a picture's filters, in order. */
function filtersOf(file: ReaderFile, object: number, name: number): string[] {
  const { p } = file;
  const count = Math.max(p.FPDFImageObj_GetImageFilterCount(object), 0);
  const out: string[] = [];
  for (let at = 0; at < count; at += 1) {
    const size = p.FPDFImageObj_GetImageFilter(object, at, name, FILTER_NAME_BYTES);
    // The name and its ending zero, within the room given.
    out.push(size > 1 && size <= FILTER_NAME_BYTES ? file.latin1(name, size - 1) : '');
  }
  return out;
}

/** A picture's bytes as the file holds them; null where the reader gives none. */
function rawBytes(file: ReaderFile, object: number): Uint8Array<ArrayBuffer> | null {
  const { p } = file;
  const size = p.FPDFImageObj_GetImageDataRaw(object, 0, 0);
  if (size <= 0) return null;
  const buffer = file.alloc(size);
  try {
    const read = p.FPDFImageObj_GetImageDataRaw(object, buffer, size);
    return read === size ? file.heap.slice(buffer, buffer + size) : null;
  } finally {
    file.free(buffer);
  }
}

/** A picture's pixels as the reader decodes them at its own size, every pixel opaque; null where it decodes none. */
function pixelsOf(file: ReaderFile, object: number): PagePictureBytes | null {
  const { p } = file;
  const bitmap = p.FPDFImageObj_GetBitmap(object);
  if (!bitmap) return null;
  try {
    const width = p.FPDFBitmap_GetWidth(bitmap);
    const height = p.FPDFBitmap_GetHeight(bitmap);
    const step = PIXEL_BYTES[p.FPDFBitmap_GetFormat(bitmap)];
    const buffer = p.FPDFBitmap_GetBuffer(bitmap);
    if (!step || width <= 0 || height <= 0 || !buffer) return null;
    const stride = p.FPDFBitmap_GetStride(bitmap);
    const pixels = new Uint8Array(width * height * 4);
    const heap = file.heap;
    for (let y = 0; y < height; y += 1) {
      const row = buffer + y * stride;
      for (let x = 0; x < width; x += 1) {
        const from = row + x * step;
        const to = (y * width + x) * 4;
        // The reader's bytes are blue, green, red; a grey pixel is one byte.
        pixels[to] = step === 1 ? heap[from]! : heap[from + 2]!;
        pixels[to + 1] = step === 1 ? heap[from]! : heap[from + 1]!;
        pixels[to + 2] = heap[from]!;
        pixels[to + 3] = 255;
      }
    }
    return { type: 'rgba', width, height, pixels };
  } finally {
    p.FPDFBitmap_Destroy(bitmap);
  }
}

/**
 * The page's pictures in the order its content draws them, at most `limits.most`; each with its bytes unless past
 * `limits.pixels` or not decoded (each held back counted). Null where there is no such page.
 */
export function readPagePictures(
  file: ReaderFile,
  index: number,
  limits: PictureLimits = LIMITS,
): PagePictures | null {
  const { p } = file;
  return file.withPage(index, (page) => {
    const pictures: PagePicture[] = [];
    let cut = false;
    const meta = file.alloc(METADATA_BYTES);
    const matrix = file.alloc(24);
    const name = file.alloc(FILTER_NAME_BYTES);
    const picture = (object: number, placed: PageMatrix): PagePicture | null => {
      if (!p.FPDFImageObj_GetImageMetadata(object, page, meta)) return null;
      const width = file.runtime.getValue(meta, 'i32') >>> 0;
      const height = file.runtime.getValue(meta + 4, 'i32') >>> 0;
      const space = file.runtime.getValue(meta + COLOUR_SPACE_AT, 'i32');
      const at = { matrix: placed, box: boxOf(placed), width, height };
      if (width * height > limits.pixels) {
        file.clamped('picture');
        return { ...at, picture: null };
      }
      const filters = filtersOf(file, object, name);
      const jpeg = filters.length === 1 && filters[0] === JPEG_FILTER && SHOWN_AS_MEANT.has(space);
      const raw = jpeg ? rawBytes(file, object) : null;
      const bytes: PagePictureBytes | null = raw
        ? { type: 'image/jpeg', bytes: raw }
        : pixelsOf(file, object);
      if (!bytes) file.clamped('picture');
      return { ...at, picture: bytes };
    };
    const visit = (object: number, outer: PageMatrix, depth: number): void => {
      if (cut) return;
      const type = p.FPDFPageObj_GetType(object);
      if (type !== OBJECT_IMAGE && (type !== OBJECT_FORM || depth >= PDF_MAX_TREE_DEPTH)) return;
      const own = matrixOf(file, object, matrix);
      if (!own) return;
      const placed = compose(own, outer);
      if (type === OBJECT_FORM) {
        const count = p.FPDFFormObj_CountObjects(object);
        for (let at = 0; at < count; at += 1)
          visit(p.FPDFFormObj_GetObject(object, at), placed, depth + 1);
        return;
      }
      if (pictures.length === limits.most) {
        cut = true;
        file.clamped('list');
        return;
      }
      const read = picture(object, placed);
      if (read) pictures.push(read);
    };
    try {
      const count = p.FPDFPage_CountObjects(page);
      for (let at = 0; at < count; at += 1) visit(p.FPDFPage_GetObject(page, at), IDENTITY, 0);
    } finally {
      file.free(meta);
      file.free(matrix);
      file.free(name);
    }
    return { pictures, cut };
  });
}
