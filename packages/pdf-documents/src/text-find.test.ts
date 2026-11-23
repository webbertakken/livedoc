// docs/specs/035-pdf-documents/reading-surface.md "Find": What matches. The query and the text read alike (a run of
// spaces or a line break one space, a hyphen-broken word one word, the query trimmed), in either case unless asked,
// whole words only where asked; the spans name units of the text as the reader wrote it.
import { describe, expect, it } from 'vitest';
import { TextFind } from './text-find';

const found = (text: string, query: string, options = {}) =>
  TextFind.spans(text, query, options).map(([start, end]) => text.slice(start, end));

describe('finding a query in a page’s text', () => {
  it('finds every place, in either case unless asked', () => {
    expect(found('The fox and the Fox', 'fox')).toEqual(['fox', 'Fox']);
    expect(found('The fox and the Fox', 'Fox', { matchCase: true })).toEqual(['Fox']);
    expect(TextFind.spans('aaaa', 'aa')).toEqual([
      [0, 2],
      [2, 4],
    ]);
  });

  it('reads a line break and a run of spaces as one space, and the query trimmed', () => {
    expect(found('type information\r\nis available', ' information is ')).toEqual([
      'information\r\nis',
    ]);
    expect(found('two  spaces', 'two spaces')).toEqual(['two  spaces']);
  });

  it('finds a word the file broke with a hyphen at a line’s end', () => {
    expect(found('to com\u0002pile it', 'compile')).toEqual(['com\u0002pile']);
  });

  it('finds whole words only where asked', () => {
    expect(found('cat concat cat.', 'cat', { wholeWords: true })).toEqual(['cat', 'cat']);
    expect(found('cat concat', 'cat')).toEqual(['cat', 'cat']);
  });

  it('keeps a letter whose other case is longer mapped to its own place', () => {
    // "İ" folds to two units; what follows it is still found where it is.
    expect(found('İstanbul and bul', 'bul')).toEqual(['bul', 'bul']);
  });

  it('finds nothing for an empty query', () => {
    expect(TextFind.spans('anything', '   ')).toEqual([]);
  });
});
