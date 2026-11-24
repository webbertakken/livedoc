// A sheet copied in from another spreadsheet (docs/specs/029-sheets/sheet-store.md "Changing the workbook", Copy To):
// the add's `seed`, its layout and the cells one request carries, read as a shape here and checked whole as a new
// spreadsheet's seed sheets are, against the workbook's cells.
import type { WorkbookSheetSeed } from '@livedoc/api-schema';
import { SheetLimits, sheetFromJson, validateSheetCreate, type SheetJson } from '@livedoc/sheets';
import { workbookRefused } from './sheet-route-kit';

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** A seed's shape, or null for one that is none (its cells and layout are checked whole later). */
export function readSeed(raw: unknown): WorkbookSheetSeed | null {
  if (!isRecord(raw) || !isRecord(raw.layout) || !Array.isArray(raw.cells)) return null;
  return raw as WorkbookSheetSeed;
}

/** A seeded sheet refused: what the sheet's checks say, or the workbook's cells past their most. */
export function seedProblem(sheet: SheetJson, cellsNow: number): Response | null {
  const limits = SheetLimits.spreadsheet;
  let check;
  try {
    check = validateSheetCreate(sheetFromJson(sheet), limits);
  } catch {
    return workbookRefused('write_invalid', 400);
  }
  if (!check.ok) return workbookRefused(check.error, check.error === 'sheet_full' ? 413 : 400);
  if (cellsNow + sheet.cells.length > limits.documentCells)
    return workbookRefused('sheets_full', 413);
  return null;
}
