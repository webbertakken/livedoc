// The checks a sheet write passes before it is stored (docs/specs/029-sheets/sheet-store.md "Limits",
// docs/specs/029-sheets/spreadsheet.md "Limits"): the cells and bytes it adds against the sheet's, the document's and the
// workbook's caps, the grid it grows against the workbook's, and a new title against the other sheets'. The write
// route's and a sheet changeset's (sheet-changesets/store.ts).
import {
  SheetLimits,
  SheetName,
  cellKey,
  type CellChange,
  type Sheet,
  type SheetWrite,
} from '@livedoc/sheets';
import { documentSheetTotals, existingCells, listSheetHeads, type SheetHead } from '../db';
import { gridsWith, workbookGrids } from '../db/sheet-grids';
import type { DocumentRouteContext } from './context';
import { sheetRejected } from './sheet-route-kit';

export function deletes(write: SheetWrite): boolean {
  return (
    write.kind === 'layout' &&
    write.changes.some((c) => c.k === 'deleteRows' || c.k === 'deleteCols')
  );
}

// Upper bounds of what a write adds: cells it may create and the bytes it may store.
function growth(cells: readonly CellChange[]): { count: number; bytes: number; keys: string[] } {
  let count = 0;
  let bytes = 0;
  const keys: string[] = [];
  for (const ch of cells) {
    if ((ch.i !== undefined && ch.i !== null) || (ch.f !== undefined && ch.f !== null)) {
      count++;
      keys.push(cellKey(ch.r, ch.c));
    }
    if (ch.i) bytes += JSON.stringify(ch.i).length;
    if (ch.f) bytes += JSON.stringify(ch.f).length;
  }
  return { count, bytes, keys };
}

export async function capsProblem(
  ctx: DocumentRouteContext,
  documentId: string,
  head: SheetHead,
  cells: readonly CellChange[],
  limits: SheetLimits,
): Promise<Response | null> {
  const g = growth(cells);
  if (g.count === 0) return null;
  let added = g.count;
  let addedBytes = g.bytes;
  const near = head.cellCount + g.count > limits.cells || head.cellBytes + g.bytes > limits.bytes;
  const totals = await documentSheetTotals(ctx.env, documentId);
  const docNear =
    totals.cells + g.count > limits.documentCells || totals.bytes + g.bytes > limits.documentBytes;
  if (near || docNear) {
    // Close to a cap: count exactly, as cells the write replaces add nothing new.
    const existing = await existingCells(ctx.env, documentId, head.id, g.keys);
    added -= existing.count;
    addedBytes -= existing.bytes;
  }
  if (head.cellCount + added > limits.cells || head.cellBytes + addedBytes > limits.bytes) {
    console.info('[sheets] sheets.full', { documentId });
    return sheetRejected('sheet_full', 413);
  }
  if (totals.cells + added > limits.documentCells) return sheetRejected('sheets_full', 413);
  // A spreadsheet's stored bytes over every sheet (spreadsheet.md "Limits").
  if (totals.bytes + addedBytes > limits.documentBytes) {
    console.info('[workbook] refused', { error: 'workbook_full', bytes: true });
    return sheetRejected('workbook_full', 413);
  }
  return null;
}

// A spreadsheet's grid grown by a write, against the workbook's rows and grid cells over every sheet
// (spreadsheet.md "Limits"): read only when the write adds rows or columns.
export async function gridProblem(
  ctx: DocumentRouteContext,
  documentId: string,
  head: SheetHead,
  after: Sheet,
  limits: SheetLimits,
): Promise<Response | null> {
  const rows = after.layout.rows.length;
  const cols = after.layout.cols.length;
  if (rows <= head.layout.rows.length && cols <= head.layout.cols.length) return null;
  const grids = gridsWith(await workbookGrids(ctx.env, documentId), { id: head.id, rows, cols });
  const refusal = SheetLimits.workbookRefusal(limits, grids);
  if (!refusal) return null;
  console.info('[workbook] refused', { error: refusal, rows, cols });
  return sheetRejected(refusal, 413);
}

// A sheet's new title refused: a spreadsheet's against the sheet name's rules and its other sheets', a Plan Sheet's
// against its tab's other sheets'.
export async function titleProblem(
  ctx: DocumentRouteContext,
  documentId: string,
  sheetId: string,
  title: unknown,
  spreadsheet: boolean,
  scope: string | undefined,
): Promise<Response | null> {
  const others = (await listSheetHeads(ctx.env, documentId, scope))
    .filter((h) => h.id !== sheetId)
    .map((h) => h.title);
  const named = typeof title === 'string' ? title : '';
  if (spreadsheet) {
    const checked = SheetName.check(named, others);
    return checked.ok
      ? null
      : sheetRejected(checked.refusal, checked.refusal === 'sheet_name_taken' ? 409 : 400);
  }
  return others.some((t) => t.toLowerCase() === named.trim().toLowerCase())
    ? sheetRejected('sheet_title_taken', 409)
    : null;
}
