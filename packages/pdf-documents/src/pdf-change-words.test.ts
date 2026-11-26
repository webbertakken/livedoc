import * as Y from 'yjs';
import { describe, expect, it } from 'vitest';
import { PdfLiveChanges } from './live-changes';
import { Mark } from './mark';
import { PageName } from './page-name';
import { PdfChange, PdfChangeset } from './pdf-change';
import { wordsDiff } from './words-diff';

const typed = (words: string) =>
  Mark.text({
    id: 't1',
    page: PageName.ofObject(3),
    colour: '#ff0000',
    opacity: 1,
    author: 'Ada',
    createdAt: 1,
    rect: [72, 700, 272, 730],
    words,
    size: 12,
  })!;

const wordsOf = (doc: Y.Doc): unknown =>
  doc.getMap<Y.Map<unknown>>('marks').get('t1')?.get('words');
const setWords = (doc: Y.Doc, words: string) =>
  expect(PdfChange.apply(doc, PdfChange.changeMark('t1', { words }))).toBeNull();
/** Two people's live changes, each holding what the other's did. */
const sync = (a: Y.Doc, b: Y.Doc) => {
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)));
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)));
};

// live-editing-and-storage.md "A change and what takes it back": a Text's and a Callout's words are a text type.
describe('a mark’s words', () => {
  it('are held as a text type when the mark is made, and read as its words', () => {
    const doc = PdfLiveChanges.load();
    PdfChange.apply(doc, PdfChange.addMark(typed('Hello')));
    expect(wordsOf(doc)).toBeInstanceOf(Y.Text);
    expect(PdfLiveChanges.mark(doc, 't1')).toEqual(typed('Hello'));
  });

  it('change by the characters that differ, so the text type stays the same one', () => {
    const doc = PdfLiveChanges.load();
    PdfChange.apply(doc, PdfChange.addMark(typed('Hello')));
    const text = wordsOf(doc);
    setWords(doc, 'Hello there');
    expect(wordsOf(doc)).toBe(text);
    expect(
      PdfLiveChanges.mark(doc, 't1')?.kind === 'text' && PdfLiveChanges.mark(doc, 't1'),
    ).toMatchObject({
      words: 'Hello there',
    });
  });

  it('keep both people’s characters when two change one mark’s words at once', () => {
    const ada = PdfLiveChanges.load();
    PdfChange.apply(ada, PdfChange.addMark(typed('Hello world')));
    const bo = PdfLiveChanges.load([PdfLiveChanges.encode(ada)]);
    setWords(ada, 'Hello, world');
    setWords(bo, 'Hello world!');
    sync(ada, bo);
    expect(PdfLiveChanges.mark(ada, 't1')).toMatchObject({ words: 'Hello, world!' });
    expect(PdfLiveChanges.mark(bo, 't1')).toEqual(PdfLiveChanges.mark(ada, 't1'));
  });

  it('held as a whole value, as a state from before held them, become a text type at their next change', () => {
    const doc = PdfLiveChanges.load();
    PdfChange.apply(doc, PdfChange.addMark(typed('Hello')));
    doc.getMap<Y.Map<unknown>>('marks').get('t1')!.set('words', 'Hello');
    expect(PdfLiveChanges.mark(doc, 't1')).toEqual(typed('Hello'));
    setWords(doc, 'Hello again');
    expect(wordsOf(doc)).toBeInstanceOf(Y.Text);
    expect(PdfLiveChanges.mark(doc, 't1')).toMatchObject({ words: 'Hello again' });
  });

  it('are taken back as plain words, by a change and by a changeset', () => {
    const doc = PdfLiveChanges.load();
    PdfChange.apply(doc, PdfChange.addMark(typed('Hello')));
    const change = PdfChange.changeMark('t1', { words: 'Goodbye' });
    expect(PdfChange.inverse(doc, change)).toEqual({
      root: 'marks',
      id: 't1',
      set: { words: 'Hello' },
      unset: [],
    });
    expect(PdfChange.inverse(doc, PdfChange.removeMark('t1'))).toEqual({
      root: 'marks',
      id: 't1',
      put: typed('Hello'),
    });
    const made = PdfChangeset.apply(doc, [PdfChange.removeMark('t1')]);
    expect(made.ok).toBe(true);
    if (made.ok) PdfChangeset.apply(doc, made.back);
    expect(PdfLiveChanges.mark(doc, 't1')).toEqual(typed('Hello'));
    expect(wordsOf(doc)).toBeInstanceOf(Y.Text);
  });

  it('show the same fingerprint as the same words held as a whole value', async () => {
    const text = PdfLiveChanges.load();
    PdfChange.apply(text, PdfChange.addMark(typed('Hello')));
    const plain = PdfLiveChanges.load();
    plain.transact(() => {
      const entry = new Y.Map<unknown>();
      for (const [key, value] of Object.entries(typed('Hello'))) entry.set(key, value);
      plain.getMap('marks').set('t1', entry);
    });
    expect(await PdfLiveChanges.fingerprint(text)).toBe(await PdfLiveChanges.fingerprint(plain));
  });
});

describe('wordsDiff', () => {
  it('names the characters between the common start and the common end', () => {
    expect(wordsDiff('Hello world', 'Hello, world')).toEqual({ at: 5, remove: 0, insert: ',' });
    expect(wordsDiff('Hello world', 'Hello')).toEqual({ at: 5, remove: 6, insert: '' });
    expect(wordsDiff('abc', 'xbc')).toEqual({ at: 0, remove: 1, insert: 'x' });
  });

  it('answers null where nothing differs', () => {
    expect(wordsDiff('same', 'same')).toBeNull();
  });

  it('never splits a pair of surrogates', () => {
    // 😀 is \ud83d\ude00, 😃 is \ud83d\ude03: they share their first unit.
    expect(wordsDiff('a😀b', 'a😃b')).toEqual({ at: 1, remove: 2, insert: '😃' });
    // U+1F642 and U+1F242 share their last unit (\ude42), their first differing.
    const other = String.fromCodePoint(0x1f242);
    expect(wordsDiff('a🙂b', `a${other}b`)).toEqual({ at: 1, remove: 2, insert: other });
  });

  it('takes the common end only from what is left after the common start', () => {
    expect(wordsDiff('aa', 'aaa')).toEqual({ at: 2, remove: 0, insert: 'a' });
  });
});
