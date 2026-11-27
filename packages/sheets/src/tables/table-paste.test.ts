// Tables in a paste (docs/specs/029-sheets/data-tools.md "Tables", D454): a copy holding a table's header row makes
// the next `TableN`, as Google's copyPaste did (plans/assets/0020/research/google-table-paste-probe.ts); a cut of a
// whole table moves it, its formulas still reading it (the Director's ruling); a cut of part of one is cells only.
import { describe, expect, it } from 'vitest';
import { book } from '../testing/book';
import { applySheetWrite, type SheetWrite } from '../store';
import { clipFromRange } from '../clipboard';
import { pasteWithRules } from '../paste-layout';
import { posRangeOf } from '../layout';
import type { Banding } from '../sheet';
import type { SheetTable } from './table';

const ctx = { now: 1, by: { id: '', name: '', color: '#000000' } };

// Sales over A1:B4 (Item, Amount), Amount typed Currency, banded; a total of its Amounts in D1, beside it.
const SALES: SheetTable = {
  id: 'tbl001',
  name: 'Sales',
  r1: 's0r0',
  c1: 's0c0',
  r2: 's0r3',
  c2: 's0c1',
  types: { s0c1: 'currency' },
  band: 'bnd001',
};
const BAND: Banding = {
  id: 'bnd001',
  r1: 's0r0',
  c1: 's0c0',
  r2: 's0r3',
  c2: 's0c1',
  head: '#356854',
  band1: '#ffffff',
  band2: '#f6f8f9',
  foot: '#dedede',
  header: true,
};

function setup() {
  const b = book(
    {
      One: {
        A1: 'Item',
        B1: 'Amount',
        A2: 'pen',
        B2: '3',
        A3: 'ink',
        B3: '1',
        A4: 'cap',
        B4: '2',
        D1: '=SUM(Sales[Amount])',
      },
      Two: { A1: 'x' },
    },
    { rows: 20, cols: 10, tables: { One: [SALES] } },
  );
  const one = b.sheets[0]!;
  b.sheets[0] = { ...one, layout: { ...one.layout, bands: [BAND] } };
  b.wb.updateSheet(b.sheets[0]);
  const [oneId, twoId] = b.sheets.map((s) => s.id) as [string, string];
  const apply = (edits: readonly { sheetId: string; write: SheetWrite }[]) => {
    for (const e of edits) {
      const i = b.sheets.findIndex((s) => s.id === e.sheetId);
      const r = applySheetWrite(b.sheets[i]!, e.write, ctx);
      b.sheets[i] = r.sheet;
      b.wb.updateSheet(r.sheet, e.write.kind === 'cells' ? r.touched : undefined);
    }
  };
  const paste = (
    from: { r1: number; c1: number; r2: number; c2: number },
    to: { r: number; c: number },
    opts: { cut?: boolean; toSheet?: string } = {},
  ) => {
    const clip = clipFromRange(b.wb, oneId, from, opts.cut)!;
    const sheetId = opts.toSheet ?? oneId;
    const done = pasteWithRules(b.wb, sheetId, { r1: to.r, c1: to.c, r2: to.r, c2: to.c }, clip)!;
    apply(done.edits);
    return done;
  };
  const tables = (sheet = 0) =>
    (b.sheets[sheet]!.layout.tables ?? []).map((t) => ({
      name: t.name,
      id: t.id,
      at: posRangeOf(b.sheets[sheet]!.layout, t),
      types: Object.values(t.types ?? {}),
      banded: !!t.band && (b.sheets[sheet]!.layout.bands ?? []).some((x) => x.id === t.band),
    }));
  return { b, oneId, twoId, paste, tables };
}

const box = (r1: number, c1: number, r2: number, c2: number) => ({ r1, c1, r2, c2 });

