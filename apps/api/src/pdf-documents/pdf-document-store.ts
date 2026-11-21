// A PDF tab as its room stores it (docs/specs/035-pdf-documents/live-editing-and-storage.md "Storage"): its row names
// its stored file; its live changes are a live tab kind's (live-tabs/live-tab-store.ts, PDF_LIVE_TAB).
import { pdfTabOf, type BlobKey, type PdfTabFile } from '@livedoc/document';
import { storedLiveTab } from '../live-tabs/live-tab-store';
import type { DocumentEnv } from '../types';
import { PDF_LIVE_TAB } from './pdf-live-tab';

/** The stored file a PDF tab names; null when the document lacks the tab, it is another kind, or it names none. */
export async function storedPdfTab(
  env: DocumentEnv,
  documentId: string,
  tabId: string,
): Promise<PdfTabFile | null> {
  return pdfTabOf((await storedLiveTab(env, PDF_LIVE_TAB, documentId, tabId)) ?? undefined);
}

/**
 * Whether the document holds the key (docs/specs/006-document/blob-store.md "Holds and retention"): the tab naming
 * it, with the size it names, or null. `tabScope` narrows the answer to one tab, for a tab-scoped link.
 */
export async function documentBlobHold(
  env: DocumentEnv,
  documentId: string,
  key: BlobKey,
  tabScope: string | null,
): Promise<{ tabId: string; size: number } | null> {
  const rows = await env.DOCUMENT_DB.prepare(
    `SELECT t.id, json_extract(t.data, '$.size') AS size
       FROM tabs t JOIN document_tabs dt ON dt.tab_id = t.id
      WHERE dt.document_id = ? AND t.kind = 'pdf' AND json_valid(t.data)
        AND json_extract(t.data, '$.blob') = ?`,
  )
    .bind(documentId, key)
    .all<{ id: string; size: number }>();
  // A row's body was checked when it was written (isValidTab), so the size it names is a blob's.
  const row = rows.results.find((held) => tabScope === null || held.id === tabScope);
  return row ? { tabId: row.id, size: row.size } : null;
}
