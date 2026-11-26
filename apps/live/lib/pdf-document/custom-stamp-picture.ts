// A custom stamp's picture as it is kept (docs/specs/035-pdf-documents/custom-stamps.md "Making one"): made in the
// browser, never on the servers. A PNG or a JPEG as it came where it fits, else drawn smaller in its own form; an SVG
// drawn as a picture into a PNG; a page of a PDF drawn by the engine into a PNG, its paper white. Each held to
// `PDF_CUSTOM_STAMP_MAX_SIDE_PX` on its longer side and `PDF_STAMP_MAX_BYTES`. The drawing is the browser's, handed
// in, so what is decided here is tested without one.
import {
  PDF_CUSTOM_STAMP_MAX_SIDE_PX,
  PDF_CUSTOM_STAMP_PAGE_SCALE,
  PDF_STAMP_MAX_BYTES,
  StampPictureBytes,
  type StampPictureType,
} from '@livedoc/pdf-documents';

/** What a chosen file is, read from its bytes, never its name. */
export type PictureSource = 'png' | 'jpeg' | 'svg' | 'pdf';

/** Why a file did not become a picture. */
export type PictureRefusal = 'unreadable' | 'too_large';

/** A picture as kept: its bytes, form and size in pixels, and its natural size in points. */
export type KeptPicture = {
  readonly bytes: Uint8Array<ArrayBuffer>;
  readonly type: StampPictureType;
  readonly width: number;
  readonly height: number;
  readonly natural: { readonly width: number; readonly height: number };
  /** Whether it was drawn smaller than it came. */
  readonly scaled: boolean;
};

export type PictureKept =
  | { readonly ok: true; readonly picture: KeptPicture }
  | { readonly ok: false; readonly refusal: PictureRefusal };

/** A picture as the browser holds it, drawn and encoded. */
export type DrawnPicture = { readonly width: number; readonly height: number };

/** What the browser does for it: read a picture's size, draw one at a size into a form, draw a PDF's page. */
export type PictureDrawing<Held> = {
  /** The picture of the bytes, as the browser reads it (an SVG as a picture: no script of it runs); null where it cannot. */
  readonly read: (
    bytes: Uint8Array<ArrayBuffer>,
    source: 'png' | 'jpeg' | 'svg',
  ) => Promise<(DrawnPicture & { readonly held: Held }) | null>;
  /** It drawn at that size, encoded in that form (a JPEG on white). */
  readonly encode: (
    held: Held,
    size: DrawnPicture,
    type: StampPictureType,
  ) => Promise<Uint8Array<ArrayBuffer>>;
  /** The page of the PDF at that index, drawn at `scale` pixels a point into a held picture, its size in points too. */
  readonly page: (
    bytes: Uint8Array<ArrayBuffer>,
    index: number,
    scale: number,
  ) => Promise<(DrawnPicture & { readonly held: Held; readonly points: DrawnPicture }) | null>;
};

/** (default) A picture's pixel at 96 to the inch: three quarters of a point. */
export const POINTS_PER_PIXEL = 0.75;

/** (default) How much smaller each try draws a picture still past `PDF_STAMP_MAX_BYTES`. */
const SHRINK = 0.75;

/** (default) The tries at drawing a picture smaller before it is refused as too large. */
const SHRINK_TRIES = 8;

const startsWith = (bytes: Uint8Array, text: string): boolean =>
  [...text].every((character, at) => bytes[at] === character.charCodeAt(0));

/** What the bytes are: a PNG, a JPEG or a PDF by how they begin, an SVG by its opening tag; null otherwise. */
export function sniffPicture(bytes: Uint8Array): PictureSource | null {
  if (StampPictureBytes.fit('png', bytes)) return 'png';
  if (StampPictureBytes.fit('jpeg', bytes)) return 'jpeg';
  if (startsWith(bytes, '%PDF-')) return 'pdf';
  const head = new TextDecoder().decode(bytes.subarray(0, 1024)).trimStart().toLowerCase();
  return /^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!doctype svg[^>]*>\s*)?<svg[\s>]/.test(head)
    ? 'svg'
    : null;
}

