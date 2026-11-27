// Tables as writes change them (docs/specs/029-sheets/data-tools.md "Tables"): names, shapes, deletions, growth and
// its undo in one step.
import { describe, expect, it } from 'vitest';
import { cellKey, emptySheet, type Banding, type SheetLayout } from '../sheet';
import { applySheetWrite, inverseSheetWrite, type SheetWrite } from '../store';
import { validateSheetCreate, validateWrite } from '../validate';
import { gridLayout } from '../testing/book';
import {
  isSheetTable,
  nextTableName,
  tableAt,
  tableColumnNames,
  tableNameProblem,
  tableOverlaps,
  TABLE_NAME_TAKEN,
  type SheetTable,
} from './table';
import { isParticipantTableWrite, tableGrowth, withTableGrowth } from './table-store';

const T: SheetTable = {
  id: 'tbl001',
  name: 'Sales',
  r1: 's0r0',
  c1: 's0c0',
  r2: 's0r3',
  c2: 's0c2',
  band: 'bnd001',
};
const BAND: Banding = {
  id: 'bnd001',
  r1: 's0r0',
  c1: 's0c0',
  r2: 's0r3',
  c2: 's0c2',
  head: '#bdbdbd',
  band1: '#ffffff',
  band2: '#f3f3f3',
  foot: '#dedede',
  header: true,
};
const layout = (more: Partial<SheetLayout> = {}): SheetLayout => ({
  ...gridLayout('s0', 10, 6),
  tables: [T],
  bands: [BAND],
  ...more,
});
const sheetOf = (l: SheetLayout) =>
  emptySheet({ id: 'sheet0xx', tabId: 'tab', title: 'Sheet 1', layout: l });
const by = { id: '', name: '', color: '#000000' };
const apply = (l: SheetLayout, write: SheetWrite) =>
  applySheetWrite(sheetOf(l), write, { now: 1, by });

describe('a table name', () => {
  it("follows Google's rules, unique with named ranges, a space read as an underscore", () => {
    const l = layout({
      names: [{ name: 'Rates', r1: 's0r5', c1: 's0c0', r2: 's0r5', c2: 's0c0' }],
    });
    expect(tableNameProblem('Project roadmap', l)).toBeNull();
    expect(tableNameProblem('Q3_Sales', l)).toBeNull();
    expect(tableNameProblem('3D', l)).toMatch(/start with a letter/);
    expect(tableNameProblem('a-b', l)).toMatch(/start with a letter/);
    expect(tableNameProblem('x'.repeat(256), l)).toMatch(/start with a letter/);
    expect(tableNameProblem('', l)).toMatch(/start with a letter/);
    expect(tableNameProblem('true', l)).toMatch(/TRUE and FALSE/);
    expect(tableNameProblem('AB12', l)).toMatch(/cell reference/);
    expect(tableNameProblem('R1C1', l)).toMatch(/cell reference/);
    expect(tableNameProblem('sales', l)).toBe(TABLE_NAME_TAKEN);
    expect(tableNameProblem('Sales', l, { except: 'tbl001' })).toBeNull();
    expect(tableNameProblem('rates', l)).toBe(TABLE_NAME_TAKEN);
    const other = { ...gridLayout('s1', 3, 3), tables: [{ ...T, id: 'tbl002', name: 'My table' }] };
    expect(tableNameProblem('My_Table', gridLayout('s0'), { others: [other] })).toBe(
      TABLE_NAME_TAKEN,
    );
  });

  it('is the first free TableN of the workbook', () => {
    const one = { ...gridLayout('s0'), tables: [{ ...T, name: 'Table1' }] };
    const two = {
      ...gridLayout('s1'),
      names: [{ name: 'table2', r1: 's1r0', c1: 's1c0', r2: 's1r0', c2: 's1c0' }],
    };
    expect(nextTableName([gridLayout('s0')])).toBe('Table1');
    expect(nextTableName([one, two])).toBe('Table3');
  });
});

