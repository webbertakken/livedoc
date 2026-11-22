// A PDF document's doors (docs/specs/035-pdf-documents/live-editing-and-storage.md "Storage"): its live changes, with
// the key of the stored file they are on, and one update too large for a frame.
import { PDF_STORED_FILE_HEADER, TEXT_DOCUMENT_STATE_VECTOR_HEADER } from '@livedoc/api-schema';
import { isBlobKey, type BlobKey } from '@livedoc/document';
import { base64OfBytes, bytesOfBase64 } from '@livedoc/text-documents/base64';
import { API_BASE, apiFetch, apiHeaders, expectOkVoid } from './core';

export type PdfDocumentScope = {
  ownerId: string;
  documentId: string;
  tabId: string;
  shareCode: string | null;
};

const door = (scope: PdfDocumentScope, rest: string) =>
  `${API_BASE}/documents/${encodeURIComponent(scope.documentId)}/pdf-documents/${encodeURIComponent(scope.tabId)}/${rest}`;

/** What a read of the live changes answers: the update, the state's own vector, and the stored file it is on. */
export type PdfStateRead = {
  update: Uint8Array;
  stateVector: Uint8Array;
  storedFile: BlobKey;
};

// A state vector past this rides no URL: the catch-up reads the whole state instead. Safe range: 1 to 6 KB (URLs).
const SINCE_MAX_CHARS = 4_096;

/** The live changes as one Yjs update; with `since` (a state vector), only what lies beyond it. */
export async function apiLoadPdfState(
  scope: PdfDocumentScope,
  since?: Uint8Array,
): Promise<PdfStateRead> {
  const vector = since ? base64OfBytes(since) : '';
  const query =
    vector !== '' && vector.length <= SINCE_MAX_CHARS ? `?since=${encodeURIComponent(vector)}` : '';
  const res = await apiFetch(door(scope, `state${query}`), {
    headers: await apiHeaders(scope.ownerId, { share: scope.shareCode }),
  });
  await expectOkVoid(res, 'PDF state');
  const storedFile = res.headers.get(PDF_STORED_FILE_HEADER);
  const header = res.headers.get(TEXT_DOCUMENT_STATE_VECTOR_HEADER);
  const stateVector = header ? bytesOfBase64(header) : null;
  if (!isBlobKey(storedFile) || !stateVector) throw new Error('PDF state: headers missing');
  return { update: new Uint8Array(await res.arrayBuffer()), stateVector, storedFile };
}

/**
 * Send one update by the door: one too large for a frame. `on`: the stored file it was made on; the room refuses
 * one made on another. Resolves once the room has stored it.
 */
export async function apiPostPdfUpdate(
  scope: PdfDocumentScope,
  update: Uint8Array,
  on: BlobKey,
): Promise<void> {
  const res = await apiFetch(door(scope, 'updates'), {
    method: 'POST',
    headers: {
      ...(await apiHeaders(scope.ownerId, { share: scope.shareCode })),
      'Content-Type': 'application/octet-stream',
      [PDF_STORED_FILE_HEADER]: on,
    },
    body: update.slice().buffer,
  });
  await expectOkVoid(res, 'PDF update');
}
