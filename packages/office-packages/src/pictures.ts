// Pictures' headers (docs/specs/020-import-export/office-packages.md "Common pieces" and "Reading a package" step 9):
// the media type and pixel size read from the first bytes, before anything decodes, so a picture bomb is refused.

export type PictureHeader = { mediaType: string; width: number; height: number };

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
    return { mediaType: 'image/png', width: u32be(b, 16), height: u32be(b, 20) };
  if (b.length >= 10 && (ascii(b, 0, 6) === 'GIF87a' || ascii(b, 0, 6) === 'GIF89a'))
    return { mediaType: 'image/gif', width: u16le(b, 6), height: u16le(b, 8) };
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    const size = jpegSize(b);
    return size && { mediaType: 'image/jpeg', ...size };
  }
  if (b.length >= 30 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') {
    const size = webpSize(b);
    return size && { mediaType: 'image/webp', ...size };
  }
  return undefined;
}

/** Whether the picture's header claims more pixels than any import reads. */
export function isPictureTooLarge(bytes: Uint8Array, maxPixels = PICTURE_MAX_PIXELS): boolean {
  const header = pictureHeader(bytes);
  return header !== undefined && header.width * header.height > maxPixels;
}
