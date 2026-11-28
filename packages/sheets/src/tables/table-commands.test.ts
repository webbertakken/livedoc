// Convert to Table (docs/specs/029-sheets/data-tools.md "Tables"): the range, the name, the guessed types (D441), the
// banding (D442), and each refusal.
import { describe, expect, it } from 'vitest';
import { book } from '../testing/book';
import { applySheetWrite } from '../store';
import { validateWrite } from '../validate';
import { renderFormula } from '../formula/stored';
import { cellKey, type Banding, type Sheet } from '../sheet';
import type { Grid } from '../selection';
import {
  convertToRangeWrites,
  convertToTable,
  TABLE_REFUSAL_COPY,
  TOTAL_ROW_NO_ROOM,
  totalRowWrite,
} from './table-commands';
import type { SheetTable } from './table';

const DATA = {
  A1: 'Item',
  B1: 'Amount',
  C1: 'Share',
  D1: 'Due',
  E1: 'Done',
  F1: 'Mixed',
  G1: 'Empty',
  A2: 'pen',
  B2: '1',
  C2: '10%',
  D2: '1/2/2026',
  E2: 'TRUE',
  F2: '1',
  A3: 'ink',
  B3: '2',
  C3: '20%',
  D3: '2/2/2026',
  E3: 'FALSE',
  F3: 'x',
  B4: '=B2+B3',
  E4: '=1/0',
};

function gridOf(sheet: Sheet): Grid {
  return {
    rows: sheet.layout.rows.length,
    cols: sheet.layout.cols.length,
    hiddenRow: () => false,
    hiddenCol: () => false,
    filled: (r, c) => sheet.cells.has(cellKey(sheet.layout.rows[r]!, sheet.layout.cols[c]!)),
    mergeAt: () => null,
  };
}
const rand = () => 0.25;
const range = (r1: number, c1: number, r2: number, c2: number) => ({ r1, c1, r2, c2 });

describe('convertToTable', () => {
  it('makes the data around one cell a table, its types guessed, with its banding, in one write', () => {
    const b = book(DATA);
    const sheet = b.sheets[0]!;
    const made = convertToTable(b.wb, sheet.id, range(1, 1, 1, 1), gridOf(sheet), rand)!;
    expect(made.ok).toBe(true);
    if (!made.ok) return;
    const t = made.table;
    expect(t).toMatchObject({ name: 'Table1', r1: 's0r0', c1: 's0c0', r2: 's0r3', c2: 's0c6' });
    expect(t.types).toEqual({
      s0c0: 'text',
      s0c1: 'number',
      s0c2: 'percent',
      s0c3: 'date',
      s0c4: 'checkbox',
      s0c5: 'text',
    });
    expect(validateWrite(sheet, made.write).ok).toBe(true);
    const after = applySheetWrite(sheet, made.write, { now: 1, by: sheet.updatedBy }).sheet;
    expect(after.layout.tables).toEqual([t]);
    expect(after.layout.bands).toEqual([
      expect.objectContaining({ id: t.band, r1: 's0r0', r2: 's0r3', c2: 's0c6', header: true }),
    ]);
  });

  it('takes a one-row selection and the row below, and names the next table of the workbook', () => {
    const taken: SheetTable = {
      id: 'tbl001',
      name: 'Table1',
      r1: 's0r20',
      c1: 's0c0',
      r2: 's0r21',
      c2: 's0c0',
    };
    const b = book(DATA, { tables: { 'Sheet 1': [taken] } });
    const sheet = b.sheets[0]!;
    const made = convertToTable(b.wb, sheet.id, range(5, 0, 5, 2), gridOf(sheet), rand)!;
    expect(made.ok && made.table).toMatchObject({
      name: 'Table2',
      r1: 's0r5',
      r2: 's0r6',
      c2: 's0c2',
    });
    expect(made.ok && made.table.types).toBeUndefined();
  });

  it('replaces a banding wholly inside it', () => {
    const b = book(DATA);
    const sheet = b.sheets[0]!;
    const band: Banding = {
      id: 'bnd001',
      r1: 's0r1',
      c1: 's0c0',
      r2: 's0r2',
      c2: 's0c1',
      head: '#000000',
      band1: '#ffffff',
      band2: '#eeeeee',
      foot: '#dddddd',
    };
    const banded = { ...sheet, layout: { ...sheet.layout, bands: [band] } };
    b.wb.updateSheet(banded);
    const made = convertToTable(b.wb, sheet.id, range(0, 0, 3, 2), gridOf(banded), rand)!;
    expect(made.ok).toBe(true);
    if (!made.ok) return;
    expect(validateWrite(banded, made.write).ok).toBe(true);
    const after = applySheetWrite(banded, made.write, { now: 1, by: sheet.updatedBy }).sheet;
    expect(after.layout.bands!.map((x) => x.id)).toEqual([made.table.band]);
  });

  it('refuses another table, a merge, a banding reaching outside, and a full sheet, with their words', () => {
    const b = book(DATA);
    const sheet = b.sheets[0]!;
    const refusal = (layout: Partial<Sheet['layout']>, sel = range(0, 0, 3, 2)) => {
      const s = { ...sheet, layout: { ...sheet.layout, ...layout } };
      b.wb.updateSheet(s);
      const made = convertToTable(b.wb, sheet.id, sel, gridOf(s), rand)!;
      return made.ok ? null : made.reason;
    };
    const other: SheetTable = {
      id: 'tbl001',
      name: 'Other',
      r1: 's0r3',
      c1: 's0c2',
      r2: 's0r5',
      c2: 's0c3',
    };
    expect(refusal({ tables: [other] })).toBe('overlap');
    expect(refusal({ merges: [{ r1: 's0r2', c1: 's0c0', r2: 's0r2', c2: 's0c1' }] })).toBe('merge');
    const wide: Banding = {
      id: 'bnd001',
      r1: 's0r1',
      c1: 's0c0',
      r2: 's0r9',
      c2: 's0c1',
      head: '#000000',
      band1: '#ffffff',
      band2: '#eeeeee',
      foot: '#dddddd',
    };
    expect(refusal({ bands: [wide] })).toBe('banding');
    const many = Array.from({ length: 50 }, (_, i): SheetTable => ({
      ...other,
      id: `tbl${100 + i}`,
      name: `T${i}x`,
      r1: `s0r${20 + i}`,
      r2: `s0r${20 + i}`,
    }));
    expect(refusal({ tables: many })).toBe('full');
    expect(TABLE_REFUSAL_COPY.overlap).toBe("Tables can't overlap");
  });

  it('makes nothing of a sheet it does not know, nor a one-row sheet', () => {
    const b = book(DATA, { rows: 1 });
    const sheet = b.sheets[0]!;
    expect(convertToTable(b.wb, 'nosheet', range(0, 0, 0, 0), gridOf(sheet))).toBeNull();
    expect(convertToTable(b.wb, sheet.id, range(0, 0, 0, 2), gridOf(sheet))).toBeNull();
  });
});

