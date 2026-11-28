// docs/specs/034-text-documents/standard-mapping.md "The model": lengths are points; a zero is a zero.
import { parseXml } from '@livedoc/office-packages';
import { describe, expect, it } from 'vitest';
import { readParagraphProps, readRunProps } from './ooxml-props';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const element = (local: string) => (inner: string) => {
  const parsed = parseXml(`<w:${local} xmlns:w="${W}">${inner}</w:${local}>`);
  if (!parsed.ok) throw new Error('fixture');
  return parsed.root;
};
const pPr = element('pPr');
const rPr = element('rPr');

describe('readParagraphProps', () => {
  it('reads a hanging indent as a negative first line, and a hanging of nothing as zero, not minus zero', () => {
    expect(readParagraphProps(pPr('<w:ind w:hanging="360"/>')).indentFirst).toBe(-18);
    expect(Object.is(readParagraphProps(pPr('<w:ind w:hanging="0"/>')).indentFirst, 0)).toBe(true);
  });
});

// standard-mapping.md "What the model holds", A theme's font: a font named by the theme reads as the theme's typeface.
describe('readRunProps', () => {
  const theme = { major: 'Calibri Light', minor: 'Calibri' };

  it('reads a font named by the theme as its body or heading typeface', () => {
    const font = (inner: string) => readRunProps(rPr(inner), theme).props.font;
    expect(font('<w:rFonts w:asciiTheme="minorHAnsi" w:hAnsiTheme="minorHAnsi"/>')).toBe('Calibri');
    expect(font('<w:rFonts w:asciiTheme="majorAscii"/>')).toBe('Calibri Light');
    expect(font('<w:rFonts w:hAnsiTheme="majorHAnsi"/>')).toBe('Calibri Light');
  });

  it('keeps a run’s own font before the theme’s, and names none for a script it does not read', () => {
    const font = (inner: string) => readRunProps(rPr(inner), theme).props.font;
    expect(font('<w:rFonts w:ascii="Arial Black" w:asciiTheme="minorHAnsi"/>')).toBe('Arial Black');
    expect(font('<w:rFonts w:eastAsiaTheme="minorEastAsia"/>')).toBeUndefined();
  });

  it('names no font by the theme without a theme part', () => {
    expect(readRunProps(rPr('<w:rFonts w:asciiTheme="minorHAnsi"/>')).props.font).toBeUndefined();
  });
});
