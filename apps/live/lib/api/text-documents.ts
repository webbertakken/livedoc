// A text document's doors (docs/specs/034-text-documents/live-editing-and-storage.md "Storage",
// files-and-print.md "Downloading"): its live state, to load a surface, and its file, to download.
import {
  TEXT_DOCUMENT_PICTURES_LEFT_OUT_HEADER,
  TEXT_DOCUMENT_STATE_VECTOR_HEADER,
} from '@livedoc/api-schema';
import type { TextDocumentFileType } from '@livedoc/text-documents';
import { base64OfBytes, bytesOfBase64 } from '@livedoc/text-documents/base64';
import { API_BASE, apiFetch, apiHeaders, expectOkVoid } from './core';

export type TextDocumentScope = {
  ownerId: string;
  documentId: string;
  tabId: string;
  shareCode: string | null;
};

const door = (scope: TextDocumentScope, rest: string) =>
  `${API_BASE}/documents/${encodeURIComponent(scope.documentId)}/text-documents/${encodeURIComponent(scope.tabId)}/${rest}`;

async function bytesOf(scope: TextDocumentScope, rest: string, what: string): Promise<Response> {
  const res = await apiFetch(door(scope, rest), {
    headers: await apiHeaders(scope.ownerId, { share: scope.shareCode }),
  });
  await expectOkVoid(res, what);
  return res;
}

/** The text document's live state as one Yjs update. */
export async function apiLoadTextDocumentState(scope: TextDocumentScope): Promise<Uint8Array> {
  const res = await bytesOf(scope, 'state', 'text document state');
  return new Uint8Array(await res.arrayBuffer());
}

/** What a catch-up reads ("Reconnecting"): what the room's state holds beyond `since`, and the state's own vector,
 *  so the reader can send what the room lacks. */
export type TextDocumentStateSince = { update: Uint8Array; stateVector: Uint8Array };

// A state vector past this rides no URL: the catch-up reads the whole state instead. Safe range: 1 to 6 KB (URLs).
const SINCE_MAX_CHARS = 4_096;

export async function apiLoadTextDocumentStateSince(
  scope: TextDocumentScope,
  since: Uint8Array,
): Promise<TextDocumentStateSince> {
  const vector = base64OfBytes(since);
  const query = vector.length <= SINCE_MAX_CHARS ? `?since=${encodeURIComponent(vector)}` : '';
  const res = await bytesOf(scope, `state${query}`, 'text document state');
  const header = res.headers.get(TEXT_DOCUMENT_STATE_VECTOR_HEADER);
  const stateVector = header ? bytesOfBase64(header) : null;
  if (!stateVector) throw new Error('text document state: no state vector');
  return { update: new Uint8Array(await res.arrayBuffer()), stateVector };
}

/** Send one update by the door ("Sending"): one too large for a frame. Resolves once the room has stored it. */
export async function apiPostTextDocumentUpdate(
  scope: TextDocumentScope,
  update: Uint8Array,
): Promise<void> {
  const res = await apiFetch(door(scope, 'updates'), {
    method: 'POST',
    headers: {
      ...(await apiHeaders(scope.ownerId, { share: scope.shareCode })),
      'Content-Type': 'application/octet-stream',
    },
    body: update.slice().buffer,
  });
  await expectOkVoid(res, 'text document update');
}

/** The text document as a file, with the name the server gave it. */
export async function apiDownloadTextDocument(
  scope: TextDocumentScope,
  type: TextDocumentFileType,
): Promise<{ blob: Blob; fileName: string; leftOut: number }> {
  const res = await bytesOf(scope, `file?type=${type}`, 'text document file');
  const disposition = res.headers.get('Content-Disposition') ?? '';
  const fileName = /filename="([^"]+)"/.exec(disposition)?.[1] ?? `Untitled.${type}`;
  // The pictures it left out, their media not read (objects.md "Where the bytes live").
  const leftOut = Number(res.headers.get(TEXT_DOCUMENT_PICTURES_LEFT_OUT_HEADER) ?? 0) || 0;
  return { blob: await res.blob(), fileName, leftOut };
}
