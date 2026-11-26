// docs/specs/034-text-documents/live-editing-and-storage.md "The digest".
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { textDocumentDigest } from './digest';
import { TEXT_DOCUMENT_WORDS_PER_PAGE } from './limits';
import { LiveThreads } from './live/live-threads';
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
      imageIds: [],
      collab: { actions: [], threads: [] },
    });
  });

  it('counts characters and words over every paragraph, the search text one line a paragraph', () => {
    expect(textDocumentDigest(stateOf('Hello, world.', '', '  two  words '))).toEqual({
      characters: 26,
      words: 4,
      pages: 1,
      hasContent: true,
      searchText: 'Hello, world.\n\n  two  words ',
      imageIds: [],
      collab: { actions: [], threads: [] },
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

// review.md "How a comment is kept", live-editing-and-storage.md "Storage": the search text ends with every thread's
// comments, open and resolved alike, in the threads' order; the counts stay the writing's.
describe('textDocumentDigest with comment threads', () => {
  it('searches every comment after the writing, counting the writing alone', () => {
    const doc = stateOf('Quarterly results');
    const run = (TextDocumentState.body(doc).get(0) as Y.XmlElement).get(0) as Y.XmlText;
    const author = { key: 'k', name: 'Ada', colour: '#000' };
    const start = (id: string, at: number, text: string) => ({
      id,
      tab: 't.0',
      ...LiveThreads.anchorFor(run, 0, 9),
      quote: 'Quarterly',
      comment: { id: `${id}-1`, text, at, author },
    });
    LiveThreads.begin(doc, start('later', 20, 'Check the totals'), 'me');
    LiveThreads.begin(doc, start('first', 10, 'Nice'), 'me');
    LiveThreads.reply(doc, 'first', { id: 'r', text: 'Thanks', at: 30, author }, 'me');
    LiveThreads.resolve(doc, 'later', true, 'me');
    const digest = textDocumentDigest(doc);
    expect(digest.searchText).toBe('Quarterly results\nNice\nThanks\nCheck the totals');
    expect(digest.words).toBe(2);
  });

  it('carries the threads’ rows for the Inbox, authors as keys (inbox.md Â§2.7)', () => {
    const doc = stateOf('Quarterly results');
    const run = (TextDocumentState.body(doc).get(0) as Y.XmlElement).get(0) as Y.XmlText;
    const author = { key: 'k', name: 'Ada', colour: '#000' };
    LiveThreads.begin(
      doc,
      {
        id: 'th',
        tab: 't.0',
        ...LiveThreads.anchorFor(run, 0, 9),
        quote: 'Quarterly',
        comment: { id: 'c', text: 'Nice', at: 10, author },
      },
      'me',
    );
    const { collab } = textDocumentDigest(doc);
    expect(collab.actions).toEqual([]);
    expect(collab.threads).toMatchObject([
      { elementId: 'th', elementLabel: 'Quarterly', participantIds: ['k'], latestText: 'Nice' },
    ]);
  });

  it('carries no rows without threads', () => {
    expect(textDocumentDigest(stateOf('Plain')).collab).toEqual({ actions: [], threads: [] });
  });
});
