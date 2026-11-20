// @vitest-environment jsdom
// docs/specs/034-text-documents/text-and-paragraphs.md "Clipboard": HTML from a web page or another editor, its
// whitespace collapsed as a browser draws it but where the source keeps it, `br` a line break, lists read with their
// levels, and headings, character and paragraph formatting read from tags and inline CSS.
import { describe, expect, it } from 'vitest';
import type { Slice } from 'prosemirror-model';
import { textDocumentSchema as schema } from './text-document-schema';
import {
  cssColourHex,
  cssLengthPt,
  normalisePastedHtml,
  pastedHtmlParser,
  pastedParagraphProps,
} from './text-document-paste-html';

function parse(html: string): Slice {
  const { html: plain } = normalisePastedHtml(html);
  const holder = document.createElement('div');
  holder.innerHTML = plain;
  return pastedHtmlParser(schema).parseSlice(holder);
}

const texts = (slice: Slice) => {
  const out: string[] = [];
  slice.content.forEach((node) => out.push(node.textContent));
  return out;
};
const attrsOf = (slice: Slice, index: number) =>
  slice.content.child(index).attrs as Record<string, unknown>;
const marksOf = (slice: Slice, index: number, at = 0) =>
  Object.fromEntries(
    slice.content
      .child(index)
      .child(at)
      .marks.map((m) => [
        m.type.name,
        (m.attrs as { value?: unknown; href?: unknown }).value ?? m.attrs.href,
      ]),
  );

describe('normalisePastedHtml', () => {
  it('collapses whitespace as a browser draws it, between and inside blocks', () => {
    const slice = parse('<div>\n  <p>\n    one   two\n  </p>\n  <p>three <b> four</b></p>\n</div>');
    expect(texts(slice)).toEqual(['one two', 'three four']);
  });

  it('keeps whitespace where the source keeps it, and reads br as a line break', () => {
    const slice = parse(
      '<p>a<br>b<br></p><pre>x  y\n  z</pre><p><span style="white-space: pre-wrap">c  d</span></p>',
    );
    expect(texts(slice)).toEqual(['a\nb', 'x  y\n  z', 'c  d']);
  });

  it('wraps loose inline runs in paragraphs, keeping their block alignment', () => {
    const slice = parse('<div style="text-align: center">loose <i>text</i></div>tail');
    expect(texts(slice)).toEqual(['loose text', 'tail']);
    expect(attrsOf(slice, 0).props).toEqual({ align: 'center' });
  });

  it("keeps a page's style rules for the parser", () => {
    const { html } = normalisePastedHtml(
      '<html><head><style>.MsoNormal { font-weight: bold }</style></head><body><p class="MsoNormal">a</p></body></html>',
    );
    expect(html).toBe('<style>.MsoNormal { font-weight: bold }</style><p class="MsoNormal">a</p>');
  });

  it('leaves pictures, scripts and comments out, counting the pictures', () => {
    const result = normalisePastedHtml('<p>a<img src="x.png"><script>bad()</script><!-- c --></p>');
    expect(result.pictures).toBe(1);
    expect(result.html).toBe('<p>a</p>');
  });

  it('marks list items with their list, level and kind, nested lists inside items', () => {
    const { lists } = normalisePastedHtml(
      '<ul><li>a<ol type="i"><li>b</li></ol></li></ul><ol start="3"><li>c</li></ol>' +
        '<ul><li role="checkbox" aria-checked="true">d</li></ul>',
    );
    expect([...lists.keys()]).toEqual(['html-1', 'html-2', 'html-3']);
    expect([...lists.get('html-1')!]).toEqual([
      [0, { kind: 'bullet' }],
      [1, { kind: 'number', format: 'lower-roman' }],
    ]);
    const slice = parse('<ol start="3"><li>c</li><li>d</li></ol>');
    expect(attrsOf(slice, 0).list).toEqual({ id: '@paste:html-1', level: 0, restart: 3 });
    expect(attrsOf(slice, 1).list).toEqual({ id: '@paste:html-1', level: 0 });
    const checks = parse('<ul><li role="checkbox" aria-checked="true">d</li></ul>');
    expect(attrsOf(checks, 0).list).toEqual({ id: '@paste:html-1', level: 0, checked: true });
  });

  it('reads an item of paragraphs as one item, their formatting on it', () => {
    const slice = parse(
      '<ul><li><p style="text-align: right">one</p><p>two</p></li><li>three</li></ul>',
    );
    expect(texts(slice)).toEqual(['one\ntwo', 'three']);
    expect(attrsOf(slice, 0).props).toEqual({ align: 'end' });
  });

  it("reads Word's list paragraphs, their markers taken out", () => {
    const html =
      '<p class="MsoListParagraph" style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">1.<span> </span></span>First</p>' +
      '<p style="mso-list:l0 level2 lfo1"><span style="mso-list:Ignore">·</span>Sub</p>';
    const { lists } = normalisePastedHtml(html);
    expect([...lists.get('word-l0')!]).toEqual([
      [0, { kind: 'number', format: 'decimal' }],
      [1, { kind: 'bullet' }],
    ]);
    const slice = parse(html);
    expect(texts(slice)).toEqual(['First', 'Sub']);
    expect(attrsOf(slice, 1).list).toEqual({ id: '@paste:word-l0', level: 1 });
  });
});

