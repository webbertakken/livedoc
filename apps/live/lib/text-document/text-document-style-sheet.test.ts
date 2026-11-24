// docs/specs/034-text-documents/text-and-paragraphs.md "Paragraph styles": a paragraph draws in its style.
import { describe, expect, it } from 'vitest';
import { TextDocument, type Style } from '@livedoc/text-documents';
import {
  cssText,
  paragraphDeclarations,
  styleRule,
  textDocumentStyleSheet,
} from './text-document-style-sheet';
import { paperFill, paperInk } from './text-document-paper';

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
    expect(rule).toContain(`color: ${paperInk('#666666')}`);
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
      `color: ${paperInk('#123456')}`,
      `background-color: ${paperFill('#fff2cc')}`,
      'font-variant: small-caps',
      'text-transform: uppercase',
      'text-align: justify',
      '--text-document-indent-start: 36pt',
      '--text-document-indent-end: 12pt',
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

// text-and-paragraphs.md "Spacing and keep rules": the keep rules drawn as the print layout's break rules.
describe('paragraphDeclarations, the keep rules', () => {
  it('draws keep with next, keep lines together and prevent single lines', () => {
    expect(
      cssText(
        paragraphDeclarations({ keepWithNext: true, keepTogether: true, widowControl: true }),
      ),
    ).toBe('break-after: avoid; break-inside: avoid; widows: 2; orphans: 2;');
    expect(
      cssText(
        paragraphDeclarations({ keepWithNext: false, keepTogether: false, widowControl: false }),
      ),
    ).toBe('break-after: auto; break-inside: auto; widows: 1; orphans: 1;');
    expect(cssText(paragraphDeclarations({}))).toBe('');
  });
});

// text-and-paragraphs.md "Borders and shading": a paragraph with borders or a background is a box at its indents.
describe('paragraphDeclarations, borders and shading', () => {
  it('draws a box at the indents: each side its border and padding, and the background', () => {
    const css = cssText(
      paragraphDeclarations({
        indentStart: 36,
        borders: {
          top: { width: 1, dash: 'dotted', color: '#1155cc', space: 4 },
          left: { width: 0.5, dash: 'solid', color: '#000000', space: 2 },
        },
        shading: '#fff2cc',
      }),
    );
    expect(css).toBe(
      '--text-document-indent-start: 36pt; margin-inline-start: var(--text-document-indent-start, 0); ' +
        `margin-inline-end: var(--text-document-indent-end, 0); --text-document-box-inline: calc(var(--text-document-indent-start, 0pt) + var(--text-document-indent-end, 0pt)); border-top: 1pt dotted ${paperInk('#1155cc')}; padding-top: 4pt; ` +
        `border-bottom: none; padding-bottom: 0pt; border-left: 0.5pt solid ${paperInk('#000000')}; padding-left: 2pt; ` +
        `border-right: none; padding-right: 0pt; background-color: ${paperFill('#fff2cc')};`,
    );
  });

  // editing-surface.md "The page in the dark scheme": a line of the box's own fill is drawn as that fill.
  it('draws a line in the box’s own fill colour as the fill, so it melts into it on either paper', () => {
    const css = cssText(
      paragraphDeclarations({
        borders: { top: { width: 1, dash: 'solid', color: '#F1F3F4', space: 4 } },
        shading: '#f1f3f4',
      }),
    );
    expect(css).toContain(`border-top: 1pt solid ${paperFill('#F1F3F4')}`);
  });

  it('draws no box without borders or a background, and nothing unsafe in one', () => {
    expect(cssText(paragraphDeclarations({ borders: undefined }))).toBe('');
    const css = cssText(
      paragraphDeclarations({
        borders: { top: { width: 1, dash: 'solid', color: 'red; x: url(y)', space: 1 } },
        shading: 'url(z)',
      }),
    );
    expect(css).not.toContain('url(');
    expect(css).toContain('border-top: none');
    expect(css).toContain('background-color: transparent');
  });

  it('draws indents as padding on every paragraph, which a box draws as margin', () => {
    expect(textDocumentStyleSheet([], { paragraph: {}, text: {} })).toContain(
      'padding-inline-start: var(--text-document-indent-start, 0); padding-inline-end: var(--text-document-indent-end, 0);',
    );
  });
});
