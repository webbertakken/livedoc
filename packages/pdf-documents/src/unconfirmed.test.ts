import * as Y from 'yjs';
import { describe, expect, it } from 'vitest';
import { PDF_MAX_MARKS } from './limits';
import { PdfLiveChanges } from './live-changes';
import { Mark } from './mark';
import { PageName } from './page-name';
import { PdfChange } from './pdf-change';
import { PdfUnconfirmed, type PdfAnchors, type UnconfirmedChange } from './unconfirmed';

// docs/specs/035-pdf-documents/live-editing-and-storage.md "A change carried across a replacement".

const at = Date.UTC(2026, 10, 22);
const page = PageName.ofObject(3);
const highlight = (id: string, on: PageName = page) =>
  Mark.highlight({
    id,
    page: on,
    quads: [[72, 720, 172, 720, 72, 700, 172, 700]],
    text: 'The quick',
    colour: '#fdf1a9',
    opacity: 1,
    author: 'Ada',
    createdAt: at,
  })!;
const filled = (value: string) => ({ field: 'applicant.city', value, by: 'Ada', at });
const made = (doc: Y.Doc, ...changes: PdfChange[]) => {
  for (const change of changes) expect(PdfChange.apply(doc, change)).toBeNull();
};

/** What the room holds, and this browser's document on it with `here` made and not yet confirmed. */
function unconfirmed(held: readonly PdfChange[], here: readonly PdfChange[]): UnconfirmedChange[] {
  const room = PdfLiveChanges.load();
  made(room, ...held);
  const live = PdfLiveChanges.load([PdfLiveChanges.encode(room)]);
  made(live, ...here);
  return PdfUnconfirmed.read(room, live);
}

const anchors = (given: { pages?: PageName[]; fileMarks?: string[] } = {}): PdfAnchors => ({
  pages: new Set(given.pages ?? [page]),
  fileMarks: new Set(given.fileMarks ?? []),
});

/** The new state, as the room makes it after a replacement: nothing but the stored file's name. */
const replaced = () => PdfLiveChanges.load();

const shown = (doc: Y.Doc) => ({
  marks: PdfLiveChanges.marks(doc),
  fieldValues: PdfLiveChanges.fieldValues(doc),
  removed: [...PdfLiveChanges.removed(doc)],
  turns: [...PdfLiveChanges.pageTurns(doc)],
});
const NOTHING = { marks: [], fieldValues: [], removed: [], turns: [] };

describe('reading the unconfirmed changes', () => {
  it('finds none where this browser holds what the room holds', () => {
    expect(unconfirmed([PdfChange.addMark(highlight('m'))], [])).toEqual([]);
  });

  it('reads an entry made, changed and removed here, each with what the room held', () => {
    const read = unconfirmed(
      [PdfChange.addMark(highlight('kept')), PdfChange.addMark(highlight('gone'))],
      [
        PdfChange.addMark(highlight('new')),
        PdfChange.changeMark('kept', { colour: '#bfe3ff' }),
        PdfChange.removeMark('gone'),
      ],
    );
    expect(read).toEqual([
      { root: 'marks', id: 'gone', held: highlight('gone'), made: null },
      {
        root: 'marks',
        id: 'kept',
        held: highlight('kept'),
        made: { ...highlight('kept'), colour: '#bfe3ff' },
      },
      { root: 'marks', id: 'new', held: null, made: highlight('new') },
    ]);
  });

  it('reads every root a change reaches, in the layout’s order', () => {
    const read = unconfirmed(
      [],
      [
        PdfChange.removeFromFile('o:41', 'mark'),
        PdfChange.turnPage(page, 90),
        PdfChange.fill(filled('Arlington')),
        PdfChange.addMark(highlight('m')),
      ],
    );
    expect(read.map((change) => [change.root, change.id])).toEqual([
      ['marks', 'm'],
      ['fieldValues', 'applicant.city'],
      ['pages', page],
      ['removed', 'o:41'],
    ]);
  });

  it('never reads another person’s change the room relayed as this browser’s', () => {
    const room = PdfLiveChanges.load();
    const live = PdfLiveChanges.load();
    const grace = PdfLiveChanges.load();
    made(grace, PdfChange.addMark(highlight('hers')));
    const relayed = PdfLiveChanges.encode(grace);
    Y.applyUpdate(room, relayed);
    Y.applyUpdate(live, relayed);
    made(live, PdfChange.addMark(highlight('mine')));
    expect(PdfUnconfirmed.read(room, live).map((change) => change.id)).toEqual(['mine']);
  });

  it('reads an entry that is no map as nothing', () => {
    const room = PdfLiveChanges.load();
    const live = PdfLiveChanges.load();
    live.getMap('marks').set('odd', 5);
    expect(PdfUnconfirmed.read(room, live)).toEqual([]);
  });

  it('keeps of a copy’s own reading only what is an unconfirmed change', () => {
    const good = unconfirmed([], [PdfChange.addMark(highlight('m'))]);
    expect(PdfUnconfirmed.parse(structuredClone(good))).toEqual(good);
    expect(PdfUnconfirmed.parse(undefined)).toEqual([]);
    expect(PdfUnconfirmed.parse('marks')).toEqual([]);
    expect(
      PdfUnconfirmed.parse([
        null,
        { root: 'stored', id: 'blob', held: null, made: {} },
        { root: 'marks', id: 7, held: null, made: {} },
        { root: 'marks', id: 'm', held: null, made: null },
        { root: 'marks', id: 'm', held: [], made: null },
        { root: 'marks', id: 'm', held: null, made: 'yellow' },
        { root: 'removed', id: 'o:41', held: { kind: 'mark' }, made: null },
      ]),
    ).toEqual([{ root: 'removed', id: 'o:41', held: { kind: 'mark' }, made: null }]);
  });
});

