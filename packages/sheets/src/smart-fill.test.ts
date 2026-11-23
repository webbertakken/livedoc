// Smart Fill's offer and its writing (docs/specs/029-sheets/grid-and-editing.md "Fill and move", D148, D150).
import { describe, expect, it } from 'vitest';
import { book } from './testing/book';
import { applySheetWrite } from './store';
import {
  SMART_FILL_ROWS_MAX,
  smartFillOffer,
  smartFillWrite,
  type SmartFillOffer,
} from './smart-fill';

type Book = ReturnType<typeof book>;
const offer = (b: Book, r: number, c: number) => smartFillOffer(b.wb, b.sheets[0]!.id, { r, c });
const names = {
  A1: 'First',
  B1: 'Last',
  C1: 'Full name',
  A2: 'Ada',
  B2: 'Lovelace',
  C2: 'Ada Lovelace',
  A3: 'Alan',
  B3: 'Turing',
  C3: 'Alan Turing',
  A4: 'Grace',
  B4: 'Hopper',
  A5: 'Charles',
  B5: 'Babbage',
};

describe('smartFillOffer', () => {
  it('offers the rest of the column, the header row dropped', () => {
    expect(offer(book(names), 2, 2)).toEqual({
      at: { r: 2, c: 2 },
      cells: [
        { r: 3, text: 'Grace Hopper' },
        { r: 4, text: 'Charles Babbage' },
      ],
    });
  });

  it('keeps a first row that fits, and reads sources on the right too', () => {
    const b = book({ B1: 'ada', C1: 'Ada', B2: 'alan', C2: 'Alan', C3: 'Grace', A1: 'x', A2: 'y' });
    expect(offer(b, 1, 0)).toEqual({ miss: 'no_pattern' });
    const right = book({ A1: 'ADA', B1: 'ada', A2: 'ALAN', B2: 'alan', B3: 'grace' });
    expect(offer(right, 1, 0)).toEqual({ at: { r: 1, c: 0 }, cells: [{ r: 2, text: 'GRACE' }] });
    // An empty first row is filled like the rest.
    const above = book({ A1: 'x', A2: 'b', B2: 'B', A3: 'c', B3: 'C' });
    expect(offer(above, 1, 1)).toEqual({ at: { r: 1, c: 1 }, cells: [{ r: 0, text: 'X' }] });
  });

  it('says why it offers nothing', () => {
    expect(offer(book({ A1: 'a' }), 0, 0)).toEqual({ miss: 'no_sources' });
    expect(offer(book({ A1: '=1', B1: 'x' }), 0, 0)).toEqual({ miss: 'not_typed' });
    expect(offer(book({ B1: 'x' }), 0, 0)).toEqual({ miss: 'not_typed' });
    expect(offer(book({ A1: 'x' }), 99, 0)).toEqual({ miss: 'not_typed' });
    expect(smartFillOffer(book({}).wb, 'nope', { r: 0, c: 0 })).toEqual({ miss: 'not_typed' });
    expect(offer(book({ A1: 'a', B1: 'A', A2: 'b' }), 0, 1)).toEqual({ miss: 'too_few' });
    expect(offer(book({ A1: 'a', B1: 'A', A2: 'b', B2: '=1', A3: 'c' }), 0, 1)).toEqual({
      miss: 'formula',
    });
    const long = 'x'.repeat(201);
    expect(offer(book({ A1: long, B1: long, A2: long, B2: long }), 0, 1)).toEqual({
      miss: 'too_long',
    });
    expect(offer(book({ A1: 'a', B1: 'A', A2: 'b', B2: 'B' }), 0, 1)).toEqual({
      miss: 'nothing_to_fill',
    });
    // The pattern finds no word in the row to fill.
    expect(offer(book({ A1: 'a b', B1: 'b', A2: 'c d', B2: 'd', A3: 'e' }), 0, 1)).toEqual({
      miss: 'nothing_to_fill',
    });
  });

  it('holds the block to its most rows', () => {
    const cells: Record<string, string> = { B1: 'A', B2: 'B' };
    for (let r = 1; r <= SMART_FILL_ROWS_MAX + 10; r++) cells[`A${r}`] = r > 2 ? 'q' : 'ab'[r - 1]!;
    const got = offer(book(cells, { rows: SMART_FILL_ROWS_MAX + 20 }), 0, 1) as SmartFillOffer;
    expect(got.cells.at(-1)!.r).toBe(SMART_FILL_ROWS_MAX - 1);
    const up = offer(book(cells, { rows: SMART_FILL_ROWS_MAX + 20 }), 1, 1) as SmartFillOffer;
    expect(up.cells.length).toBe(SMART_FILL_ROWS_MAX - 2);
  });
});

describe('smartFillWrite', () => {
  it('types the texts into the cells still empty', () => {
    const b = book({ ...names, A4: '12%', B4: '' });
    const id = b.sheets[0]!.id;
    const got: SmartFillOffer = {
      at: { r: 2, c: 2 },
      cells: [
        { r: 3, text: '12%' },
        { r: 2, text: 'taken' },
        { r: 4, text: '=1+1' },
        { r: 5, text: 'x'.repeat(10_001) },
        { r: 99, text: 'gone' },
      ],
    };
    const w = smartFillWrite(b.wb, id, got)!;
    const sheet = applySheetWrite(b.sheets[0]!, w, {
      now: 1,
      by: { id: '', name: '', color: '' },
    }).sheet;
    b.wb.updateSheet(sheet);
    expect(b.wb.value(id, 3, 2)).toBe(0.12);
    expect(b.wb.value(id, 2, 2)).toBe('Alan Turing');
    expect(b.wb.value(id, 4, 2)).toBeNull();
    expect(
      smartFillWrite(b.wb, id, { at: { r: 0, c: 2 }, cells: [{ r: 0, text: 'x' }] }),
    ).toBeNull();
    expect(smartFillWrite(b.wb, 'nope', got)).toBeNull();
  });
});