describe('pastedHtmlParser', () => {
  it('reads h1 to h6 as headings and other paragraphs as Normal text', () => {
    const slice = parse('<h1>A</h1><h6>B</h6><p>C</p>');
    expect([0, 1, 2].map((i) => attrsOf(slice, i).style)).toEqual(['@heading1', '@heading6', null]);
  });

  it('reads character formatting from tags and inline CSS', () => {
    const slice = parse(
      '<p><b><i><u><s><sup><a href="https://a.example/">x</a></sup></s></u></i></b>' +
        "<span style=\"font-family: 'Open Sans', sans-serif; font-size: 16px; color: rgb(255, 0, 0); " +
        'background-color: #ff0; font-variant: small-caps; text-transform: uppercase; ' +
        'text-decoration: underline line-through">y</span></p>',
    );
    expect(marksOf(slice, 0, 0)).toEqual({
      bold: true,
      italic: true,
      underline: true,
      strike: true,
      vertical: 'super',
      link: 'https://a.example/',
    });
    expect(marksOf(slice, 0, 1)).toEqual({
      font: 'Open Sans',
      size: 12,
      color: '#ff0000',
      highlight: '#ffff00',
      small_caps: true,
      transform: 'uppercase',
      underline: true,
      strike: true,
    });
  });

  it("reads Google's normal-weight wrapper as no bold, and leaves unsafe links and white backgrounds out", () => {
    const slice = parse(
      '<b style="font-weight:normal"><p><a href="javascript:alert(1)" style="background-color: #ffffff">z</a></p></b>',
    );
    expect(marksOf(slice, 0)).toEqual({});
  });
});

describe('pastedParagraphProps', () => {
  it('reads alignment, indents, spacing and line height; a list item keeps its level indents', () => {
    const style = document.createElement('p').style;
    style.cssText =
      'text-align: justify; margin: 6pt 1in 12px 36pt; text-indent: -18pt; line-height: 1.5';
    expect(pastedParagraphProps(style, false)).toEqual({
      align: 'justify',
      indentStart: 36,
      indentEnd: 72,
      indentFirst: -18,
      spaceBefore: 6,
      spaceAfter: 9,
      lineHeight: { rule: 'multiple', value: 1.5 },
    });
    expect(pastedParagraphProps(style, true)).not.toHaveProperty('indentStart');
    style.cssText = 'line-height: 20pt';
    expect(pastedParagraphProps(style, false)).toEqual({ lineHeight: { rule: 'atLeast', pt: 20 } });
    style.cssText = 'line-height: 150%; margin-top: -4pt';
    expect(pastedParagraphProps(style, false)).toEqual({
      lineHeight: { rule: 'multiple', value: 1.5 },
    });
    expect(pastedParagraphProps(document.createElement('p').style, false)).toBeNull();
  });
});

describe('css values', () => {
  it('reads lengths in points, none for relative ones', () => {
    expect([
      cssLengthPt('12px'),
      cssLengthPt('1in'),
      cssLengthPt('2.54cm'),
      cssLengthPt('0'),
    ]).toEqual([9, 72, 72, 0]);
    expect([cssLengthPt('1em'), cssLengthPt('12'), cssLengthPt('50%')]).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
  });

  it('reads colours as #rrggbb, none for transparent or unknown ones', () => {
    expect(
      ['red', '#AbC', '#a1b2c3ff', 'rgba(1, 2, 3, 0.5)', 'rgb(1 2 3 / 50%)'].map(cssColourHex),
    ).toEqual(['#ff0000', '#aabbcc', '#a1b2c3', '#010203', '#010203']);
    expect(
      ['transparent', '#0000', '#11223300', 'rgba(0,0,0,0)', 'hsl(0 0% 0%)'].map(cssColourHex),
    ).toEqual([undefined, undefined, undefined, undefined, undefined]);
  });
});