describe('carrying the unconfirmed changes onto a new stored file', () => {
  it('makes a mark made here again, on its page', () => {
    const doc = replaced();
    const changes = unconfirmed([], [PdfChange.addMark(highlight('m'))]);
    expect(PdfUnconfirmed.carry(doc, changes, anchors())).toEqual({
      carried: 1,
      already: 0,
      lost: [],
    });
    expect(PdfLiveChanges.marks(doc)).toEqual([highlight('m')]);
  });

  it('makes them as one step, under the origin given', () => {
    const doc = replaced();
    const origins: unknown[] = [];
    doc.on('afterTransaction', (transaction) => origins.push(transaction.origin));
    const changes = unconfirmed(
      [],
      [PdfChange.addMark(highlight('a')), PdfChange.addMark(highlight('b'))],
    );
    PdfUnconfirmed.carry(doc, changes, anchors(), 'carried');
    expect(origins).toEqual(['carried']);
    expect(PdfLiveChanges.marks(doc)).toHaveLength(2);
  });

  it('passes over a mark the new file already holds under its id, or the new state does', () => {
    const changes = unconfirmed([], [PdfChange.addMark(highlight('m'))]);
    const inFile = replaced();
    expect(PdfUnconfirmed.carry(inFile, changes, anchors({ fileMarks: ['m'] }))).toEqual({
      carried: 0,
      already: 1,
      lost: [],
    });
    expect(shown(inFile)).toEqual(NOTHING);
    const inState = replaced();
    made(inState, PdfChange.addMark({ ...highlight('m'), colour: '#bfe3ff' }));
    expect(PdfUnconfirmed.carry(inState, changes, anchors()).already).toBe(1);
    expect(PdfLiveChanges.marks(inState)[0]!.colour).toBe('#bfe3ff');
  });

  it('loses a mark whose page the new file does not have, and says which', () => {
    const doc = replaced();
    const changes = unconfirmed([], [PdfChange.addMark(highlight('m', PageName.ofObject(9)))]);
    expect(PdfUnconfirmed.carry(doc, changes, anchors())).toEqual({
      carried: 0,
      already: 0,
      lost: changes,
    });
    expect(shown(doc)).toEqual(NOTHING);
  });

  it('loses a mark past the most a PDF document holds', () => {
    const doc = replaced();
    const marks = doc.getMap('marks');
    doc.transact(() => {
      for (let n = 0; n < PDF_MAX_MARKS; n += 1) marks.set(`m${n}`, new Y.Map());
    });
    const changes = unconfirmed([], [PdfChange.addMark(highlight('one-more'))]);
    expect(PdfUnconfirmed.carry(doc, changes, anchors()).lost).toEqual(changes);
  });

  it('changes only the properties changed here of a mark the new state holds', () => {
    const doc = replaced();
    made(doc, PdfChange.addMark({ ...highlight('m'), opacity: 0.5 }));
    const changes = unconfirmed(
      [PdfChange.addMark(highlight('m'))],
      [PdfChange.changeMark('m', { colour: '#bfe3ff' })],
    );
    expect(PdfUnconfirmed.carry(doc, changes, anchors()).carried).toBe(1);
    expect(PdfLiveChanges.marks(doc)).toEqual([
      { ...highlight('m'), colour: '#bfe3ff', opacity: 0.5 },
    ]);
  });

  it('unsets a property unset here', () => {
    const doc = replaced();
    made(doc, { root: 'pages', id: page, put: { rotation: 90, label: 'iv' } });
    const changes = unconfirmed(
      [{ root: 'pages', id: page, put: { rotation: 90, label: 'iv' } }],
      [{ root: 'pages', id: page, set: { rotation: 180 }, unset: ['label'] }],
    );
    expect(PdfUnconfirmed.carry(doc, changes, anchors()).carried).toBe(1);
    expect(doc.getMap<Y.Map<unknown>>('pages').get(page)!.toJSON()).toEqual({ rotation: 180 });
  });

  it('loses a change to a mark that is now the file’s own, and does nothing for one that is gone', () => {
    const changes = unconfirmed(
      [PdfChange.addMark(highlight('m'))],
      [PdfChange.changeMark('m', { colour: '#bfe3ff' })],
    );
    const baked = replaced();
    expect(PdfUnconfirmed.carry(baked, changes, anchors({ fileMarks: ['m'] })).lost).toEqual(
      changes,
    );
    const gone = replaced();
    expect(PdfUnconfirmed.carry(gone, changes, anchors())).toEqual({
      carried: 0,
      already: 0,
      lost: [],
    });
    expect(shown(baked)).toEqual(NOTHING);
    expect(shown(gone)).toEqual(NOTHING);
  });

  it('removes a mark removed here: from the state, or from the file where it is now the file’s own', () => {
    const changes = unconfirmed([PdfChange.addMark(highlight('m'))], [PdfChange.removeMark('m')]);
    const live = replaced();
    made(live, PdfChange.addMark(highlight('m')));
    expect(PdfUnconfirmed.carry(live, changes, anchors()).carried).toBe(1);
    expect(shown(live)).toEqual(NOTHING);
    const baked = replaced();
    expect(PdfUnconfirmed.carry(baked, changes, anchors({ fileMarks: ['m'] })).carried).toBe(1);
    expect([...PdfLiveChanges.removed(baked)]).toEqual([['m', 'mark']]);
    const gone = replaced();
    expect(PdfUnconfirmed.carry(gone, changes, anchors())).toEqual({
      carried: 0,
      already: 0,
      lost: [],
    });
  });

  it('fills a field filled here, by its name, over whatever the new state holds', () => {
    const changes = unconfirmed([], [PdfChange.fill(filled('Arlington'))]);
    const doc = replaced();
    made(doc, PdfChange.fill({ ...filled('London'), by: 'Grace' }));
    expect(PdfUnconfirmed.carry(doc, changes, anchors()).carried).toBe(1);
    expect(PdfLiveChanges.fieldValues(doc)).toEqual([filled('Arlington')]);
  });

  it('clears a field cleared here where the new state holds a value, and loses it where the file does', () => {
    const changes = unconfirmed(
      [PdfChange.fill(filled('Arlington'))],
      [PdfChange.clearField('applicant.city')],
    );
    const live = replaced();
    made(live, PdfChange.fill(filled('Arlington')));
    expect(PdfUnconfirmed.carry(live, changes, anchors()).carried).toBe(1);
    expect(shown(live)).toEqual(NOTHING);
    expect(PdfUnconfirmed.carry(replaced(), changes, anchors()).lost).toEqual(changes);
  });

  it('turns a page turned here, and loses the turn of a page the new file does not have', () => {
    const changes = unconfirmed([], [PdfChange.turnPage(page, 90)]);
    const doc = replaced();
    expect(PdfUnconfirmed.carry(doc, changes, anchors()).carried).toBe(1);
    expect([...PdfLiveChanges.pageTurns(doc)]).toEqual([[page, 90]]);
    const other = replaced();
    expect(
      PdfUnconfirmed.carry(other, changes, anchors({ pages: [PageName.ofObject(9)] })).lost,
    ).toEqual(changes);
  });

  it('loses a turn taken back here once the turn is in the file', () => {
    const changes = unconfirmed(
      [PdfChange.turnPage(page, 90)],
      [{ root: 'pages', id: page, remove: true }],
    );
    const live = replaced();
    made(live, PdfChange.turnPage(page, 90));
    expect(PdfUnconfirmed.carry(live, changes, anchors()).carried).toBe(1);
    expect(shown(live)).toEqual(NOTHING);
    expect(PdfUnconfirmed.carry(replaced(), changes, anchors()).lost).toEqual(changes);
  });

  it('deletes what was deleted here of the stored file, by its id', () => {
    const changes = unconfirmed([], [PdfChange.removeFromFile('o:41', 'mark')]);
    const doc = replaced();
    expect(PdfUnconfirmed.carry(doc, changes, anchors()).carried).toBe(1);
    expect([...PdfLiveChanges.removed(doc)]).toEqual([['o:41', 'mark']]);
  });

  it('takes a deletion back where the new state holds it, and loses that once the file does', () => {
    const changes = unconfirmed(
      [PdfChange.removeFromFile('o:41', 'mark')],
      [PdfChange.restoreFromFile('o:41')],
    );
    const live = replaced();
    made(live, PdfChange.removeFromFile('o:41', 'mark'));
    expect(PdfUnconfirmed.carry(live, changes, anchors()).carried).toBe(1);
    expect(shown(live)).toEqual(NOTHING);
    expect(PdfUnconfirmed.carry(replaced(), changes, anchors()).lost).toEqual(changes);
  });

  it('writes nothing where there is nothing to carry', () => {
    const doc = replaced();
    let transactions = 0;
    doc.on('afterTransaction', () => (transactions += 1));
    expect(PdfUnconfirmed.carry(doc, [], anchors())).toEqual({ carried: 0, already: 0, lost: [] });
    expect(transactions).toBe(0);
  });
});
