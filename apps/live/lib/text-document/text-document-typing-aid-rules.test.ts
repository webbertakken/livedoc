// docs/specs/034-text-documents/text-and-paragraphs.md "Typing aids": what each aid makes of the text before the caret.
import { describe, expect, it } from 'vitest';
import {
  capitalFor,
  lastWord,
  linkFor,
  listMarkerFor,
  markdownHeadingFor,
  markdownSpanFor,
  smartQuote,
  substitutionFor,
} from './text-document-typing-aid-rules';

describe('smartQuote', () => {
  it('opens at a word start and closes elsewhere', () => {
    expect(smartQuote('', '"')).toBe('“');
    expect(smartQuote('say ', '"')).toBe('“');
    expect(smartQuote('(', "'")).toBe('‘');
    expect(smartQuote('“', "'")).toBe('‘');
    expect(smartQuote('word', '"')).toBe('”');
    expect(smartQuote('don', "'")).toBe('’');
  });
});

describe('substitutionFor', () => {
  const pairs = [
    { replace: '(c)', with: '©', on: true },
    { replace: '--', with: '–', on: false },
  ];
  it('finds the pair the word is, when it is on', () => {
    expect(substitutionFor('(c)', pairs)?.with).toBe('©');
    expect(substitutionFor('--', pairs)).toBeUndefined();
    expect(substitutionFor('a(c)', pairs)).toBeUndefined();
    expect(substitutionFor('', pairs)).toBeUndefined();
  });
});

describe('lastWord', () => {
  it('reads the word after the last space or tab', () => {
    expect(lastWord('one two')).toEqual({ word: 'two', start: 4 });
    expect(lastWord('a\tb')).toEqual({ word: 'b', start: 2 });
    expect(lastWord('solo')).toEqual({ word: 'solo', start: 0 });
  });
});

describe('linkFor', () => {
  it('links web and email addresses, their trailing marks left out', () => {
    expect(linkFor('https://a.example/x?y=1')).toEqual({
      length: 23,
      href: 'https://a.example/x?y=1',
    });
    expect(linkFor('www.example.com,')).toEqual({ length: 15, href: 'https://www.example.com' });
    expect(linkFor('me@example.org.')).toEqual({ length: 14, href: 'mailto:me@example.org' });
  });

  it('links nothing else', () => {
    expect(linkFor('example.com')).toBeUndefined();
    expect(linkFor('www.')).toBeUndefined();
    expect(linkFor('javascript:alert(1)')).toBeUndefined();
    expect(linkFor('...')).toBeUndefined();
  });
});

describe('capitalFor', () => {
  it("capitalises a sentence's first word", () => {
    expect(capitalFor('hello')).toEqual({ at: 0, letter: 'H' });
    expect(capitalFor('Done. next')).toEqual({ at: 6, letter: 'N' });
    expect(capitalFor('Really? “yes')).toEqual({ at: 9, letter: 'Y' });
    expect(capitalFor('élan')).toEqual({ at: 0, letter: 'É' });
  });

  it('capitalises i on its own and in its contractions', () => {
    expect(capitalFor('so i')).toEqual({ at: 3, letter: 'I' });
    expect(capitalFor("so i'm")).toEqual({ at: 3, letter: 'I' });
    expect(capitalFor('so in')).toBeUndefined();
  });

  it('leaves mid-sentence words, abbreviations and odd words as typed', () => {
    expect(capitalFor('One two')).toBeUndefined();
    expect(capitalFor('See e.g. this')).toBeUndefined();
    expect(capitalFor('Done.next')).toBeUndefined();
    expect(capitalFor('iPhone')).toBeUndefined();
    expect(capitalFor('x2')).toBeUndefined();
    expect(capitalFor('a/b')).toBeUndefined();
    expect(capitalFor('www.example.com')).toBeUndefined();
    expect(capitalFor('Hello')).toBeUndefined();
  });
});

describe('listMarkerFor', () => {
  it('reads bullets, numbers, letters and Roman numerals', () => {
    expect(listMarkerFor('-')).toEqual({ kind: 'bullet', length: 1 });
    expect(listMarkerFor('*')).toEqual({ kind: 'bullet', length: 1 });
    expect(listMarkerFor('1.')).toEqual({ kind: 'number', length: 2, format: 'decimal', start: 1 });
    expect(listMarkerFor('12)')).toEqual({
      kind: 'number',
      length: 3,
      format: 'decimal',
      start: 12,
    });
    expect(listMarkerFor('a.')).toEqual({
      kind: 'number',
      length: 2,
      format: 'lower-letter',
      start: 1,
    });
    expect(listMarkerFor('C)')).toEqual({
      kind: 'number',
      length: 2,
      format: 'upper-letter',
      start: 3,
    });
    expect(listMarkerFor('i.')).toEqual({
      kind: 'number',
      length: 2,
      format: 'lower-roman',
      start: 1,
    });
    expect(listMarkerFor('IV.')).toEqual({
      kind: 'number',
      length: 3,
      format: 'upper-roman',
      start: 4,
    });
  });

  it('reads nothing else', () => {
    for (const text of ['', '1', '-.', 'ab.', '12345.', 'word.', '- '])
      expect(listMarkerFor(text)).toBeUndefined();
  });
});

describe('markdownSpanFor', () => {
  it('reads the span the text closes, and where its inner text lies', () => {
    expect(markdownSpanFor('a **bold**')).toEqual({
      start: 2,
      innerStart: 4,
      innerEnd: 8,
      makes: { mark: 'bold' },
    });
    expect(markdownSpanFor('__b__')).toMatchObject({
      innerStart: 2,
      innerEnd: 3,
      makes: { mark: 'bold' },
    });
    expect(markdownSpanFor('x *it*')).toMatchObject({
      start: 2,
      innerStart: 3,
      makes: { mark: 'italic' },
    });
    expect(markdownSpanFor('_it_')).toMatchObject({ start: 0, makes: { mark: 'italic' } });
    expect(markdownSpanFor('~~gone~~')).toMatchObject({
      start: 0,
      innerEnd: 6,
      makes: { mark: 'strike' },
    });
    expect(markdownSpanFor('see [x](https://a.example)')).toEqual({
      start: 4,
      innerStart: 5,
      innerEnd: 6,
      makes: { link: 'https://a.example' },
    });
  });

  it('reads nothing that is no closed span', () => {
    for (const text of ['**b*', '2 * 3 *', 'snake_case_', '* x*', '[x](javascript:y)', 'plain'])
      expect(markdownSpanFor(text)).toBeUndefined();
  });
});

describe('markdownHeadingFor', () => {
  it('reads one to six hashes', () => {
    expect([markdownHeadingFor('#'), markdownHeadingFor('######')]).toEqual([1, 6]);
    expect([markdownHeadingFor('#######'), markdownHeadingFor('#a')]).toEqual([
      undefined,
      undefined,
    ]);
  });
});
