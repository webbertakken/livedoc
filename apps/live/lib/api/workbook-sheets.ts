// A spreadsheet's sheets changed with their tabs (docs/specs/029-sheets/sheet-store.md "Changing the workbook"): the
// sheet bar's add, duplicate, move and delete through the workbook routes. A spreadsheet in This Browser changes its tabs
// and sheet store in the editor instead (components/spreadsheet/sheet-bar-backend.ts).
import type {
  WorkbookSheetAddRequest,
  WorkbookSheetAddResponse,
  WorkbookSheetMoveRequest,
} from '@livedoc/api-schema';
import { API_BASE, apiFetch, apiHeaders, expectOk, expectOkVoid } from './core';
import type { WorkbookScope } from './workbook';

function sheetsUrl(scope: WorkbookScope, sheetId = ''): string {
  const tail = sheetId ? `/${encodeURIComponent(sheetId)}` : '';
  return `${API_BASE}/documents/${encodeURIComponent(scope.documentId)}/workbook/sheets${tail}`;
}

/** Adds a sheet tab and its sheet as one (a copy with `copyOf`, a kept sheet put back with its ids). */
export async function apiAddWorkbookSheet(
  scope: WorkbookScope,
  add: WorkbookSheetAddRequest,
): Promise<WorkbookSheetAddResponse> {
  const res = await apiFetch(sheetsUrl(scope), {
    method: 'POST',
    headers: await apiHeaders(scope.ownerId, { share: scope.shareCode, body: true }),
    body: JSON.stringify(add),
  });
  return expectOk<WorkbookSheetAddResponse>(res, 'add sheet');
}

/** Moves a sheet's tab after the tab `after` names, first for ''. */
export async function apiMoveWorkbookSheet(
  scope: WorkbookScope,
  sheetId: string,
  after: string,
): Promise<void> {
  const body: WorkbookSheetMoveRequest = { after };
  const res = await apiFetch(`${sheetsUrl(scope, sheetId)}/move`, {
    method: 'POST',
    headers: await apiHeaders(scope.ownerId, { share: scope.shareCode, body: true }),
    body: JSON.stringify(body),
  });
  await expectOkVoid(res, 'move sheet');
}

/** Removes a sheet's tab; its sheet is kept for Undo until it expires. */
export async function apiDeleteWorkbookSheet(scope: WorkbookScope, sheetId: string): Promise<void> {
  const res = await apiFetch(sheetsUrl(scope, sheetId), {
    method: 'DELETE',
    headers: await apiHeaders(scope.ownerId, { share: scope.shareCode }),
  });
  await expectOkVoid(res, 'delete sheet');
}
