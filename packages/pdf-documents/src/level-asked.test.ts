import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import type { BlobKey } from '@livedoc/document';
import { pdfLevelAsked } from './level-asked';
import { PdfLiveChanges } from './live-changes';
import { Mark, type Quad } from './mark';
import { PdfChange } from './pdf-change';

// docs/specs/035-pdf-documents/live-editing-and-storage.md "The room's op kinds": the room checks what an update
// touches, never who its sender says they are.

const BLOB = 'a'.repeat(64) as BlobKey;
const OTHER = 'b'.repeat(64) as BlobKey;
const QUAD: Quad = [72, 716, 300, 716, 72, 700, 300, 700];
const highlight = (id: string, text = 'words') =>
  Mark.highlight({
    id,
    page: 'p:4',
    quads: [QUAD],
    text,
    colour: '#fdf1a9',
    opacity: 1,
    author: 'Ada',
    createdAt: 1_795_000_000_000,
  })!;

/** What the room holds, and one person's document on it, whose changes are read as the updates it sends. */
function onState(stored: readonly Uint8Array[] = []) {
  const doc = PdfLiveChanges.load(stored);
  const sent: Uint8Array[] = [];
  doc.on('update', (update: Uint8Array) => sent.push(update));
  return { doc, sent, last: () => sent.at(-1)! };
}

/** The state after some changes, as the room would hold it. */
function stateOf(change: (doc: Y.Doc) => void): Uint8Array[] {
  const doc = PdfLiveChanges.load();
  change(doc);
  return [PdfLiveChanges.encode(doc)];
}

const named = (doc: Y.Doc) => PdfLiveChanges.setStored(doc, { blob: BLOB, pages: 9 });

