// docs/specs/020-import-export/office-packages.md "Common pieces" (embedded files: resolution) and
// docs/specs/034-text-documents/objects.md "The model" (a picture's own size, media by key).
import { describe, expect, it } from 'vitest';
import {
  MAPPED_PICTURE_TYPES,
  mediaKeyOf,
  PICTURE_EXTENSIONS,
  pictureHeader,
  pictureOwnSize,
} from './pictures';

const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const ascii = (s: string) => [...new TextEncoder().encode(s)];

/** A PNG's signature, IHDR, then the chunks given, then IDAT. */
const png = (w: number, h: number, ...chunks: number[][]) =>
  new Uint8Array([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...u32(13),
    ...ascii('IHDR'),
    ...u32(w),
    ...u32(h),
    8,
    6,
    0,
    0,
    0,
    ...u32(0),
    ...chunks.flat(),
    ...u32(0),
    ...ascii('IDAT'),
    ...u32(0),
  ]);
const chunk = (type: string, data: number[]) => [
  ...u32(data.length),
  ...ascii(type),
  ...data,
  ...u32(0),
];
const pHYs = (x: number, y: number, unit: number) => chunk('pHYs', [...u32(x), ...u32(y), unit]);

/** A JPEG with a JFIF APP0 of these units and densities, then a frame of 640 × 480. */
const jfif = (units: number, x: number, y: number) =>
  new Uint8Array([
    0xff,
    0xd8,
    0xff,
    0xe0,
    0,
    16,
    ...ascii('JFIF'),
    0,
    1,
    1,
    units,
    x >> 8,
    x & 255,
    y >> 8,
    y & 255,
    0,
    0,
    0xff,
    0xc0,
    0,
    17,
    8,
    0x01,
    0xe0,
    0x02,
    0x80,
    3,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
  ]);

describe('pictureHeader resolution', () => {
  it('reads a PNG pHYs in pixels a metre as dots an inch', () => {
    expect(pictureHeader(png(300, 200, chunk('sRGB', [0]), pHYs(5906, 5906, 1)))).toEqual({
      mediaType: 'image/png',
      width: 300,
      height: 200,
      dpi: { x: 150.012, y: 150.012 },
    });
  });

  it('reads no resolution from a PNG pHYs of no unit, or none at all', () => {
    expect(pictureHeader(png(300, 200, pHYs(1, 1, 0)))?.dpi).toBeUndefined();
    expect(pictureHeader(png(300, 200))?.dpi).toBeUndefined();
  });

  it('reads a JFIF density in inches or centimetres', () => {
    expect(pictureHeader(jfif(1, 300, 72))).toMatchObject({
      width: 640,
      height: 480,
      dpi: { x: 300, y: 72 },
    });
    expect(pictureHeader(jfif(2, 100, 100))?.dpi).toEqual({ x: 254, y: 254 });
    expect(pictureHeader(jfif(0, 1, 1))?.dpi).toBeUndefined();
  });
});

describe('pictureOwnSize', () => {
  it('is the pixels at the header resolution, in points', () => {
    expect(
      pictureOwnSize({ mediaType: 'image/png', width: 300, height: 150, dpi: { x: 150, y: 75 } }),
    ).toEqual({ width: 144, height: 144 });
  });

  it('is the pixels at 96 an inch without one, as LibreOffice reads it', () => {
    expect(pictureOwnSize({ mediaType: 'image/png', width: 130, height: 92 })).toEqual({
      width: 97.5,
      height: 69,
    });
  });
});

describe('media types and keys', () => {
  it('maps PNG, JPEG, GIF and WebP, each with its extension', () => {
    expect(MAPPED_PICTURE_TYPES).toEqual(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
    expect(MAPPED_PICTURE_TYPES.map((t) => PICTURE_EXTENSIONS[t])).toEqual([
      'png',
      'jpeg',
      'gif',
      'webp',
    ]);
  });

  it('keys media by the SHA-256 of its bytes, as 64 lower-case hex characters', async () => {
    expect(await mediaKeyOf(new TextEncoder().encode('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});
