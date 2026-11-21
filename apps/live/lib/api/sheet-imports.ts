// A spreadsheet's imports through the api (docs/specs/029-sheets/imports.md): one import fetched, read as the answer
// its cells show, and Allow Access. Called from the sheet chunk only (the store and the spreadsheet surface).
import type { WorkbookSettingsResponse } from '@livedoc/api-schema';
import { importParams, IMPORT_WORDS, type ImportAnswer, type ImportAsk } from '@livedoc/sheets';
import { API_BASE, apiFetch, apiHeaders, expectOk } from './core';
import type { SheetsScope } from './sheets';

function workbookUrl(scope: SheetsScope, rest: string, query = new URLSearchParams()): string {
  if (scope.tabId) query.set('tabId', scope.tabId);
  const q = query.toString();
  return `${API_BASE}/documents/${encodeURIComponent(scope.documentId)}/workbook/${rest}${q ? `?${q}` : ''}`;
}

/** One import's answer; `later` when the spreadsheet's rate is spent (asked again after a wait). */
export async function fetchSheetImport(
  scope: SheetsScope,
  ask: ImportAsk,
): Promise<ImportAnswer | 'later'> {
  const notFetched: ImportAnswer = { error: '#N/A', why: IMPORT_WORDS.notFetched(ask.request.url) };
  let res: Response;
  try {
    res = await apiFetch(workbookUrl(scope, 'imports', importParams(ask.request, ask.fresh)), {
      headers: await apiHeaders(scope.ownerId, { share: scope.shareCode }),
    });
  } catch (e) {
    console.warn('[sheet imports] request failed', { reason: (e as Error).name });
    return notFetched;
  }
  if (res.ok) return (await res.json()) as ImportAnswer;
  if (res.status === 429) return 'later';
  const code = ((await res.json().catch(() => null)) as { error?: string } | null)?.error;
  console.warn('[sheet imports] refused', { status: res.status, code });
  if (code === 'imports_not_allowed') return { error: '#REF!', why: IMPORT_WORDS.blocked };
  return notFetched;
}

/** An Editor allows the spreadsheet's imports, for good; the room sends the workbook to everyone. */
export async function allowSheetImports(scope: SheetsScope): Promise<WorkbookSettingsResponse> {
  const res = await apiFetch(workbookUrl(scope, 'imports'), {
    method: 'POST',
    headers: await apiHeaders(scope.ownerId, { share: scope.shareCode }),
  });
  return expectOk<WorkbookSettingsResponse>(res, 'allow imports');
}
