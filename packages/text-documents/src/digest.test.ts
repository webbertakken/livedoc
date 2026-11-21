// docs/specs/034-text-documents/live-editing-and-storage.md "The digest".
import { describe, expect, it } from 'vitest';
import { textDocumentDigest } from './digest';
import { TEXT_DOCUMENT_WORDS_PER_PAGE } from './limits';
import { CONSTRUCTS } from './testing/constructs';
import { TextDocumentState } from './text-document-state';

const stateOf = (...texts: string[]) =>
  TextDocumentState.load([TextDocumentState.fromBody(texts.map((text) => ({ text })))]);

describe('textDocumentDigest', () => {
  it('reads the seed as empty: no content, no words, one page', () => {
    expect(textDocumentDigest(TextDocumentState.load())).toEqual({
      characters: 0,
      words: 0,
      pages: 1,
      hasContent: false,
      searchText: '',
    });
  });

  it('counts characters and words over every paragraph, the search text one line a paragraph', () => {
    expect(textDocumentDigest(stateOf('Hello, world.', '', '  two  words '))).toEqual({
      characters: 26,
      words: 4,
      pages: 1,
      hasContent: true,
      searchText: 'Hello, world.\n\n  two  words ',
    });
  });

  it('has content with a character that is only a space', () => {
    expect(textDocumentDigest(stateOf(' ')).hasContent).toBe(true);
  });

  it('estimates pages from words, without layout', () => {
    const words = (n: number) => Array.from({ length: n }, () => 'word').join(' ');
    expect(textDocumentDigest(stateOf(words(TEXT_DOCUMENT_WORDS_PER_PAGE))).pages).toBe(1);
    expect(textDocumentDigest(stateOf(words(TEXT_DOCUMENT_WORDS_PER_PAGE + 1))).pages).toBe(2);
  });

  // "The digest": the search text gains each header and footer a section names, once each; the counts stay the body's.
  it('searches headers and footers after the body, each once, counting the body alone', () => {
    const doc = TextDocumentState.load([
      TextDocumentState.fromDocument(CONSTRUCTS.headers!('ooxml')),
    ]);
    const digest = textDocumentDigest(doc);
    expect(digest.searchText).toBe(
      [
        'First section',
        'Second section',
        'Header',
        'First page header',
        'Even page header',
        'Footer',
        'Second section header',
      ].join('\n'),
    );
    expect(digest.words).toBe(4);
  });
});