/** A size held to `max` on its longer side, its shape kept, each side a whole pixel at least. */
export function heldSize(
  { width, height }: DrawnPicture,
  max = PDF_CUSTOM_STAMP_MAX_SIDE_PX,
): DrawnPicture {
  const scale = Math.min(1, max / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** A name for a stamp from a file's: its name without its ending, trimmed to `max`. */
export function stampNameOf(fileName: string, max: number): string {
  const name = fileName.replace(/\.[^./\\]+$/, '').trim();
  return name.slice(0, max).trim();
}

/** Draws the held picture smaller until it fits `PDF_STAMP_MAX_BYTES`, from `size`; null where it never does. */
async function drawnToFit<Held>(
  drawing: PictureDrawing<Held>,
  held: Held,
  size: DrawnPicture,
  type: StampPictureType,
): Promise<{ bytes: Uint8Array<ArrayBuffer>; size: DrawnPicture } | null> {
  let at = size;
  for (let attempt = 0; attempt < SHRINK_TRIES; attempt += 1) {
    const bytes = await drawing.encode(held, at, type);
    if (bytes.byteLength <= PDF_STAMP_MAX_BYTES) return { bytes, size: at };
    at = heldSize(at, Math.floor(Math.max(at.width, at.height) * SHRINK));
  }
  return null;
}

/**
 * The picture a chosen file keeps as a custom stamp: `page` the page of a PDF, from 0. Refused `unreadable` where it
 * is no picture or PDF the browser reads, `too_large` where no smaller drawing fits.
 */
export async function keepPicture<Held>(
  bytes: Uint8Array<ArrayBuffer>,
  drawing: PictureDrawing<Held>,
  page = 0,
): Promise<PictureKept> {
  const source = sniffPicture(bytes);
  if (!source) return { ok: false, refusal: 'unreadable' };
  if (source === 'pdf') {
    const drawn = await drawing.page(bytes, page, PDF_CUSTOM_STAMP_PAGE_SCALE);
    if (!drawn) return { ok: false, refusal: 'unreadable' };
    const fit = await drawnToFit(drawing, drawn.held, heldSize(drawn), 'png');
    if (!fit) return { ok: false, refusal: 'too_large' };
    return kept(fit, 'png', drawn.points, true);
  }
  const read = await drawing.read(bytes, source);
  if (!read) return { ok: false, refusal: 'unreadable' };
  const type: StampPictureType = source === 'jpeg' ? 'jpeg' : 'png';
  const size = heldSize(read);
  const asItCame =
    source !== 'svg' && size.width === read.width && bytes.byteLength <= PDF_STAMP_MAX_BYTES;
  if (asItCame) return kept({ bytes, size }, type, naturalOf(size), false);
  const fit = await drawnToFit(drawing, read.held, size, type);
  if (!fit) return { ok: false, refusal: 'too_large' };
  // An SVG is always drawn; it is drawn smaller only where its size changed.
  const scaled = source !== 'svg' || fit.size.width !== read.width;
  return kept(fit, type, naturalOf(fit.size), scaled);
}

/** A kept picture's natural size: its pixels at 96 to the inch. */
const naturalOf = ({ width, height }: DrawnPicture): DrawnPicture => ({
  width: width * POINTS_PER_PIXEL,
  height: height * POINTS_PER_PIXEL,
});

function kept(
  { bytes, size }: { bytes: Uint8Array<ArrayBuffer>; size: DrawnPicture },
  type: StampPictureType,
  natural: DrawnPicture,
  scaled: boolean,
): PictureKept {
  return {
    ok: true,
    picture: { bytes, type, width: size.width, height: size.height, natural, scaled },
  };
}
