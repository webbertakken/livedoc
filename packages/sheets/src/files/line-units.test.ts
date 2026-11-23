// The units of row and column sizes in files (standard-mapping.md "Rows and columns in the file", D166).
import { describe, expect, it } from 'vitest';
import {
  excelWidthFromPx,
  odfLengthFromPx,
  pointsFromPx,
  pxFromExcelWidth,
  pxFromOdfLength,
  pxFromPoints,
} from './line-units';

describe('line units', () => {
  it('turn points and pixels at 96 to the inch', () => {
    expect(pxFromPoints(15.75)).toBe(21);
    expect(pointsFromPx(21)).toBe(15.75);
    expect(pointsFromPx(28)).toBe(21);
  });

  it('read and write Excel’s column widths as Excel does', () => {
    // Excel's default column: 8.43 characters, 64 px, written 9.140625.
    expect(excelWidthFromPx(64)).toBe(9.140625);
    expect(pxFromExcelWidth(9.140625)).toBe(64);
    for (const px of [24, 100, 120, 333, 2000])
      expect(pxFromExcelWidth(excelWidthFromPx(px))).toBe(px);
  });

  it('read ODF lengths in any unit, and write them in inches', () => {
    expect(pxFromOdfLength('1in')).toBe(96);
    expect(pxFromOdfLength('2.54cm')).toBeCloseTo(96);
    expect(pxFromOdfLength('25.4mm')).toBeCloseTo(96);
    expect(pxFromOdfLength('72pt')).toBe(96);
    expect(pxFromOdfLength('6pc')).toBe(96);
    expect(pxFromOdfLength(' .5in ')).toBe(48);
    expect(pxFromOdfLength('12px')).toBe(12);
    expect(pxFromOdfLength('12em')).toBeNull();
    expect(pxFromOdfLength('')).toBeNull();
    expect(odfLengthFromPx(100)).toBe('1.0417in');
    expect(odfLengthFromPx(96)).toBe('1in');
    expect(Math.round(pxFromOdfLength(odfLengthFromPx(21))!)).toBe(21);
  });
});
