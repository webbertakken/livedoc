// A table column's type as the validation it draws and checks (docs/specs/029-sheets/data-tools.md "Tables", D444): a
// Dropdown column's chips, a Checkbox column's tick boxes, and a wrong type flagged and kept (a warning, never a
// refusal). Worked out from the table, never stored as a rule of the sheet's, so it grows and shrinks with the table.
import type { SheetLayout, ValidationRule } from '../sheet';
import { tableAt, tableBox, type TableColumnType } from './table';

// The largest serial a date, time or date and time column takes: 31 December 9999.
const SERIAL_MAX = 2_958_465;

/** What a wrong value's hover says, by type (D444). */
export const TABLE_TYPE_HELP: Readonly<Record<Exclude<TableColumnType, 'text'>, string>> = {
  number: 'Expected a number',
  percent: 'Expected a number',
  currency: 'Expected a number',
  date: 'Expected a date',
  time: 'Expected a time',
  dateTime: 'Expected a date and time',
  dropdown: 'Expected one of the options',
  checkbox: 'Expected a tick box value',
};

/** The rule a table's typed column gives a data cell, or null (a header, a total row, a Text or None column). */
export function tableRuleAt(layout: SheetLayout, r: number, c: number): ValidationRule | null {
  if (!layout.tables?.length) return null;
  const table = tableAt(layout, r, c);
  const p = table && tableBox(layout, table);
  if (!table || !p || r === p.r1 || (table.total && r === p.r2)) return null;
  const col = layout.cols[c]!;
  const type = table.types?.[col];
  if (!type || type === 'text') return null;
  const first = layout.rows[p.r1 + 1]!;
  const last = layout.rows[table.total ? p.r2 - 1 : p.r2]!;
  const base = {
    id: `${table.id}${col}`,
    r1: first,
    r2: last,
    c1: col,
    c2: col,
    warn: true as const,
  };
  const help = TABLE_TYPE_HELP[type];
  switch (type) {
    case 'dropdown':
      return { ...base, is: 'list', opts: table.opts?.[col] ?? [], help };
    case 'checkbox':
      return { ...base, is: 'check', help };
    case 'date':
    case 'time':
    case 'dateTime':
      return { ...base, is: 'num', op: 'between', a: 0, b: SERIAL_MAX, help };
    default:
      return { ...base, is: 'num', op: 'between', a: -Number.MAX_VALUE, b: Number.MAX_VALUE, help };
  }
}
