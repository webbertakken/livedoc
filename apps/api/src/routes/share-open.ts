// A share link opened in one read (docs/specs/016-platform/web-performance.md "The open is one read",
// docs/specs/015-api/api.md): the share read, marked as an open, carries the tab the visitor opens first and the
// visitor's own participant row. The tab is the document room's answer to the visitor's own tab read, asked with
// their identity, the link's code and the password or grant they sent, so the room's gate, redaction and open record
// are the tab read's own.
import type { ParticipantRecord, TabRecord, TabResponse } from '@livedoc/api-schema';
import { getParticipant } from '../db';
import { askRoom, documentRoom } from '../document-room/document-client';
import { identityOf } from '../document-room/document-route';
import type { RouteContext } from './context';

export type ShareOpening = { openedTab: TabRecord | null; reader: ParticipantRecord | null };

export async function openSharedForVisitor(
  ctx: RouteContext,
  opening: {
    documentId: string;
    ownerId: string;
    code: string;
    // The tab the visitor opens first (lib/tab-scope.ts firstTabToLoad): the link's own tab, else the first.
    tabId: string | null;
    visitor: string;
  },
): Promise<ShareOpening> {
  const { documentId, ownerId, code, tabId, visitor } = opening;
  const [openedTab, row] = await Promise.all([
    // The owner opening their own link reads as the owner, presenting no code, as the editor does.
    tabId ? roomTab(ctx, documentId, tabId, visitor === ownerId ? null : code) : null,
    getParticipant(ctx.env, visitor).catch((err: unknown) => {
      console.warn('[share] open_reader_failed', err);
      return null;
    }),
  ]);
  // The published picture goes to a signed-in caller only, as GET /api/participants/:id hands it out.
  const reader = row ? { ...row, pictureUrl: ctx.verifiedAccountId ? row.pictureUrl : null } : null;
  return { openedTab, reader };
}

async function roomTab(
  ctx: RouteContext,
  documentId: string,
  tabId: string,
  code: string | null,
): Promise<TabRecord | null> {
  const url = new URL(ctx.request.url);
  url.pathname = url.pathname.replace(/\/share\/[^/]+$/, `/documents/${documentId}/tabs/${tabId}`);
  url.search = '';
  const headers = new Headers(ctx.request.headers);
  if (code) headers.set('X-Share-Code', code);
  else headers.delete('X-Share-Code');
  const request = new Request(url, { method: 'GET', headers });
  const res = await askRoom(request, () =>
    documentRoom(ctx.env, documentId).route(request, identityOf(ctx)),
  );
  if (!res.ok) {
    // The editor reads the tab itself, and meets whatever refused it here.
    console.warn(`[share] open_tab_unanswered status=${res.status}`);
    return null;
  }
  return (await res.json<TabResponse>()).tab;
}
