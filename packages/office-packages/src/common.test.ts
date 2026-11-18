import { describe, expect, it } from 'vitest';
import { colourToOoxml, odfColour, ooxmlColour, ooxmlHighlightName } from './colours';
import { isPictureTooLarge, pictureHeader } from './pictures';
import {
  emuToPt,
  fractionToOdfPercent,
  halfPointsToPt,
  odfLengthToPt,
  odfPercent,
  ptToEmu,
  ptToHalfPoints,
  ptToOdf,
  ptToTwips,
  twipsToPt,
} from './units';

// docs/specs/020-import-export/office-packages.md "Common pieces": units.
describe('lengths', () => {
  it('reads every ODF unit as points, to three decimals', () => {
    expect(odfLengthToPt('1in')).toBe(72);
    expect(odfLengthToPt('2.54cm')).toBe(72);
    expect(odfLengthToPt('25.4mm')).toBe(72);
    expect(odfLengthToPt('2cm')).toBe(56.693);
    expect(odfLengthToPt('1pc')).toBe(12);
    expect(odfLengthToPt('4px')).toBe(3);
    expect(odfLengthToPt('-0.5in')).toBe(-36);
    expect(odfLengthToPt('.5pt')).toBe(0.5);
    expect(odfLengthToPt('12')).toBeUndefined();
    expect(odfLengthToPt(undefined)).toBeUndefined();
  });

  it('writes points that read back equal', () => {
    expect(ptToOdf(56.693)).toBe('56.693pt');
    expect(odfLengthToPt(ptToOdf(odfLengthToPt('2cm')!))).toBe(56.693);
    expect(ptToOdf(-0)).toBe('0pt');
  });

  it('reads and writes percentages', () => {
    expect(odfPercent('115%')).toBe(1.15);
    expect(odfPercent('x')).toBeUndefined();
    expect(fractionToOdfPercent(1.15)).toBe('115%');
  });

  it('reads and writes OOXML units', () => {
    expect(twipsToPt('1440')).toBe(72);
    expect(ptToTwips(72)).toBe('1440');
    expect(halfPointsToPt('22')).toBe(11);
    expect(ptToHalfPoints(11)).toBe('22');
    expect(emuToPt('914400')).toBe(72);
    expect(ptToEmu(72)).toBe('914400');
    expect(twipsToPt('abc')).toBeUndefined();
    expect(halfPointsToPt(undefined)).toBeUndefined();
    expect(emuToPt('')).toBeUndefined();
  });
});

// docs/specs/020-import-export/office-packages.md "Common pieces": colours.
describe('colours', () => {
  it('reads both formats into #rrggbb and writes OOXML back', () => {
    expect(odfColour('#FF00aa')).toBe('#ff00aa');
    expect(odfColour('transparent')).toBeUndefined();
    expect(ooxmlColour('FF00AA')).toBe('#ff00aa');
    expect(ooxmlColour('auto')).toBeUndefined();
    expect(colourToOoxml('#ff00aa')).toBe('FF00AA');
  });

  it('names the highlight a colour stands for', () => {
    expect(ooxmlHighlightName('#ffff00')).toBe('yellow');
    expect(ooxmlHighlightName('#123456')).toBeUndefined();
  });
});

const png = (w: number, h: number) => {
  const b = new Uint8Array(24);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, w);
  new DataView(b.buffer).setUint32(20, h);
  return b;
};

// docs/specs/020-import-export/office-packages.md "Reading a package" step 9.
describe('pictureHeader', () => {
  it('reads PNG, GIF, JPEG and WebP sizes from their headers', () => {
    expect(pictureHeader(png(640, 480))).toEqual({
      mediaType: 'image/png',
      width: 640,
      height: 480,
    });
    const gif = new Uint8Array([...new TextEncoder().encode('GIF89a'), 0x40, 0x01, 0xf0, 0x00]);
    expect(pictureHeader(gif)).toEqual({ mediaType: 'image/gif', width: 320, height: 240 });
    const jpeg = new Uint8Array([
      0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 17, 8, 0x01, 0xe0, 0x02, 0x80, 3,
    ]);
    expect(pictureHeader(jpeg)).toEqual({ mediaType: 'image/jpeg', width: 640, height: 480 });
    const riff = (chunk: string, body: number[]) =>
      new Uint8Array([
        ...new TextEncoder().encode(`RIFF\0\0\0\0WEBP${chunk}`),
        ...new Array(4).fill(0),
        ...body,
        ...new Array(12).fill(0),
      ]);
    expect(pictureHeader(riff('VP8X', [0, 0, 0, 0, 0x7f, 0x02, 0, 0xdf, 0x01, 0]))).toEqual({
      mediaType: 'image/webp',
      width: 640,
      height: 480,
    });
    const lossless = riff('VP8L', [0x2f, 0x7f, 0xc2, 0x77, 0x00]);
    expect(pictureHeader(lossless)).toMatchObject({ width: 640, height: 480 });
    const lossy = riff('VP8 ', [0, 0, 0, 0, 0, 0, 0x80, 0x02, 0xe0, 0x01]);
    expect(pictureHeader(lossy)).toMatchObject({ width: 640, height: 480 });
    expect(pictureHeader(riff('XXXX', []))).toBeUndefined();
  });

  it('reads nothing from other bytes or a JPEG without a frame', () => {
    expect(pictureHeader(new Uint8Array([1, 2, 3]))).toBeUndefined();
    expect(
      pictureHeader(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 2, 1, 1, 1, 1, 1, 1])),
    ).toBeUndefined();
    expect(pictureHeader(new Uint8Array([0xff, 0xd8, 0xff]))).toBeUndefined();
  });

  it('calls a picture bomb too large, before decoding', () => {
    expect(isPictureTooLarge(png(20_000, 20_000))).toBe(true);
    expect(isPictureTooLarge(png(4000, 3000))).toBe(false);
    expect(isPictureTooLarge(new Uint8Array(3))).toBe(false);
  });
});
