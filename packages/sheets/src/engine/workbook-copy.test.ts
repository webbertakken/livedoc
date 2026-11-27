// The page's copy of the Worker's values (formulas.md "Recalculation"): a formula's value waits for the Worker; a value
// typed in never does, whatever the Worker said of it.
import { describe, expect, it } from 'vitest';
import { makeSheets } from '../testing/book';
import { WorkbookCopy } from './workbook-copy';

describe('WorkbookCopy', () => {
  it('lets a formula wait for its value, never a value typed in', () => {
    const sheets = makeSheets({ S: { A1: 'x', B1: '1', C1: '=B1+1', D2: '=SEQUENCE(2)' } });
    const wb = new WorkbookCopy({ sheets, locale: 'en-GB' });
    const id = sheets[0]!.id;
    wb.acceptValue(id, 1, 3, { rows: [[1], [2]] });
    const cells = [0, 1, 2].map((c) => ({ sheetId: id, r: 0, c }));
    wb.markStale([...cells, { sheetId: id, r: 2, c: 3 }]);
    expect([0, 1, 2].map((c) => wb.isStale(id, 0, c))).toEqual([false, false, true]);
    // A spilled cell waits with the formula that spills it.
    expect(wb.isStale(id, 2, 3)).toBe(wb.isStale(id, 1, 3));
    expect(wb.isStale(id, 5, 5)).toBe(false);
  });
});
