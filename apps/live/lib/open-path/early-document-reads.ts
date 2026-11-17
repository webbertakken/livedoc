// The open path asked while the editor's code downloads (docs/specs/016-platform/web-performance.md "The open path
// asks in parallel"). Started by EarlyDocumentReadsBoot once the session has settled, on a page load at a
// document's address. It asks what the editor's identity bootstrap would, in its order, as the same person and
// with the same headers (lib/api/open-path-requests.ts): the guest's signed id, then the participant row beside the
// document or the share link, then the first tab. The answers wait in the early reads pool (lib/api/early-reads.ts)
// for the editor's own requests to take. Loaded by dynamic import, so no other route carries it.
import { parseStoredLevel, type LiveDoc } from '@livedoc/api-schema';
import { readCachedShareGrant, setSessionSharePassword } from '@/lib/api/core';
import { askEarly } from '@/lib/api/early-reads';
import { documentRead, participantRead, shareRead, tabRead } from '@/lib/api/open-path-requests';
import { guestMintedForThisPage } from '@/lib/api/self';
import { debugLog } from '@/lib/debug-log';
import { resolveDocumentSession } from '@/lib/document-session';
import { ensureSignedGuestIdentity } from '@/lib/guest-identity';
import { documentIdFromPath } from '@/lib/legacy-editor-path';
import { isOfflineId } from '@/lib/offline/offline-ids';
import { firstTabToLoad } from '@/lib/tab-scope';

// What the address opened, as the editor reads it: the document, the one tab a scoped link opens, and the share
// code the tab read presents (null for the document's owner).
type Opened = { document: LiveDoc; scope: string | null; tabShareCode: string | null };

export async function askEarlyDocumentReads(input: {
  // The account the settled session names, or null for a guest.
  accountId: string | null;
  href: string;
}): Promise<void> {
  const url = new URL(input.href);
  const { id } = documentIdFromPath(url.pathname);
  const shareCode = url.searchParams.get('s');
  if (!id && !shareCode) {
    debugLog('[early-reads] none reason=no-document');
    return;
  }
  try {
    // The editor's own mint: concurrent callers share one, and the id it lands in storage is the one the editor reads.
    const selfId = input.accountId ?? (await ensureSignedGuestIdentity()).id;
    // A guest id the api minted for this page has no row yet: the editor writes it, never reads it first.
    if (!guestMintedForThisPage(selfId)) {
      const participant = await participantRead(selfId);
      void askEarly('participant', participant.url, participant.headers);
    }
    const opened = shareCode ? await openShared(shareCode, selfId) : await openOwn(id!, selfId);
    if (!opened) return;
    const { document, scope, tabShareCode } = opened;
    const firstId = firstTabToLoad(document.tabs, scope);
    if (!firstId || !document.tabs.some((t) => t.id === firstId)) {
      debugLog('[early-reads] done reason=no-tab');
      return;
    }
    const tab = await tabRead(selfId, document.id, firstId, tabShareCode, { open: true });
    void askEarly('tab', tab.url, tab.headers);
  } catch (err) {
    // A signed-in reader without a token, say: the editor meets the same and handles it; nothing is asked early.
    debugLog(`[early-reads] stopped ${String(err)}`);
  }
}

// A share link, with the cached grant the editor would send (docs/specs/013-workspace/share-password.md).
async function openShared(code: string, selfId: string): Promise<Opened | null> {
  const grant = readCachedShareGrant(code);
  if (grant) setSessionSharePassword(grant);
  const share = await shareRead(code, selfId);
  const body = await answerOf(askEarly('share', share.url, share.headers));
  const document = body?.document as LiveDoc | undefined;
  if (!document) return null;
  const { sessionShareCode } = resolveDocumentSession({
    documentOwnerId: document.ownerId,
    selfId,
    shareRole: parseStoredLevel(body!.role),
    shareCodeParam: code,
  });
  return {
    document,
    scope: typeof body!.tabId === 'string' ? body!.tabId : null,
    tabShareCode: sessionShareCode,
  };
}

// A document by its id, unless it lives in This Browser: then the server is asked nothing about it.
async function openOwn(id: string, selfId: string): Promise<Opened | null> {
  if (await isOfflineId(id)) {
    debugLog('[early-reads] done reason=this-browser');
    return null;
  }
  const read = await documentRead(selfId, id);
  const document = (await answerOf(askEarly('document', read.url, read.headers)))?.document;
  return document ? { document: document as LiveDoc, scope: null, tabShareCode: null } : null;
}

// The body of an early answer the server granted; null when it was not asked, failed, or was refused.
async function answerOf(
  asked: Promise<Response | null> | null,
): Promise<Record<string, unknown> | null> {
  const res = asked && (await asked);
  if (!res?.ok) return null;
  return (await res.json().catch(() => null)) as Record<string, unknown> | null;
}
