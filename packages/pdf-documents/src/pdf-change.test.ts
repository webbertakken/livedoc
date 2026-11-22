import * as Y from 'yjs';
import { describe, expect, it } from 'vitest';
import { PDF_MAX_MARKS } from './limits';
import { PdfLiveChanges } from './live-changes';
import { Mark } from './mark';
import { PageName } from './page-name';
import { PdfChange, PdfChangeset } from './pdf-change';

const page = PageName.ofObject(3);
const highlight = (id: string) =>
  Mark.highlight({
    id,
    page,
    quads: [[72, 720, 172, 720, 72, 700, 172, 700]],
    text: 'The quick',
    colour: '#fdf1a9',
    opacity: 1,
    author: 'Ada',
    createdAt: Date.UTC(2026, 10, 22),
  })!;
const filled = (value: string | string[], by = 'Ada') => ({
  field: 'applicant.city',
  value,
  by,
  at: Date.UTC(2026, 10, 22),
});
/** The state as plain values, to tell two states are the same. */
const state = (doc: Y.Doc) => ({
  marks: PdfLiveChanges.marks(doc),
  fieldValues: PdfLiveChanges.fieldValues(doc),
  removed: [...PdfLiveChanges.removed(doc)],
  turns: [...PdfLiveChanges.pageTurns(doc)],
});
/** Makes a change and answers what takes it back. */
const made = (doc: Y.Doc, change: PdfChange) => {
  const back = PdfChange.inverse(doc, change);
  expect(PdfChange.apply(doc, change)).toBeNull();
  return back;
};

