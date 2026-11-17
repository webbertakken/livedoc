// One tab as a granted reader reads it: the tab read's answer (GET /api/documents/<id>/tabs/<tabId>) and the tab the
// editor's open read carries (docs/specs/016-platform/web-performance.md "The open is one read"), so both hand out
// the same content and record the same open.
import { DOCUMENT_OPEN_HEADER, readDocumentOpen } from '@livedoc/api-schema';
import type { DocumentGrant } from '../auth/document-access';
import { redactCommentAuthorIds } from '../comments';
import { getParticipant, getTab, type DocumentMeta } from '../db';
import { recordDocumentOpen } from '../home/record-open';
import { recordVisitorOpened } from '../timeline';
import type { TabDTO } from '../types';
import type { DocumentRouteContext } from './context';

// The tab, its other people's comment author ids blanked for anyone but the document's owner, or null when the
// document has no such tab. The caller has already gated the reader on it.
export async function grantedTab(
  ctx: DocumentRouteContext,
  document: DocumentMeta,
  tabId: string,
  reader: string,
): Promise<TabDTO | null> {
  const tab = await getTab(ctx.env, document.id, tabId);
  if (!tab) return null;
  // A visitor only ever sees their OWN author id (so they can delete-own), never another participant's: the same
  // anti-claim posture as the document's owner redaction.
  if (reader === document.ownerId) return tab;
  return { ...tab, elements: redactCommentAuthorIds(tab.elements, reader) };
}

// What reading a tab tells, in the background: a share-link visitor's open for the owner's Timeline
// (docs/specs/013-workspace/timeline.md §4.3), and the reader's own open for their Home when the editor declares the
// read an open (docs/specs/013-workspace/explorer-home.md "Opens", D66).
export function recordTabRead(
  ctx: DocumentRouteContext,
  document: DocumentMeta,
  grant: DocumentGrant,
  reader: string,
): void {
  const { env, request } = ctx;
  // A visitor is someone the grant admitted through a link, never merely a request carrying a share header: a
  // teammate following a share link, or reading their team's library without one, is still a teammate.
  if (reader !== document.ownerId && grant.shareCode !== null) {
    ctx.waitUntil?.(
      getParticipant(env, reader).then((p) =>
        recordVisitorOpened(env, document, reader, p?.name ?? null),
      ),
    );
  }
  // A resync, a duplicate, Take Offline, the Drive mirror and an embed read the same tab and are not opens.
  if (readDocumentOpen(request.headers.get(DOCUMENT_OPEN_HEADER))) {
    ctx.waitUntil?.(recordDocumentOpen(env, document, reader, Date.now()));
  }
}
