// Test helpers: a sheet with two filtered tables and the sheet's own filter beside them (data-tools.md "A table's
// filter", D481), and the filters of a layout by column place, so a sheet read back from a file compares.
import { cellKey, type FilterCondition, type Sheet, type SheetLayout } from '../sheet';
import { makeSheets } from './book';

/**
 * Table1 (A1:B4: B keeps 2, A keeps cells filled red, A3 and A4 are), Table2 (D1:E4: D keeps b) and the sheet's
 * filter over H1:H4 keeping x: row 2 hidden by both tables, row 4 by the sheet's filter, row 3 kept by all.
 */
export function twoTablesAndAFilter(): Sheet[] {
  const [sheet] = makeSheets({
    Data: {
      A1: 'Item',
      B1: 'N',
      A2: 'pen',
      B2: '1',
      A3: 'ink',
      B3: '2',
      A4: 'cap',
      B4: '2',
      D1: 'Tag',
      E1: 'M',
      D2: 'a',
      D3: 'b',
      D4: 'b',
      H1: 'H',
      H2: 'x',
      H3: 'x',
      H4: 'y',
    },
  });
  for (const r of ['s0r2', 's0r3']) {
    const cell = sheet!.cells.get(cellKey(r, 's0c0'))!;
    sheet!.cells.set(cellKey(r, 's0c0'), { ...cell, format: { bg: '#ff0000' } });
  }
  const layout: SheetLayout = {
    ...sheet!.layout,
    tables: [
      {
        id: 'tbl001',
        name: 'Table1',
        r1: 's0r0',
        c1: 's0c0',
        r2: 's0r3',
        c2: 's0c1',
        filter: { s0c1: { values: ['2'] }, s0c0: { colour: { key: 'bg', is: '#ff0000' } } },
      },
      {
        id: 'tbl002',
        name: 'Table2',
        r1: 's0r0',
        c1: 's0c3',
        r2: 's0r3',
        c2: 's0c4',
        filter: { s0c3: { values: ['b'] } },
      },
    ],
    filter: { r1: 's0r0', c1: 's0c7', r2: 's0r3', c2: 's0c7', conds: { s0c7: { values: ['x'] } } },
  };
  return [{ ...sheet!, layout }];
}

const byPlace = (layout: SheetLayout, conds: Record<string, FilterCondition> | undefined) =>
  Object.fromEntries(Object.entries(conds ?? {}).map(([c, v]) => [layout.cols.indexOf(c), v]));

/** A layout's filters by column place: the sheet's, then each table's by name (off as null). */
export function filtersByPlace(layout: SheetLayout) {
  return {
    sheet: layout.filter ? byPlace(layout, layout.filter.conds) : null,
    tables: (layout.tables ?? []).map((t) => [t.name, t.filter ? byPlace(layout, t.filter) : null]),
  };
}
