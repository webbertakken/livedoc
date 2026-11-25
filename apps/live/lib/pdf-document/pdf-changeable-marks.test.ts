// docs/specs/035-pdf-documents/marks.md "Changing a mark": the marks a person may change on a page are LiveDoc's and
// the file's own LiveDoc reads, but those taken as LiveDoc's or deleted; the file's own are drawn by the picture.
import { describe, expect, it } from 'vitest';
import { Mark, PageName, PdfChange, PdfLiveChanges } from '@livedoc/pdf-documents';
import {
  changeableMarks,
  changeableOnPage,
  fileMarksGone,
  pdfChangeableStore,
} from './pdf-changeable-marks';
import { pdfMarksStore } from './pdf-marks-store';

const page = PageName.ofObject(4);
const other = PageName.ofObject(9);
const T = 1_795_000_000_000;
const shape = (id: string, on = page) =>
  Mark.shape('rectangle', {
    id,
    page: on,
    colour: '#ff0000',
    opacity: 1,
    author: 'Ada',
    createdAt: T,
    rect: [10, 10, 50, 50],
    width: 2,
  })!;

describe('changeableMarks', () => {
  it('holds LiveDoc’s marks, then the file’s own neither LiveDoc’s now nor gone, naming those the file’s', () => {
    const changeable = changeableMarks(
      [shape('mine'), shape('o:2')],
      [shape('o:1'), shape('o:2'), shape('o:3')],
      new Set(['o:3']),
    );
    expect(changeable.marks.map((mark) => mark.id)).toEqual(['mine', 'o:2', 'o:1']);
    expect([...changeable.fileOwn]).toEqual(['o:1']);
  });

  it('is the same empty value for a page with none', () => {
    expect(changeableMarks([], [], new Set())).toBe(
      changeableMarks([], [shape('o:1')], new Set(['o:1'])),
    );
  });
});

describe('pdfChangeableStore', () => {
  it('renews as the live marks, the file’s own read and their deletions change, and only then', () => {
    const doc = PdfLiveChanges.load();
    const store = pdfChangeableStore(doc, pdfMarksStore(doc));
    let renewed = 0;
    const stop = store.subscribe(() => (renewed += 1));
    store.putFileMarks(page, [shape('o:1')]);
    expect(changeableOnPage(store.get(), page).marks.map((mark) => mark.id)).toEqual(['o:1']);
    const first = store.get();
    store.putFileMarks(page, [shape('o:1')]);
    expect(store.get()).toBe(first);

    PdfLiveChanges.addMark(doc, shape('mine', other));
    expect(changeableOnPage(store.get(), other).marks.map((mark) => mark.id)).toEqual(['mine']);
    PdfChange.apply(doc, PdfChange.removeFromFile('o:1', 'mark'));
    expect(changeableOnPage(store.get(), page).marks).toEqual([]);
    expect(fileMarksGone(doc)).toEqual(['o:1']);
    expect(renewed).toBe(3);

    stop();
    PdfChange.apply(doc, PdfChange.restoreFromFile('o:1'));
    expect(renewed).toBe(3);
  });

  it('names only the file’s own marks gone, never its fields or objects', () => {
    const doc = PdfLiveChanges.load();
    PdfChange.apply(doc, PdfChange.removeFromFile('f1', 'field'));
    PdfChange.apply(doc, PdfChange.removeFromFile('o:4', 'mark'));
    expect(fileMarksGone(doc)).toEqual(['o:4']);
  });
});