describe('pdfLevelAsked', () => {
  it('asks a Participant for a mark, a field value and what Reviewing holds', () => {
    const person = onState();
    PdfLiveChanges.addMark(person.doc, highlight('m1'));
    expect(pdfLevelAsked([], person.last(), BLOB)).toBe('participate');
    PdfChange.apply(
      person.doc,
      PdfChange.fill({ field: 'name', value: 'Ada', by: 'Ada', at: 1_795_000_000_000 }),
    );
    expect(pdfLevelAsked([person.sent[0]!], person.last(), BLOB)).toBe('participate');
    person.doc.getMap('threads').set('m1', new Y.Map());
    expect(pdfLevelAsked(person.sent.slice(0, 2), person.last(), BLOB)).toBe('participate');
    person.doc.getMap('recognised').set('p:4', new Y.Map());
    expect(pdfLevelAsked(person.sent.slice(0, 3), person.last(), BLOB)).toBe('participate');
  });

  it('asks a Participant for a change inside a mark and for a mark removed', () => {
    const stored = stateOf((doc) => PdfLiveChanges.addMark(doc, highlight('m1')));
    const person = onState(stored);
    PdfChange.apply(person.doc, PdfChange.changeMark('m1', { colour: '#aaccff' }));
    expect(pdfLevelAsked(stored, person.last(), BLOB)).toBe('participate');
    PdfLiveChanges.removeMark(person.doc, 'm1');
    expect(pdfLevelAsked([...stored, person.sent[0]!], person.last(), BLOB)).toBe('participate');
  });

  it.each(['pageOrder', 'pages', 'objects', 'fields', 'document'] as const)(
    'asks an Editor for a change to %s',
    (root) => {
      const person = onState();
      if (root === 'pageOrder') person.doc.getArray(root).push(['p:4']);
      else person.doc.getMap(root).set('p:4', new Y.Map([['rotation', 90]]));
      expect(pdfLevelAsked([], person.last(), BLOB)).toBe('edit');
    },
  );

  it('asks an Editor for a change deep inside an Editing root, and for a deletion in one', () => {
    const stored = stateOf((doc) => PdfChange.apply(doc, PdfChange.turnPage('p:4', 90)));
    const deep = onState(stored);
    deep.doc.getMap<Y.Map<unknown>>('pages').get('p:4')!.set('rotation', 180);
    expect(pdfLevelAsked(stored, deep.last(), BLOB)).toBe('edit');
    const gone = onState(stored);
    gone.doc.getMap('pages').delete('p:4');
    expect(pdfLevelAsked(stored, gone.last(), BLOB)).toBe('edit');
  });

  it('asks an Editor for one update that changes a mark and a page together', () => {
    const person = onState();
    person.doc.transact(() => {
      PdfLiveChanges.addMark(person.doc, highlight('m1'));
      PdfChange.apply(person.doc, PdfChange.turnPage('p:4', 90));
    });
    expect(pdfLevelAsked([], person.last(), BLOB)).toBe('edit');
  });

  it('asks an Editor for a root the layout does not name', () => {
    const person = onState();
    person.doc.getMap('anything').set('x', 1);
    expect(pdfLevelAsked([], person.last(), BLOB)).toBe('edit');
  });

  it("lets a Participant delete and bring back the stored file's marks, and nothing else of it", () => {
    const mark = onState();
    PdfChange.apply(mark.doc, PdfChange.removeFromFile('17', 'mark'));
    expect(pdfLevelAsked([], mark.last(), BLOB)).toBe('participate');
    mark.doc.getMap('removed').delete('17');
    expect(pdfLevelAsked([mark.sent[0]!], mark.last(), BLOB)).toBe('participate');

    const field = onState();
    PdfChange.apply(field.doc, PdfChange.removeFromFile('21', 'field'));
    expect(pdfLevelAsked([], field.last(), BLOB)).toBe('edit');

    // An Editor deleted a field of the file: a Participant neither brings it back nor renames what was deleted.
    const stored = stateOf((doc) => PdfChange.apply(doc, PdfChange.removeFromFile('21', 'field')));
    const back = onState(stored);
    back.doc.getMap('removed').delete('21');
    expect(pdfLevelAsked(stored, back.last(), BLOB)).toBe('edit');
    // Whatever order its properties were set in, an entry that reads the same was not changed.
    const again = onState(stored);
    again.doc.transact(() => {
      PdfChange.apply(again.doc, PdfChange.removeFromFile('17', 'mark'));
      again.doc.getMap('removed').set('21', new Y.Map([['kind', 'field']]));
    });
    expect(pdfLevelAsked(stored, again.last(), BLOB)).toBe('participate');
    const nothing = onState();
    nothing.doc.getMap('removed').set('17', null);
    expect(pdfLevelAsked([], nothing.last(), BLOB)).toBe('edit');
    const listed = onState();
    listed.doc.getMap('removed').set(
      '17',
      new Y.Map<unknown>([
        ['kind', 'mark'],
        ['pages', ['p:4']],
      ]),
    );
    expect(pdfLevelAsked([], listed.last(), BLOB)).toBe('participate');
    const renamed = onState(stored);
    renamed.doc.getMap<Y.Map<unknown>>('removed').get('21')!.set('kind', 'mark');
    expect(pdfLevelAsked(stored, renamed.last(), BLOB)).toBe('edit');
  });

  it('lets a Participant name the stored file once, as the tab names it', () => {
    const first = onState();
    first.doc.transact(() => {
      named(first.doc);
      PdfLiveChanges.addMark(first.doc, highlight('m1'));
    });
    expect(pdfLevelAsked([], first.last(), BLOB)).toBe('participate');
    expect(pdfLevelAsked([], first.last(), OTHER)).toBe('edit');
    expect(pdfLevelAsked([], first.last(), null)).toBe('edit');
  });

  it('lets two people name the stored file at once, and refuses a Participant who changes what it reads', () => {
    const stored = stateOf(named);
    // Someone who had not heard yet names it the same: it reads as it did.
    const same = onState();
    named(same.doc);
    expect(pdfLevelAsked(stored, same.last(), BLOB)).toBe('participate');
    const pages = onState(stored);
    pages.doc.getMap('stored').set('pages', 2);
    expect(pdfLevelAsked(stored, pages.last(), BLOB)).toBe('edit');
    const extra = onState();
    extra.doc.transact(() => {
      named(extra.doc);
      extra.doc.getMap('stored').set('owner', 'me');
    });
    expect(pdfLevelAsked([], extra.last(), BLOB)).toBe('edit');
    const noPages = onState();
    noPages.doc.getMap('stored').set('blob', BLOB);
    expect(pdfLevelAsked([], noPages.last(), BLOB)).toBe('edit');
  });

  it('cannot read an update that stands on changes the room lacks', () => {
    const person = onState();
    PdfLiveChanges.addMark(person.doc, highlight('m1'));
    PdfLiveChanges.addMark(person.doc, highlight('m2'));
    // The second change alone: its items follow the first's, which the room never stored.
    expect(pdfLevelAsked([], person.sent[1]!, BLOB)).toBe('unreadable');
    PdfLiveChanges.removeMark(person.doc, 'm1');
    // A deletion of items the room lacks.
    expect(pdfLevelAsked([], person.sent[2]!, BLOB)).toBe('unreadable');
    expect(pdfLevelAsked([], Uint8Array.of(9, 9, 9), BLOB)).toBe('unreadable');
  });

  it('still reads a Participant’s update when the room itself holds something it cannot place', () => {
    // An Editor's frame after one the room refused: stored, and pending in every reader.
    const editor = onState();
    PdfLiveChanges.addMark(editor.doc, highlight('e1'));
    PdfLiveChanges.addMark(editor.doc, highlight('e2'));
    const stored = [editor.sent[1]!];
    const person = onState(stored);
    PdfLiveChanges.addMark(person.doc, highlight('m1'));
    expect(pdfLevelAsked(stored, person.last(), BLOB)).toBe('participate');
  });
});
