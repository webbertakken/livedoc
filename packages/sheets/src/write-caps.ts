// Whether a change, sent as several writes, fits the store's caps before any of it is sent
// (docs/specs/029-sheets/sheet-store.md "Agents", "Limits"). The api checks each write on its own, so a large
// change split into parts could land its first parts and be refused on a later one, leaving half of it stored. An
// agent checks the whole change here first: the sheet's cells and bytes, its
// grid, and the document's cells, each by the sheet's kind's limits (sheet-limits.ts).
import { SheetLimits } from './sheet-limits';
import { NOBODY, type Sheet } from './sheet';
import { applySheetWrite, type SheetWrite } from './store';
import { sheetBytes, sheetProblem } from './validate';

type WriteCapsRejection = 'sheet_full' | 'sheet_too_large' | 'sheets_full';

// The cap the writes would cross, applied in order to `sheet`, or null when they fit. `documentCells` is the cells
// every sheet of the document holds now, this one included. A change that grows nothing is never refused here, so
// an older sheet already past a cap can still be cleared or shrunk. `limits`: the sheet's kind's (a Plan Sheet's by
// default).
export function writesCapsProblem(
  sheet: Sheet,
  writes: readonly SheetWrite[],
  documentCells: number,
  limits: SheetLimits = SheetLimits.plan,
): WriteCapsRejection | null {
  if (writes.length === 0) return null;
  let after = sheet;
  for (const write of writes) after = applySheetWrite(after, write, { now: 0, by: NOBODY }).sheet;
  const added = after.cells.size - sheet.cells.size;
  const grew =
    added > 0 ||
    after.layout.rows.length > sheet.layout.rows.length ||
    after.layout.cols.length > sheet.layout.cols.length ||
    sheetBytes(after) > sheetBytes(sheet);
  if (!grew) return null;
  const problem = sheetProblem(after, limits);
  if (!problem.ok && (problem.error === 'sheet_full' || problem.error === 'sheet_too_large'))
    return problem.error;
  if (added > 0 && documentCells + added > limits.documentCells) return 'sheets_full';
  return null;
}

// The cells a document's sheets hold, as the store counts them against the document's cells.
export function documentCellCount(sheets: readonly { cells: readonly unknown[] }[]): number {
  let n = 0;
  for (const s of sheets) n += s.cells.length;
  return n;
}
