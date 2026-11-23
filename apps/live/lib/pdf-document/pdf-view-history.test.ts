// docs/specs/035-pdf-documents/reading-surface.md "The pages": Previous view and Next view step through the places a
// person jumped from and to, as a browser's history; at most PDF_VIEW_HISTORY_MAX kept, none twice in a row.
import { describe, expect, it } from 'vitest';
import { PdfViewHistory } from './pdf-view-history';

const at = (index: number, down = 0) => ({ index, across: 0, down });

describe('a person’s view history', () => {
  it('goes back to where a jump left from, and forward again', () => {
    let history = PdfViewHistory.jumped(PdfViewHistory.empty, at(0));
    history = PdfViewHistory.jumped(history, at(4));
    expect(PdfViewHistory.canBack(history)).toBe(true);
    expect(PdfViewHistory.canForward(history)).toBe(false);
    // Now on page nine: back to four, then to zero, then forward to four and nine.
    const first = PdfViewHistory.back(history, at(9))!;
    expect(first.to).toEqual(at(4));
    const second = PdfViewHistory.back(first.history, first.to)!;
    expect(second.to).toEqual(at(0));
    expect(PdfViewHistory.back(second.history, second.to)).toBeNull();
    const ahead = PdfViewHistory.forward(second.history, second.to)!;
    expect(ahead.to).toEqual(at(4));
    expect(PdfViewHistory.forward(ahead.history, ahead.to)!.to).toEqual(at(9));
  });

  it('drops what was ahead on a new jump', () => {
    const history = PdfViewHistory.jumped(PdfViewHistory.empty, at(0));
    const back = PdfViewHistory.back(history, at(5))!;
    const jumped = PdfViewHistory.jumped(back.history, back.to);
    expect(PdfViewHistory.canForward(jumped)).toBe(false);
    expect(PdfViewHistory.forward(jumped, at(2))).toBeNull();
  });

  it('keeps a place once where it is kept twice in a row', () => {
    const history = PdfViewHistory.jumped(
      PdfViewHistory.jumped(PdfViewHistory.empty, at(3)),
      at(3),
    );
    expect(history.back).toEqual([at(3)]);
  });

  it('lets the oldest place go past the most it keeps', () => {
    let history = PdfViewHistory.empty;
    for (let index = 0; index < 5; index += 1)
      history = PdfViewHistory.jumped(history, at(index), 3);
    expect(history.back).toEqual([at(2), at(3), at(4)]);
  });

  it('has nowhere to go from nothing', () => {
    expect(PdfViewHistory.canBack(PdfViewHistory.empty)).toBe(false);
    expect(PdfViewHistory.back(PdfViewHistory.empty, at(1))).toBeNull();
  });

  it('keeps no place where there is none in view', () => {
    expect(PdfViewHistory.jumped(PdfViewHistory.empty, null)).toBe(PdfViewHistory.empty);
  });
});
