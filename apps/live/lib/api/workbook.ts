// A spreadsheet's workbook doors (docs/specs/029-sheets/files-and-print.md): its file, written by the api from the
// sheets the room holds, in the workbook's own format, or in this browser for an offline one.
import type { WorkbookFormat } from '@livedoc/sheets';
import { isOfflineId } from '../offline/offline-store';
import { API_BASE, apiFetch, apiHeaders, expectOkVoid } from './core';

export type WorkbookScope = { ownerId: string; documentId: string; shareCode: string | null };

/** The workbook as a file, with the name the api gave it. */
export async function apiDownloadWorkbook(
  scope: WorkbookScope,
  format: WorkbookFormat,
): Promise<{ blob: Blob; fileName: string }> {
  // An offline spreadsheet is written in this browser (sheet-store.md "Offline documents").
  if (await isOfflineId(scope.documentId))
    return (await import('../offline/offline-workbook-file')).offlineWorkbookFile(
      scope.documentId,
      format,
    );
  const res = await apiFetch(
    `${API_BASE}/documents/${encodeURIComponent(scope.documentId)}/workbook/file?format=${format}`,
    { headers: await apiHeaders(scope.ownerId, { share: scope.shareCode }) },
  );
  await expectOkVoid(res, 'workbook file');
  const disposition = res.headers.get('Content-Disposition') ?? '';
  const fileName = /filename="([^"]+)"/.exec(disposition)?.[1] ?? `Untitled spreadsheet.${format}`;
  return { blob: await res.blob(), fileName };
}
