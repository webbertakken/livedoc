// Share-link + share-password calls (docs/specs/013-workspace/share-password.md): resolve a share code to
// a document, list/create/delete links, and set the document password.
import {
  type DocumentOpenResponse,
  type ShareLink,
  type ShareLinkExpiry,
  type ShareLinkResponse,
  type ShareRole,
} from '@livedoc/api-schema';
import { dedupeInFlight } from '../dedupe';
import {
  API_BASE,
  apiDelete,
  apiHeaders,
  expectOk,
  expectOkOrNull,
  type SharedDocumentResolution,
  type ShareLinksResponse,
  type SharePasswordResponse,
  apiFetch,
} from './core';
import { shareRead } from './open-path-requests';
import { expectReaderFromOpen, participantOf } from './self';
import { clientTabOf } from './tabs';
import { parseStoredLevel } from '@livedoc/api-schema';

// Resolve a share code to a full document + the role granted by that
// code. Visitors landing on `/document/shared?s=<code>` use
// this; revoked codes return 404 from the API. Deduped by `${code}|
// ${ownerId}` so Strict Mode's double-invoke doesn't fire two share
// lookups for the same visitor, while a different visitor on the
// same code still gets its own lookup. The visitor's ownerId is
// passed so the api worker can recognise them and record the visit
// into shared_with; without it the worker can't identify the
// visitor and the "Shared with you" list stays empty.
async function _apiLoadShared(
  code: string,
  ownerId: string,
  opts: { open?: boolean } = {},
): Promise<SharedDocumentResolution | null> {
  const { url, headers } = await shareRead(code, ownerId, opts);
  const res = await apiFetch(url, { headers });
  // Password gate (docs/specs/013-workspace/share-password.md): 401 = the document is protected and we sent
  // no (or no longer-valid) password; 403 = we sent a wrong one. Both
  // surface as `passwordRequired` so the editor shows the gate; only
  // 403 flags `invalid` so it can show an error line. The password the
  // visitor enters next is attached automatically by apiHeaders.
  if (res.status === 401 || res.status === 403) {
    return { passwordRequired: true, invalid: res.status === 403, rateLimited: false };
  }
  // Too many tries at the password (429 password_rate_limited): the gate stays up and asks the visitor to wait. A
  // plain 429 (the resolve's own request throttle) is not about the password and fails like any other error below.
  if (res.status === 429 && (await errorCodeOf(res)) === 'password_rate_limited') {
    return { passwordRequired: true, invalid: false, rateLimited: true };
  }
  const body = await expectOkOrNull<
    DocumentOpenResponse & {
      role?: ShareRole;
      tabId?: string | null;
      shareGrant?: string | null;
    }
  >(res, 'load shared');
  if (!body) return null;
  const { openedTab, reader } = body;
  return {
    document: body.document,
    role: parseStoredLevel(body.role),
    tabId: typeof body.tabId === 'string' ? body.tabId : null,
    shareGrant: typeof body.shareGrant === 'string' ? body.shareGrant : null,
    ...(openedTab === undefined ? {} : { opened: openedTab ? clientTabOf(openedTab) : null }),
    ...(reader === undefined ? {} : { reader: reader ? participantOf(reader) : null }),
  };
}

async function errorCodeOf(res: Response): Promise<string | null> {
  const body = (await res
    .clone()
    .json()
    .catch(() => null)) as { error?: unknown } | null;
  return typeof body?.error === 'string' ? body.error : null;
}

const loadSharedOnce = dedupeInFlight(
  _apiLoadShared,
  (code, ownerId, opts) => `${code}|${ownerId}|${opts?.open ? 'open' : ''}`,
);

/** A share code resolved; `open` is the editor's open, whose answer also answers the participant read beside it. */
export function apiLoadShared(
  code: string,
  ownerId: string,
  opts: { open?: boolean } = {},
): Promise<SharedDocumentResolution | null> {
  const loading = loadSharedOnce(code, ownerId, opts);
  if (opts.open) {
    expectReaderFromOpen(
      ownerId,
      loading.then(
        (resolved) => (resolved && 'reader' in resolved ? resolved.reader : undefined),
        () => undefined,
      ),
    );
  }
  return loading;
}