// live-editing-and-storage.md "A change and what takes it back"
describe('a change', () => {
  it('adds a mark, and is taken back by removing it', () => {
    const doc = PdfLiveChanges.load();
    const back = made(doc, PdfChange.addMark(highlight('m1')));
    expect(PdfLiveChanges.marks(doc)).toEqual([highlight('m1')]);
    made(doc, back!);
    expect(PdfLiveChanges.isEmpty(doc)).toBe(true);
  });

  it('changes only what is given of a mark, and is taken back by what the mark held', () => {
    const doc = PdfLiveChanges.load();
    made(doc, PdfChange.addMark(highlight('m1')));
    const before = state(doc);
    const back = made(doc, PdfChange.changeMark('m1', { colour: '#bfe3ff', opacity: 0.5 }));
    expect(PdfLiveChanges.marks(doc)).toEqual([
      { ...highlight('m1'), colour: '#bfe3ff', opacity: 0.5 },
    ]);
    expect(back).toEqual({
      root: 'marks',
      id: 'm1',
      set: { colour: '#fdf1a9', opacity: 1 },
      unset: [],
    });
    made(doc, back!);
    expect(state(doc)).toEqual(before);
  });

  it('removes a mark, and is taken back by putting back all it held', () => {
    const doc = PdfLiveChanges.load();
    made(doc, PdfChange.addMark(highlight('m1')));
    const back = made(doc, PdfChange.removeMark('m1'));
    expect(PdfLiveChanges.marks(doc)).toEqual([]);
    made(doc, back!);
    expect(PdfLiveChanges.marks(doc)).toEqual([highlight('m1')]);
  });

  it('fills a field, fills it again, and each is taken back to what was there', () => {
    const doc = PdfLiveChanges.load();
    const first = made(doc, PdfChange.fill(filled('Delft')));
    const second = made(doc, PdfChange.fill(filled(['Dutch', 'English'], 'Grace')));
    expect(PdfLiveChanges.fieldValues(doc)).toEqual([filled(['Dutch', 'English'], 'Grace')]);
    made(doc, second!);
    expect(PdfLiveChanges.fieldValues(doc)).toEqual([filled('Delft')]);
    made(doc, first!);
    expect(PdfLiveChanges.fieldValues(doc)).toEqual([]);
  });

  it('gives a field back the stored file’s value, and is taken back by the value filled', () => {
    const doc = PdfLiveChanges.load();
    made(doc, PdfChange.fill(filled('Delft')));
    const back = made(doc, PdfChange.clearField('applicant.city'));
    expect(PdfLiveChanges.fieldValues(doc)).toEqual([]);
    made(doc, back!);
    expect(PdfLiveChanges.fieldValues(doc)).toEqual([filled('Delft')]);
  });

  it('deletes a mark of the stored file by naming it, and restores it by forgetting the name', () => {
    const doc = PdfLiveChanges.load();
    const back = made(doc, PdfChange.removeFromFile('o:13', 'mark'));
    expect([...PdfLiveChanges.removed(doc)]).toEqual([['o:13', 'mark']]);
    expect(back).toEqual(PdfChange.restoreFromFile('o:13'));
    made(doc, back!);
    expect(PdfLiveChanges.removed(doc).size).toBe(0);
  });

  it('turns a page, and is taken back to the turn it had', () => {
    const doc = PdfLiveChanges.load();
    const first = made(doc, PdfChange.turnPage(page, 90));
    const second = made(doc, PdfChange.turnPage(page, 180));
    expect([...PdfLiveChanges.pageTurns(doc)]).toEqual([[page, 180]]);
    made(doc, second!);
    expect([...PdfLiveChanges.pageTurns(doc)]).toEqual([[page, 90]]);
    made(doc, first!);
    expect(PdfLiveChanges.pageTurns(doc).size).toBe(0);
  });

  it('has nothing to take back where it changes nothing', () => {
    const doc = PdfLiveChanges.load();
    expect(PdfChange.inverse(doc, PdfChange.removeMark('absent'))).toBeNull();
    expect(PdfChange.inverse(doc, PdfChange.changeMark('absent', { opacity: 0.5 }))).toBeNull();
    expect(PdfChange.apply(doc, PdfChange.removeMark('absent'))).toBeNull();
    expect(PdfLiveChanges.isEmpty(doc)).toBe(true);
  });

  it('takes a set back by unsetting what the entry did not hold', () => {
    const doc = PdfLiveChanges.load();
    made(doc, PdfChange.turnPage(page, 90));
    const change: PdfChange = {
      root: 'pages',
      id: page,
      set: { label: 'iv' },
      unset: ['rotation'],
    };
    const back = made(doc, change);
    expect(back).toEqual({ root: 'pages', id: page, set: { rotation: 90 }, unset: ['label'] });
    expect(PdfLiveChanges.pageTurns(doc).size).toBe(0);
    made(doc, back!);
    expect([...PdfLiveChanges.pageTurns(doc)]).toEqual([[page, 90]]);
  });

  it('is refused whole where it sets properties of an entry that is not there', () => {
    const doc = PdfLiveChanges.load();
    expect(PdfChange.apply(doc, PdfChange.changeMark('absent', { opacity: 0.5 }))).toBe(
      'pdf_change_target_missing',
    );
    expect(PdfLiveChanges.isEmpty(doc)).toBe(true);
  });

  it('is made under the origin given, so one person’s undo tells it from another’s', () => {
    const doc = PdfLiveChanges.load();
    const origins: unknown[] = [];
    doc.on('afterTransaction', (transaction) => origins.push(transaction.origin));
    PdfChange.apply(doc, PdfChange.addMark(highlight('m1')), 'ada');
    expect(origins).toEqual(['ada']);
  });

  it('merges with another person’s change to the same mark, property by property', () => {
    const ada = PdfLiveChanges.load();
    made(ada, PdfChange.addMark(highlight('m1')));
    const grace = PdfLiveChanges.load([PdfLiveChanges.encode(ada)]);
    made(ada, PdfChange.changeMark('m1', { colour: '#bfe3ff' }));
    made(grace, PdfChange.changeMark('m1', { opacity: 0.5 }));
    Y.applyUpdate(ada, PdfLiveChanges.encode(grace));
    Y.applyUpdate(grace, PdfLiveChanges.encode(ada));
    expect(PdfLiveChanges.marks(ada)).toEqual([
      { ...highlight('m1'), colour: '#bfe3ff', opacity: 0.5 },
    ]);
    expect(PdfLiveChanges.marks(grace)).toEqual(PdfLiveChanges.marks(ada));
  });
});