describe('totalRowWrite', () => {
  const T: SheetTable = {
    id: 'tbl001',
    name: 'Sales',
    r1: 's0r0',
    c1: 's0c0',
    r2: 's0r2',
    c2: 's0c2',
    types: { s0c1: 'number', s0c2: 'percent', s0c0: 'text' },
    band: 'bnd001',
  };
  const BAND: Banding = {
    id: 'bnd001',
    r1: 's0r0',
    c1: 's0c0',
    r2: 's0r2',
    c2: 's0c2',
    head: '#000000',
    band1: '#ffffff',
    band2: '#eeeeee',
    foot: '#dddddd',
    header: true,
  };
  const DATA3 = {
    A1: 'Item',
    B1: 'Amount',
    C1: 'Share',
    A2: 'pen',
    B2: '1',
    C2: '10%',
    A3: 'ink',
    B3: '2',
    C3: '20%',
  };
  const withTable = (more: Record<string, string> = {}, table = T) => {
    const b = book({ ...DATA3, ...more }, { tables: { 'Sheet 1': [table] } });
    const sheet = { ...b.sheets[0]!, layout: { ...b.sheets[0]!.layout, bands: [BAND] } };
    b.wb.updateSheet(sheet);
    return { b, sheet };
  };

  it('adds the row below as the total row, Total and SUBTOTAL under each number column, and takes it off again', () => {
    const { b, sheet } = withTable();
    const on = totalRowWrite(b.wb, sheet.id, 'tbl001', true)!;
    expect(on.ok).toBe(true);
    if (!on.ok) return;
    expect(validateWrite(sheet, on.write).ok).toBe(true);
    const after = applySheetWrite(sheet, on.write, { now: 1, by: sheet.updatedBy }).sheet;
    expect(after.layout.tables).toEqual([{ ...T, r2: 's0r3', total: true }]);
    expect(after.layout.bands).toEqual([{ ...BAND, r2: 's0r3', footer: true }]);
    b.wb.updateSheet(after);
    expect([b.v('A4'), b.v('B4'), b.v('C4')]).toEqual(['Total', 3, expect.closeTo(0.3)]);
    const off = totalRowWrite(b.wb, sheet.id, 'tbl001', false)!;
    expect(off.ok).toBe(true);
    if (!off.ok) return;
    const back = applySheetWrite(after, off.write, { now: 2, by: sheet.updatedBy }).sheet;
    expect(back.layout.tables).toEqual([{ ...T, r2: 's0r3' }]);
    expect(back.layout.bands).toEqual([{ ...BAND, r2: 's0r3' }]);
  });

  it('refuses a row below that holds something, and asks nothing of a switch already set or a table gone', () => {
    const { b, sheet } = withTable({ B4: '9' });
    expect(totalRowWrite(b.wb, sheet.id, 'tbl001', true)).toEqual({
      ok: false,
      reason: TOTAL_ROW_NO_ROOM,
    });
    expect(totalRowWrite(b.wb, sheet.id, 'tbl001', false)).toBeNull();
    expect(totalRowWrite(b.wb, sheet.id, 'nope01', true)).toBeNull();
    const last = withTable({}, { ...T, r1: 's0r28', r2: 's0r29', band: undefined });
    expect(totalRowWrite(last.b.wb, last.sheet.id, 'tbl001', true)).toEqual({
      ok: false,
      reason: TOTAL_ROW_NO_ROOM,
    });
  });

  it('turns off a total row of a table without a banding', () => {
    const { b, sheet } = withTable({}, { ...T, r2: 's0r3', total: true, band: undefined });
    const off = totalRowWrite(b.wb, sheet.id, 'tbl001', false)!;
    expect(off.ok && off.write).toEqual({
      kind: 'layout',
      changes: [{ k: 'table', id: 'tbl001', table: { ...T, r2: 's0r3', band: undefined } }],
    });
  });
});

