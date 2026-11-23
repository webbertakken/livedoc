// The units a file sizes its rows and columns in, to and from the pixels the model holds (docs/specs/029-sheets/
// standard-mapping.md "Rows and columns in the file", D166): a pixel a 96th of an inch, a point 4/3 of a pixel, an
// XLSX column's width Excel's own (characters of a 7 px digit with 5 px of padding), an ODF length in any of its units.

// Excel's maximum digit width in pixels (Calibri 11, its default font) and the padding a column adds around it.
const DIGIT_PX = 7;
const PADDING_PX = 5;

const PX_PER: Record<string, number> = {
  in: 96,
  cm: 96 / 2.54,
  mm: 96 / 25.4,
  pt: 96 / 72,
  pc: 16,
  px: 1,
};

/** A row height in points as pixels. */
export const pxFromPoints = (pt: number): number => (pt * 4) / 3;

/** Pixels as points, to two places, as files write them. */
export const pointsFromPx = (px: number): number => Math.round(px * 75) / 100;

/** An XLSX column width (Excel's characters, padding included) as pixels, by Excel's own formula. */
export function pxFromExcelWidth(width: number): number {
  return Math.trunc(((256 * width + Math.trunc(128 / DIGIT_PX)) / 256) * DIGIT_PX);
}

/** Pixels as an XLSX column width: characters to two places, then padded and kept to 256ths, as Excel writes them. */
export function excelWidthFromPx(px: number): number {
  const chars = Math.trunc(((px - PADDING_PX) / DIGIT_PX) * 100 + 0.5) / 100;
  return Math.trunc(((chars * DIGIT_PX + PADDING_PX) / DIGIT_PX) * 256) / 256;
}

/** An ODF length (`2.258cm`, `0.1665in`, `12pt`) as pixels; null when it is not one. */
export function pxFromOdfLength(text: string): number | null {
  const match = /^(\d+(?:\.\d+)?|\.\d+)(in|cm|mm|pt|pc|px)$/.exec(text.trim());
  if (!match) return null;
  return Number(match[1]) * PX_PER[match[2]!]!;
}

/** Pixels as an ODF length in inches, to four places. */
export function odfLengthFromPx(px: number): string {
  return `${Number((px / 96).toFixed(4))}in`;
}
