// A text document's versions (docs/specs/034-text-documents/live-editing-and-storage.md "The api"): the list, one read
// whole with the one before it, naming the current one or any, and restoring one. Editors only; the room refuses others.
import type {
  TextDocumentVersionDto,
  TextDocumentVersionListDto,
  TextDocumentVersionReadDto,
  TextDocumentVersionWriteDto,
} from '@livedoc/api-schema';
import { API_BASE, apiFetch, apiHeaders, expectOk } from './core';
import type { TextDocumentScope } from './text-documents';

/** The label a name or a restore gives its sender (never who they are: the session says that). */
export type VersionAuthorLabel = { name?: string; color?: string };

const versions = (scope: TextDocumentScope, versionId?: string) =>
  `${API_BASE}/documents/${encodeURIComponent(scope.documentId)}/text-documents/${encodeURIComponent(scope.tabId)}/versions${
    versionId === undefined ? '' : `/${encodeURIComponent(versionId)}`
  }`;

async function call<T>(
  scope: TextDocumentScope,
  url: string,
  what: string,
  method: 'GET' | 'POST' | 'PUT' = 'GET',
  body?: unknown,
): Promise<T> {
  const headers = await apiHeaders(scope.ownerId, { share: scope.shareCode });
  const res = await apiFetch(url, {
    method,
    headers: body === undefined ? headers : { ...headers, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return expectOk<T>(res, what);
}

/** Every version of the text document, newest first. */
export async function apiListTextDocumentVersions(
  scope: TextDocumentScope,
): Promise<TextDocumentVersionDto[]> {
  const list = await call<TextDocumentVersionListDto>(
    scope,
    versions(scope),
    'text document versions',
  );
  return list.versions;
}

/** One version read whole: its snapshot, the one before it, and who wrote what in it. */
export function apiReadTextDocumentVersion(
  scope: TextDocumentScope,
  versionId: string,
): Promise<TextDocumentVersionReadDto> {
  return call(scope, versions(scope, versionId), 'text document version');
}

/** Names the current version: the newest when nothing changed since it, else a version of now. */
export async function apiNameCurrentTextDocumentVersion(
  scope: TextDocumentScope,
  name: string,
  author?: VersionAuthorLabel,
): Promise<TextDocumentVersionDto> {
  const answer = await call<TextDocumentVersionWriteDto>(
    scope,
    versions(scope),
    'text document version name',
    'POST',
    { name, ...(author ? { author } : {}) },
  );
  return answer.version;
}

/** Names, renames or (with an empty name) unnames one version. */
export async function apiNameTextDocumentVersion(
  scope: TextDocumentScope,
  versionId: string,
  name: string,
  author?: VersionAuthorLabel,
): Promise<TextDocumentVersionDto> {
  const answer = await call<TextDocumentVersionWriteDto>(
    scope,
    versions(scope, versionId),
    'text document version name',
    'PUT',
    { name, ...(author ? { author } : {}) },
  );
  return answer.version;
}

/** Restores one version: answers the version the restore left behind. */
export async function apiRestoreTextDocumentVersion(
  scope: TextDocumentScope,
  versionId: string,
  author?: VersionAuthorLabel,
): Promise<TextDocumentVersionDto> {
  const answer = await call<TextDocumentVersionWriteDto>(
    scope,
    versions(scope, versionId),
    'text document version restore',
    'POST',
    author ? { author } : {},
  );
  return answer.version;
}
