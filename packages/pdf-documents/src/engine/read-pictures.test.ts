import { beforeAll, describe, expect, it } from 'vitest';
import { picturesPdf, readerWasm, textPdf, TINY_JPEG } from '../testing/fixtures';
import { PdfReader, startReader } from './reader';

// opening.md "What is read": a page's pictures handed over whole, in the order drawn, with where each is drawn and its
// bytes: a JPEG as the file holds it, any other picture as its pixels; past the limits listed without bytes, or cut.

let reader: PdfReader;

beforeAll(async () => {
  reader = new PdfReader(await startReader(readerWasm()));
});

const at = (pixels: Uint8Array, width: number, x: number, y: number) => [
  ...pixels.subarray((y * width + x) * 4, (y * width + x) * 4 + 4),
];

describe("a page's pictures", () => {
  it('hands over each picture in the order drawn, placed in page points, through the forms it sits in', () => {
    reader.open(picturesPdf());
    const read = reader.pagePictures(0)!;
    expect(read.cut).toBe(false);
    expect(read.pictures.map((x) => [x.matrix, x.box, x.width, x.height])).toEqual([
      [[100, 0, 0, 50, 10, 20], { left: 10, bottom: 20, right: 110, top: 70 }, 4, 2],
      [[64, 0, 0, 64, 200, 300], { left: 200, bottom: 300, right: 264, top: 364 }, 64, 64],
      [[40, 0, 0, 20, 300, 400], { left: 300, bottom: 400, right: 340, top: 420 }, 64, 64],
    ]);
    reader.close();
  });

  it('hands a JPEG over as the file holds it, any other picture as its pixels, row by row from the top', () => {
    reader.open(picturesPdf());
    const [jpeg, photo, chart] = reader.pagePictures(0)!.pictures;
    expect(jpeg!.picture).toEqual({ type: 'image/jpeg', bytes: TINY_JPEG });
    expect(photo!.picture).toMatchObject({ type: 'rgba', width: 64, height: 64 });
    const pixels = (photo!.picture as { pixels: Uint8Array }).pixels;
    expect(pixels.length).toBe(64 * 64 * 4);
    expect(at(pixels, 64, 0, 0)).toEqual([0, 0, 0, 255]);
    expect(at(pixels, 64, 1, 0)).toEqual([4, 0, 0, 255]);
    expect(at(pixels, 64, 3, 2)).toEqual([12, 8, 6, 255]);
    const bar = (chart!.picture as { pixels: Uint8Array }).pixels;
    expect([at(bar, 64, 0, 0), at(bar, 64, 40, 0)]).toEqual([
      [51, 102, 204, 255],
      [255, 255, 255, 255],
    ]);
    reader.close();
  });

  it('lists a picture past the pixels it may decode without bytes, and cuts a page past the pictures it may list', () => {
    reader.open(picturesPdf());
    const big = reader.pagePictures(0, { most: 10, pixels: 64 * 64 - 1 })!;
    expect(big.pictures.map((x) => x.picture?.type ?? null)).toEqual(['image/jpeg', null, null]);
    expect(reader.takeClamped()).toEqual(new Map([['picture', 2]]));
    const cut = reader.pagePictures(0, { most: 2, pixels: 64 * 64 })!;
    expect([cut.pictures.length, cut.cut]).toEqual([2, true]);
    expect(reader.takeClamped()).toEqual(new Map([['list', 1]]));
    reader.close();
  });

  it('hands over none for a page of text alone, and null where there is no such page', async () => {
    reader.open(await textPdf(1));
    expect(reader.pagePictures(0)).toEqual({ pictures: [], cut: false });
    expect(reader.pagePictures(5)).toBeNull();
    reader.close();
  });
});
