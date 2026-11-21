// Reading a page into a tree (docs/specs/029-sheets/imports.md "The functions"): HTML as a browser forgives it, XML as
// written, character references, and document order.
import { describe, expect, it } from 'vitest';
import {
  attrOf,
  decodeEntities,
  elementsOf,
  parseMarkup,
  shownText,
  textOf,
  type MarkupElement,
  type MarkupNode,
} from './markup';

// A tree written back as nested names, text in quotes, for a compact comparison.
function shape(node: MarkupNode): unknown {
  if (node.kind === 'text') return JSON.stringify(node.text);
  return [node.name, ...node.children.map(shape)];
}

const html = (src: string) => parseMarkup(src, 'html').children.map(shape);

describe('parseMarkup in HTML', () => {
  it('closes the paragraphs, items and cells a page leaves open', () => {
    expect(html('<p>a<p>b<div>c</div>')).toEqual([
      ['p', '"a"'],
      ['p', '"b"'],
      ['div', '"c"'],
    ]);
    expect(html('<ul><li>a<li>b</ul>')).toEqual([['ul', ['li', '"a"'], ['li', '"b"']]]);
    expect(html('<dl><dt>a<dd>b<dt>c</dl>')).toEqual([
      ['dl', ['dt', '"a"'], ['dd', '"b"'], ['dt', '"c"']],
    ]);
    expect(html('<table><tr><td>1<td>2<tr><th>3</table>')).toEqual([
      ['table', ['tr', ['td', '"1"'], ['td', '"2"']], ['tr', ['th', '"3"']]],
    ]);
    expect(html('<table><thead><tr><td>1<tbody><tr><td>2</table>')).toEqual([
      ['table', ['thead', ['tr', ['td', '"1"']]], ['tbody', ['tr', ['td', '"2"']]]],
    ]);
    expect(html('<select><option>a<option>b<optgroup><option>c</select>')).toEqual([
      ['select', ['option', '"a"'], ['option', '"b"'], ['optgroup', ['option', '"c"']]],
    ]);
  });

  it('never closes past what bounds an implied end', () => {
    expect(html('<li>a<ul><li>b</ul>')).toEqual([['li', '"a"', ['ul', ['li', '"b"']]]]);
    expect(html('<td><p>a<table><tr><td>b</table>')).toEqual([
      ['td', ['p', '"a"'], ['table', ['tr', ['td', '"b"']]]],
    ]);
    expect(html('<td><p>a</td>')).toEqual([['td', ['p', '"a"']]]);
  });

  it('reads void elements, raw text, comments and stray markup', () => {
    expect(html('a<br>b<img src=x>')).toEqual(['"a"', ['br'], '"b"', ['img']]);
    expect(html('<script>if (a<b) x="</p>"</script><style>p{}</STYLE>z')).toEqual([
      ['script', '"if (a<b) x=\\"</p>\\""'],
      ['style', '"p{}"'],
      '"z"',
    ]);
    expect(html('<title>a &amp; b</title><script>x')).toEqual([
      ['title', '"a & b"'],
      ['script', '"x"'],
    ]);
    expect(html('<!DOCTYPE html><!-- c -->a < b<!-- open')).toEqual(['"a < b"']);
    expect(html('<?php x ?>a</b>c')).toEqual(['"ac"']);
    expect(html('<P CLASS="x">a</p>')).toEqual([['p', '"a"']]);
    expect(html('<b')).toEqual(['"<b"']);
    expect(html('<script></script><!x')).toEqual([['script']]);
  });

  it('reads attributes quoted, unquoted and bare, the first of a name kept', () => {
    const [el] = parseMarkup(
      `<a HREF="/x?a=1&amp;b=2" title='t' data-n=3 hidden href="/y">`,
      'html',
    ).children as MarkupElement[];
    expect(el!.attrs.map((a) => [a.name, a.value])).toEqual([
      ['href', '/x?a=1&b=2'],
      ['title', 't'],
      ['data-n', '3'],
      ['hidden', ''],
    ]);
    expect(attrOf(el!, 'title')).toBe('t');
    expect(attrOf(el!, 'alt')).toBeUndefined();
  });
});

describe('parseMarkup in XML', () => {
  it('keeps names as written, empty elements, CDATA and processing instructions', () => {
    const root = parseMarkup(
      '<?xml version="1.0"?><Rss><dc:creator>A</dc:creator><e/><d><![CDATA[<b>x</b>]]></d><d><![CDATA[y',
      'xml',
    );
    expect(root.children.map(shape)).toEqual([
      ['Rss', ['dc:creator', '"A"'], ['e'], ['d', '"<b>x</b>"'], ['d', '"y"']],
    ]);
  });

  it('numbers nodes in document order: an element, its attributes, its children', () => {
    const root = parseMarkup('<a x="1"><b/>t</a>', 'xml');
    const a = root.children[0] as MarkupElement;
    expect([
      root.order,
      a.order,
      a.attrs[0]!.order,
      a.children[0]!.order,
      a.children[1]!.order,
    ]).toEqual([0, 1, 2, 3, 4]);
  });
});

describe('the helpers', () => {
  it('decodes numeric and named references, leaving unknown ones', () => {
    expect(decodeEntities('&#65;&#x42;&eacute;&NBSP;&Amp;&#0;&copy;')).toBe(
      'AB&eacute;\u00a0&&#0;©',
    );
    expect(decodeEntities('plain')).toBe('plain');
  });

  it('reads text as a page shows it, and every element in order', () => {
    const root = parseMarkup('<div> a\n <b>b</b>&nbsp;c </div><i>d</i>', 'html');
    expect(shownText(textOf(root))).toBe('a b c d');
    expect(elementsOf(root).map((e) => e.name)).toEqual(['div', 'b', 'i']);
    const attr = (root.children[0] as MarkupElement).attrs;
    expect(attr).toEqual([]);
  });
});
