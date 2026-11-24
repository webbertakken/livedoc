// docs/specs/035-pdf-documents/marks.md "Making a mark": A Drawing; "Limits": PDF_DRAWING_STEP_PT, PDF_DRAWING_JOIN_MS,
// PDF_DRAWING_MAX_POINTS, PDF_MAX_MARKS; live-editing-and-storage.md "The layout".
import { describe, expect, it } from 'vitest';
import { standardColours, type BlobKey } from '@livedoc/document';
import {
  PageName,
  PDF_DRAWING_JOIN_MS,
  PDF_DRAWING_MAX_POINTS,
  PDF_DRAWING_STEP_PT,
  PDF_MAX_MARKS,
  PdfLiveChanges,
  type DrawingMark,
} from '@livedoc/pdf-documents';
import { addStroke, DRAWING_LOOK, DRAWING_WIDTH_PT, extendStroke } from './pdf-drawing';
import { PDF_LOCAL_ORIGIN } from './pdf-undo';

const stored = { blob: 'ab'.repeat(32) as BlobKey, pages: 2 };
const page = PageName.ofObject(4);
const other = PageName.ofObject(9);
const T = 1_795_000_000_000;
const by = (
  id: string,
  begunAt = T,
  last: { id: string; page: PageName; endedAt: number } | null = null,
  now = begunAt,
) => ({
  author: 'Ada',
  now,
  begunAt,
  id,
  look: DRAWING_LOOK,
  last,
});
const drawings = (doc: ReturnType<typeof PdfLiveChanges.load>) =>
  PdfLiveChanges.marks(doc) as DrawingMark[];

describe('a stroke as it is drawn', () => {
  it('keeps a point a step or more from the last kept, and lets a closer one go', () => {
    const first = extendStroke([], { x: 10, y: 10 });
    expect(first).toEqual([10, 10]);
    expect(extendStroke(first, { x: 10 + PDF_DRAWING_STEP_PT / 2, y: 10 })).toBe(first);
    expect(extendStroke(first, { x: 10 + PDF_DRAWING_STEP_PT, y: 10 })).toEqual([
      10,
      10,
      10 + PDF_DRAWING_STEP_PT,
      10,
    ]);
  });
});

describe('addStroke', () => {
  it('makes a new Drawing of one stroke, in its first look, as one change that names the stored file', () => {
    const doc = PdfLiveChanges.load();
    const origins: unknown[] = [];
    doc.on('update', (_update: Uint8Array, origin: unknown) => origins.push(origin));
    const made = addStroke(doc, { page, stored }, [10, 10, 20, 20], by('d1'));
    expect(made).toMatchObject({ ok: true, joined: false });
    expect(drawings(doc)).toEqual([
      expect.objectContaining({
        id: 'd1',
        kind: 'drawing',
        strokes: [[10, 10, 20, 20]],
        width: DRAWING_WIDTH_PT,
        colour: standardColours('strong', 'light').find((colour) => colour.name === 'red')!.hex,
        opacity: 1,
        author: 'Ada',
      }),
    ]);
    expect(PdfLiveChanges.stored(doc)).toEqual(stored);
    expect(origins).toEqual([PDF_LOCAL_ORIGIN]);
  });

  it('joins a stroke begun soon after the last one ended on the same page, and starts anew otherwise', () => {
    const doc = PdfLiveChanges.load();
    addStroke(doc, { page, stored }, [10, 10, 20, 20], by('d1'));
    const last = { id: 'd1', page, endedAt: T };
    const joined = addStroke(
      doc,
      { page, stored },
      [30, 30],
      by('d2', T + PDF_DRAWING_JOIN_MS, last),
    );
    expect(joined).toMatchObject({ ok: true, joined: true });
    expect(drawings(doc)).toEqual([
      expect.objectContaining({
        id: 'd1',
        strokes: [
          [10, 10, 20, 20],
          [30, 30],
        ],
        modifiedAt: T + PDF_DRAWING_JOIN_MS,
        createdAt: T,
      }),
    ]);
    // Too late, on another page, or the last one gone: a Drawing of its own.
    addStroke(doc, { page, stored }, [40, 40], by('d3', T + PDF_DRAWING_JOIN_MS + 1, last));
    addStroke(doc, { page: other, stored }, [50, 50], by('d4', T + 1, last));
    addStroke(doc, { page, stored }, [60, 60], by('d5', T + 1, { ...last, id: 'gone' }));
    expect(drawings(doc).map((mark) => mark.id)).toEqual(['d1', 'd3', 'd4', 'd5']);
  });

  // Joining is decided by when a stroke began: a long stroke begun in time joins, however long it took.
  it('joins a stroke begun in time though it ends long after', () => {
    const doc = PdfLiveChanges.load();
    addStroke(doc, { page, stored }, [10, 10], by('d1'));
    const last = { id: 'd1', page, endedAt: T };
    const long = by('d2', T + PDF_DRAWING_JOIN_MS, last, T + 10 * PDF_DRAWING_JOIN_MS);
    expect(addStroke(doc, { page, stored }, [20, 20], long)).toMatchObject({ joined: true });
  });

  it('starts a new Drawing where the stroke would take the last past the most points one holds', () => {
    const doc = PdfLiveChanges.load();
    const full = Array.from({ length: PDF_DRAWING_MAX_POINTS * 2 }, (_, at) => at % 100);
    addStroke(doc, { page, stored }, full, by('d1'));
    addStroke(doc, { page, stored }, [1, 1], by('d2', T + 1, { id: 'd1', page, endedAt: T }));
    expect(drawings(doc).map((mark) => mark.id)).toEqual(['d1', 'd2']);
  });

  it('joins no mark that is not a Drawing', () => {
    const doc = PdfLiveChanges.load();
    const notDrawing = { id: 'h1', page, endedAt: T };
    // A highlight under that id is no Drawing to join.
    PdfLiveChanges.addMark(doc, {
      id: 'h1',
      kind: 'highlight',
      page,
      quads: [[0, 10, 10, 10, 0, 0, 10, 0]],
      text: 'x',
      colour: '#fef9c3',
      opacity: 1,
      author: 'Ada',
      createdAt: T,
      modifiedAt: T,
    });
    expect(addStroke(doc, { page, stored }, [2, 2], by('d2', T + 1, notDrawing))).toMatchObject({
      ok: true,
      joined: false,
    });
  });

  it('makes nothing of a stroke with no point, or one that is no stroke', () => {
    const doc = PdfLiveChanges.load();
    expect(addStroke(doc, { page, stored }, [], by('d1'))).toEqual({
      ok: false,
      reason: 'no_stroke',
    });
    expect(addStroke(doc, { page, stored }, [1e9, 1], by('d1'))).toEqual({
      ok: false,
      reason: 'no_stroke',
    });
    expect(PdfLiveChanges.isEmpty(doc)).toBe(true);
  });

  it('refuses a new Drawing past the most marks one PDF document holds', () => {
    const doc = PdfLiveChanges.load();
    doc.transact(() => {
      const marks = doc.getMap('marks');
      for (let n = 0; n < PDF_MAX_MARKS; n += 1) marks.set(`m${n}`, 1);
    });
    expect(addStroke(doc, { page, stored }, [1, 1], by('one-more'))).toEqual({
      ok: false,
      reason: 'pdf_too_many_marks',
    });
  });
});
