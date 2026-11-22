// Pictures' headers (docs/specs/020-import-export/office-packages.md "Common pieces" and "Reading a package" step 9):
// the media type and pixel size read from the first bytes, before anything decodes, so a picture bomb is refused.

import { sha256 } from '@livedoc/items';

/** A picture's media type, its pixels, and its resolution in dots an inch when the header gives one. */
export type PictureHeader = {
  mediaType: string;
  width: number;
  height: number;
  dpi?: { x: number; y: number };
};

/** The media types a text document holds as its own pictures (objects.md "The model"), each with its extension. */
export const MAPPED_PICTURE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const;
export type MappedPictureType = (typeof MAPPED_PICTURE_TYPES)[number];
export const PICTURE_EXTENSIONS: Readonly<Record<MappedPictureType, string>> = {
  'image/png': 'png',
  'image/jpeg': 'jpeg',
  'image/gif': 'gif',
  'image/webp': 'webp',
};
export const isMappedPictureType = (type: string): type is MappedPictureType =>
  (MAPPED_PICTURE_TYPES as readonly string[]).includes(type);

/** The resolution a picture without one is read at, as LibreOffice reads it. */
export const PICTURE_DEFAULT_DPI = 96;

const INCHES_A_METRE = 0.0254;
const CM_AN_INCH = 2.54;
const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** (default) A picture's width times height; past it, `picture_too_large`. */
export const PICTURE_MAX_PIXELS = 100_000_000;

const u16be = (b: Uint8Array, at: number) => (b[at]! << 8) | b[at + 1]!;
const u16le = (b: Uint8Array, at: number) => b[at]! | (b[at + 1]! << 8);
const u24le = (b: Uint8Array, at: number) => b[at]! | (b[at + 1]! << 8) | (b[at + 2]! << 16);
const u32be = (b: Uint8Array, at: number) => u16be(b, at) * 0x10000 + u16be(b, at + 2);
const ascii = (b: Uint8Array, at: number, n: number) =>
  String.fromCharCode(...b.subarray(at, at + n));

function jpegSize(b: Uint8Array): { width: number; height: number } | undefined {
  let at = 2;
  while (at + 9 < b.length) {
    if (b[at] !== 0xff) return undefined;
    const marker = b[at + 1]!;
    // Start-of-frame markers carry the size: C0 to CF, but C4 (tables), C8 (reserved) and CC (arithmetic).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc)
      return { height: u16be(b, at + 5), width: u16be(b, at + 7) };
    at += 2 + u16be(b, at + 2);
  }
  return undefined;
}

/** A PNG's `pHYs` resolution in pixels a metre, when its unit is the metre; chunks are walked to the first IDAT. */
function pngDpi(b: Uint8Array): PictureHeader['dpi'] {
  let at = 8;
  while (at + 8 <= b.length) {
    const length = u32be(b, at);
    const type = ascii(b, at + 4, 4);
    if (type === 'IDAT' || type === 'IEND') return undefined;
    if (type === 'pHYs' && length >= 9 && at + 17 <= b.length) {
      if (b[at + 16] !== 1) return undefined;
      return {
        x: round3(u32be(b, at + 8) * INCHES_A_METRE),
        y: round3(u32be(b, at + 12) * INCHES_A_METRE),
      };
    }
    at += 12 + length;
  }
  return undefined;
}

/** A JPEG's JFIF density, in dots an inch or a centimetre; units 0 give only an aspect, no resolution. */
function jfifDpi(b: Uint8Array): PictureHeader['dpi'] {
  if (b.length < 18 || b[3] !== 0xe0 || ascii(b, 6, 5) !== 'JFIF\0') return undefined;
  const units = b[13];
  const x = u16be(b, 14);
  const y = u16be(b, 16);
  if ((units !== 1 && units !== 2) || x === 0 || y === 0) return undefined;
  const scale = units === 2 ? CM_AN_INCH : 1;
  return { x: round3(x * scale), y: round3(y * scale) };
}

const withDpi = (header: PictureHeader, dpi: PictureHeader['dpi']): PictureHeader =>
  dpi ? { ...header, dpi } : header;

function webpSize(b: Uint8Array): { width: number; height: number } | undefined {
  const chunk = ascii(b, 12, 4);
  if (chunk === 'VP8X') return { width: u24le(b, 24) + 1, height: u24le(b, 27) + 1 };
  if (chunk === 'VP8L') {
    const bits = b[21]! | (b[22]! << 8) | (b[23]! << 16) | (b[24]! << 24);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (chunk === 'VP8 ') return { width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff };
  return undefined;
}

/** The picture's media type and size from its header, or undefined for a format it does not read. */
export function pictureHeader(b: Uint8Array): PictureHeader | undefined {
  if (b.length >= 24 && u32be(b, 0) === 0x89504e47 && ascii(b, 12, 4) === 'IHDR')
    return withDpi(
      { mediaType: 'image/png', width: u32be(b, 16), height: u32be(b, 20) },
      pngDpi(b),
    );
  if (b.length >= 10 && (ascii(b, 0, 6) === 'GIF87a' || ascii(b, 0, 6) === 'GIF89a'))
    return { mediaType: 'image/gif', width: u16le(b, 6), height: u16le(b, 8) };
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    const size = jpegSize(b);
    return size && withDpi({ mediaType: 'image/jpeg', ...size }, jfifDpi(b));
  }
  if (b.length >= 30 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') {
    const size = webpSize(b);
    return size && { mediaType: 'image/webp', ...size };
  }
  return undefined;
}

/** A picture's own size in points: its pixels at its resolution, else at `PICTURE_DEFAULT_DPI`. */
export function pictureOwnSize(header: PictureHeader): { width: number; height: number } {
  const dpi = header.dpi ?? { x: PICTURE_DEFAULT_DPI, y: PICTURE_DEFAULT_DPI };
  return {
    width: round3((header.width / dpi.x) * 72),
    height: round3((header.height / dpi.y) * 72),
  };
}

/** A picture's media key: the SHA-256 of its bytes as 64 lower-case hex characters. */
export async function mediaKeyOf(bytes: Uint8Array): Promise<string> {
  const digest = await sha256(new Uint8Array(bytes));
  let hex = '';
  for (const byte of digest) hex += byte.toString(16).padStart(2, '0');
  return hex;
}

/** Whether the picture's header claims more pixels than any import reads. */
export function isPictureTooLarge(bytes: Uint8Array, maxPixels = PICTURE_MAX_PIXELS): boolean {
  const header = pictureHeader(bytes);
  return header !== undefined && header.width * header.height > maxPixels;
}
