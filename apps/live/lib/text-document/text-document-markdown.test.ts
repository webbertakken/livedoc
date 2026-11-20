// docs/specs/034-text-documents/text-and-paragraphs.md "Typing aids", "Clipboard": the Markdown Google reads, read as
// headings, paragraphs and list items, and in their text bold, italic, strikethrough, code and links.
import { describe, expect, it } from 'vitest';
import { looksLikeMarkdown, markdownInline, parseMarkdown } from './text-document-markdown';

describe('markdownInline', () => {
  it('reads bold, italic, strikethrough and their nesting', () => {
    expect(markdownInline('a **b *c* d** ~~e~~ _f_ __g__')).toEqual([
      { text: 'a ' },
      { text: 'b ', bold: true },
      { text: 'c', bold: true, italic: true },
      { text: ' d', bold: true },
      { text: ' ' },
      { text: 'e', strike: true },
      { text: ' ' },
      { text: 'f', italic: true },
      { text: ' ' },
      { text: 'g', bold: true },
    ]);
  });

  it('reads links, autolinks, code as its text, and escapes', () => {
    expect(
      markdownInline('see [the **site**](https://a.example/) or <mailto:me@a.example>'),
    ).toEqual([
      { text: 'see ' },
      { text: 'the ', link: 'https://a.example/' },
      { text: 'site', bold: true, link: 'https://a.example/' },
      { text: ' or ' },
      { text: 'me@a.example', link: 'mailto:me@a.example' },
    ]);
    expect(markdownInline('`a*b*` \\*not\\* [x](javascript:y)')).toEqual([
      { text: 'a*b* *not* [x](javascript:y)' },
    ]);
  });

  it('leaves delimiters that open on a space, or underscores inside a word, as text', () => {
    expect(markdownInline('2 * 3 * 4 snake_case_name ** x**')).toEqual([
      { text: '2 * 3 * 4 snake_case_name ** x**' },
    ]);
    expect(markdownInline('unclosed **bold')).toEqual([{ text: 'unclosed **bold' }]);
  });
});

describe('parseMarkdown', () => {
  it('reads headings, paragraphs joined by their soft breaks, and hard breaks', () => {
    expect(parseMarkdown('# Title #\n\nOne\ntwo  \nthree\n\n###### Six\n#tag')).toEqual([
      { kind: 'heading', level: 1, runs: [{ text: 'Title' }] },
      { kind: 'paragraph', runs: [{ text: 'One two\nthree' }] },
      { kind: 'heading', level: 6, runs: [{ text: 'Six' }] },
      { kind: 'paragraph', runs: [{ text: '#tag' }] },
    ]);
  });

  it('reads lists with their nesting, numbering, checkboxes and carried lines', () => {
    const blocks = parseMarkdown(
      '- one\n  - sub\n    carried\n- [x] done\n\n3. three\n4) four\n\nafter',
    );
    expect(blocks).toEqual([
      { kind: 'item', list: 1, level: 0, marker: 'bullet', runs: [{ text: 'one' }] },
      { kind: 'item', list: 1, level: 1, marker: 'bullet', runs: [{ text: 'sub carried' }] },
      { kind: 'item', list: 1, level: 0, marker: 'check', checked: true, runs: [{ text: 'done' }] },
      { kind: 'item', list: 2, level: 0, marker: 'number', start: 3, runs: [{ text: 'three' }] },
      { kind: 'item', list: 2, level: 0, marker: 'number', start: 4, runs: [{ text: 'four' }] },
      { kind: 'paragraph', runs: [{ text: 'after' }] },
    ]);
  });

  it('reads quotes and code as their text, and leaves rules out', () => {
    expect(parseMarkdown('> quoted\n> on\n\n```js\nconst *a* = 1;\n\n```\n---\nend')).toEqual([
      { kind: 'paragraph', runs: [{ text: 'quoted on' }] },
      { kind: 'paragraph', runs: [{ text: 'const *a* = 1;' }] },
      { kind: 'paragraph', runs: [] },
      { kind: 'paragraph', runs: [{ text: 'end' }] },
    ]);
  });
});

describe('looksLikeMarkdown', () => {
  it('reads Markdown by a line of its own or a span', () => {
    expect(
      ['# Head', '- item', '1. one', '> q', '```', 'a **b** c', 'see [x](https://a.b)'].map(
        looksLikeMarkdown,
      ),
    ).toEqual([true, true, true, true, true, true, true]);
    expect(['plain words', 'a * b', '#tag', 'price 3.5'].map(looksLikeMarkdown)).toEqual([
      false,
      false,
      false,
      false,
    ]);
  });
});
