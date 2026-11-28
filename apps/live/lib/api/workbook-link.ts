// A sheet of a spreadsheet as a dashboard reads it (docs/specs/029-sheets/plan-links.md "Reading a sheet from another
// document", D505): asked with the reader's own access and the version it holds. A spreadsheet that is not there and
// one the reader may not open answer alike (`denied`); one past the bound a read works out is `too-large`.
import type { WorkbookLinkResponse } from '@livedoc/api-schema';
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
