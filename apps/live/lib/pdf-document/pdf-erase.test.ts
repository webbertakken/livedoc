// docs/specs/035-pdf-documents/marks.md "Changing a mark": Erase rubs out the strokes passed over as one change under
// the person's own origin; a Drawing with none left is deleted; a file's own Drawing is taken as LiveDoc's, or named
// gone.
import { describe, expect, it } from 'vitest';
import { Mark, PageName, PdfLiveChanges, type DrawingMark } from '@livedoc/pdf-documents';
import { eraseStrokes } from './pdf-erase';
import { PDF_LOCAL_ORIGIN } from './pdf-undo';

const T = 1_795_000_000_000;
const drawing = (id: string, strokes: number[][]): DrawingMark =>
  Mark.drawing({
    id,
    page: PageName.ofObject(3),
    strokes,
    width: 2,
    colour: '#d93025',
    opacity: 1,
    author: 'Ada',
    createdAt: T,
  })!;
const A = [0, 0, 10, 0];
const B = [0, 9, 10, 9];

describe('eraseStrokes', () => {
  it('rubs out the strokes named and deletes a Drawing left with none, as one change', () => {
    const doc = PdfLiveChanges.load();
    const one = drawing('one', [A, B]);
    const two = drawing('two', [A]);
    PdfLiveChanges.addMark(doc, one);
    PdfLiveChanges.addMark(doc, two);
    const origins: unknown[] = [];
    doc.on('update', (_update: Uint8Array, origin: unknown) => origins.push(origin));
    const done = eraseStrokes(
      doc,
      [
        { mark: one, gone: [0] },
        { mark: two, gone: [0] },
      ],
      T + 1,
    );
    expect(done).toEqual({ strokes: 2, marks: 2, deleted: 1 });
    expect(PdfLiveChanges.mark(doc, 'one')).toMatchObject({ strokes: [B], modifiedAt: T + 1 });
    expect(PdfLiveChanges.mark(doc, 'two')).toBeNull();
    expect(origins).toEqual([PDF_LOCAL_ORIGIN]);
  });

  it('takes a file’s own Drawing as LiveDoc’s, or names it gone once emptied', () => {
    const doc = PdfLiveChanges.load();
    const own = drawing('o:12', [A, B]);
    expect(eraseStrokes(doc, [{ mark: own, gone: [1] }], T + 1)).toEqual({
      strokes: 1,
      marks: 1,
      deleted: 0,
    });
    expect(PdfLiveChanges.mark(doc, 'o:12')).toMatchObject({ strokes: [A] });
    const other = drawing('o:13', [A]);
    expect(eraseStrokes(doc, [{ mark: other, gone: [0] }], T + 2).deleted).toBe(1);
    expect(PdfLiveChanges.mark(doc, 'o:13')).toBeNull();
    expect([...PdfLiveChanges.removed(doc).keys()]).toEqual(['o:12', 'o:13']);
  });

  it('does nothing for no strokes, or a mark that is no Drawing', () => {
    const doc = PdfLiveChanges.load();
    expect(eraseStrokes(doc, [{ mark: drawing('d', [A]), gone: [] }], T)).toEqual({
      strokes: 0,
      marks: 0,
      deleted: 0,
    });
    const line = Mark.line('line', { ...drawing('l', [A]), line: [0, 0, 9, 9] })!;
    PdfLiveChanges.addMark(doc, line);
    expect(eraseStrokes(doc, [{ mark: drawing('l', [A]), gone: [0] }], T).strokes).toBe(0);
  });
});
