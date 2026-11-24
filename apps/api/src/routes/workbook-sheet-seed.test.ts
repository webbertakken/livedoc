// docs/specs/029-sheets/sheet-store.md "Changing the workbook": a sheet carried in is checked whole, and against the
// workbook's cells.
import { describe, expect, it, vi } from 'vitest';
import { SheetLimits, emptyLayout, type SheetJson } from '@livedoc/sheets';
import { seedProblem } from './workbook-sheet-seed';

const check = vi.hoisted(() => ({ result: { ok: true } as { ok: boolean; error?: string } }));
vi.mock('@livedoc/sheets', async (real) => ({
  ...(await real<typeof import('@livedoc/sheets')>()),
  validateSheetCreate: () => check.result,
}));

let n = 0;
const sheet: SheetJson = {
  id: 'seeded1',
  tabId: 'tab1',
  title: 'S',
  layout: emptyLayout(() => (n = (n * 16807 + 11) % 2147483647) / 2147483647, 2, 2),
  cells: [],
  rev: 0,
  createdAt: 0,
  updatedAt: 0,
  updatedBy: { id: 'o', name: 'O' } as never,
};

describe('seedProblem', () => {
  it('names a sheet too full as 413, and the workbook past its cells', async () => {
    check.result = { ok: false, error: 'sheet_full' };
    expect(seedProblem(sheet, 0)!.status).toBe(413);
    check.result = { ok: true };
    const full = seedProblem(
      { ...sheet, cells: [{ r: 'a', c: 'b' }] },
      SheetLimits.spreadsheet.documentCells,
    )!;
    expect([full.status, await full.json()]).toEqual([413, { error: 'sheets_full' }]);
    expect(seedProblem(sheet, 0)).toBeNull();
  });
});