describe('a table', () => {
  it('names its columns by their headers, blanks and repeats as Excel does', () => {
    const text = (_r: string, c: string) => ({ s0c0: 'Item', s0c1: ' item ', s0c2: undefined })[c];
    expect(tableColumnNames(layout(), T, text)).toEqual(['Item', 'item2', 'Column 3']);
    expect(tableColumnNames(gridLayout('zz'), T, text)).toEqual([]);
  });

  it('is found by a cell inside it', () => {
    expect(tableAt(layout(), 3, 2)).toBe(T);
    expect(tableAt(layout(), 4, 2)).toBeNull();
    expect(tableAt(layout(), 0, 3)).toBeNull();
    expect(tableAt(gridLayout('s0'), 0, 0)).toBeNull();
  });

  it('is well made only with a header and a data row, known columns, types and options', () => {
    const l = gridLayout('s0', 10, 6);
    expect(isSheetTable(T, 'tbl001', l)).toBe(true);
    const typed = {
      ...T,
      types: { s0c1: 'number', s0c2: 'dropdown' },
      opts: { s0c2: [{ v: 'a' }] },
      total: true,
    };
    expect(isSheetTable(typed, 'tbl001', l)).toBe(true);
    for (const bad of [
      null,
      { ...T, id: 'other1' },
      { ...T, extra: 1 },
      { ...T, name: '1x' },
      { ...T, r2: 's0r0' },
      { ...T, r2: 's0r1', total: true },
      { ...T, r2: 'gone01' },
      { ...T, c2: 'gone01' },
      { ...T, types: { s0c5: 'text' } },
      { ...T, types: { s0c1: 'people' } },
      { ...T, types: [] },
      { ...T, opts: { s0c1: [{ v: 'a' }] } },
      { ...T, types: { s0c1: 'dropdown' }, opts: { s0c1: [] } },
      { ...T, opts: [] },
      { ...T, total: false },
      { ...T, band: 'NO' },
    ])
      expect(isSheetTable(bad, 'tbl001', l), JSON.stringify(bad)).toBe(false);
  });

  it('never overlaps another', () => {
    const l = layout();
    expect(tableOverlaps(l, { ...T, id: 'tbl002' })).toBe(true);
    expect(tableOverlaps(l, { ...T, id: 'tbl002', r1: 's0r4', r2: 's0r6' })).toBe(false);
    expect(tableOverlaps(l, T)).toBe(false);
  });
});

describe('a table write', () => {
  it('sets, replaces and removes a table, one undo step each', () => {
    const l = gridLayout('s0', 10, 6);
    const made = apply(l, { kind: 'layout', changes: [{ k: 'table', id: 'tbl001', table: T }] });
    expect(made.sheet.layout.tables).toEqual([T]);
    const renamed = applySheetWrite(
      made.sheet,
      { kind: 'layout', changes: [{ k: 'table', id: 'tbl001', table: { ...T, name: 'Q3' } }] },
      { now: 2, by },
    );
    expect(renamed.sheet.layout.tables).toEqual([{ ...T, name: 'Q3' }]);
    const undo = inverseSheetWrite(made.sheet, renamed);
    expect(applySheetWrite(renamed.sheet, undo, { now: 3, by }).sheet.layout.tables).toEqual([T]);
    const gone = applySheetWrite(
      made.sheet,
      { kind: 'layout', changes: [{ k: 'table', id: 'tbl001', table: null }] },
      { now: 2, by },
    );
    expect(gone.sheet.layout.tables).toBeUndefined();
  });

  it('is checked by the room: shape, overlap and the most a sheet holds', () => {
    const sheet = sheetOf(layout());
    const ok = (write: SheetWrite) => validateWrite(sheet, write).ok;
    const put = (table: unknown, id = 'tbl002') => ({
      kind: 'layout' as const,
      changes: [{ k: 'table' as const, id, table: table as SheetTable }],
    });
    expect(ok(put({ ...T, id: 'tbl002', name: 'Other', r1: 's0r5', r2: 's0r7' }))).toBe(true);
    expect(ok(put({ ...T, id: 'tbl002', name: 'Other' }))).toBe(false);
    expect(ok(put({ ...T, id: 'tbl002', name: 'Sales', r1: 's0r5', r2: 's0r7' }))).toBe(false);
    expect(ok(put(null, 'tbl001'))).toBe(true);
    expect(ok(put(null, 'NOPE'))).toBe(false);
    const full = sheetOf({
      ...gridLayout('s0', 200, 6),
      tables: Array.from({ length: 50 }, (_, i) => ({
        ...T,
        id: `tbl${100 + i}`,
        name: `T${i}x`,
        r1: `s0r${i * 3}`,
        r2: `s0r${i * 3 + 1}`,
        band: undefined,
      })),
    });
    expect(
      validateWrite(full, put({ ...T, id: 'tbl999', name: 'More', r1: 's0r160', r2: 's0r161' })).ok,
    ).toBe(false);
  });
});

