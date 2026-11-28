// A sheet of a spreadsheet as a dashboard reads it (docs/specs/029-sheets/plan-links.md "Reading a sheet from another
// document", D505): asked with the reader's own access and the version it holds. A spreadsheet that is not there and
// one the reader may not open answer alike (`denied`); one past the bound a read works out is `too-large`.
import type {
  WorkbookFormLinkRequest,
  WorkbookLinkResponse,
  WorkbookSettingsResponse,
} from '@livedoc/api-schema';
import { API_BASE, apiFetch, apiHeaders, expectOk } from './core';

export type WorkbookLinkAnswer =
  { kind: 'read'; body: WorkbookLinkResponse } | { kind: 'denied' } | { kind: 'too-large' };

export async function fetchWorkbookLink(
  ownerId: string,
  documentId: string,
  sheetId: string,
  since: string | null,
): Promise<WorkbookLinkAnswer> {
  const q = new URLSearchParams({
    ...(sheetId ? { sheet: sheetId } : {}),
    ...(since ? { since } : {}),
  }).toString();
  const res = await apiFetch(
    `${API_BASE}/documents/${encodeURIComponent(documentId)}/workbook/link${q ? `?${q}` : ''}`,
    // Never the dashboard's share link: the spreadsheet is read with the reader's own access.
    { headers: await apiHeaders(ownerId) },
  );
  if (res.status === 404 || res.status === 403 || res.status === 410) return { kind: 'denied' };
  if (res.status === 413) return { kind: 'too-large' };
  return { kind: 'read', body: await expectOk<WorkbookLinkResponse>(res, 'workbook link') };
}

const linkUrl = (spreadsheetId: string, query = '') =>
  `${API_BASE}/documents/${encodeURIComponent(spreadsheetId)}/workbook/link${query ? `?${query}` : ''}`;

/**
 * A form connected to a sheet of a spreadsheet, so its responses land there (plan-links.md "Form responses", D506):
 * by the Editor's own access to both, never a share link's. Throws as `expectOk` does when refused.
 */
export async function connectFormToSheet(
  ownerId: string,
  spreadsheetId: string,
  form: { documentId: string; tabId: string; sheetId: string },
): Promise<WorkbookSettingsResponse> {
  const body: WorkbookFormLinkRequest = {
    document: form.documentId,
    tab: form.tabId,
    sheet: form.sheetId,
  };
  const res = await apiFetch(linkUrl(spreadsheetId), {
    method: 'POST',
    headers: await apiHeaders(ownerId, { body: true }),
    body: JSON.stringify(body),
  });
  return expectOk<WorkbookSettingsResponse>(res, 'connect form');
}

/** Form connections taken back: one form's (its Editor choosing elsewhere), or every one to a sheet (Unlink Form). */
export async function unlinkFormFromSheet(
  ownerId: string,
  spreadsheetId: string,
  which: { documentId: string; tabId: string } | { sheetId: string },
  shareCode: string | null = null,
): Promise<WorkbookSettingsResponse> {
  const q = new URLSearchParams(
    'sheetId' in which
      ? { sheet: which.sheetId }
      : { document: which.documentId, tab: which.tabId },
  ).toString();
  const res = await apiFetch(linkUrl(spreadsheetId, q), {
    method: 'DELETE',
    headers: await apiHeaders(ownerId, { share: shareCode }),
  });
  return expectOk<WorkbookSettingsResponse>(res, 'unlink form');
}
