// A table row breaking between its lines (docs/specs/034-text-documents/tables.md "Laying out across pages", "Built: a
// row breaks between its lines"): only where no cell's line crosses.
import { describe, expect, it } from 'vitest';
import { rowBreaks } from './pagination-table-rows';

// A cell's lines of text, each 20 px high, 30 px apart, from `first`.
const lines = (count: number, first = 5) =>
  Array.from({ length: count }, (_, k) => ({ top: first + k * 30, bottom: first + k * 30 + 20 }));

describe('rowBreaks', () => {
  it('breaks between any two lines where the cells stand level', () => {
    expect(rowBreaks([lines(3), lines(2)], 90)).toEqual([30, 60]);
  });

  it("never breaks where another cell's line crosses", () => {
    // The second cell's lines sit 15 px lower: each crosses the first's boundaries, and the first crosses its.
    expect(rowBreaks([lines(3), lines(3, 20)], 110)).toEqual([]);
  });

  it('breaks past a short cell and an empty one', () => {
    expect(rowBreaks([lines(4), lines(1), []], 120)).toEqual([30, 60, 90]);
  });

  it('keeps something that moves whole as one line', () => {
    // A nested table 70 px high in the second cell: the first cell's boundaries inside it are no places to break.
    expect(rowBreaks([lines(4), [{ top: 5, bottom: 75 }]], 120)).toEqual([90]);
  });

  it('takes boundaries a pixel or two apart as one place', () => {
    expect(rowBreaks([lines(2), lines(2, 6.5)], 60)).toEqual([30]);
  });
});
