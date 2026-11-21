// A picture's kind read from its first bytes (docs/specs/029-sheets/imports.md "IMAGE", D73): the type a server names
// is never trusted, so an SVG or a page served as a picture is never answered as one.

/** The pictures IMAGE shows, by the type they are answered with. SVG is not one (verified: Google's help). */
export type ImageType =
  | 'image/png'
  | 'image/jpeg'
  | 'image/gif'
  | 'image/webp'
  | 'image/avif'
  | 'image/bmp'
  | 'image/x-icon';

function startsWith(bytes: Uint8Array, at: number, sig: readonly number[]): boolean {
  return sig.every((b, i) => bytes[at + i] === b);
}

function ascii(text: string): number[] {
  return [...text].map((ch) => ch.charCodeAt(0));
}

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff];
const ICO = [0x00, 0x00, 0x01, 0x00];

/** The kind of picture the bytes are, or null when they are none IMAGE shows. */
export function sniffImage(bytes: Uint8Array): ImageType | null {
  if (startsWith(bytes, 0, PNG)) return 'image/png';
  if (startsWith(bytes, 0, JPEG)) return 'image/jpeg';
  if (startsWith(bytes, 0, ascii('GIF87a')) || startsWith(bytes, 0, ascii('GIF89a')))
    return 'image/gif';
  if (startsWith(bytes, 0, ascii('RIFF')) && startsWith(bytes, 8, ascii('WEBP')))
    return 'image/webp';
  if (
    startsWith(bytes, 4, ascii('ftyp')) &&
    (startsWith(bytes, 8, ascii('avif')) || startsWith(bytes, 8, ascii('avis')))
  )
    return 'image/avif';
  if (startsWith(bytes, 0, ascii('BM')) && bytes.length > 14) return 'image/bmp';
  if (startsWith(bytes, 0, ICO) && bytes.length > 6) return 'image/x-icon';
  return null;
}
