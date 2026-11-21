// The blob store's doors (docs/specs/006-document/blob-store.md "Getting bytes in", "Getting bytes out"): ask whether
// bytes are held, send them when they are not, and read a blob a document holds.
import type { BlobKey } from '@livedoc/document';
import { API_BASE, apiFetch, apiHeaders, expectOkVoid } from './core';

const files = (key: BlobKey) => `${API_BASE}/files/${key}`;

/** Whether this person already holds the bytes with that key: the question an upload begins with. */
export async function apiHoldsBlob(ownerId: string, key: BlobKey): Promise<boolean> {
  const res = await apiFetch(files(key), { headers: await apiHeaders(ownerId) });
  if (res.status === 404) return false;
  await expectOkVoid(res, 'file held');
  return true;
}

/** Stores the bytes under their key for this person, in one request. */
export async function apiStoreBlob(
  ownerId: string,
  key: BlobKey,
  bytes: Uint8Array<ArrayBuffer>,
): Promise<void> {
  const res = await apiFetch(files(key), {
    method: 'PUT',
    headers: { ...(await apiHeaders(ownerId)), 'Content-Type': 'application/octet-stream' },
    body: bytes,
  });
  await expectOkVoid(res, 'file upload');
}

export type DocumentBlobScope = { ownerId: string; documentId: string; shareCode: string | null };

/** The bytes of a blob the document holds, whole. */
export async function apiReadBlob(
  scope: DocumentBlobScope,
  key: BlobKey,
): Promise<Uint8Array<ArrayBuffer>> {
  const res = await apiFetch(
    `${API_BASE}/documents/${encodeURIComponent(scope.documentId)}/files/${key}`,
    { headers: await apiHeaders(scope.ownerId, { share: scope.shareCode }) },
  );
  await expectOkVoid(res, 'file read');
  return new Uint8Array(await res.arrayBuffer());
}
