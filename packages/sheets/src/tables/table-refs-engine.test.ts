// Table references as formulas read them (docs/specs/029-sheets/formulas.md "Table references"): the cells they
// cover, this row, names case aside, stored by id so renames rewrite the text, and growth read at once.
import { describe, expect, it } from 'vitest';
import { book } from '../testing/book';
import { cellKey, type Sheet, type StoredFormula } from '../sheet';
import { readsUnknownTable, renderFormula, shiftForCopy } from '../formula/stored';
import { readTypedInput } from '../typed-input';
import type { SheetTable } from './table';

// Sales over A1:D5: Item, Amount, Unit price, Total (this row's Amount times Unit price); data rows 2 to 5.
const SALES: SheetTable = {
  id: 'tbl001',
  name: 'Sales',
  r1: 's0r0',
  c1: 's0c0',
  r2: 's0r4',
  c2: 's0c3',
};
const DATA = {
  A1: 'Item',
  B1: 'Amount',
  C1: 'Unit price',
  D1: 'Total',
  A2: 'pen',
  B2: '1',
  C2: '10',
  A3: 'ink',
  B3: '2',
  C3: '20',
  A4: 'pad',
  B4: '3',
  C4: '30',
  A5: 'cap',
  B5: '4',
  C5: '40',
  D2: '=[@Amount]*[@[Unit price]]',
  D3: '=Sales[@Amount]*Sales[[#This Row],[Unit price]]',
};
// The stored formula a cell holds.
function formulaAt(sheet: Sheet, r: string, c: string): StoredFormula {
  const input = sheet.cells.get(cellKey(r, c))?.input;
  if (!input || !('f' in input)) throw new Error(`${r}:${c} holds no formula`);
  return input.f;
}
const YEARS: SheetTable = {
  id: 'tbl002',
  name: 'Years',
  r1: 's0r0',
  c1: 's0c0',
  r2: 's0r1',
  c2: 's0c2',
};
const make = (more: Record<string, string> = {}, tables: SheetTable[] = [SALES]) =>
  book({ ...DATA, ...more }, { tables: { 'Sheet 1': tables } });
const v = (formula: string, tables?: SheetTable[]) => make({ J20: formula }, tables).v('J20');