describe('a sheet made with tables (a copy, a seed)', () => {
  it('holds them to what a write may set', () => {
    const ok = (tables: unknown) =>
      validateSheetCreate(sheetOf({ ...gridLayout('s0', 10, 6), tables } as SheetLayout)).ok;
    const other = { ...T, id: 'tbl002', name: 'Other', r1: 's0r5', r2: 's0r7' };
    expect(ok([T, other])).toBe(true);
    expect(ok([T, { ...other, r1: 's0r2' }])).toBe(false);
    expect(ok([T, { ...other, name: 'sales' }])).toBe(false);
    expect(ok({})).toBe(false);
    expect(ok(Array.from({ length: 51 }, () => T))).toBe(false);
  });
});

describe('deleting rows and columns', () => {
  const del = (l: SheetLayout, k: 'deleteRows' | 'deleteCols', ids: string[]) =>
    apply(l, { kind: 'layout', changes: [{ k, ids }] });

  it('shrinks a table, its columns types going with them, and undo puts it back', () => {
    const typed = {
      ...T,
      types: { s0c1: 'number' as const, s0c2: 'dropdown' as const },
      opts: { s0c2: [{ v: 'a' }] },
    };
    const l = layout({ tables: [typed] });
    const rows = del(l, 'deleteRows', ['s0r2']);
    expect(rows.sheet.layout.tables).toEqual([{ ...typed, r2: 's0r3' }]);
    const cols = del(l, 'deleteCols', ['s0c2']);
    expect(cols.sheet.layout.tables).toEqual([{ ...T, c2: 's0c1', types: { s0c1: 'number' } }]);
    const undo = inverseSheetWrite(sheetOf(l), cols);
    expect(applySheetWrite(cols.sheet, undo, { now: 2, by }).sheet.layout.tables).toEqual([typed]);
  });

  it('takes a table away with its header row or every data row', () => {
    expect(del(layout(), 'deleteRows', ['s0r0']).sheet.layout.tables).toBeUndefined();
    expect(
      del(layout(), 'deleteRows', ['s0r1', 's0r2', 's0r3']).sheet.layout.tables,
    ).toBeUndefined();
    expect(
      del(layout(), 'deleteCols', ['s0c0', 's0c1', 's0c2']).sheet.layout.tables,
    ).toBeUndefined();
    const withTotal = { ...T, total: true as const };
    expect(
      del(layout({ tables: [withTotal] }), 'deleteRows', ['s0r1', 's0r2']).sheet.layout.tables,
    ).toBeUndefined();
  });

  it('leaves a table without its total row when that row goes', () => {
    const withTotal = { ...T, total: true as const };
    const after = del(layout({ tables: [withTotal] }), 'deleteRows', ['s0r3']);
    const { total: _t, ...rest } = withTotal;
    expect(after.sheet.layout.tables).toEqual([{ ...rest, r2: 's0r2' }]);
  });
});

