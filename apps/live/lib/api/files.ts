// The blob store's doors (docs/specs/006-document/blob-store.md "Getting bytes in", "Getting bytes out"): ask whether
// bytes are held, send them when they are not, in one request or in parts, and read a blob a document holds. How a
// file is sent (which way, what is tried again) is lib/blob-store/send-blob.ts's.
import type { BlobKey } from '@livedoc/document';
import { API_BASE, apiFetch, apiHeaders, expectOk, expectOkVoid } from './core';

// An upload names the document it is for, when there is one: the bytes are then that document's owner's.
const files = (key: BlobKey, documentId?: string, rest = ''): string =>
  `${API_BASE}/files/${key}${rest}${documentId ? `${rest.includes('?') ? '&' : '?'}document=${encodeURIComponent(documentId)}` : ''}`;

/** Whether the bytes with that key are already held: the question an upload begins with. */
export async function apiHoldsBlob(
  ownerId: string,
  key: BlobKey,
  documentId?: string,
): Promise<boolean> {
  const res = await apiFetch(files(key, documentId), { headers: await apiHeaders(ownerId) });
  return (await expectOk<{ held: boolean }>(res, 'file held')).held;
}

const bytesHeaders = async (ownerId: string): Promise<HeadersInit> => ({
  ...(await apiHeaders(ownerId)),
  'Content-Type': 'application/octet-stream',
});

/** Stores the bytes under their key, in one request. */
export async function apiStoreBlob(
  ownerId: string,
  key: BlobKey,
  bytes: Uint8Array<ArrayBuffer>,
  documentId?: string,
): Promise<void> {
  const res = await apiFetch(files(key, documentId), {
    method: 'PUT',
    headers: await bytesHeaders(ownerId),
    body: bytes,
  });
  await expectOkVoid(res, 'file upload');
}

/** An upload in parts as the store answers it: held already, or the upload and the parts storage has. */
export type BegunBlobUpload =
  { held: true } | { held?: false; upload: string; partBytes: number; parts: number[] };

/** Begins storing a file of that size in parts, or resumes the unfinished upload of that key and size. */
export async function apiBeginBlobUpload(
  ownerId: string,
  key: BlobKey,
  size: number,
  documentId?: string,
): Promise<BegunBlobUpload> {
  const res = await apiFetch(files(key, documentId, `/uploads?size=${size}`), {
    method: 'POST',
    headers: await apiHeaders(ownerId),
  });
  return expectOk<BegunBlobUpload>(res, 'file upload begin');
}

/** Stores part `n` (from 1) of an upload; the parts storage has now. */
export async function apiStoreBlobPart(
  ownerId: string,
  key: BlobKey,
  upload: string,
  n: number,
  bytes: Uint8Array<ArrayBuffer>,
  documentId?: string,
): Promise<number[]> {
  const res = await apiFetch(
    files(key, documentId, `/uploads/${encodeURIComponent(upload)}/parts/${n}`),
    { method: 'PUT', headers: await bytesHeaders(ownerId), body: bytes },
  );
  return (await expectOk<{ parts: number[] }>(res, 'file upload part')).parts;
}

/** Puts an upload's parts together under its key. */
export async function apiCompleteBlobUpload(
  ownerId: string,
  key: BlobKey,
  upload: string,
  documentId?: string,
): Promise<void> {
  const res = await apiFetch(
    files(key, documentId, `/uploads/${encodeURIComponent(upload)}/complete`),
    { method: 'POST', headers: await apiHeaders(ownerId) },
  );
  await expectOkVoid(res, 'file upload complete');
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
