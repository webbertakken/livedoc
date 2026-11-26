// A PDF tab as its room stores it (docs/specs/035-pdf-documents/live-editing-and-storage.md "Storage"): its row names
// its stored file; its live changes are a live tab kind's (live-tabs/live-tab-store.ts, PDF_LIVE_TAB).
import { previousVersionHeldUntil } from './pdf-previous';
import { pdfTabOf, type BlobKey, type PdfTabFile } from '@livedoc/document';
import { storedLiveTab } from '../live-tabs/live-tab-store';
import type { DocumentEnv } from '../types';
import { pdfDigest, PdfLiveChanges } from '@livedoc/pdf-documents';
import { documentOwnerBlobSize } from '../db/blobs';
import { storedUpdates } from '../live-tabs/live-tab-store';
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
 * Whether the document holds the key (docs/specs/006-document/blob-store.md "Holds and retention", "Getting bytes
 * out"): the tab naming it, keeping it as a previous version whose day has not come, or a mark of it naming it as its
 * picture (a custom stamp's, custom-stamps.md "Placing one") where the document's owner holds its bytes, with its size;
 * or null.
 * `tabScope` narrows the answer to one tab, for a tab-scoped link.
 */
export async function documentBlobHold(
  env: DocumentEnv,
  documentId: string,
  key: BlobKey,
  tabScope: string | null,
  now = Date.now(),
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
  if (row) return { tabId: row.id, size: row.size };
  const previous = await env.DOCUMENT_DB.prepare(
    `SELECT p.tab_id AS id, p.size, p.replaced_at FROM pdf_previous p
       JOIN document_tabs dt ON dt.tab_id = p.tab_id
      WHERE dt.document_id = ? AND p.blob = ? ORDER BY p.replaced_at DESC`,
  )
    .bind(documentId, key)
    .all<{ id: string; size: number; replaced_at: number }>();
  const version = previous.results.find(
    (held) =>
      (tabScope === null || held.id === tabScope) &&
      previousVersionHeldUntil(held.replaced_at) > now,
  );
  if (version) return { tabId: version.id, size: version.size };
  return markedHold(env, documentId, key, tabScope);
}

/**
 * The PDF tab whose marks name the key as a picture, read from its live changes as they stand (never a digest that
 * trails them), with the size of the bytes the document's owner holds; null where no mark names it or the owner
 * holds no bytes of it. Read only for a key no tab row names: a picture is fetched once and cached for good.
 */
async function markedHold(
  env: DocumentEnv,
  documentId: string,
  key: BlobKey,
  tabScope: string | null,
): Promise<{ tabId: string; size: number } | null> {
  const tabs = await env.DOCUMENT_DB.prepare(
    `SELECT t.id FROM tabs t JOIN document_tabs dt ON dt.tab_id = t.id
      WHERE dt.document_id = ? AND t.kind = 'pdf' ORDER BY dt.order_index`,
  )
    .bind(documentId)
    .all<{ id: string }>();
  for (const { id } of tabs.results) {
    if (tabScope !== null && id !== tabScope) continue;
    const changes = PdfLiveChanges.load(await storedUpdates(env, PDF_LIVE_TAB, id));
    if (!pdfDigest(changes).blobKeys.includes(key)) continue;
    const size = await documentOwnerBlobSize(env, documentId, key);
    return size === null ? null : { tabId: id, size };
  }
  return null;
}
