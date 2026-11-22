import { describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import type { BlobKey } from '@livedoc/document';
import { Mark, PageName, PdfChange, PdfLiveChanges } from '@livedoc/pdf-documents';
import { PDF_CARRY_ORIGIN } from './pdf-carry';
import { PDF_LOCAL_ORIGIN, pdfUndo, type PdfUndoPlace } from './pdf-undo';

// docs/specs/035-pdf-documents/live-editing-and-storage.md "Undo".

const BLOB = 'a'.repeat(64) as BlobKey;
const page = PageName.ofObject(3);
const other = PageName.ofObject(9);
const highlight = (id: string, on: PageName = page) =>
  Mark.highlight({
    id,
    page: on,
    quads: [[72, 720, 172, 720, 72, 700, 172, 700]],
    text: 'The quick',
    colour: '#fdf1a9',
    opacity: 1,
    author: 'Ada',
    createdAt: 1_795_000_000_000,
  })!;
const ids = (doc: Y.Doc) => PdfLiveChanges.marks(doc).map((mark) => mark.id);
const add = (doc: Y.Doc, id: string, on: PageName = page) =>
  PdfChange.apply(doc, PdfChange.addMark(highlight(id, on)), PDF_LOCAL_ORIGIN);

/** A person's document and their undo, with a mark made as one step each. */
function person() {
  const doc = PdfLiveChanges.load();
  const undo = pdfUndo(doc);
  const mark = (id: string, on: PageName = page) => undo.step({ page: on }, () => add(doc, id, on));
  return { doc, undo, mark };
}

describe('pdfUndo', () => {
  it('takes back the person’s own changes, newest first, and makes them again', () => {
    const { doc, undo, mark } = person();
    mark('a');
    mark('b');
    undo.undo();
    expect(ids(doc)).toEqual(['a']);
    undo.undo();
    expect(ids(doc)).toEqual([]);
    undo.redo();
    undo.redo();
    expect(PdfLiveChanges.marks(doc)).toEqual([highlight('a'), highlight('b')]);
  });

  it('makes one act one step, however quickly the next follows', () => {
    const { doc, undo, mark } = person();
    mark('a');
    mark('b');
    undo.undo();
    expect(ids(doc)).toEqual(['a']);
  });

  it('makes what is changed within the group’s time one step, and what follows it another', async () => {
    // Yjs reads the clock it took as its module loaded, which no fake clock moves: a short group, and a real wait.
    const doc = PdfLiveChanges.load();
    const undo = pdfUndo(doc, 20);
    add(doc, 'a');
    add(doc, 'b');
    await new Promise((resolve) => setTimeout(resolve, 40));
    add(doc, 'c');
    undo.undo();
    expect(ids(doc)).toEqual(['a', 'b']);
    undo.undo();
    expect(ids(doc)).toEqual([]);
  });

  it('never takes back another person’s change', () => {
    const { doc, undo, mark } = person();
    mark('mine');
    const grace = PdfLiveChanges.load();
    PdfChange.apply(grace, PdfChange.addMark(highlight('hers')));
    Y.applyUpdate(doc, PdfLiveChanges.encode(grace), 'room');
    undo.undo();
    undo.undo();
    expect(ids(doc)).toEqual(['hers']);
  });

  it('passes over a step whose mark another person removed, and takes back the one before it', () => {
    const { doc, undo, mark } = person();
    mark('first');
    mark('second');
    const grace = PdfLiveChanges.load([PdfLiveChanges.encode(doc)]);
    PdfChange.apply(grace, PdfChange.removeMark('second'));
    Y.applyUpdate(doc, PdfLiveChanges.encode(grace), 'room');
    undo.undo();
    expect(ids(doc)).toEqual([]);
    expect(undo.get().canUndo).toBe(false);
  });

  it('never writes over a value another person has given since', () => {
    const { doc, undo } = person();
    const filled = (value: string, by: string) => ({ field: 'city', value, by, at: 1 });
    undo.step({ page }, () =>
      PdfChange.apply(doc, PdfChange.fill(filled('London', 'Ada')), PDF_LOCAL_ORIGIN),
    );
    const grace = PdfLiveChanges.load([PdfLiveChanges.encode(doc)]);
    PdfChange.apply(grace, PdfChange.fill(filled('Arlington', 'Grace')));
    Y.applyUpdate(doc, PdfLiveChanges.encode(grace), 'room');
    undo.undo();
    expect(PdfLiveChanges.fieldValues(doc)).toEqual([filled('Arlington', 'Grace')]);
  });

  it('leaves the stored file named when the first change is taken back', () => {
    const { doc, undo } = person();
    undo.step({ page }, () =>
      doc.transact(() => {
        PdfLiveChanges.setStored(doc, { blob: BLOB, pages: 2 });
        add(doc, 'a');
      }, PDF_LOCAL_ORIGIN),
    );
    undo.undo();
    expect(ids(doc)).toEqual([]);
    expect(PdfLiveChanges.stored(doc)).toEqual({ blob: BLOB, pages: 2 });
  });

  it('makes a carried change no step', () => {
    const { doc, undo } = person();
    PdfChange.apply(doc, PdfChange.addMark(highlight('carried')), PDF_CARRY_ORIGIN);
    expect(undo.get()).toEqual({ canUndo: false, canRedo: false });
    undo.undo();
    expect(ids(doc)).toEqual(['carried']);
  });

  it('says where a step was made when it is taken back, and when it is made again', () => {
    const { undo, mark } = person();
    const returned: PdfUndoPlace[] = [];
    const off = undo.onReturn((place) => returned.push(place));
    mark('a', page);
    mark('b', other);
    undo.undo();
    undo.undo();
    undo.redo();
    undo.redo();
    undo.undo();
    expect(returned.map((place) => place.page)).toEqual([other, page, page, other, other]);
    off();
    undo.redo();
    expect(returned).toHaveLength(5);
  });

  it('says nowhere for a change made outside a step', () => {
    const { doc, undo } = person();
    const returned = vi.fn();
    undo.onReturn(returned);
    add(doc, 'a');
    undo.undo();
    expect(ids(doc)).toEqual([]);
    expect(returned).not.toHaveBeenCalled();
  });

  it('ends a step that throws, so the next change is a step of its own', () => {
    const { doc, undo, mark } = person();
    expect(() =>
      undo.step({ page }, () => {
        add(doc, 'a');
        throw new Error('the act failed');
      }),
    ).toThrow('the act failed');
    const returned = vi.fn();
    undo.onReturn(returned);
    add(doc, 'b');
    undo.undo();
    expect(ids(doc)).toEqual(['a']);
    expect(returned).not.toHaveBeenCalled();
    mark('c');
    expect(ids(doc)).toEqual(['a', 'c']);
  });

  it('says whether there is a step to take back or make again, telling only when that changes', () => {
    const { undo, mark } = person();
    const told = vi.fn();
    const off = undo.subscribe(told);
    const none = undo.get();
    expect(none).toEqual({ canUndo: false, canRedo: false });
    mark('a');
    expect(undo.get()).toEqual({ canUndo: true, canRedo: false });
    const one = undo.get();
    mark('b');
    expect(undo.get()).toBe(one);
    expect(told).toHaveBeenCalledTimes(1);
    undo.undo();
    expect(undo.get()).toEqual({ canUndo: true, canRedo: true });
    undo.undo();
    expect(undo.get()).toEqual({ canUndo: false, canRedo: true });
    // A new change ends what could be made again.
    mark('c');
    expect(undo.get()).toEqual({ canUndo: true, canRedo: false });
    off();
    const calls = told.mock.calls.length;
    undo.undo();
    expect(told).toHaveBeenCalledTimes(calls);
  });

  it('watches nothing once destroyed', () => {
    const { doc, undo, mark } = person();
    const told = vi.fn();
    undo.subscribe(told);
    undo.destroy();
    mark('a');
    expect(told).not.toHaveBeenCalled();
    undo.undo();
    expect(ids(doc)).toEqual(['a']);
  });
});
