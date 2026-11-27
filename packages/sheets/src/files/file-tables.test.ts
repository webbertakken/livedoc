// docs/specs/029-sheets/standard-mapping.md "Tables in the file": a sheet's tables as a file holds them, LiveDoc's
// record beside the standard form (taken while its fingerprint holds, D293, D294), which of a file's tables LiveDoc
// holds, and a file's tables made on a sheet's grid.
import { describe, expect, it } from 'vitest';
import { emptyLayout, type SheetLayout } from '../sheet';
import type { SheetTable } from '../tables/table';
import {
  fileTablesOf,
  heldTables,
  readTableRecord,
  tableFingerprint,
  tableRecordText,
  tablesFound,
  tablesFromFile,
  type FileTable,
} from './file-tables';
import type { FileLoss } from './workbook-file';
import { xlsxHeld as held } from './xlsx-filters';
import { book } from '../testing/book';

const FILTERS = (() => {
  const b = book({});
  return { ctx: b.wb.ctxFor(b.sheets[0]!.id), dates: { locale: 'en-GB', today: 46000 } };
})();

let n = 11;
const rand = () => (n = (n * 16807) % 2147483647) / 2147483647;

// A 10 by 6 grid holding `tables`, each given by place.
function laidOut(tables: (Omit<SheetTable, 'r1' | 'c1' | 'r2' | 'c2'> & { at: number[] })[]) {
  const layout = emptyLayout(rand, 10, 6);
  const made = tables.map(({ at: [r1, c1, r2, c2], ...t }) => ({
    ...t,
    r1: layout.rows[r1!]!,
    c1: layout.cols[c1!]!,
    r2: layout.rows[r2!]!,
    c2: layout.cols[c2!]!,
  }));
  return { ...layout, tables: made } as SheetLayout;
}

const sales: FileTable = {
  name: 'Sales',
  range: { r1: 0, c1: 0, r2: 3, c2: 2 },
  columns: ['Item', 'Amount', 'Column 3'],
};

describe('a sheet’s tables as a file holds them', () => {
  it('gives each its cells, its column names, its typed columns by name and its total row', () => {
    const layout = laidOut([
      {
        id: 'tbl1',
        name: 'My Sales',
        at: [1, 1, 5, 3],
        total: true,
        types: {},
        opts: {},
      },
    ]);
    const t = layout.tables![0]!;
    const [item, amount] = [layout.cols[1]!, layout.cols[2]!];
    layout.tables = [
      {
        ...t,
        types: { [item]: 'dropdown', [amount]: 'currency' },
        opts: { [item]: [{ v: 'pen' }, { v: 'ink' }] },
      },
    ];
    const text = (r: string, c: string) =>
      r === layout.rows[1]
        ? ({ [item]: 'Item', [amount]: 'Amount' } as Record<string, string>)[c]
        : undefined;
    expect(fileTablesOf(layout, text, FILTERS)).toEqual([
      {
        name: 'My Sales',
        range: { r1: 1, c1: 1, r2: 5, c2: 3 },
        columns: ['Item', 'Amount', 'Column 3'],
        types: { Item: 'dropdown', Amount: 'currency' },
        opts: { Item: [{ v: 'pen' }, { v: 'ink' }] },
        total: true,
      },
    ]);
    expect(fileTablesOf(emptyLayout(rand, 3, 3), () => undefined, FILTERS)).toBeUndefined();
  });
});

