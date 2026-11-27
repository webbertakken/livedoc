// A table column's type as validation (data-tools.md "Tables", D444): chips and tick boxes drawn, a wrong type flagged
// and kept, never refused; and the column type written with its cells' format and a Dropdown's options (D449).
import { describe, expect, it } from 'vitest';
import { book } from '../testing/book';
import { applySheetWrite } from '../store';
import { validateWrite } from '../validate';
import { validationRuleAt, valueInvalid } from '../rules/validation';
import { err } from '../formula/values';
import type { SheetTable } from './table';
import { tableRuleAt, TABLE_TYPE_HELP } from './table-rules';
import { columnTypeWrite } from './table-commands';

const T: SheetTable = {
  id: 'tbl001',
  name: 'Sales',
  r1: 's0r0',
  c1: 's0c0',
  r2: 's0r4',
  c2: 's0c4',
  total: true,
  types: { s0c0: 'text', s0c1: 'number', s0c2: 'dropdown', s0c3: 'checkbox', s0c4: 'date' },
  opts: { s0c2: [{ v: 'To Do' }, { v: 'Done' }] },
};
const DATA = {
  A1: 'Item',
  B1: 'Amount',
  C1: 'State',
  D1: 'Paid',
  E1: 'Due',
  A2: 'pen',
  B2: 'many',
  C2: 'Done',
  D2: 'TRUE',
};
const ctx = (b: ReturnType<typeof book>) => ({ locale: 'en-GB', layout: b.sheets[0]!.layout });

describe('tableRuleAt', () => {
  const b = book(DATA, { tables: { 'Sheet 1': [T] } });
  const layout = b.sheets[0]!.layout;

  it('gives each typed data cell its rule, as a warning, and none to the header, the total row or text', () => {
    expect(tableRuleAt(layout, 0, 1)).toBeNull();
    expect(tableRuleAt(layout, 4, 1)).toBeNull();
    expect(tableRuleAt(layout, 1, 0)).toBeNull();
    expect(tableRuleAt(layout, 1, 6)).toBeNull();
    expect(tableRuleAt({ ...layout, tables: undefined }, 1, 1)).toBeNull();
    expect(tableRuleAt({ ...layout, tables: [{ ...T, types: undefined }] }, 1, 1)).toBeNull();
    expect(tableRuleAt(layout, 1, 1)).toMatchObject({
      is: 'num',
      warn: true,
      r1: 's0r1',
      r2: 's0r3',
      help: TABLE_TYPE_HELP.number,
    });
    expect(tableRuleAt(layout, 2, 2)).toMatchObject({ is: 'list', opts: T.opts!.s0c2 });
    expect(tableRuleAt(layout, 2, 3)).toMatchObject({ is: 'check' });
    expect(tableRuleAt(layout, 2, 4)).toMatchObject({ is: 'num', a: 0, help: 'Expected a date' });
    const noOpts = { ...layout, tables: [{ ...T, opts: undefined }] };
    expect(tableRuleAt(noOpts, 2, 2)).toMatchObject({ is: 'list', opts: [] });
  });

  it('is the rule validation reads, after a rule of the sheet’s own', () => {
    expect(validationRuleAt(layout, 1, 1)?.is).toBe('num');
    const own = {
      id: 'rul001',
      r1: 's0r1',
      c1: 's0c1',
      r2: 's0r1',
      c2: 's0c1',
      is: 'check' as const,
    };
    expect(validationRuleAt({ ...layout, rules: [own] }, 1, 1)).toBe(own);
  });

  it('flags a wrong type and keeps it: text in a number column, never an error or an empty cell', () => {
    const rule = tableRuleAt(layout, 1, 1)!;
    expect(valueInvalid(rule, 'many', 'many', ctx(b))).toBe(true);
    expect(valueInvalid(rule, 5, '5', ctx(b))).toBe(false);
    expect(valueInvalid(rule, err('#DIV/0!'), '#DIV/0!', ctx(b))).toBe(false);
    expect(valueInvalid(rule, null, '', ctx(b))).toBe(false);
    const sheet = b.sheets[0]!;
    const write = { kind: 'cells' as const, cells: [{ r: 's0r2', c: 's0c1', i: { s: 'lots' } }] };
    expect(validateWrite(sheet, write, { checkRules: true }).ok).toBe(true);
  });
});

describe('columnTypeWrite', () => {
  const T2: SheetTable = {
    id: 'tbl001',
    name: 'Sales',
    r1: 's0r0',
    c1: 's0c0',
    r2: 's0r3',
    c2: 's0c1',
  };
  const D2 = { A1: 'State', B1: 'Amount', A2: 'Done', A3: 'to do', A4: 'Done', B2: '1' };

  it("sets a number type and its cells' format, a Dropdown with the column's values, and None", () => {
    const b = book(D2, { tables: { 'Sheet 1': [T2] } });
    const sheet = b.sheets[0]!;
    const num = columnTypeWrite(b.wb, sheet.id, 'tbl001', 's0c1', 'currency')!;
    expect(validateWrite(sheet, num).ok).toBe(true);
    const after = applySheetWrite(sheet, num, { now: 1, by: sheet.updatedBy }).sheet;
    expect(after.layout.tables![0]!.types).toEqual({ s0c1: 'currency' });
    expect(after.cells.get('s0r3:s0c1')?.format).toEqual({ nf: 'currency' });
    const drop = columnTypeWrite(b.wb, sheet.id, 'tbl001', 's0c0', 'dropdown')!;
    expect(drop).toMatchObject({ kind: 'layout' });
    const table = (drop as { changes: { table: SheetTable }[] }).changes[0]!.table;
    expect(table.opts).toEqual({ s0c0: [{ v: 'Done' }, { v: 'to do' }] });
    b.wb.updateSheet(applySheetWrite(sheet, drop, { now: 1, by: sheet.updatedBy }).sheet);
    const none = columnTypeWrite(b.wb, sheet.id, 'tbl001', 's0c0', null)!;
    expect((none as { changes: { table: SheetTable }[] }).changes[0]!.table).toEqual(T2);
  });

  it('makes nothing of a column outside the table or a table it does not know', () => {
    const b = book(D2, { tables: { 'Sheet 1': [T2] } });
    expect(columnTypeWrite(b.wb, b.sheets[0]!.id, 'tbl001', 's0c5', 'text')).toBeNull();
    expect(columnTypeWrite(b.wb, b.sheets[0]!.id, 'nope01', 's0c0', 'text')).toBeNull();
  });
});