describe('a changeset', () => {
  it('makes several changes as one step, and is taken back by one', () => {
    const doc = PdfLiveChanges.load();
    let steps = 0;
    doc.on('afterTransaction', () => (steps += 1));
    const result = PdfChangeset.apply(doc, [
      PdfChange.addMark(highlight('m1')),
      PdfChange.changeMark('m1', { opacity: 0.5 }),
      PdfChange.fill(filled('Delft')),
      PdfChange.removeFromFile('o:13', 'mark'),
      PdfChange.removeMark('absent'),
    ]);
    if (!result.ok) throw new Error(result.refusal);
    expect(steps).toBe(1);
    expect(state(doc)).toEqual({
      marks: [{ ...highlight('m1'), opacity: 0.5 }],
      fieldValues: [filled('Delft')],
      removed: [['o:13', 'mark']],
      turns: [],
    });
    // A change that changed nothing has nothing to take back.
    expect(result.back).toHaveLength(4);
    const reverted = PdfChangeset.apply(doc, result.back);
    expect(reverted.ok).toBe(true);
    expect(steps).toBe(2);
    expect(PdfLiveChanges.isEmpty(doc)).toBe(true);
  });

  it('is made again by taking back what took it back', () => {
    const doc = PdfLiveChanges.load();
    const first = PdfChangeset.apply(doc, [
      PdfChange.addMark(highlight('m1')),
      PdfChange.fill(filled('Delft')),
    ]);
    if (!first.ok) throw new Error(first.refusal);
    const after = state(doc);
    const reverted = PdfChangeset.apply(doc, first.back);
    if (!reverted.ok) throw new Error(reverted.refusal);
    expect(PdfChangeset.apply(doc, reverted.back).ok).toBe(true);
    expect(state(doc)).toEqual(after);
  });

  it('writes nothing where one change is refused, and says which', () => {
    const doc = PdfLiveChanges.load();
    PdfChange.apply(doc, PdfChange.fill(filled('Delft')));
    const before = state(doc);
    const result = PdfChangeset.apply(doc, [
      PdfChange.addMark(highlight('m1')),
      PdfChange.fill(filled('Leiden')),
      PdfChange.changeMark('absent', { opacity: 0.5 }),
      PdfChange.addMark(highlight('m2')),
    ]);
    expect(result).toEqual({ ok: false, refusal: 'pdf_change_target_missing', at: 2 });
    expect(state(doc)).toEqual(before);
  });

  it('refuses a mark past the most a PDF document holds, and replaces one already there at the limit', () => {
    const doc = PdfLiveChanges.load();
    const marks = doc.getMap('marks');
    doc.transact(() => {
      for (let n = 0; n < PDF_MAX_MARKS; n += 1) marks.set(`filler-${n}`, new Y.Map());
    });
    expect(PdfChange.apply(doc, PdfChange.addMark(highlight('one-more')))).toBe(
      'pdf_too_many_marks',
    );
    expect(PdfChangeset.apply(doc, [PdfChange.addMark(highlight('one-more'))])).toEqual({
      ok: false,
      refusal: 'pdf_too_many_marks',
      at: 0,
    });
    expect(PdfChange.apply(doc, PdfChange.addMark(highlight('filler-0')))).toBeNull();
  });
});

describe('what the live changes hold', () => {
  it('leaves out a field value, a deletion or a turn that is not one', () => {
    const doc = PdfLiveChanges.load();
    PdfChangeset.apply(doc, [
      { root: 'fieldValues', id: 'broken', put: { field: 'broken', value: 7 } },
      { root: 'removed', id: 'o:1', put: { kind: 'page' } },
      { root: 'pages', id: 'p:3', put: { rotation: 45 } },
      { root: 'pages', id: 'not a page', put: { rotation: 90 } },
    ]);
    expect(PdfLiveChanges.fieldValues(doc)).toEqual([]);
    expect(PdfLiveChanges.removed(doc).size).toBe(0);
    expect(PdfLiveChanges.pageTurns(doc).size).toBe(0);
  });

  it('lists field values by field name', () => {
    const doc = PdfLiveChanges.load();
    for (const field of ['b', 'c', 'a', 'b'])
      PdfChange.apply(doc, PdfChange.fill({ ...filled('x'), field }));
    expect(PdfLiveChanges.fieldValues(doc).map((value) => value.field)).toEqual(['a', 'b', 'c']);
  });
});
