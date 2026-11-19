import { describe, expect, it } from 'vitest';
import { typeInto } from '../commands';
import { appendAxis } from '../commands-axis';
import { pasteExternal } from '../commands-paste';
import { SheetLimits } from '../sheet-limits';
import { makeSheets } from '../testing/book';
import { WORKBOOK_GRID_CELLS_MAX } from '../workbook/workbook-limits';
import { Workbook } from './workbook';

// docs/specs/029-sheets/spreadsheet.md "Limits": a spreadsheet's engine grows its sheets by the workbook's limits,
// counting every sheet's rows and grid cells; a Plan Sheet's by its own.

function book(limits: SheetLimits | undefined, sizes: { rows: number; cols: number }[]) {
  const sheets = sizes.flatMap((size, i) =>
    makeSheets({ [`Sheet ${i + 1}`]: {} }, size).map((s) => ({
      ...s,
      id: `sheet${String(i).padStart(4, '0')}`,
    })),
  );
  return { wb: new Workbook({ sheets, locale: 'en-GB', ...(limits ? { limits } : {}) }), sheets };
}

describe("a workbook's room", () => {
  it("is a Plan Sheet's own grid by default", () => {
    const { wb } = book(undefined, [{ rows: 9_990, cols: 26 }]);
    expect(wb.limits).toBe(SheetLimits.plan);
    expect(wb.room('sheet0000')).toEqual({ rows: 10, cols: 174 });
  });

  it("counts every sheet of a spreadsheet's workbook", () => {
    const { wb } = book(SheetLimits.spreadsheet, [
      { rows: 600_000, cols: 1 },
      { rows: 399_000, cols: 1 },
    ]);
    expect(wb.room('sheet0001').rows).toBe(1_000);
  });

  it('is none for a sheet it does not hold', () => {
    expect(book(SheetLimits.spreadsheet, [{ rows: 1, cols: 1 }]).wb.room('nope')).toEqual({
      rows: 0,
      cols: 0,
    });
  });

  it("grows a spreadsheet's sheet past 10,000 rows", () => {
    const { wb, sheets } = book(SheetLimits.spreadsheet, [{ rows: 9_990, cols: 2 }]);
    const w = appendAxis(sheets[0]!, 'r', 5_000, wb.room('sheet0000'));
    expect(w?.kind === 'layout' && (w.changes[0] as { ids: string[] }).ids).toHaveLength(5_000);
  });

  it("cuts a paste at the workbook's grid cells, saying so", () => {
    // 100 columns and 100 grid cells left: room for one more row.
    const rows = (WORKBOOK_GRID_CELLS_MAX - 100) / 100;
    const sheet = book(SheetLimits.spreadsheet, [{ rows: 1, cols: 100 }]).sheets[0]!;
    const tall = {
      ...sheet,
      layout: { ...sheet.layout, rows: Array.from({ length: rows }, (_, i) => `r${i}`) },
    };
    const wb = new Workbook({ sheets: [tall], locale: 'en-GB', limits: SheetLimits.spreadsheet });
    expect(wb.room('sheet0000')).toEqual({ rows: 1, cols: 0 });
    const res = pasteExternal(
      wb,
      'sheet0000',
      { r1: rows - 1, c1: 0, r2: rows - 1, c2: 0 },
      [['a'], ['b'], ['c']],
      'values',
    );
    expect(res?.truncated).toBe(true);
    const grown = res?.edits.find((e) => e.write.kind === 'layout')?.write;
    expect(grown?.kind === 'layout' && (grown.changes[0] as { ids: string[] }).ids).toHaveLength(1);
  });

  it("takes a typed input up to a spreadsheet's 50,000 characters", () => {
    const plan = book(undefined, [{ rows: 2, cols: 2 }]).wb;
    const sheet = book(SheetLimits.spreadsheet, [{ rows: 2, cols: 2 }]).wb;
    const text = 'x'.repeat(20_000);
    expect(typeInto(plan, 'sheet0000', { r: 0, c: 0 }, text)).toMatchObject({ ok: false });
    expect(typeInto(sheet, 'sheet0000', { r: 0, c: 0 }, text)).toMatchObject({ ok: true });
    expect(typeInto(sheet, 'sheet0000', { r: 0, c: 0 }, 'x'.repeat(50_001))).toMatchObject({
      ok: false,
      read: { reason: 'input_too_long', at: 50_000 },
    });
  });
});
