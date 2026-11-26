// docs/specs/035-pdf-documents/marks.md "Changing a mark": A stamp's quarter turns, every selected stamp a quarter
// about its middle, held on its page, one change; any other mark left as it is; a file's own stamp taken as LiveDoc's.
import { describe, expect, it } from 'vitest';
import { Mark, PageName, PdfLiveChanges } from '@livedoc/pdf-documents';
import { TURN_ITEMS, turnStamps } from './pdf-stamp-turns';
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

describe('turnStamps', () => {
  it('names Format > Rotate’s two items', () => {
    expect(Object.values(TURN_ITEMS)).toEqual(['clockwise', 'counterclockwise']);
  });

  it('turns every selected stamp a quarter as one change, and back upright', () => {
    const doc = PdfLiveChanges.load();
    PdfLiveChanges.addMark(doc, stamp('a'));
    PdfLiveChanges.addMark(
      doc,
      Mark.shape('ellipse', { ...BASE, id: 'e', rect: [0, 0, 9, 9], width: 2 })!,
    );
    const origins: unknown[] = [];
    doc.on('update', (_update: Uint8Array, origin: unknown) => origins.push(origin));
    expect(turnStamps(doc, ['a', 'e'], 'counterclockwise', PAGE, 5, new Map())).toBe(1);
    expect(PdfLiveChanges.mark(doc, 'a')).toMatchObject({
      turn: 90,
      rect: [100, 100, 160, 120],
      modifiedAt: 5,
    });
    expect(PdfLiveChanges.mark(doc, 'e')).not.toHaveProperty('turn');
    expect(origins).toEqual([PDF_LOCAL_ORIGIN]);
    expect(turnStamps(doc, ['a'], 'clockwise', PAGE, 6, new Map())).toBe(1);
    expect(PdfLiveChanges.mark(doc, 'a')).not.toHaveProperty('turn');
  });

  it('holds a turned stamp on its page, takes a file’s own as LiveDoc’s, and turns nothing without a stamp', () => {
    const doc = PdfLiveChanges.load();
    const own = stamp('o:4', [100, 2, 160, 22]);
    expect(turnStamps(doc, ['o:4'], 'clockwise', PAGE, 5, new Map([['o:4', own]]))).toBe(1);
    expect(PdfLiveChanges.mark(doc, 'o:4')).toMatchObject({ turn: 270, rect: [100, 20, 160, 40] });
    expect(turnStamps(doc, ['gone'], 'clockwise', PAGE, 5, new Map())).toBe(0);
  });
});
