// A spreadsheet's workbook doors (docs/specs/029-sheets/files-and-print.md): its file, written by the api from the
// sheets the room holds (in the other standard a converted copy), and its conversion; in this browser for an offline one.
import type {
  WorkbookConversionResponse,
  WorkbookConvertRequest,
  WorkbookFunctionsRequest,
  WorkbookSettingsRequest,
  WorkbookSettingsResponse,
} from '@livedoc/api-schema';
import type { NamedFunction, WorkbookFormat, WorkbookSettings } from '@livedoc/sheets';
import { isOfflineId } from '../offline/offline-store';
import { API_BASE, apiFetch, apiHeaders, expectOk, expectOkVoid } from './core';

export type WorkbookScope = { ownerId: string; documentId: string; shareCode: string | null };

/** What File › Download writes: the workbook in a format, or the open sheet as CSV or TSV (files-and-print.md). */
export type DownloadFormat = WorkbookFormat | 'csv' | 'tsv';

/** The workbook (or, as CSV or TSV, the sheet on `tabId`) as a file, with the name the api gave it. */
export async function apiDownloadWorkbook(
  scope: WorkbookScope,
  format: DownloadFormat,
  tabId = '',
): Promise<{ blob: Blob; fileName: string }> {
  // An offline spreadsheet is written in this browser (sheet-store.md "Offline documents").
  if (await isOfflineId(scope.documentId))
    return (await import('../offline/offline-workbook-file')).offlineWorkbookFile(
      scope.documentId,
      format,
      tabId,
    );
  const tab = format === 'csv' || format === 'tsv' ? `&tab=${encodeURIComponent(tabId)}` : '';
  const res = await apiFetch(
    `${API_BASE}/documents/${encodeURIComponent(scope.documentId)}/workbook/file?format=${format}${tab}`,
    { headers: await apiHeaders(scope.ownerId, { share: scope.shareCode }) },
  );
  await expectOkVoid(res, 'workbook file');
  const disposition = res.headers.get('Content-Disposition') ?? '';
  const fileName = /filename="([^"]+)"/.exec(disposition)?.[1] ?? `Untitled spreadsheet.${format}`;
  return { blob: await res.blob(), fileName };
}

function conversionUrl(scope: WorkbookScope, query = ''): string {
  return `${API_BASE}/documents/${encodeURIComponent(scope.documentId)}/workbook/conversion${query}`;
}

/** What a file in `to` cannot hold that the workbook's own could (files-and-print.md "Converting"). */
export async function apiWorkbookConversion(
  scope: WorkbookScope,
  to: WorkbookFormat,
): Promise<WorkbookConversionResponse> {
  if (await isOfflineId(scope.documentId))
    return (await import('../offline/offline-workbook-conversion')).offlineWorkbookConversion(
      scope.documentId,
      to,
    );
  const res = await apiFetch(conversionUrl(scope, `?to=${to}`), {
    headers: await apiHeaders(scope.ownerId, { share: scope.shareCode }),
  });
  return expectOk<WorkbookConversionResponse>(res, 'workbook conversion');
}

/** An Editor converts the workbook to `format`, of the other standard; the room sends it to everyone. */
export async function apiConvertWorkbook(
  scope: WorkbookScope,
  format: WorkbookFormat,
): Promise<WorkbookSettingsResponse> {
  if (await isOfflineId(scope.documentId))
    return (await import('../offline/offline-workbook-conversion')).offlineConvertWorkbook(
      scope.documentId,
      format,
    );
  const body: WorkbookConvertRequest = { format };
  const res = await apiFetch(conversionUrl(scope), {
    method: 'POST',
    headers: await apiHeaders(scope.ownerId, { share: scope.shareCode, body: true }),
    body: JSON.stringify(body),
  });
  return expectOk<WorkbookSettingsResponse>(res, 'convert workbook');
}

/** An Editor saves the workbook's settings whole (its theme, formatting.md "Themes"); the room sends them to everyone. */
export async function apiSaveWorkbookSettings(
  scope: WorkbookScope,
  settings: WorkbookSettings,
): Promise<WorkbookSettingsResponse> {
  if (await isOfflineId(scope.documentId))
    return (await import('../offline/offline-workbook-settings')).offlineSaveWorkbookSettings(
      scope.documentId,
      settings,
    );
  const body: WorkbookSettingsRequest = { settings };
  const res = await apiFetch(
    `${API_BASE}/documents/${encodeURIComponent(scope.documentId)}/workbook/settings`,
    {
      method: 'PUT',
      headers: await apiHeaders(scope.ownerId, { share: scope.shareCode, body: true }),
      body: JSON.stringify(body),
    },
  );
  return expectOk<WorkbookSettingsResponse>(res, 'save workbook settings');
}

/** An Editor saves the workbook's named functions whole (formulas.md "Named functions"); the room sends them on. */
export async function apiSaveWorkbookFunctions(
  scope: WorkbookScope,
  functions: readonly NamedFunction[],
): Promise<WorkbookSettingsResponse> {
  if (await isOfflineId(scope.documentId))
    return (await import('../offline/offline-workbook-functions')).offlineSaveWorkbookFunctions(
      scope.documentId,
      functions,
    );
  const body: WorkbookFunctionsRequest = { functions: [...functions] };
  const res = await apiFetch(
    `${API_BASE}/documents/${encodeURIComponent(scope.documentId)}/workbook/functions`,
    {
      method: 'PUT',
      headers: await apiHeaders(scope.ownerId, { share: scope.shareCode, body: true }),
      body: JSON.stringify(body),
    },
  );
  return expectOk<WorkbookSettingsResponse>(res, 'save named functions');
}
