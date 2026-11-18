// A text document's doors (docs/specs/034-text-documents/live-editing-and-storage.md "Storage",
// files-and-print.md "Downloading"): its live state, to load a surface, and its file, to download.
import type { TextDocumentFileType } from '@livedoc/text-documents';
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

/** The text document as a file, with the name the server gave it. */
export async function apiDownloadTextDocument(
  scope: TextDocumentScope,
  type: TextDocumentFileType,
): Promise<{ blob: Blob; fileName: string }> {
  const res = await bytesOf(scope, `file?type=${type}`, 'text document file');
  const disposition = res.headers.get('Content-Disposition') ?? '';
  const fileName = /filename="([^"]+)"/.exec(disposition)?.[1] ?? `Untitled.${type}`;
  return { blob: await res.blob(), fileName };
}
