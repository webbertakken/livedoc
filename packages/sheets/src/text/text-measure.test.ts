import { describe, expect, it } from 'vitest';
import { ADVANCE_FIRST, FONT_ADVANCES, SYSTEM_ADVANCES } from './font-advances';
import { fontPx, lineHeightPx, textWidth, TEXT_BASE_PX, type TextFace } from './text-measure';

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

  // A text with no font is drawn in the device's own font, which no table holds (D92).
  it('measures a text with no font in the system face: each character at its widest', () => {
    const text = 'Budget review, 12 March';
    let units = 0;
    for (const ch of text) units += SYSTEM_ADVANCES.regular[ch.charCodeAt(0) - ADVANCE_FIRST]!;
    expect(textWidth(text, 13)).toBeCloseTo((units * 13) / 1000, 6);
    expect(textWidth(text, 13, { bold: true })).toBeGreaterThan(textWidth(text, 13));
  });

  it('holds no character of the system face narrower than Inter draws it', () => {
    for (const weight of ['regular', 'bold'] as const)
      SYSTEM_ADVANCES[weight].forEach((units, i) =>
        expect(units).toBeGreaterThanOrEqual(FONT_ADVANCES.inter![weight][i]!),
      );
  });

  it('measures a font it does not know in the system face', () => {
    expect(textWidth('Budget', 13, { font: 'gone' })).toBe(textWidth('Budget', 13));
    expect(textWidth('Budget', 13, { font: 'constructor' })).toBe(textWidth('Budget', 13));
    expect(textWidth('Budget', 13, { font: 'gone' })).toBeGreaterThan(
      textWidth('Budget', 13, INTER),
    );
  });

  it('measures an accented letter as its letter and a mark on its own as nothing (D91)', () => {
    expect(textWidth('é', 13, INTER)).toBeCloseTo(em('e') * 13, 6);
    expect(textWidth('Å', 13, INTER)).toBeCloseTo(em('A') * 13, 6);
    expect(textWidth('e\u0301', 13, INTER)).toBeCloseTo(em('e') * 13, 6);
  });

  it('measures a CJK character a full em and an emoji 1.25 em (D91)', () => {
    expect(textWidth('漢字', 10)).toBe(20);
    expect(textWidth('한', 10)).toBe(10);
    expect(textWidth('😀', 10)).toBe(12.5);
    expect(textWidth('★', 10)).toBe(12.5);
  });

  it("measures any other letter as the font's average letter, by its case (D91)", () => {
    const lower = textWidth('abcdefghijklmnopqrstuvwxyz', 13, INTER) / 26;
    const upper = textWidth('ABCDEFGHIJKLMNOPQRSTUVWXYZ', 13, INTER) / 26;
    expect(textWidth('д', 13, INTER)).toBeCloseTo(lower, 6);
    expect(textWidth('Д', 13, INTER)).toBeCloseTo(upper, 6);
    expect(textWidth('д', 13)).toBeCloseTo(textWidth('abcdefghijklmnopqrstuvwxyz', 13) / 26, 6);
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
