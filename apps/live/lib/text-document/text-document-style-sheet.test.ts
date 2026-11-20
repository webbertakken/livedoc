// docs/specs/034-text-documents/text-and-paragraphs.md "Paragraph styles": a paragraph draws in its style.
import { describe, expect, it } from 'vitest';
import { TextDocument, type Style } from '@livedoc/text-documents';
import { styleRule, textDocumentStyleSheet } from './text-document-style-sheet';

const blank = TextDocument.blank({ format: 'odf' });

describe('textDocumentStyleSheet', () => {
  const css = textDocumentStyleSheet(blank.styles, blank.defaults);

  it('draws Normal text for a paragraph with no style, or one the document lacks', () => {
    expect(css).toContain('.text-document-body p {');
    expect(css).toContain('line-height: 1.15');
  });

  it('draws each style through its parents, by the paragraph style attribute', () => {
    const heading = blank.styles.find((s) => s.role === 'heading1')!;
    expect(css).toContain(`.text-document-body p[data-style="${heading.id}"] {`);
    expect(styleRule(blank.styles, blank.defaults, heading.id)).toContain('font-size: 20pt');
    expect(styleRule(blank.styles, blank.defaults, heading.id)).toContain('margin-top: 20pt');
    const h6 = blank.styles.find((s) => s.role === 'heading6')!;
    const rule = styleRule(blank.styles, blank.defaults, h6.id);
    expect(rule).toContain('font-style: italic');
    expect(rule).toContain('color: #666666');
  });

  it('draws every text and paragraph property a style may set', () => {
    const all: Style = {
      id: 'All',
      name: 'All',
      family: 'paragraph',
      paragraph: {
        align: 'justify',
        indentStart: 36,
        indentEnd: 12,
        indentFirst: -18,
        spaceBefore: 6,
        spaceAfter: 3,
        lineHeight: { rule: 'exact', pt: 14 },
      },
      text: {
        font: 'Lora',
        size: 12,
        bold: true,
        italic: false,
        underline: true,
        strike: true,
        color: '#123456',
        highlight: '#fff2cc',
        smallCaps: true,
        transform: 'uppercase',
      },
    };
    const rule = styleRule([all], { paragraph: {}, text: {} }, 'All');
    for (const part of [
      'font-family: "LiveDoc Lora", serif',
      'font-size: 12pt',
      'font-weight: 700',
      'font-style: normal',
      'text-decoration-line: underline line-through',
      'color: #123456',
      'background-color: #fff2cc',
      'font-variant: small-caps',
      'text-transform: uppercase',
      'text-align: justify',
      'padding-inline-start: 36pt',
      'padding-inline-end: 12pt',
      'text-indent: -18pt',
      'margin-top: 6pt',
      'margin-bottom: 3pt',
      'line-height: 14pt',
    ])
      expect(rule).toContain(part);
    const atLeast = styleRule(
      [{ ...all, paragraph: { lineHeight: { rule: 'atLeast', pt: 16 } }, text: { bold: false } }],
      { paragraph: {}, text: {} },
      'All',
    );
    expect(atLeast).toContain('line-height: 16pt');
    expect(atLeast).toContain('font-weight: 400');
  });

  it('leaves out a colour or size that could not be a CSS value, and quotes ids safely', () => {
    const odd: Style = {
      id: 'He said "hi"\\',
      name: 'Odd',
      family: 'paragraph',
      paragraph: {},
      text: { color: 'red; background: url(x)', size: 5000 },
    };
    const sheet = textDocumentStyleSheet([odd], { paragraph: {}, text: {} });
    expect(sheet).toContain('p[data-style="He said \\"hi\\"\\\\"]');
    expect(sheet).not.toContain('url(');
    expect(sheet).not.toContain('5000');
  });

  it('draws text styles not at all: only paragraph styles have a paragraph', () => {
    const text: Style = {
      id: 'Strong',
      name: 'Strong',
      family: 'text',
      paragraph: {},
      text: { bold: true },
    };
    expect(textDocumentStyleSheet([text], { paragraph: {}, text: {} })).not.toContain('Strong');
  });
});
