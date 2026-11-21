// @vitest-environment jsdom
// docs/specs/034-text-documents/text-and-paragraphs.md "Clipboard": the copied HTML other editors read, each paragraph
// and run with its formatting in place, headings as h1 to h6, list items as li in ul and ol, colours as on white paper;
// kept content and section breaks left out.
import { describe, expect, it } from 'vitest';
import { Fragment } from 'prosemirror-model';
import { ListDefinition, Styles, type ListLevel } from '@livedoc/text-documents';
import { textDocumentSchema as schema } from './text-document-schema';
import {
  clipboardSerializer,
  exportParagraphCss,
  exportTextCss,
  type ClipboardHtmlContext,
} from './text-document-clipboard-html';

const numbered = ListDefinition.of('number');
const lists = {
  L1: {
    ...numbered,
    levels: numbered.levels.map((l, i): ListLevel =>
      i === 0 && l.kind === 'number' ? { ...l, start: 3 } : l,
    ),
  },
  L2: ListDefinition.of('check'),
};
const context: ClipboardHtmlContext = {
  styles: [
    ...Styles.builtIn('odf'),
    { id: 'Strong', name: 'Strong', family: 'text', paragraph: {}, text: { bold: true } },
  ],
  defaults: Styles.defaults(),
  lists,
};

function html(nodes: Parameters<typeof Fragment.from>[0]): string {
  const holder = document.createElement('div');
  holder.append(
    clipboardSerializer(() => context).serializeFragment(Fragment.from(nodes), { document }),
  );
  return holder.innerHTML;
}

const p = (attrs: Record<string, unknown>, text = 'x') =>
  schema.nodes.paragraph!.create(attrs, text ? schema.text(text) : undefined);

describe('clipboardSerializer', () => {
  it('writes a heading as its h tag, its style resolved in place, and Normal text as p', () => {
    const out = html([
      p({ style: 'Heading_20_2' }, 'Head'),
      p({ props: { align: 'center' } }, 'Body'),
    ]);
    expect(out).toMatch(
      /^<h2 style="[^"]*font-size: 16pt;[^"]*margin-top: 18pt;[^"]*white-space: pre-wrap;">Head<\/h2>/,
    );
    expect(out).toMatch(
      /<p style="[^"]*font-family: [^"]*Arial[^"]*text-align: center;[^"]*">Body<\/p>$/,
    );
  });

  it('writes runs with their formatting, colours as they are, and safe links only', () => {
    const marks = [
      schema.marks.color!.create({ value: '#000000' }),
      schema.marks.highlight!.create({ value: '#ffff00' }),
      schema.marks.text_style!.create({ id: 'Strong' }),
    ];
    const out = html([
      schema.nodes.paragraph!.create({}, [
        schema.text('a', marks),
        schema.text('b', [schema.marks.link!.create({ href: 'https://a.example/' })]),
        schema.text('c', [schema.marks.link!.create({ href: 'javascript:x' })]),
      ]),
    ]);
    expect(out).toContain('color: rgb(0, 0, 0)');
    expect(out).toContain('background-color: rgb(255, 255, 0)');
    expect(out).toContain('font-weight: 700');
    expect(out).toContain('<a href="https://a.example/">b</a>');
    expect(out).not.toContain('javascript');
  });

  it('gathers list items into ul and ol by list and level, nesting a deeper level in its item', () => {
    const out = html([
      p({ list: { id: 'L1', level: 0 } }, 'one'),
      p({ list: { id: 'L1', level: 1 } }, 'sub'),
      p({ list: { id: 'L1', level: 0 } }, 'two'),
      p({}, 'between'),
      p({ list: { id: 'L2', level: 0, checked: true } }, 'done'),
    ]);
    const holder = document.createElement('div');
    holder.innerHTML = out;
    const [ol, between, ul] = [...holder.children];
    expect(ol!.tagName).toBe('OL');
    expect(ol!.getAttribute('start')).toBe('3');
    expect(ol!.children).toHaveLength(2);
    expect(ol!.querySelector('li > ol[style*="lower-alpha"] > li')!.textContent).toBe('sub');
    expect(between!.tagName).toBe('P');
    expect(ul!.querySelector('li')!.getAttribute('aria-checked')).toBe('true');
    expect(out).not.toContain('data-livedoc');
  });

  it('leaves kept content and section breaks out', () => {
    const out = html([
      schema.nodes.paragraph!.create({}, [
        schema.text('a'),
        schema.nodes.kept_inline!.create({ name: 'field' }),
      ]),
      schema.nodes.section_break!.create(),
      schema.nodes.kept_block!.create({ name: 'table' }),
    ]);
    expect(out).not.toMatch(/<span[^>]*><\/span>|<div/);
    expect(out).toMatch(/>a<\/p>$/);
  });

  // page-layout.md "Page numbers": copied into another app, a field is its text.
  it('writes a field as the text it shows', () => {
    const out = html([
      schema.nodes.paragraph!.create({}, [
        schema.text('Page '),
        schema.nodes.field!.create({ field: 'page-number', text: '4' }),
      ]),
    ]);
    expect(out).toMatch(/Page <span>4<\/span><\/p>$/);
  });

  // page-layout.md "Footnotes": copied elsewhere, a footnote's mark is its number, in superscript.
  it('writes a footnote’s mark as its number', () => {
    const holder = document.createElement('div');
    const numbered = { ...context, noteNumbers: new Map([['n', 2]]) };
    holder.append(
      clipboardSerializer(() => numbered).serializeFragment(
        Fragment.from(
          schema.nodes.paragraph!.create({}, [
            schema.text('Said'),
            schema.nodes.footnote!.create({ story: 'n' }),
            schema.nodes.footnote!.create({ story: 'gone' }),
          ]),
        ),
        { document },
      ),
    );
    expect(holder.innerHTML).toMatch(/Said<sup>2<\/sup><sup><\/sup><\/p>$/);
  });
});

describe('export css', () => {
  it('writes real margins and borders, a list item without its indents', () => {
    const props = {
      indentStart: 36,
      indentFirst: -18,
      indentEnd: 9,
      lineHeight: { rule: 'exact', pt: 14 },
      borders: { top: { width: 1, dash: 'solid', color: '#ff0000', space: 2 } },
      shading: '#eeeeee',
    } as const;
    expect(exportParagraphCss(props)).toBe(
      'margin-left: 36pt; margin-right: 9pt; text-indent: -18pt; margin-top: 0pt; margin-bottom: 0pt; ' +
        'line-height: 14pt; border-top: 1pt solid #ff0000; padding-top: 2pt; background-color: #eeeeee;',
    );
    expect(exportParagraphCss(props, true)).not.toContain('margin-left');
    expect(
      exportParagraphCss({ lineHeight: { rule: 'multiple', value: 1.15 }, align: 'end' }),
    ).toBe('text-align: right; margin-top: 0pt; margin-bottom: 0pt; line-height: 1.15;');
    expect(exportTextCss({ color: '#ffffff' })).toBe('color: #ffffff;');
  });
});
