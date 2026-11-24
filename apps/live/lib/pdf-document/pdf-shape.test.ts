// docs/specs/035-pdf-documents/marks.md "Making a mark": a Line or an Arrow from press to let-go; a Rectangle or an
// Ellipse the box a drag spans, ⇧ square or round; a press alone makes nothing (PDF_SHAPE_MIN_PT); a drag stops at the
// page's edge; the first looks; "Limits": PDF_MAX_MARKS; live-editing-and-storage.md "The layout".
import { describe, expect, it } from 'vitest';
import { standardColours, type BlobKey } from '@livedoc/document';
import { PageName, PDF_MAX_MARKS, PDF_SHAPE_MIN_PT, PdfLiveChanges } from '@livedoc/pdf-documents';
import { addShape, dragShape, SHAPE_LOOK, SHAPE_WIDTH_PT, shapeOf } from './pdf-shape';
import { PDF_LOCAL_ORIGIN } from './pdf-undo';

const stored = { blob: 'ab'.repeat(32) as BlobKey, pages: 2 };
const page = PageName.ofObject(4);
const T = 1_795_000_000_000;
const by = (id: string) => ({ author: 'Ada', now: T, id, look: SHAPE_LOOK });
// The page as it shows on screen: 100 to 500 across, 50 to 650 down.
const box = { left: 100, top: 50, right: 500, bottom: 650 };

describe('the first look of a line or shape', () => {
  it('is the strong Red for light paper, 2 points wide, opaque', () => {
    const red = standardColours('strong', 'light').find((colour) => colour.name === 'red')!.hex;
    expect(SHAPE_LOOK).toEqual({ colour: red, opacity: 1 });
    expect(SHAPE_WIDTH_PT).toBe(2);
  });
});

describe('dragShape', () => {
  it('ends where the pointer is, on the page', () => {
    expect(dragShape('line', { x: 200, y: 100 }, { x: 300, y: 400 }, box, false)).toEqual({
      x: 300,
      y: 400,
    });
  });

  it('stops at the page’s edge when the pointer leaves it', () => {
    expect(dragShape('arrow', { x: 200, y: 100 }, { x: 900, y: -40 }, box, false)).toEqual({
      x: 500,
      y: 50,
    });
  });

  it('keeps a Rectangle or an Ellipse square with ⇧, its side the drag’s longer', () => {
    expect(dragShape('rectangle', { x: 200, y: 100 }, { x: 260, y: 140 }, box, true)).toEqual({
      x: 260,
      y: 160,
    });
    expect(dragShape('ellipse', { x: 200, y: 300 }, { x: 170, y: 200 }, box, true)).toEqual({
      x: 100,
      y: 200,
    });
  });

  it('keeps a square on the page, its side what room the page leaves', () => {
    expect(dragShape('rectangle', { x: 450, y: 100 }, { x: 600, y: 300 }, box, true)).toEqual({
      x: 500,
      y: 150,
    });
    expect(dragShape('rectangle', { x: 200, y: 100 }, { x: 200, y: 100 }, box, true)).toEqual({
      x: 200,
      y: 100,
    });
  });

  it('leaves a line as dragged with ⇧', () => {
    expect(dragShape('line', { x: 200, y: 100 }, { x: 260, y: 140 }, box, true)).toEqual({
      x: 260,
      y: 140,
    });
  });
});

describe('shapeOf', () => {
  it('is a Line or an Arrow from the press to the let-go', () => {
    expect(shapeOf('arrow', { x: 300, y: 500 }, { x: 100, y: 400 }, 2)).toEqual({
      kind: 'arrow',
      line: [300, 500, 100, 400],
      width: 2,
    });
  });

  it('is a Rectangle or an Ellipse along the box the two points span, whichever way the drag went', () => {
    expect(shapeOf('ellipse', { x: 300, y: 500 }, { x: 100, y: 600 }, 3)).toEqual({
      kind: 'ellipse',
      rect: [100, 500, 300, 600],
      width: 3,
    });
  });

  it('is nothing for a press: a box under PDF_SHAPE_MIN_PT both ways, or a line shorter', () => {
    const near = PDF_SHAPE_MIN_PT * 0.6;
    expect(shapeOf('rectangle', { x: 10, y: 10 }, { x: 10 + near, y: 10 + near }, 2)).toBeNull();
    expect(shapeOf('line', { x: 10, y: 10 }, { x: 10 + near, y: 10 + near }, 2)).toBeNull();
    // A flat box is still a mark: it spans the page one way.
    expect(shapeOf('rectangle', { x: 10, y: 10 }, { x: 40, y: 10 }, 2)).not.toBeNull();
  });
});

describe('addShape', () => {
  it('makes the mark in the look given, as one change that names the stored file', () => {
    const doc = PdfLiveChanges.load();
    const origins: unknown[] = [];
    doc.on('update', (_update: Uint8Array, origin: unknown) => origins.push(origin));
    const made = addShape(
      doc,
      { page, stored },
      shapeOf('rectangle', { x: 10, y: 20 }, { x: 110, y: 70 }, 2),
      by('s1'),
    );
    expect(made.ok).toBe(true);
    expect(PdfLiveChanges.marks(doc)).toEqual([
      {
        id: 's1',
        kind: 'rectangle',
        page,
        rect: [10, 20, 110, 70],
        width: 2,
        ...SHAPE_LOOK,
        author: 'Ada',
        createdAt: T,
        modifiedAt: T,
      },
    ]);
    expect(PdfLiveChanges.stored(doc)).toEqual(stored);
    expect(origins).toEqual([PDF_LOCAL_ORIGIN]);
  });

  it('makes a Line of its ends, beside a mark made before it', () => {
    const doc = PdfLiveChanges.load();
    addShape(doc, { page, stored }, shapeOf('arrow', { x: 0, y: 0 }, { x: 9, y: 9 }, 2), by('a0'));
    addShape(
      doc,
      { page, stored },
      shapeOf('line', { x: 10, y: 20 }, { x: 110, y: 70 }, 2),
      by('l1'),
    );
    expect(PdfLiveChanges.marks(doc).map((mark) => mark.kind)).toEqual(['arrow', 'line']);
    expect(PdfLiveChanges.marks(doc)[1]).toMatchObject({ line: [10, 20, 110, 70] });
  });

  it('makes nothing of no shape, or of one no mark holds', () => {
    const doc = PdfLiveChanges.load();
    expect(addShape(doc, { page, stored }, null, by('s1'))).toEqual({
      ok: false,
      reason: 'no_shape',
    });
    const far = { kind: 'line', line: [0, 0, 1e9, 0], width: 2 } as const;
    expect(addShape(doc, { page, stored }, far, by('s2'))).toEqual({
      ok: false,
      reason: 'no_shape',
    });
    expect(PdfLiveChanges.marks(doc)).toEqual([]);
  });

  it('is refused past PDF_MAX_MARKS', () => {
    const doc = PdfLiveChanges.load();
    doc.transact(() => {
      const marks = doc.getMap('marks');
      for (let n = 0; n < PDF_MAX_MARKS; n += 1) marks.set(`m${n}`, 1);
    });
    const shape = shapeOf('ellipse', { x: 10, y: 20 }, { x: 110, y: 70 }, 2);
    expect(addShape(doc, { page, stored }, shape, by('one-more'))).toEqual({
      ok: false,
      reason: 'pdf_too_many_marks',
    });
  });
});