describe('growth', () => {
  const below = (c = 's0c1', i: unknown = { s: 'new' }) => [{ r: 's0r4', c, i }] as never;

  it('grows a table and its banding by the row below, when a value lands there inside its columns', () => {
    expect(tableGrowth(layout(), below())).toEqual([
      { k: 'table', id: 'tbl001', table: { ...T, r2: 's0r4' } },
      { k: 'band', id: 'bnd001', band: { ...BAND, r2: 's0r4' } },
    ]);
    expect(tableGrowth(layout({ bands: undefined }), below())).toEqual([
      { k: 'table', id: 'tbl001', table: { ...T, r2: 's0r4' } },
    ]);
  });

  it('grows nothing for a clear, a format, a cell beside it or further down, or a table with a total row', () => {
    expect(tableGrowth(layout(), below('s0c1', null))).toEqual([]);
    expect(tableGrowth(layout(), [{ r: 's0r4', c: 's0c1', f: { b: true } }])).toEqual([]);
    expect(tableGrowth(layout(), below('s0c3'))).toEqual([]);
    expect(tableGrowth(layout(), [{ r: 's0r5', c: 's0c1', i: { n: 1 } }])).toEqual([]);
    expect(tableGrowth(layout({ tables: [{ ...T, total: true }] }), below())).toEqual([]);
    expect(tableGrowth(gridLayout('s0'), below())).toEqual([]);
    expect(
      tableGrowth(layout({ tables: [{ ...T, r2: 's0r9', r1: 's0r7' }] }), [
        { r: 's0r9', c: 's0c0', i: { n: 1 } },
      ]),
    ).toEqual([]);
  });

  it('never swallows a protected range or another table below', () => {
    const guarded = layout({
      protections: [
        { id: 'prt001', can: 'editors', range: { r1: 's0r4', c1: 's0c2', r2: 's0r6', c2: 's0c4' } },
      ],
    });
    expect(tableGrowth(guarded, below())).toEqual([]);
    const sheetWide = layout({ protections: [{ id: 'prt001', can: 'editors' }] });
    expect(tableGrowth(sheetWide, below())).toHaveLength(2);
    const next = {
      ...T,
      id: 'tbl002',
      name: 'Next',
      r1: 's0r4',
      r2: 's0r6',
      c1: 's0c2',
      c2: 's0c4',
      band: undefined,
    };
    expect(tableGrowth(layout({ tables: [T, next] }), below())).toEqual([]);
  });

  it('is one write with the value, so one undo takes both back', () => {
    const l = layout();
    const write = withTableGrowth(l, { kind: 'cells', cells: below() });
    expect(write).toMatchObject({ kind: 'layout', cells: below() });
    const done = apply(l, write);
    expect(done.sheet.layout.tables![0]!.r2).toBe('s0r4');
    expect(done.sheet.cells.get(cellKey('s0r4', 's0c1'))).toEqual({ input: { s: 'new' } });
    const undone = applySheetWrite(done.sheet, inverseSheetWrite(sheetOf(l), done), { now: 2, by });
    expect(undone.sheet.layout.tables).toEqual([T]);
    expect(undone.sheet.layout.bands).toEqual([BAND]);
    expect(undone.sheet.cells.get(cellKey('s0r4', 's0c1'))).toBeUndefined();
  });

  it('joins a layout write, and leaves writes that grow nothing as they are', () => {
    const l = layout();
    const sized = {
      kind: 'layout' as const,
      changes: [{ k: 'freeze' as const, rows: 1 }],
      cells: below(),
    };
    expect(withTableGrowth(l, sized)).toMatchObject({
      changes: [{ k: 'freeze' }, { k: 'table' }, { k: 'band' }],
    });
    const plain = { kind: 'cells' as const, cells: below('s0c4') };
    expect(withTableGrowth(l, plain)).toBe(plain);
    const title = { kind: 'title' as const, title: 'x' };
    expect(withTableGrowth(l, title)).toBe(title);
    const noCells = { kind: 'layout' as const, changes: [] };
    expect(withTableGrowth(l, noCells)).toBe(noCells);
  });
});

