// docs/specs/034-text-documents/standard-mapping.md "The model": lengths are points; a zero is a zero.
import { parseXml } from '@livedoc/office-packages';
import { describe, expect, it } from 'vitest';
import { readParagraphProps } from './ooxml-props';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const pPr = (inner: string) => {
  const parsed = parseXml(`<w:pPr xmlns:w="${W}">${inner}</w:pPr>`);
  if (!parsed.ok) throw new Error('fixture');
  return parsed.root;
};

describe('readParagraphProps', () => {
  it('reads a hanging indent as a negative first line, and a hanging of nothing as zero, not minus zero', () => {
    expect(readParagraphProps(pPr('<w:ind w:hanging="360"/>')).indentFirst).toBe(-18);
    expect(Object.is(readParagraphProps(pPr('<w:ind w:hanging="0"/>')).indentFirst, 0)).toBe(true);
  });
});
