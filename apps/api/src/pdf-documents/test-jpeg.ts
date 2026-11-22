// A JPEG as far as its segments go, for tests of a browser's thumbnail: a start, a JFIF header, an Exif segment that
// names a camera, a frame header of the given size, a scan and an end. Not a `.test.ts` file, so vitest doesn't
// collect it as a suite.
const segment = (marker: number, payload: number[]) => [
  0xff,
  marker,
  ((payload.length + 2) >> 8) & 0xff,
  (payload.length + 2) & 0xff,
  ...payload,
];
const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));

export const TEST_JPEG_CAMERA = 'Camera-9000';

export function testJpeg(width: number, height: number, padding = 0): Uint8Array<ArrayBuffer> {
  return Uint8Array.from([
    0xff,
    0xd8,
    ...segment(0xe0, [...ascii('JFIF'), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]),
    ...segment(0xe1, [...ascii('Exif'), 0, 0, ...ascii(TEST_JPEG_CAMERA)]),
    ...segment(0xc0, [8, height >> 8, height & 0xff, width >> 8, width & 0xff, 1, 1, 0x11, 0]),
    ...segment(0xda, [1, 1, 0, 0, 63, 0]),
    ...Array.from({ length: padding }, () => 0x55),
    0xff,
    0xd9,
  ]);
}
