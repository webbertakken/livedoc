// A spreadsheet's kept content through the api (docs/specs/029-sheets/sheet-store.md "In a spreadsheet", Unknown
// content): sent after File › Open's create and Sync to cloud's, fitted to the sizes a spreadsheet stores (D113) and in
// requests of up to 7 MB (D114); read whole by Take offline. The codec reads the office files' entry, so it loads with
// them, only on these paths.
import type { WorkbookKeptResponse } from '@livedoc/api-schema';
import type { KeptContent, StoredAt } from '@livedoc/sheets/files';
import { debugLog } from '@/lib/debug-log';
import { API_BASE, apiFetch, apiHeaders, expectOk } from './core';

export type KeptScope = { ownerId: string; documentId: string; shareCode: string | null };

const keptUrl = (scope: KeptScope) =>
  `${API_BASE}/documents/${encodeURIComponent(scope.documentId)}/workbook/kept`;

/**
 * Sends a spreadsheet's kept content, in order; a refusal throws (ApiError) and stops the rest. Answers how many of its
 * items, relationships and entries were past the sizes and left out (`kept_too_large`), 0 for none.
 */
export async function sendKept(scope: KeptScope, kept: KeptContent<StoredAt>): Promise<number> {
  const { keptRequests } = await import('@livedoc/api-schema/workbook-kept');
  const { batches, left } = keptRequests(kept);
  if (left > 0) debugLog('[workbook] kept too large', { left });
  for (const batch of batches) {
    const res = await apiFetch(keptUrl(scope), {
      method: 'POST',
      headers: await apiHeaders(scope.ownerId, { share: scope.shareCode, body: true }),
      body: JSON.stringify(batch),
    });
    await expectOk(res, 'keep file content');
  }
  debugLog('[workbook] kept sent', { requests: batches.length, left });
  return left;
}

/** A spreadsheet's kept content whole, or undefined when it keeps none. */
export async function fetchKept(scope: KeptScope): Promise<KeptContent<StoredAt> | undefined> {
  const res = await apiFetch(keptUrl(scope), {
    headers: await apiHeaders(scope.ownerId, { share: scope.shareCode }),
  });
  const answer = await expectOk<WorkbookKeptResponse>(res, 'kept content');
  if (!answer.kept) return undefined;
  const { keptFromWire } = await import('@livedoc/api-schema/workbook-kept');
  const kept = keptFromWire(answer.kept);
  // What the api answers is what it stored, checked; anything else is a fault to surface, never kept content.
  if (!kept) throw new Error('kept content unreadable');
  return kept;
}
