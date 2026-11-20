import { describe, expect, it } from 'vitest';
import { Styles } from '../model/styles';
import { TextDocument } from '../model/text-document';
import { textDocumentPageSvg, wrapText } from './page-svg';

// docs/specs/034-text-documents/live-editing-and-storage.md "Thumbnails": the first page from the model, without layout.
describe('textDocumentPageSvg', () => {
  it('draws the paragraphs on the first section’s paper, at their style’s size', () => {
    const plain = TextDocument.fromTexts(['Quarterly report', 'Revenue <grew> & so did costs.']);
    const titleId = Styles.idOfRole(plain.styles, 'title')!;
    const [first, ...rest] = plain.body;
    const document = {
      ...plain,
      body: [{ ...first!, style: titleId } as (typeof plain.body)[number], ...rest],
    };
    const svg = textDocumentPageSvg(document)!;
    expect(svg).toContain('viewBox="0 0 612 792"');
    expect(svg).toContain('font-size="26" fill="#000000">Quarterly report</text>');
    expect(svg).toContain('font-size="11"');
    expect(svg).toContain('Revenue &#60;grew&#62; &#38; so did costs.');
  });

  it('stops at the bottom margin', () => {
    const many = TextDocument.fromTexts(Array.from({ length: 200 }, (_, i) => `Line ${i}`));
    const svg = textDocumentPageSvg(many)!;
    expect(svg).toContain('>Line 0<');
    expect(svg).not.toContain('>Line 199<');
    const ys = [...svg.matchAll(/ y="([\d.]+)"/g)].map((m) => Number(m[1]));
    expect(Math.max(...ys)).toBeLessThanOrEqual(792 - 72);
  });

  it('has nothing to draw for a document without text', () => {
    expect(textDocumentPageSvg(TextDocument.fromTexts(['', '  ']))).toBeNull();
  });
});

describe('wrapText', () => {
  it('breaks between words, and cuts a word longer than a line', () => {
    expect(wrapText('one two three', 7)).toEqual(['one two', 'three']);
    expect(wrapText('abcdefghij', 4)).toEqual(['abcd', 'efgh', 'ij']);
    expect(wrapText('   ', 4)).toEqual([]);
  });
});