describe("a Participant's table write (D388)", () => {
  const value = { r: 's0r4', c: 's0c1', i: { s: 'new' } };
  const grown = { ...T, r2: 's0r4' };
  const bandGrown = { ...BAND, r2: 's0r4' };
  const write = (changes: unknown[], cells: unknown[] = [value]) =>
    ({ kind: 'layout', changes, cells }) as SheetWrite;

  it('is exactly the growth its own value makes, its keys in any order', () => {
    const reordered = Object.fromEntries(Object.entries(grown).reverse());
    expect(
      isParticipantTableWrite(
        layout(),
        write([
          { k: 'band', id: 'bnd001', band: bandGrown },
          { table: reordered, id: 'tbl001', k: 'table' },
        ]),
        false,
      ),
    ).toBe(true);
  });

  it('refuses anything more or other: two rows, a rename, a type, a total row, a column, or a part left out', () => {
    const l = layout();
    const band = { k: 'band', id: 'bnd001', band: bandGrown };
    for (const changes of [
      [{ k: 'table', id: 'tbl001', table: { ...T, r2: 's0r5' } }, band],
      [{ k: 'table', id: 'tbl001', table: { ...grown, name: 'Mine' } }, band],
      [{ k: 'table', id: 'tbl001', table: { ...grown, types: { s0c1: 'text' } } }, band],
      [{ k: 'table', id: 'tbl001', table: { ...grown, total: true } }, band],
      [{ k: 'table', id: 'tbl001', table: { ...grown, c2: 's0c3' } }, band],
      [{ k: 'table', id: 'tbl001', table: grown }],
      [{ k: 'table', id: 'tbl001', table: grown }, band, { k: 'freeze', rows: 1 }],
    ])
      expect(isParticipantTableWrite(l, write(changes), false), JSON.stringify(changes)).toBe(
        false,
      );
    expect(isParticipantTableWrite(l, write([]), false)).toBe(false);
    expect(isParticipantTableWrite(l, { kind: 'cells', cells: [value] }, false)).toBe(false);
    expect(isParticipantTableWrite(l, { kind: 'layout', changes: 'x' } as never, false)).toBe(
      false,
    );
  });

  it('never grows into a protected range below', () => {
    const guarded = layout({
      protections: [
        { id: 'prt001', can: 'editors', range: { r1: 's0r4', c1: 's0c2', r2: 's0r4', c2: 's0c2' } },
      ],
    });
    const changes = [
      { k: 'table', id: 'tbl001', table: grown },
      { k: 'band', id: 'bnd001', band: bandGrown },
    ];
    expect(isParticipantTableWrite(guarded, write(changes), false)).toBe(false);
  });

  it('takes a growth back only as an undo clearing a value in the row it gives up', () => {
    const l = layout({ tables: [grown], bands: [bandGrown] });
    const back = [
      { k: 'table', id: 'tbl001', table: T },
      { k: 'band', id: 'bnd001', band: BAND },
    ];
    const cleared = [{ r: 's0r4', c: 's0c1', i: null }];
    expect(isParticipantTableWrite(l, write(back, cleared), true)).toBe(true);
    expect(isParticipantTableWrite(l, write(back, cleared), false)).toBe(false);
    expect(isParticipantTableWrite(l, write(back, [{ r: 's0r4', c: 's0c4', i: null }]), true)).toBe(
      false,
    );
    expect(isParticipantTableWrite(l, write(back, [{ r: 's0r3', c: 's0c1', i: null }]), true)).toBe(
      false,
    );
    const short = layout({ tables: [{ ...T, r2: 's0r1' }], bands: undefined });
    expect(
      isParticipantTableWrite(
        short,
        write(
          [{ k: 'table', id: 'tbl001', table: { ...T, r2: 's0r0' } }],
          [{ r: 's0r1', c: 's0c1', i: null }],
        ),
        true,
      ),
    ).toBe(false);
    const totalled = layout({ tables: [{ ...grown, total: true }], bands: undefined });
    expect(
      isParticipantTableWrite(
        totalled,
        write([{ k: 'table', id: 'tbl001', table: { ...T, total: true } }], cleared),
        true,
      ),
    ).toBe(false);
    const unbanded = layout({ tables: [{ ...grown, band: undefined }], bands: undefined });
    const { band: _b, ...plain } = T;
    expect(
      isParticipantTableWrite(
        unbanded,
        write([{ k: 'table', id: 'tbl001', table: { ...plain, band: undefined } }], cleared),
        true,
      ),
    ).toBe(true);
  });
});
