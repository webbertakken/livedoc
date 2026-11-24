import { describe, expect, it } from 'vitest';
import { ADVANCE_FIRST, FONT_ADVANCES, TABULAR_DIGITS } from './font-advances';
import {
  fontPx,
  lineHeightPx,
  measuredFont,
  SHEET_TEXT_FONT,
  textWidth,
  TEXT_BASE_PX,
  type TextFace,
} from './text-measure';

const INTER: TextFace = { font: 'inter' };
const inter = FONT_ADVANCES.inter!.regular;
const em = (ch: string) => inter[ch.charCodeAt(0) - ADVANCE_FIRST]! / 1000;

// docs/specs/029-sheets/sheet.md "Row height": lines are broken from a table of each font's own character widths.
describe('fontPx and lineHeightPx', () => {
  it('reads a cell with no size as 13 px and a size in points as px', () => {
    expect(fontPx(undefined)).toBe(TEXT_BASE_PX);
    expect(fontPx(10)).toBe(13);
    expect(fontPx(18)).toBe(24);
  });

  it('keeps a line 1.3 times its font size, to a whole px', () => {
    expect(lineHeightPx(13)).toBe(17);
    expect(lineHeightPx(24)).toBe(31);
  });
});

describe('textWidth', () => {
  it("sums each character's own advance, scaled by the font size", () => {
    expect(textWidth('il', 13, INTER)).toBeCloseTo((em('i') + em('l')) * 13, 6);
    expect(textWidth('mW', 20, INTER)).toBeCloseTo((em('m') + em('W')) * 20, 6);
    expect(textWidth('mmmm', 13, INTER)).toBeGreaterThan(textWidth('iiii', 13, INTER) * 2);
  });

  it('measures bold a little wider, and each font by its own table', () => {
    expect(textWidth('Total', 13, { ...INTER, bold: true })).toBeGreaterThan(
      textWidth('Total', 13, INTER),
    );
    expect(textWidth('illicit', 13, { font: 'roboto-mono' })).toBeCloseTo(7 * 0.6 * 13, 6);
    expect(textWidth('Budget', 13, { font: 'oswald' })).toBeLessThan(
      textWidth('Budget', 13, INTER),
    );
  });

  // A text with no font is measured and drawn in Inter (D99).
  // sheet.md "The grid": numbers are drawn in tabular figures where the font has them, and measured so.
  it('measures digits as tabular figures when asked, where the face has them', () => {
    const tabular = { ...INTER, tabular: true };
    expect(TABULAR_DIGITS.inter).toEqual({ regular: 650, bold: 650 });
    expect(textWidth('1111', 13, tabular)).toBeCloseTo(4 * 0.65 * 13, 6);
    expect(textWidth('1111', 13, { ...tabular, bold: true })).toBeCloseTo(4 * 0.65 * 13, 6);
    // Only the digits change: a comma, a point and a letter keep their own widths.
    expect(textWidth('1,0.a', 13, tabular)).toBeCloseTo(
      2 * 0.65 * 13 + textWidth(',.a', 13, INTER),
      6,
    );
    expect(textWidth('8888', 13, tabular)).toBeCloseTo(textWidth('1111', 13, tabular), 6);
    // Without the ask, digits keep their widths; a face with no tabular figures keeps them anyway.
    expect(textWidth('1111', 13, INTER)).toBeLessThan(textWidth('1111', 13, tabular));
    expect(textWidth('1111', 13, { font: 'poppins', tabular: true })).toBe(
      textWidth('1111', 13, { font: 'poppins' }),
    );
    expect(textWidth('1111', 13, { font: 'caveat', bold: true, tabular: true })).toBe(
      textWidth('1111', 13, { font: 'caveat', bold: true }),
    );
    expect(textWidth('1111', 13, { font: 'caveat', tabular: true })).toBeCloseTo(4 * 0.45 * 13, 6);
  });

  it('measures a text with no font, or a font it has no table for, as Inter', () => {
    expect(SHEET_TEXT_FONT).toBe('inter');
    expect(measuredFont(undefined)).toBe('inter');
    expect(measuredFont('lora')).toBe('lora');
    expect(measuredFont('gone')).toBe('inter');
    expect(textWidth('Budget review', 13)).toBe(textWidth('Budget review', 13, INTER));
    expect(textWidth('Budget', 13, { bold: true })).toBe(
      textWidth('Budget', 13, { ...INTER, bold: true }),
    );
    expect(textWidth('Budget', 13, { font: 'gone' })).toBe(textWidth('Budget', 13, INTER));
    expect(textWidth('Budget', 13, { font: 'constructor' })).toBe(textWidth('Budget', 13, INTER));
  });

  it('measures a document family by its own widths, its stand-in’s, else Arimo’s (formatting.md D202)', () => {
    expect(measuredFont('Roboto Mono')).toBe('Roboto Mono');
    expect(measuredFont('roboto mono')).toBe('Roboto Mono');
    expect(measuredFont('Arial')).toBe('Arimo');
    expect(measuredFont('Calibri')).toBe('Carlito');
    expect(measuredFont('Verdana')).toBe('Arimo');
    expect(measuredFont('Bitter')).toBe('Arimo');
    expect(measuredFont('Constructor')).toBe('Arimo');
    // The editor font of a name keeps its own table: an id is matched exactly, before any family.
    expect(measuredFont('nunito')).toBe('nunito');
    expect(measuredFont('Nunito')).toBe('Nunito');
    // Arimo shares Arial's metrics: a lower case a is 556 thousandths of an em.
    expect(textWidth('a', 1000, { font: 'Arial' })).toBe(556);
    expect(textWidth('Total', 13, { font: 'Arial' })).toBe(
      textWidth('Total', 13, { font: 'Arimo' }),
    );
  });

  it('measures an accented letter as its letter and a mark on its own as nothing (D98)', () => {
    expect(textWidth('é', 13, INTER)).toBeCloseTo(em('e') * 13, 6);
    expect(textWidth('Å', 13, INTER)).toBeCloseTo(em('A') * 13, 6);
    expect(textWidth('e\u0301', 13, INTER)).toBeCloseTo(em('e') * 13, 6);
  });

  it('measures a CJK character a full em and an emoji 1.25 em (D98)', () => {
    expect(textWidth('漢字', 10)).toBe(20);
    expect(textWidth('한', 10)).toBe(10);
    expect(textWidth('😀', 10)).toBe(12.5);
    expect(textWidth('★', 10)).toBe(12.5);
  });

  it("measures any other letter as the font's average letter, by its case (D98)", () => {
    const lower = textWidth('abcdefghijklmnopqrstuvwxyz', 13, INTER) / 26;
    const upper = textWidth('ABCDEFGHIJKLMNOPQRSTUVWXYZ', 13, INTER) / 26;
    expect(textWidth('д', 13, INTER)).toBeCloseTo(lower, 6);
    expect(textWidth('Д', 13, INTER)).toBeCloseTo(upper, 6);
  });

  it('measures common punctuation outside the table by a stand-in', () => {
    expect(textWidth('\u2019', 13, INTER)).toBeCloseTo(em("'") * 13, 6);
    expect(textWidth('\u2014', 10)).toBe(10);
    expect(textWidth('\u2026', 13, INTER)).toBeCloseTo(em('.') * 3 * 13, 6);
    expect(textWidth('\u00a0', 13, INTER)).toBeCloseTo(em(' ') * 13, 6);
    expect(textWidth('€', 13, INTER)).toBeCloseTo(em('0') * 13, 6);
  });

  it('gives a control character no width and a tab eight spaces', () => {
    expect(textWidth('\u0007', 13)).toBe(0);
    expect(textWidth('\t', 13, INTER)).toBeCloseTo(em(' ') * 8 * 13, 6);
  });
});