describe('a table reference', () => {
  it('reads a column, the data, and the parts', () => {
    expect(v('=SUM(Sales[Amount])')).toBe(10);
    expect(v('=ROWS(Sales)')).toBe(4);
    expect(v('=COLUMNS(Sales[#DATA])')).toBe(4);
    expect(v('=ROWS(Sales[#ALL])')).toBe(5);
    expect(v('=INDEX(Sales[#HEADERS], 1, 3)')).toBe('Unit price');
    expect(v('=ROWS(Sales[[#HEADERS],[#DATA]])')).toBe(5);
    expect(v('=SUM(Sales[[Amount]:[Unit price]])')).toBe(110);
    expect(v('=COUNTA(Sales[[#ALL],[Item]])')).toBe(5);
  });

  it('is not case sensitive', () => {
    expect(v('=SUM(sales[AMOUNT])')).toBe(10);
  });

  it("reads this row: the column's cell on the formula's own row", () => {
    const b = make({ F2: '=Sales[@Amount]', F1: '=Sales[@Amount]', F7: '=Sales[@Amount]' });
    expect(b.v('D2')).toBe(10);
    expect(b.v('D3')).toBe(40);
    expect(b.v('F2')).toBe(1);
    expect(b.v('F1')).toMatchObject({ e: '#VALUE!' });
    expect(b.v('F7')).toMatchObject({ e: '#VALUE!' });
  });

  it('reads the total row only when there is one', () => {
    expect(v('=SUM(Sales[#TOTALS])')).toMatchObject({ e: '#REF!' });
    expect(v('=ROWS(Sales[[#DATA],[#TOTALS]])')).toBe(4);
    const withTotal = { ...SALES, r2: 's0r5', total: true as const };
    const b = make({ B6: '=SUM(Sales[Amount])', J20: '=Sales[[#TOTALS],[Amount]]' }, [withTotal]);
    expect(b.v('B6')).toBe(10);
    expect(b.v('J20')).toBe(10);
    expect(b.v('B6')).toBe(10);
  });

  it('keeps one naming no table as typed, read by name once there is one', () => {
    const b = make({
      J20: '=SUM(Costs[Amount])',
      J21: '=ROWS(Costs)',
      J22: '=Costs[@Amount]',
      K20: '=Costs[Amount]',
    });
    expect(b.v('J20')).toMatchObject({ e: '#REF!', why: 'Unknown table Costs' });
    const sheet = b.sheets[0]!;
    const cell = sheet.cells.get(cellKey('s0r19', 's0c9'))!;
    expect(cell.input).toEqual({ f: { t: 'SUM(Costs[Amount])', r: [] } });
    const costs = { ...SALES, name: 'Costs' };
    b.wb.updateSheet({ ...sheet, layout: { ...sheet.layout, tables: [costs] } });
    expect(b.v('J20')).toBe(10);
    expect(b.v('J21')).toBe(4);
    expect(b.v('J22')).toMatchObject({ e: '#VALUE!' });
    expect([b.v('K20'), b.v('K23')]).toEqual([1, 4]);
  });

  it('names a column by a number or a tick box value as typed', () => {
    const b = book(
      {
        A1: '2024',
        B1: 'TRUE',
        C1: '=1',
        A2: '5',
        B2: '6',
        C2: '7',
        J20: '=Years[2024]+Years[TRUE]+Years[Column 3]',
      },
      { tables: { 'Sheet 1': [YEARS] } },
    );
    expect(b.v('J20')).toBe(18);
  });

  it('reads a LET name of a table name as the LET name', () => {
    expect(v('=LET(Sales, 2, Sales*3)')).toBe(6);
    expect(v('=ROWS(Sales)+LET(x, 1, x)')).toBe(5);
  });

  it("names its table and columns by id, so renames rewrite the formula's text", () => {
    const b = make({ F2: '=SUM(Sales[Amount])+Sales[@[Unit price]]' });
    const sheet = b.sheets[0]!;
    const stored = formulaAt(sheet, 's0r1', 's0c5');
    expect(stored).toEqual({
      t: 'SUM(@0)+@1',
      r: [
        { t: 'tbl001', tc1: 's0c1' },
        { t: 'tbl001', tc1: 's0c2', ta: 8 },
      ],
    });
    b.set('B1', 'Qty');
    const renamed = {
      ...b.sheets[0]!,
      layout: { ...b.sheets[0]!.layout, tables: [{ ...SALES, name: 'Q3 sales' }] },
    };
    b.wb.updateSheet(renamed);
    expect(renderFormula(stored, b.wb.ctxFor(renamed.id))).toBe(
      '=SUM(Q3_sales[Qty])+Q3_sales[@[Unit price]]',
    );
    expect(b.v('F2')).toBe(20);
  });

  it('is #REF! once its table or its column is gone', () => {
    const b = make({ J20: '=SUM(Sales[Amount])', J21: '=SUM(Sales)' });
    const sheet = b.sheets[0]!;
    const narrow = { ...SALES, c1: 's0c2' };
    b.wb.updateSheet({ ...sheet, layout: { ...sheet.layout, tables: [narrow] } });
    expect(b.v('J20')).toMatchObject({ e: '#REF!' });
    b.wb.updateSheet({ ...sheet, layout: { ...sheet.layout, tables: undefined } });
    expect(b.v('J21')).toMatchObject({ e: '#REF!' });
    const ctx = b.wb.ctxFor(sheet.id);
    expect(renderFormula({ t: 'SUM(@0)', r: [{ t: 'tbl001', tc1: 's0c1' }] }, ctx)).toBe(
      '=SUM(#REF!)',
    );
  });

  it('reads rows the table grows by at once', () => {
    const b = make({ J20: '=SUM(Sales[Amount])', B6: '5' });
    expect(b.v('J20')).toBe(10);
    const sheet = b.sheets[0]!;
    b.wb.updateSheet({ ...sheet, layout: { ...sheet.layout, tables: [{ ...SALES, r2: 's0r5' }] } });
    expect(b.v('J20')).toBe(15);
  });

  it("reads another sheet's table by name, and keeps reading it when copied or filled", () => {
    const b = book(
      { Data: DATA, Report: { A1: '=SUM(Sales[Amount])' } },
      { tables: { Data: [SALES] } },
    );
    expect(b.v('A1', 'Report')).toBe(10);
    const report = b.sheets[1]!;
    const f = formulaAt(report, 's1r0', 's1c0');
    expect(f.r).toEqual([{ t: 'tbl001', s: 'sheet0xx', tc1: 's0c1' }]);
    const from = b.wb.ctxFor(report.id);
    expect(shiftForCopy(f, 3, 2, from)).toBe(f);
    const onData = shiftForCopy(f, 0, 0, from, b.wb.ctxFor('sheet0xx'));
    expect(onData.r).toEqual([{ t: 'tbl001', tc1: 's0c1' }]);
    const own = { t: '@0', r: [{ t: 'tbl001', tc1: 's0c1' }] };
    expect(shiftForCopy(own, 0, 0, b.wb.ctxFor('sheet0xx'), from).r).toEqual([
      { t: 'tbl001', s: 'sheet0xx', tc1: 's0c1' },
    ]);
  });

  it("is typed in a locale whose separator is a semicolon, its brackets' commas kept", () => {
    const b = make();
    const ctx = b.wb.ctxFor(b.sheets[0]!.id);
    const read = readTypedInput('=SUMME(Sales[[#ALL],[Amount]])', 'de-DE', ctx);
    expect(read).toMatchObject({ kind: 'value' });
    const typed = readTypedInput('=SUM(Sales[[#ALL],[Amount]]; 1)', 'de-DE', ctx);
    expect(typed.kind).toBe('value');
  });
});

describe('readsUnknownTable', () => {
  it('tells a formula keeping a table reference as typed', () => {
    expect(readsUnknownTable({ t: 'SUM(Costs[Amount])', r: [] })).toBe(true);
    expect(readsUnknownTable({ t: 'SUM(@0)', r: [{ t: 'tbl001' }] })).toBe(false);
  });
});
