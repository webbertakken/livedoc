// A spreadsheet's comment threads on the wire (docs/specs/029-sheets/review.md "Comments"): the workbook's threads read
// once, one op a write. A spreadsheet in This Browser holds none (D656). Types only from the model, so this module
// costs the main bundle nothing.
import type {
  SheetFileThread,
  SheetThreadResponse,
  SheetThreadsFromFileRequest,
  SheetThreadsFromFileResponse,
  SheetThreadsResponse,
} from '@livedoc/api-schema';
import type { SheetThread, SheetThreadOp } from '@livedoc/document';
import { isOfflineId } from '../offline/offline-store';
import { API_BASE, apiFetch, apiHeaders, expectOk } from './core';
import type { SheetsScope } from './sheets';

const tabQuery = (scope: SheetsScope) =>
  scope.tabId ? `?${new URLSearchParams({ tabId: scope.tabId }).toString()}` : '';

const documentUrl = (scope: SheetsScope) =>
  `${API_BASE}/documents/${encodeURIComponent(scope.documentId)}`;

/** The workbook's threads this session may read (none for a Viewer, none in This Browser). */
export async function fetchSheetThreads(scope: SheetsScope): Promise<SheetThread[]> {
  if (await isOfflineId(scope.documentId)) return [];
  const res = await apiFetch(`${documentUrl(scope)}/sheet-threads${tabQuery(scope)}`, {
    headers: await apiHeaders(scope.ownerId, { share: scope.shareCode }),
  });
  return (await expectOk<SheetThreadsResponse>(res, 'sheet threads')).threads;
}

/** One op on a thread of `sheetId`: the thread after it, null once removed. Throws the api's refusal. */
export async function postSheetThread(
  scope: SheetsScope,
  sheetId: string,
  op: SheetThreadOp,
): Promise<SheetThreadResponse> {
  const res = await apiFetch(
    `${documentUrl(scope)}/sheets/${encodeURIComponent(sheetId)}/threads${tabQuery(scope)}`,
    {
      method: 'POST',
      headers: await apiHeaders(scope.ownerId, { share: scope.shareCode, body: true }),
      body: JSON.stringify({ op }),
    },
  );
  return expectOk<SheetThreadResponse>(res, 'sheet thread');
}

/** An opened file's threads for one of its sheets, a part at a time: how many were stored. */
export async function postSheetThreadsFromFile(
  scope: SheetsScope,
  sheetId: string,
  threads: SheetFileThread[],
): Promise<number> {
  const res = await apiFetch(
    `${documentUrl(scope)}/sheets/${encodeURIComponent(sheetId)}/file-threads`,
    {
      method: 'POST',
      headers: await apiHeaders(scope.ownerId, { share: scope.shareCode, body: true }),
      body: JSON.stringify({ threads } satisfies SheetThreadsFromFileRequest),
    },
  );
  return (await expectOk<SheetThreadsFromFileResponse>(res, 'sheet threads from file')).stored;
}
