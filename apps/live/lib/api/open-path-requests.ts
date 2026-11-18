// The open path's reads, as requests (docs/specs/016-platform/web-performance.md "The open path asks in parallel"):
// the one place their address and headers are made, for the api calls that ask them and for the early reads
// (lib/open-path/early-document-reads.ts) that ask them first. The two must agree to the header, or the editor's
// request misses the early answer (early-reads.ts) and asks again.
import { DOCUMENT_OPEN_HEADER } from '@livedoc/api-schema';
import { API_BASE, apiHeaders, SessionTokenUnavailableError } from './core';

export type ApiRead = { url: string; headers: HeadersInit };

// The participant row, asked as yourself (docs/specs/015-api/api.md). The GET is open, so a signed-in session whose
// token is momentarily unavailable (which apiHeaders reports) still loads its profile, anonymously.
export async function participantRead(id: string): Promise<ApiRead> {
  let headers: HeadersInit;
  try {
    headers = await apiHeaders(id);
  } catch (error) {
    if (!(error instanceof SessionTokenUnavailableError)) throw error;
    headers = {};
  }
  return { url: `${API_BASE}/participants/${id}`, headers };
}

// A share code resolved to its document, as the visitor `ownerId`, so the api records the visit. `open` marks it as the
// editor's open, which carries the tab the visitor opens first and their own participant row
// (docs/specs/016-platform/web-performance.md "The open is one read").
export async function shareRead(
  code: string,
  ownerId: string,
  opts: { open?: boolean } = {},
): Promise<ApiRead> {
  return {
    url: `${API_BASE}/share/${code}`,
    headers: await apiHeaders(ownerId, {
      share: null,
      ...(opts.open ? { extra: { [DOCUMENT_OPEN_HEADER]: '1' } } : {}),
    }),
  };
}

// A document of the server, by id. `open` marks it as the editor's open, which answers the tab it opens first and the
// reader's own participant row with it (docs/specs/016-platform/web-performance.md "The open is one read").
export async function documentRead(
  ownerId: string,
  id: string,
  opts: { open?: boolean } = {},
): Promise<ApiRead> {
  return {
    url: `${API_BASE}/documents/${id}`,
    headers: await apiHeaders(ownerId, opts.open ? { extra: { [DOCUMENT_OPEN_HEADER]: '1' } } : {}),
  };
}

// One tab's content, presenting the share code that admitted the reader (null for the owner). `open` marks the
// read as an open of the document (docs/specs/013-workspace/explorer-home.md "Opens").
export async function tabRead(
  ownerId: string,
  documentId: string,
  tabId: string,
  shareCode: string | null,
  opts: { open?: boolean } = {},
): Promise<ApiRead> {
  return {
    url: `${API_BASE}/documents/${documentId}/tabs/${tabId}`,
    headers: await apiHeaders(ownerId, {
      share: shareCode,
      ...(opts.open ? { extra: { [DOCUMENT_OPEN_HEADER]: '1' } } : {}),
    }),
  };
}