describe('LiveDoc’s record of tables', () => {
  it('reads back what it wrote, and refuses what is not one', () => {
    const typed = { ...sales, types: { Item: 'dropdown' as const }, opts: { Item: [{ v: 'a' }] } };
    const text = tableRecordText([typed, { ...sales, name: 'Two', total: true }], {
      D2: '=Sales[@Amount]',
    });
    expect(readTableRecord(text)).toEqual({
      tables: [
        {
          name: 'Sales',
          range: sales.range,
          types: { Item: 'dropdown' },
          opts: { Item: [{ v: 'a' }] },
        },
        { name: 'Two', range: sales.range, total: true },
      ],
      refs: { D2: '=Sales[@Amount]' },
    });
    for (const bad of [
      'nope',
      '[]',
      '{"tables":{}}',
      '{"tables":[{"name":"T","range":"nowhere"}]}',
      '{"tables":[{"name":"T","range":"A1:B3","types":{"X":"colour"}}]}',
      '{"tables":[{"name":"T","range":"A1:B3","opts":{"X":[]}}]}',
      '{"tables":[{"name":"T","range":"A1:B3","total":false}]}',
      '{"tables":[],"refs":{"here":"=1"}}',
      '{"tables":[],"refs":{"A1":1}}',
    ])
      expect(readTableRecord(bad), bad).toBeNull();
  });

  it('is taken while its fingerprint is the standard form’s, its columns the standard form’s', () => {
    const recorded = { ...sales, name: 'Sales', types: { Item: 'text' as const } };
    const record = {
      text: tableRecordText([recorded]),
      fingerprint: tableFingerprint([recorded], held),
    };
    const standard = [{ ...sales, columns: ['Item', 'Amount', 'Note'] }];
    expect(tablesFound({ standard, record, held })).toEqual({
      tables: [{ ...recorded, columns: ['Item', 'Amount', 'Note'] }],
      changed: false,
    });
    // Another app moved the table: the standard form is read, the record dropped and named.
    const moved = [{ ...sales, range: { ...sales.range, r2: 9 } }];
    expect(tablesFound({ standard: moved, record, held })).toEqual({
      tables: moved,
      changed: true,
    });
    expect(tablesFound({ standard: moved, held })).toEqual({ tables: moved, changed: false });
  });

  it('restores the formulas it recorded while each reads as written (ODF)', () => {
    const refs = { E2: '=Sales[@Amount]*2' };
    const lines = { E2: 'E2 of:=[.$B$2]*2' } as Record<string, string>;
    const record = {
      text: tableRecordText([sales], refs),
      fingerprint: tableFingerprint([sales], held, [lines.E2!]),
    };
    const kept = tablesFound({
      standard: [sales],
      record,
      held,
      refLine: (at) => lines[at] ?? null,
    });
    expect(kept).toEqual({ tables: [{ ...sales }], refs, changed: false });
    const edited = tablesFound({ standard: [sales], record, held, refLine: () => 'E2 of:=1' });
    expect(edited).toEqual({ tables: [sales], changed: true });
    const gone = tablesFound({ standard: [sales], record, held, refLine: () => null });
    expect(gone.changed).toBe(true);
  });
});

describe('which of a file’s tables LiveDoc holds', () => {
  const table = (name: string, r1: number, c1: number, r2: number, c2: number) => ({
    name,
    range: { r1, c1, r2, c2 },
    header: true,
    total: false,
  });

  it('holds one with a header and a data row, a free name, overlapping none before it', () => {
    expect(
      heldTables(
        [
          [
            table('Sales', 0, 0, 3, 2),
            table('Over', 2, 2, 5, 4),
            { ...table('Headless', 10, 0, 12, 1), header: false },
            table('Short', 20, 0, 20, 1),
            { ...table('Totalled', 30, 0, 31, 1), total: true },
            table('A1', 40, 0, 42, 1),
            table('Rate', 50, 0, 52, 1),
          ],
          [table('SALES', 0, 0, 3, 1), table('Other', 0, 3, 3, 4)],
        ],
        ['Rate'],
      ),
    ).toEqual([
      [true, false, false, false, false, false, false],
      [false, true],
    ]);
  });

  it('holds 50 a sheet', () => {
    const many = Array.from({ length: 51 }, (_, i) => table(`T${i}x`, i * 3, 0, i * 3 + 1, 0));
    expect(heldTables([many], [])[0]!.filter(Boolean)).toHaveLength(50);
  });
});

describe('a file’s tables made on a sheet’s grid', () => {
  it('makes each, its typed columns by id, and names one the grid cannot hold', () => {
    const layout = emptyLayout(rand, 6, 4);
    const losses: FileLoss[] = [];
    const typed: FileTable = {
      ...sales,
      types: { Amount: 'number', Gone: 'text' },
      opts: { Item: [{ v: 'x' }] },
    };
    const text = (r: string, c: string) =>
      r === layout.rows[0] && c === layout.cols[1] ? 'Amount' : undefined;
    const made = tablesFromFile(
      [typed, { ...sales, name: 'Far', range: { r1: 4, c1: 0, r2: 9, c2: 1 } }],
      layout,
      { sheet: 'Data', rand, losses, text, others: [] },
    )!;
    expect(made).toHaveLength(1);
    expect(made[0]).toMatchObject({
      name: 'Sales',
      r1: layout.rows[0],
      c1: layout.cols[0],
      r2: layout.rows[3],
      c2: layout.cols[2],
      types: { [layout.cols[1]!]: 'number' },
    });
    expect(made[0]!.opts).toBeUndefined();
    expect(losses).toEqual([{ k: 'table_unread', sheet: 'Data', name: 'Far' }]);
  });

  it('names one overlapping another, or of a name another sheet’s table has', () => {
    const layout = emptyLayout(rand, 10, 6);
    const other = laidOut([{ id: 'tbl9', name: 'Taken', at: [0, 0, 2, 1] }]);
    const losses: FileLoss[] = [];
    const made = tablesFromFile(
      [
        sales,
        { ...sales, name: 'Over' },
        { ...sales, name: 'Taken', range: { r1: 5, c1: 0, r2: 7, c2: 1 } },
      ],
      layout,
      { sheet: 'Data', rand, losses, text: () => undefined, others: [other] },
    );
    expect(made?.map((t) => t.name)).toEqual(['Sales']);
    expect(losses.map((l) => l.k === 'table_unread' && l.name)).toEqual(['Over', 'Taken']);
  });
});