describe('convertToRangeWrites', () => {
  const T: SheetTable = {
    id: 'tbl001',
    name: 'Sales',
    r1: 's0r0',
    c1: 's0c0',
    r2: 's0r2',
    c2: 's0c1',
  };
  const DATA2 = { A1: 'Item', B1: 'Amount', A2: 'pen', B2: '1', A3: 'ink', B3: '2' };

  it('takes the table away and leaves every formula reading it reading the same cells, on every sheet', () => {
    const b = book(
      {
        Data: { ...DATA2, C2: '=Sales[@Amount]*2', D1: '=SUM(Sales[Amount])', D2: '=A1' },
        Report: { A1: '=ROWS(Sales[#ALL])', A2: '=1' },
      },
      { tables: { Data: [T] } },
    );
    const writes = convertToRangeWrites(b.wb, 'sheet0xx', 'tbl001')!;
    expect(writes.map((w) => w.sheetId)).toEqual(['sheet0xx', 'sheet1xx']);
    for (const { sheetId, write } of writes) {
      const sheet = b.sheets.find((s) => s.id === sheetId)!;
      expect(validateWrite(sheet, write).ok).toBe(true);
      const next = applySheetWrite(sheet, write, { now: 1, by: sheet.updatedBy }).sheet;
      b.sheets[b.sheets.indexOf(sheet)] = next;
      b.wb.updateSheet(next);
    }
    expect(b.sheets[0]!.layout.tables).toBeUndefined();
    const text = (title: string, a1: string) => {
      const sheet = b.sheets.find((s) => s.title === title)!;
      const { r, c } = { r: Number(a1.slice(1)) - 1, c: a1.charCodeAt(0) - 65 };
      const input = sheet.cells.get(cellKey(sheet.layout.rows[r]!, sheet.layout.cols[c]!))!
        .input as { f: never };
      return renderFormula(input.f, b.wb.ctxFor(sheet.id));
    };
    expect(text('Data', 'C2')).toBe('=$B$2*2');
    expect(text('Data', 'D1')).toBe('=SUM($B$2:$B$3)');
    expect(text('Report', 'A1')).toBe('=ROWS(Data!$A$1:$B$3)');
    expect([b.v('D1', 'Data'), b.v('A1', 'Report'), b.v('C2', 'Data')]).toEqual([3, 3, 2]);
  });

  it('removes the group by views of the table in the same step (D499)', () => {
    const view = {
      id: 'view01',
      title: 'Group 1',
      r1: 's0r0',
      c1: 's0c0',
      r2: 's0r2',
      c2: 's0c1',
      conds: {},
      group: { t: 'tbl001', c: 's0c0' },
    };
    const b = book({ Data: DATA2 }, { tables: { Data: [T] } });
    b.sheets[0]!.layout = {
      ...b.sheets[0]!.layout,
      filterViews: [view, { ...view, id: 'view02', group: undefined }],
    };
    const [home] = convertToRangeWrites(b.wb, 'sheet0xx', 'tbl001')!;
    expect(home!.write.kind === 'layout' && home!.write.changes).toEqual([
      { k: 'table', id: 'tbl001', table: null },
      { k: 'fview', id: 'view01', view: null },
    ]);
  });

  it('makes nothing of a table it does not know', () => {
    const b = book(DATA2);
    expect(convertToRangeWrites(b.wb, b.sheets[0]!.id, 'tbl001')).toBeNull();
    expect(convertToRangeWrites(b.wb, 'nosheet', 'tbl001')).toBeNull();
  });
});
