// An office kind's font size (docs/specs/034-text-documents/text-and-paragraphs.md "Text formatting"): points from 1
// to 400, to a tenth of a point; what the toolbar's size field reads and types, and the steps its list offers.

export const FONT_SIZE_MIN = 1;
export const FONT_SIZE_MAX = 400;
/** Google's list. */
export const FONT_SIZE_STEPS: readonly number[] = [
  6, 7, 8, 9, 10, 11, 12, 14, 18, 24, 30, 36, 48, 60, 72, 96,
];

/** A size kept within 1 to 400 points, rounded to a tenth. */
export const clampFontSize = (pt: number): number =>
  Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, Math.round(pt * 10) / 10));

/** A typed size, rounded to a tenth, or null when it is not a number from 1 to 400 (a "pt" may follow). */
export function parseFontSizeText(text: string): number | null {
  const match = /^\s*(\d{1,3}(?:[.,]\d+)?|[.,]\d+)\s*(?:pt)?\s*$/i.exec(text);
  if (!match) return null;
  const n = Math.round(Number(match[1]!.replace(',', '.')) * 10) / 10;
  return n >= FONT_SIZE_MIN && n <= FONT_SIZE_MAX ? n : null;
}

/** The size as the field shows it: blank for a mixed selection. */
export const fontSizeLabel = (pt: number | null): string => (pt === null ? '' : String(pt));