// Deduped on `${ownerId}|${id}`: editor mount fires this for the
// share-dialog state alongside the other read endpoints. Strict
// Mode doubling collapses to one fetch.
// Returns the document's share links AND whether a share password is set
// (docs/specs/013-workspace/share-password.md) in one owner-only round-trip: the Share dialog needs both.
async function _apiListShareLinks(
  ownerId: string,
  id: string,
): Promise<{ links: ShareLink[]; passwordSet: boolean }> {
  const res = await apiFetch(`${API_BASE}/documents/${id}/share`, {
    headers: await apiHeaders(ownerId),
  });
  const { links, passwordSet } = await expectOk<ShareLinksResponse>(res, 'list share links');
  return { links, passwordSet: passwordSet === true };
}
export const apiListShareLinks = dedupeInFlight(
  _apiListShareLinks,
  (ownerId, id) => `${ownerId}|${id}`,
);

// Set (or clear, with null / empty) the document's share password.
// Owner-only on the api side. Resolves to whether a password is now set
// (a whitespace-only value clears it).
export async function apiSetSharePassword(
  ownerId: string,
  id: string,
  password: string | null,
): Promise<boolean> {
  const res = await apiFetch(`${API_BASE}/documents/${id}/share-password`, {
    method: 'PUT',
    headers: await apiHeaders(ownerId, { body: true }),
    body: JSON.stringify({ password }),
  });
  // A too-short new password is the owner's to fix, worded by the dialog: not an error to report.
  const { passwordSet } = await expectOk<SharePasswordResponse>(
    res,
    'set share password',
    (code) => code === 'password_too_short',
  );
  return passwordSet === true;
}

export async function apiCreateShareLink(
  ownerId: string,
  id: string,
  role: ShareRole,
  expiry: ShareLinkExpiry = 'never',
  // The one tab the link opens (docs/specs/013-workspace/tab-scoped-share-links.md); null = All tabs.
  tabId: string | null = null,
): Promise<ShareLink> {
  const res = await apiFetch(`${API_BASE}/documents/${id}/share`, {
    method: 'POST',
    headers: await apiHeaders(ownerId, { body: true }),
    body: JSON.stringify({ role, expiry, tabId }),
  });
  const { link } = await expectOk<ShareLinkResponse>(res, 'create share link');
  return link;
}

// Re-arm an expiring link for another round of its creation-time
// duration (docs/specs/013-workspace/share-link-expiry.md). Returns the updated link with its new deadline.
export async function apiExtendShareLink(
  ownerId: string,
  id: string,
  code: string,
): Promise<ShareLink> {
  const res = await apiFetch(`${API_BASE}/documents/${id}/share/${code}/extend`, {
    method: 'POST',
    headers: await apiHeaders(ownerId),
  });
  const { link } = await expectOk<ShareLinkResponse>(res, 'extend share link');
  return link;
}

// Change which tabs a link opens (docs/specs/013-workspace/tab-scoped-share-links.md): a tab id, or null for
// All tabs. The code stays; its holders reload into the new scope.
export async function apiRescopeShareLink(
  ownerId: string,
  id: string,
  code: string,
  tabId: string | null,
): Promise<ShareLink> {
  const res = await apiFetch(`${API_BASE}/documents/${id}/share/${code}`, {
    method: 'PUT',
    headers: await apiHeaders(ownerId, { body: true }),
    body: JSON.stringify({ tabId }),
  });
  const { link } = await expectOk<ShareLinkResponse>(res, 'rescope share link');
  return link;
}

export async function apiDeleteShareLink(ownerId: string, id: string, code: string): Promise<void> {
  return apiDelete(`${API_BASE}/documents/${id}/share/${code}`, ownerId, {
    action: 'delete share link',
  });
}
