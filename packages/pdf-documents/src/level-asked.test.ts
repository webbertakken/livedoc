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
const KEY = 'k-ada';
const ANOTHER = 'k-bob';
const highlight = (id: string, key: string | null = KEY) =>
  Mark.highlight({
    ...Mark.keyed(key),
    id,
    page: 'p:4',
    quads: [QUAD],
    text: 'words',
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
    expect(pdfLevelAsked([], person.last(), BLOB, KEY)).toBe('participate');
    PdfChange.apply(
      person.doc,
      PdfChange.fill({ field: 'name', value: 'Ada', by: 'Ada', at: 1_795_000_000_000 }),
    );
    expect(pdfLevelAsked([person.sent[0]!], person.last(), BLOB, KEY)).toBe('participate');
    person.doc.getMap('threads').set('m1', new Y.Map());
    expect(pdfLevelAsked(person.sent.slice(0, 2), person.last(), BLOB, KEY)).toBe('participate');
    person.doc.getMap('recognised').set('p:4', new Y.Map());
    expect(pdfLevelAsked(person.sent.slice(0, 3), person.last(), BLOB, KEY)).toBe('participate');
  });

  it('asks a Participant for a change inside a mark and for a mark removed', () => {
    const stored = stateOf((doc) => PdfLiveChanges.addMark(doc, highlight('m1')));
    const person = onState(stored);
    PdfChange.apply(person.doc, PdfChange.changeMark('m1', { colour: '#aaccff' }));
    expect(pdfLevelAsked(stored, person.last(), BLOB, KEY)).toBe('participate');
    PdfLiveChanges.removeMark(person.doc, 'm1');
    expect(pdfLevelAsked([...stored, person.sent[0]!], person.last(), BLOB, KEY)).toBe(
      'participate',
    );
  });

  it.each(['pageOrder', 'pages', 'objects', 'fields', 'document'] as const)(
    'asks an Editor for a change to %s',
    (root) => {
      const person = onState();
      if (root === 'pageOrder') person.doc.getArray(root).push(['p:4']);
      else person.doc.getMap(root).set('p:4', new Y.Map([['rotation', 90]]));
      expect(pdfLevelAsked([], person.last(), BLOB, KEY)).toBe('edit');
    },
  );

  it('asks an Editor for a change deep inside an Editing root, and for a deletion in one', () => {
    const stored = stateOf((doc) => PdfChange.apply(doc, PdfChange.turnPage('p:4', 90)));
    const deep = onState(stored);
    deep.doc.getMap<Y.Map<unknown>>('pages').get('p:4')!.set('rotation', 180);
    expect(pdfLevelAsked(stored, deep.last(), BLOB, KEY)).toBe('edit');
    const gone = onState(stored);
    gone.doc.getMap('pages').delete('p:4');
    expect(pdfLevelAsked(stored, gone.last(), BLOB, KEY)).toBe('edit');
  });

  it('asks an Editor for one update that changes a mark and a page together', () => {
    const person = onState();
    person.doc.transact(() => {
      PdfLiveChanges.addMark(person.doc, highlight('m1'));
      PdfChange.apply(person.doc, PdfChange.turnPage('p:4', 90));
    });
    expect(pdfLevelAsked([], person.last(), BLOB, KEY)).toBe('edit');
  });

  it('asks an Editor for a root the layout does not name', () => {
    const person = onState();
    person.doc.getMap('anything').set('x', 1);
    expect(pdfLevelAsked([], person.last(), BLOB, KEY)).toBe('edit');
  });

  it("refuses a Participant who changes, deletes or brings back the stored file's marks, as nobody's own", () => {
    const mark = onState();
    PdfChange.apply(mark.doc, PdfChange.removeFromFile('17', 'mark'));
    expect(pdfLevelAsked([], mark.last(), BLOB, KEY)).toBe('not_your_mark');
    // Changed: the file's mark taken as LiveDoc's, under its id, carrying the Participant's key still is not theirs.
    const adopted = onState();
    adopted.doc.transact(() => {
      PdfChange.apply(adopted.doc, PdfChange.removeFromFile('17', 'mark'));
      PdfLiveChanges.addMark(adopted.doc, highlight('17'));
    });
    expect(pdfLevelAsked([], adopted.last(), BLOB, KEY)).toBe('not_your_mark');
    const stored = stateOf((doc) => PdfChange.apply(doc, PdfChange.removeFromFile('17', 'mark')));
    const back = onState(stored);
    back.doc.getMap('removed').delete('17');
    expect(pdfLevelAsked(stored, back.last(), BLOB, KEY)).toBe('not_your_mark');
    const listed = onState();
    listed.doc.getMap('removed').set(
      '17',
      new Y.Map<unknown>([
        ['kind', 'mark'],
        ['pages', ['p:4']],
      ]),
    );
    expect(pdfLevelAsked([], listed.last(), BLOB, KEY)).toBe('not_your_mark');
  });

  it('asks an Editor for anything else of the stored file deleted or brought back', () => {
    const field = onState();
    PdfChange.apply(field.doc, PdfChange.removeFromFile('21', 'field'));
    expect(pdfLevelAsked([], field.last(), BLOB, KEY)).toBe('edit');

    // An Editor deleted a field of the file: a Participant neither brings it back nor renames what was deleted.
    const stored = stateOf((doc) => PdfChange.apply(doc, PdfChange.removeFromFile('21', 'field')));
    const back = onState(stored);
    back.doc.getMap('removed').delete('21');
    expect(pdfLevelAsked(stored, back.last(), BLOB, KEY)).toBe('edit');
    // Whatever order its properties were set in, an entry that reads the same was not changed.
    const again = onState(stored);
    again.doc.transact(() => {
      PdfLiveChanges.addMark(again.doc, highlight('m1'));
      again.doc.getMap('removed').set('21', new Y.Map([['kind', 'field']]));
    });
    expect(pdfLevelAsked(stored, again.last(), BLOB, KEY)).toBe('participate');
    const nothing = onState();
    nothing.doc.getMap('removed').set('17', null);
    expect(pdfLevelAsked([], nothing.last(), BLOB, KEY)).toBe('edit');
    const renamed = onState(stored);
    renamed.doc.getMap<Y.Map<unknown>>('removed').get('21')!.set('kind', 'mark');
    expect(pdfLevelAsked(stored, renamed.last(), BLOB, KEY)).toBe('edit');
  });

  it('lets a Participant add, change and delete only marks carrying their key', () => {
    const added = onState();
    PdfLiveChanges.addMark(added.doc, highlight('m1', ANOTHER));
    expect(pdfLevelAsked([], added.last(), BLOB, KEY)).toBe('not_your_mark');
    const keyless = onState();
    PdfLiveChanges.addMark(keyless.doc, highlight('m1', null));
    expect(pdfLevelAsked([], keyless.last(), BLOB, KEY)).toBe('not_your_mark');

    const stored = stateOf((doc) => {
      PdfLiveChanges.addMark(doc, highlight('theirs', ANOTHER));
      PdfLiveChanges.addMark(doc, highlight('before', null));
      PdfLiveChanges.addMark(doc, highlight('mine'));
    });
    for (const id of ['theirs', 'before']) {
      const changed = onState(stored);
      PdfChange.apply(changed.doc, PdfChange.changeMark(id, { colour: '#aaccff' }));
      expect(pdfLevelAsked(stored, changed.last(), BLOB, KEY)).toBe('not_your_mark');
      const deleted = onState(stored);
      PdfLiveChanges.removeMark(deleted.doc, id);
      expect(pdfLevelAsked(stored, deleted.last(), BLOB, KEY)).toBe('not_your_mark');
      // Claimed: the key put on a mark that did not carry it.
      const claimed = onState(stored);
      claimed.doc.getMap<Y.Map<unknown>>('marks').get(id)!.set('authorKey', KEY);
      expect(pdfLevelAsked(stored, claimed.last(), BLOB, KEY)).toBe('not_your_mark');
    }
    const given = onState(stored);
    given.doc.getMap<Y.Map<unknown>>('marks').get('mine')!.set('authorKey', ANOTHER);
    expect(pdfLevelAsked(stored, given.last(), BLOB, KEY)).toBe('not_your_mark');
    // The owner of a mark changes it; a session with no key owns nothing.
    const owner = onState(stored);
    PdfChange.apply(owner.doc, PdfChange.changeMark('theirs', { colour: '#aaccff' }));
    expect(pdfLevelAsked(stored, owner.last(), BLOB, ANOTHER)).toBe('participate');
    const nobody = onState();
    PdfLiveChanges.addMark(nobody.doc, highlight('m1', null));
    expect(pdfLevelAsked([], nobody.last(), BLOB, null)).toBe('not_your_mark');
  });

  it('asks an Editor before a mark of another', () => {
    const person = onState();
    person.doc.transact(() => {
      PdfLiveChanges.addMark(person.doc, highlight('m1', ANOTHER));
      PdfChange.apply(person.doc, PdfChange.turnPage('p:4', 90));
    });
    expect(pdfLevelAsked([], person.last(), BLOB, KEY)).toBe('edit');
  });

  it('lets a Participant name the stored file once, as the tab names it', () => {
    const first = onState();
    first.doc.transact(() => {
      named(first.doc);
      PdfLiveChanges.addMark(first.doc, highlight('m1'));
    });
    expect(pdfLevelAsked([], first.last(), BLOB, KEY)).toBe('participate');
    expect(pdfLevelAsked([], first.last(), OTHER, KEY)).toBe('edit');
    expect(pdfLevelAsked([], first.last(), null, KEY)).toBe('edit');
  });

  it('lets two people name the stored file at once, and refuses a Participant who changes what it reads', () => {
    const stored = stateOf(named);
    // Someone who had not heard yet names it the same: it reads as it did.
    const same = onState();
    named(same.doc);
    expect(pdfLevelAsked(stored, same.last(), BLOB, KEY)).toBe('participate');
    const pages = onState(stored);
    pages.doc.getMap('stored').set('pages', 2);
    expect(pdfLevelAsked(stored, pages.last(), BLOB, KEY)).toBe('edit');
    const extra = onState();
    extra.doc.transact(() => {
      named(extra.doc);
      extra.doc.getMap('stored').set('owner', 'me');
    });
    expect(pdfLevelAsked([], extra.last(), BLOB, KEY)).toBe('edit');
    const noPages = onState();
    noPages.doc.getMap('stored').set('blob', BLOB);
    expect(pdfLevelAsked([], noPages.last(), BLOB, KEY)).toBe('edit');
  });

  it('cannot read an update that stands on changes the room lacks', () => {
    const person = onState();
    PdfLiveChanges.addMark(person.doc, highlight('m1'));
    PdfLiveChanges.addMark(person.doc, highlight('m2'));
    // The second change alone: its items follow the first's, which the room never stored.
    expect(pdfLevelAsked([], person.sent[1]!, BLOB, KEY)).toBe('unreadable');
    PdfLiveChanges.removeMark(person.doc, 'm1');
    // A deletion of items the room lacks.
    expect(pdfLevelAsked([], person.sent[2]!, BLOB, KEY)).toBe('unreadable');
    expect(pdfLevelAsked([], Uint8Array.of(9, 9, 9), BLOB, KEY)).toBe('unreadable');
  });

  it('still reads a Participant’s update when the room itself holds something it cannot place', () => {
    // An Editor's frame after one the room refused: stored, and pending in every reader.
    const editor = onState();
    PdfLiveChanges.addMark(editor.doc, highlight('e1'));
    PdfLiveChanges.addMark(editor.doc, highlight('e2'));
    const stored = [editor.sent[1]!];
    const person = onState(stored);
    PdfLiveChanges.addMark(person.doc, highlight('m1'));
    expect(pdfLevelAsked(stored, person.last(), BLOB, KEY)).toBe('participate');
  });
});
