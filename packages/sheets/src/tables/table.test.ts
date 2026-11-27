// A copied sheet's tables (docs/specs/029-sheets/data-tools.md "Tables" "Copies", D451): renamed free of the workbook
// they land in, as Google's duplicate names them (`Sales_2`, `Sales_3`).
import { describe, expect, it } from 'vitest';
import type { SheetLayout } from '../sheet';
import { tablesForCopy, withFreeTableNames, type SheetTable } from './table';

const table = (id: string, name: string): SheetTable => ({
  id,
  name,
  r1: 'r1',
  c1: 'c1',
  r2: 'r2',
  c2: 'c2',
});
const layout = (tables: SheetTable[], names: string[] = []): SheetLayout => ({
  rows: [],
  cols: [],
  tables,
  names: names.map((name) => ({ name, r1: 'r1', c1: 'c1', r2: 'r1', c2: 'c1' })),
});

describe('tablesForCopy', () => {
  it('numbers each name from 2 after an underscore, past the names the workbook and the copy already hold', () => {
    const source = layout([table('t1', 'Sales'), table('t2', 'Table1'), table('t3', 'Due dates')]);
    const other = layout([table('t9', 'Table1_2')], ['Sales_2']);
    expect(tablesForCopy(source.tables!, [source, other]).map((t) => t.name)).toEqual([
      'Sales_3',
      'Table1_3',
      'Due dates_2',
    ]);
    // Two of the copy's own tables never take one name.
    const twins = [table('t1', 'Plan'), table('t2', 'Plan_2')];
    expect(tablesForCopy(twins, [layout(twins)]).map((t) => t.name)).toEqual([
      'Plan_3',
      'Plan_2_2',
    ]);
  });

  it('keeps a long name within the longest a table name may be', () => {
    const long = 'A'.repeat(255);
    const [copy] = tablesForCopy([table('t1', long)], [layout([table('t1', long)])]);
    expect(copy!.name).toBe(`${'A'.repeat(253)}_2`);
  });

  it('leaves a layout without tables as it is', () => {
    const bare = layout([]);
    expect(withFreeTableNames(bare, [bare])).toBe(bare);
    const held = layout([table('t1', 'Sales')]);
    expect(withFreeTableNames(held, [held]).tables).toEqual([
      { ...table('t1', 'Sales'), name: 'Sales_2' },
    ]);
  });
});