describe('a pasted copy of a table', () => {
  it('makes the next TableN over the whole table, its types and banding kept', () => {
    const t = setup();
    const done = t.paste(box(0, 0, 3, 1), { r: 0, c: 4 });
    expect(done.tablesRefused).toEqual([]);
    expect(t.tables()).toEqual([
      { name: 'Sales', id: 'tbl001', at: box(0, 0, 3, 1), types: ['currency'], banded: true },
      {
        name: 'Table1',
        id: expect.any(String),
        at: box(0, 4, 3, 5),
        types: ['currency'],
        banded: true,
      },
    ]);
  });

  it('makes one over the part copied when the copy holds the header row, none for data rows alone', () => {
    const t = setup();
    t.paste(box(0, 0, 1, 1), { r: 8, c: 0 });
    t.paste(box(0, 0, 3, 2), { r: 8, c: 4 });
    t.paste(box(1, 0, 2, 1), { r: 14, c: 0 });
    expect(t.tables().map((x) => [x.name, x.at])).toEqual([
      ['Sales', box(0, 0, 3, 1)],
      ['Table1', box(8, 0, 9, 1)],
      ['Table2', box(8, 4, 11, 5)],
    ]);
  });

  it('makes none where it would meet a table or start in the row below one, the cells still pasted', () => {
    const t = setup();
    expect(t.paste(box(0, 0, 3, 1), { r: 4, c: 0 }).tablesRefused).toEqual(['overlap']);
    expect(t.paste(box(0, 0, 3, 1), { r: 1, c: 1 }).tablesRefused).toEqual(['overlap']);
    expect(t.tables().map((x) => x.name)).toEqual(['Sales']);
    expect(t.b.v('A5', 'One')).toBe('Item');
  });

  it('makes one on another sheet', () => {
    const t = setup();
    t.paste(box(0, 0, 3, 1), { r: 2, c: 2 }, { toSheet: t.twoId });
    expect(t.tables(1).map((x) => [x.name, x.at])).toEqual([['Table1', box(2, 2, 5, 3)]]);
  });
});

describe('a cut of a table (D454, the Director’s ruling)', () => {
  it('moves a whole table on its sheet, its formulas still reading it', () => {
    const t = setup();
    const done = t.paste(box(0, 0, 3, 1), { r: 6, c: 4 }, { cut: true });
    expect(done.tablesRefused).toEqual([]);
    expect(t.tables()).toEqual([
      { name: 'Sales', id: 'tbl001', at: box(6, 4, 9, 5), types: ['currency'], banded: true },
    ]);
    expect(t.b.sheets[0]!.layout.bands?.map((x) => posRangeOf(t.b.sheets[0]!.layout, x))).toEqual([
      box(6, 4, 9, 5),
    ]);
    expect(t.b.v('D1', 'One')).toBe(6);
  });

  it('moves a whole table to another sheet, formulas left behind reading it there', () => {
    const t = setup();
    t.paste(box(0, 0, 3, 1), { r: 2, c: 2 }, { cut: true, toSheet: t.twoId });
    expect(t.tables(0)).toEqual([]);
    expect(t.b.sheets[0]!.layout.bands ?? []).toEqual([]);
    expect(t.tables(1)).toEqual([
      { name: 'Sales', id: 'tbl001', at: box(2, 2, 5, 3), types: ['currency'], banded: true },
    ]);
    expect(t.b.v('D1', 'One')).toBe(6);
  });

  it('moves cells only when it holds part of a table', () => {
    const t = setup();
    t.paste(box(0, 0, 1, 1), { r: 10, c: 0 }, { cut: true });
    expect(t.tables().map((x) => [x.name, x.at])).toEqual([['Sales', box(0, 0, 3, 1)]]);
  });

  it('leaves a table where it was when it cannot land, its cells still moved', () => {
    const t = setup();
    const done = t.paste(box(0, 0, 3, 1), { r: 1, c: 1 }, { cut: true });
    expect(done.tablesRefused).toEqual([]);
    // Onto itself: the table is set aside, so it moves.
    expect(t.tables()[0]!.at).toEqual(box(1, 1, 4, 2));
  });
});
