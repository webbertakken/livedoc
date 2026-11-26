// docs/specs/035-pdf-documents/marks.md "Changing a mark": Rotate. Every selected mark that turns, turned a quarter
// about its middle or to an angle, held on its page, one change; a mark that does not turn left as it is; a file's own
// taken as LiveDoc's.
import { describe, expect, it } from 'vitest';
import { Mark, PageName, PdfLiveChanges } from '@livedoc/pdf-documents';
import { TURN_ITEMS, turnMarks } from './pdf-mark-turns';
import { PDF_LOCAL_ORIGIN } from './pdf-undo';

const BASE = {
  page: PageName.ofObject(3),
  colour: '#188038',
  opacity: 1,
  author: 'Ada',
  createdAt: 1,
};
const PAGE = [0, 0, 612, 792] as const;
const stamp = (id: string, rect: [number, number, number, number] = [100, 100, 160, 120]) =>
  Mark.stamp({ ...BASE, id, stamp: 'approved', rect, lines: ['APPROVED'] })!;

describe('turnMarks', () => {
  it('names Format > Rotate’s two items', () => {
    expect(Object.values(TURN_ITEMS)).toEqual(['clockwise', 'counterclockwise']);
  });

  it('turns every selected mark that turns a quarter as one change, and back upright', () => {
    const doc = PdfLiveChanges.load();
    PdfLiveChanges.addMark(doc, stamp('a'));
    PdfLiveChanges.addMark(
      doc,
      Mark.shape('ellipse', { ...BASE, id: 'e', rect: [0, 0, 9, 9], width: 2 })!,
    );
    PdfLiveChanges.addMark(
      doc,
      Mark.drawing({ ...BASE, id: 'd', strokes: [[0, 0, 9, 9]], width: 2 })!,
    );
    const origins: unknown[] = [];
    doc.on('update', (_update: Uint8Array, origin: unknown) => origins.push(origin));
    expect(turnMarks(doc, ['a', 'e', 'd'], 'counterclockwise', PAGE, 5, new Map())).toBe(2);
    expect(PdfLiveChanges.mark(doc, 'a')).toMatchObject({
      turn: 90,
      rect: [100, 100, 160, 120],
      modifiedAt: 5,
    });
    // The Ellipse turns too, moved onto the page; the Drawing does not turn.
    expect(PdfLiveChanges.mark(doc, 'e')).toMatchObject({ turn: 90 });
    expect(PdfLiveChanges.mark(doc, 'd')).not.toHaveProperty('turn');
    expect(origins).toEqual([PDF_LOCAL_ORIGIN]);
    expect(turnMarks(doc, ['a'], 'clockwise', PAGE, 6, new Map())).toBe(1);
    expect(PdfLiveChanges.mark(doc, 'a')).not.toHaveProperty('turn');
  });

  it('turns to an angle, an Arrow by its points, and leaves alone what would not change', () => {
    const doc = PdfLiveChanges.load();
    PdfLiveChanges.addMark(doc, stamp('a'));
    PdfLiveChanges.addMark(
      doc,
      Mark.line('arrow', { ...BASE, id: 'l', line: [100, 100, 140, 100], width: 1 })!,
    );
    expect(turnMarks(doc, ['a', 'l'], { to: 30 }, PAGE, 5, new Map())).toBe(2);
    expect(PdfLiveChanges.mark(doc, 'a')).toMatchObject({ turn: 30 });
    const line = (PdfLiveChanges.mark(doc, 'l') as unknown as { line: number[] }).line;
    [120 - 20 * Math.cos(Math.PI / 6), 90, 120 + 20 * Math.cos(Math.PI / 6), 110].forEach((n, at) =>
      expect(line[at]).toBeCloseTo(n, 6),
    );
    expect(turnMarks(doc, ['a', 'l'], { to: 30 }, PAGE, 6, new Map())).toBe(1);
    expect(turnMarks(doc, ['l'], { to: 0 }, PAGE, 6, new Map())).toBe(0);
  });

  it('holds a turned stamp on its page, takes a file’s own as LiveDoc’s, and turns nothing that is gone', () => {
    const doc = PdfLiveChanges.load();
    const own = stamp('o:4', [100, 2, 160, 22]);
    expect(turnMarks(doc, ['o:4'], 'clockwise', PAGE, 5, new Map([['o:4', own]]))).toBe(1);
    expect(PdfLiveChanges.mark(doc, 'o:4')).toMatchObject({ turn: 270, rect: [100, 20, 160, 40] });
    expect(turnMarks(doc, ['gone'], 'clockwise', PAGE, 5, new Map())).toBe(0);
  });
});
