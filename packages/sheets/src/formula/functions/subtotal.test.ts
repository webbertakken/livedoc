// SUBTOTAL beyond the oracle's cases (docs/specs/029-sheets/formulas.md "Functions": Math): rows the filter hides,
// rows hidden by hand, subtotals inside the range, and the answer moving when a filtered value changes.
import { describe, expect, it } from 'vitest';
import { book } from '../../testing/book';

// A1:A6: a header and five amounts; B: a tag the filter reads.
const CELLS = {
  A1: 'Amount',
  B1: 'Tag',
  A2: '1',
  B2: 'keep',
  A3: '2',
  B3: 'drop',
  A4: '4',
  B4: 'keep',
  A5: '8',
  B5: 'keep',
  A6: '16',
  B6: 'drop',
  D1: '=SUBTOTAL(9, A2:A6)',
  D2: '=SUBTOTAL(109, A2:A6)',
  D3: '=SUBTOTAL(2, A2:A6)',
};

function filtered(b: ReturnType<typeof book>, hiddenRows: number[] = []) {
  const sheet = b.sheets[0]!;
  const { rows, cols } = sheet.layout;
  const next = {
    ...sheet,
    layout: {
      ...sheet.layout,
      hiddenRows: hiddenRows.map((r) => rows[r]!),
      filter: {
        r1: rows[0]!,
        c1: cols[0]!,
        r2: rows[5]!,
        c2: cols[1]!,
        conds: { [cols[1]!]: { values: ['keep'] } },
      },
    },
  };
  b.sheets[0] = next;
  b.wb.updateSheet(next);
}

describe('SUBTOTAL', () => {
  it('leaves out the rows the filter hides, for every code', () => {
    const b = book(CELLS);
    expect([b.v('D1'), b.v('D2'), b.v('D3')]).toEqual([31, 31, 5]);
    filtered(b);
    expect([b.v('D1'), b.v('D2'), b.v('D3')]).toEqual([13, 13, 3]);
  });

  it('leaves out rows hidden by hand only for 101 to 111', () => {
    const b = book(CELLS);
    filtered(b, [4]);
    expect([b.v('D1'), b.v('D2')]).toEqual([13, 5]);
  });

  it('works out afresh when a value the filter reads changes', () => {
    const b = book(CELLS);
    filtered(b);
    b.set('B6', 'keep');
    expect(b.v('D1')).toBe(29);
  });

  it('leaves out an error in a filtered row', () => {
    const b = book({ ...CELLS, A3: '=1/0', D4: '=SUBTOTAL(9, A3)' });
    expect(b.v('D1')).toMatchObject({ e: '#DIV/0!' });
    filtered(b);
    expect([b.v('D1'), b.v('D4')]).toEqual([13, 0]);
  });

  it('leaves out the subtotals inside its range', () => {
    const b = book({
      A1: '1',
      A2: '2',
      A3: '=SUBTOTAL(9, A1:A2)',
      A4: '=SUM(A1:A2)',
      A5: '=SUBTOTAL(9, A1:A4)',
    });
    expect(b.v('A5')).toBe(6);
  });

  it.each([
    ['=SUBTOTAL(9, (A1:A2, A4))', 7],
    ['=SUBTOTAL(9, {1, 2; 3, 4})', 10],
    ['=SUBTOTAL(9, 5)', 5],
    ['=SUBTOTAL(9, A1:A2, )', 3],
    ['=SUBTOTAL(1, C1:C2)', { e: '#DIV/0!' }],
    ['=SUBTOTAL(9, C1:C2)', 0],
    ['=SUBTOTAL(9, A1)', 1],
    ['=SUBTOTAL(104, A1:A4)', 4],
    ['=SUBTOTAL(NA(), A1:A4)', { e: '#N/A' }],
    ['=SUBTOTAL(9, A1:A4, B1)', { e: '#DIV/0!' }],
    ['=SUBTOTAL(6, A1:A4, B1)', { e: '#DIV/0!' }],
    ['=SUBTOTAL(9, )', 0],
    ['=SUBTOTAL(6, A1:A4)', 8],
    ['=SUBTOTAL(9, , A1)', 1],
    ['=SUBTOTAL(9, NA())', { e: '#N/A' }],
  ])('%s', (formula, value) => {
    const b = book({ A1: '1', A2: '2', A4: '4', B1: '=1/0', J20: formula });
    const got = b.v('J20');
    if (typeof value === 'object') expect(got).toMatchObject(value);
    else expect(got).toBe(value);
  });

  it('refuses a range past the cells one read may take', () => {
    const b = book({ J20: '=SUBTOTAL(9, A1:Z40000)' }, { rows: 40000, cols: 26 });
    expect(b.v('J20')).toMatchObject({ e: '#NUM!' });
  });
});
