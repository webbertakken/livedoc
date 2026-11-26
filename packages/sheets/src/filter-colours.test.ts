// Filter by Colour (docs/specs/029-sheets/data-tools.md "Filters, filter views and slicers"): the colour a cell is drawn
// in (its own or a met format rule's, in the theme; alternating colours never), a column's colours, and the filter
// keeping only the rows drawn in the chosen one.
import { describe, expect, it } from 'vitest';
import { book } from './testing/book';
import { columnColours, drawnColour } from './filter-colours';
import { filteredOutRows, isFilterCondition } from './filter';
import { cellKey, type CellFormat, type FilterCondition, type Sheet } from './sheet';
import { formatA1 } from './address';

const CELLS = { A1: 'Fruit', A2: 'apple', A3: 'pear', A4: 'plum', A5: 'fig', A6: '9' };

type Book = ReturnType<typeof book>;

function change(b: Book, edit: (sheet: Sheet) => Sheet) {
  const next = edit(b.sheets[0]!);
  b.sheets[0] = next;
  b.wb.updateSheet(next);
}

function paint(b: Book, formats: Record<string, CellFormat>) {
  change(b, (sheet) => {
    const { rows, cols } = sheet.layout;
    for (const [at, format] of Object.entries(formats)) {
      const r = Number(at.slice(1)) - 1;
      const key = cellKey(rows[r]!, cols[0]!);
      sheet.cells.set(key, { ...sheet.cells.get(key), format });
    }
    return { ...sheet };
  });
}

function filterBy(b: Book, cond: FilterCondition) {
  change(b, (sheet) => {
    const { rows, cols } = sheet.layout;
    return {
      ...sheet,
      layout: {
        ...sheet.layout,
        filter: {
          r1: rows[0]!,
          c1: cols[0]!,
          r2: rows[5]!,
          c2: cols[0]!,
          conds: { [cols[0]!]: cond },
        },
      },
    };
  });
}

const hidden = (b: Book) => {
  const rows = b.sheets[0]!.layout.rows;
  return [...filteredOutRows(b.wb, b.sheets[0]!.id)].map((id) => formatA1(rows.indexOf(id), 0));
};

describe('drawnColour', () => {
  it("reads a cell's own fill and text colour, theme colours in the theme", () => {
    const b = book(CELLS);
    paint(b, { A2: { bg: '#ff0000', fc: '#0000ff' }, A3: { bg: 'theme:accent1' } });
    const id = b.sheets[0]!.id;
    expect(drawnColour(b.wb, id, 1, 0, 'bg')).toBe('#ff0000');
    expect(drawnColour(b.wb, id, 1, 0, 'fc')).toBe('#0000ff');
    expect(drawnColour(b.wb, id, 2, 0, 'bg')).toBe(b.wb.theme.colours.accent1);
    expect(drawnColour(b.wb, id, 3, 0, 'bg')).toBeNull();
    expect(drawnColour(b.wb, 'nope', 1, 0, 'bg')).toBeNull();
  });

  it("draws a met format rule's colour over the cell's own, never alternating colours", () => {
    const b = book(CELLS);
    paint(b, { A2: { bg: '#ff0000' } });
    change(b, (sheet) => {
      const { rows, cols } = sheet.layout;
      const range = { r1: rows[1]!, c1: cols[0]!, r2: rows[5]!, c2: cols[0]! };
      return {
        ...sheet,
        layout: {
          ...sheet.layout,
          formatRules: [
            { id: 'f1', ...range, is: 'when', op: 'startsWith', a: 'p', style: { bg: '#00ff00' } },
          ],
          bands: [
            {
              id: 'b1',
              ...range,
              head: '#cccccc',
              band1: '#eeeeee',
              band2: '#dddddd',
              foot: '#bbbbbb',
            },
          ],
        },
      };
    });
    const id = b.sheets[0]!.id;
    expect(drawnColour(b.wb, id, 1, 0, 'bg')).toBe('#ff0000');
    expect(drawnColour(b.wb, id, 2, 0, 'bg')).toBe('#00ff00');
    expect(drawnColour(b.wb, id, 4, 0, 'bg')).toBeNull();
  });
});

describe('columnColours', () => {
  it("lists the colours drawn under the filter's header, once each, in the order seen", () => {
    const b = book(CELLS);
    paint(b, {
      A1: { bg: '#123456' },
      A2: { bg: '#ff0000' },
      A3: { bg: '#00ff00', fc: '#0000ff' },
      A4: { bg: '#ff0000' },
    });
    filterBy(b, {});
    const { id, layout } = b.sheets[0]!;
    expect(columnColours(b.wb, id, layout.cols[0]!, 'bg')).toEqual(['#ff0000', '#00ff00']);
    expect(columnColours(b.wb, id, layout.cols[0]!, 'fc')).toEqual(['#0000ff']);
    expect(columnColours(b.wb, id, 'nope', 'bg')).toEqual([]);
  });

  it('lists none without a filter', () => {
    const b = book(CELLS);
    expect(columnColours(b.wb, b.sheets[0]!.id, b.sheets[0]!.layout.cols[0]!, 'bg')).toEqual([]);
  });
});

describe('Filter by Colour', () => {
  it('keeps only the rows drawn in the chosen fill or text colour', () => {
    const b = book(CELLS);
    paint(b, { A2: { bg: '#ff0000' }, A3: { fc: '#0000ff' }, A4: { bg: '#ff0000' } });
    filterBy(b, { colour: { key: 'bg', is: '#ff0000' } });
    expect(hidden(b)).toEqual(['A3', 'A5', 'A6']);
    filterBy(b, { colour: { key: 'fc', is: '#0000ff' } });
    expect(hidden(b)).toEqual(['A2', 'A4', 'A5', 'A6']);
  });

  it('meets a condition as well', () => {
    const b = book(CELLS);
    paint(b, { A2: { bg: '#ff0000' }, A4: { bg: '#ff0000' } });
    filterBy(b, { colour: { key: 'bg', is: '#ff0000' }, op: 'startsWith', a: 'p' });
    expect(hidden(b)).toEqual(['A2', 'A3', 'A5', 'A6']);
  });

  it('leaves SUBTOTAL out of the rows it hides', () => {
    const b = book({
      ...CELLS,
      A6: '9',
      B1: 'n',
      B2: '1',
      B3: '2',
      B4: '4',
      B5: '8',
      B6: '16',
      D1: '=SUBTOTAL(9, B2:B6)',
    });
    paint(b, { A2: { bg: '#ff0000' }, A4: { bg: '#ff0000' } });
    filterBy(b, { colour: { key: 'bg', is: '#ff0000' } });
    expect(b.v('D1')).toBe(5);
  });
});

describe('isFilterCondition', () => {
  it('takes a colour of a fill or a text, as a colour', () => {
    expect(isFilterCondition({ colour: { key: 'bg', is: '#ff0000' } })).toBe(true);
    expect(isFilterCondition({ colour: { key: 'fc', is: '#00ff00' } })).toBe(true);
    for (const colour of [
      { key: 'bd', is: '#ff0000' },
      { key: 'bg', is: 'red' },
      { key: 'bg' },
      { key: 'bg', is: '#ff0000', x: 1 },
      '#ff0000',
      null,
    ])
      expect(isFilterCondition({ colour })).toBe(false);
  });
});
