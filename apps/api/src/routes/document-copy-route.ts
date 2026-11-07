// /api/documents/:id/copy (docs/specs/006-document/document-storage.md, Copy): answered in
// the worker, which moves the content from the source's room into the copy's.

// /api/documents — document metadata, per-tab content, copy, folder
// assignment, tab linking, comments, share links, the realtime WS
// upgrade. The largest resource: every sub-path
// under a document id lives here.

import { sharePasswordOk } from '../auth/share-access';
import { roomUnavailable } from '../document-room/document-route';
import { capStoredName } from '../names';
import {} from '../comments';
import { copyDocument, getDocument, getParticipant, listSharedWith } from '../db';
import { forbidden, json, notFound } from '../responses';
import { recordDocumentDuplicated, recordVisitorCopied } from '../timeline';
import {
  gateGrant,
  missingDocument,
  requireOwner,
  shareCodeOf,
  sharePasswordOf,
  type RouteContext,
} from './context';

export async function handleDocumentCopy(ctx: RouteContext): Promise<Response> {
  const { request, env, segments } = ctx;
  // /api/documents/<id>/copy — duplicate this document into the
  // caller's own files. Accepted from (a) the owner — same as
  // any other "duplicate" path; (b) a visitor with an active
  // `shared_with` row for the source; (c) a visitor providing
  // a valid X-Share-Code for the source. Skips share_links on the
  // copy by design (docs/specs/014-identity/auth-and-guest-access.md) so
  // the new document reads as the visitor's own clean workspace.
  if (segments.length === 4 && segments[3] === 'copy') {
    const id = segments[2]!;
    if (request.method === 'POST') {
      const owner = requireOwner(ctx);
      if (owner instanceof Response) return owner;
      const source = await getDocument(env, id);
      if (!source) return missingDocument(ctx, id);
      // Authorisation: any of (a) owner, (b) holder of any
      // share code (view or edit) for this document, (c)
      // visitor with an active shared_with row for the source.
      // The owner + share-code legs are exactly canReadDocument
      // (view-role visitors can fork their own copy, so this
      // is a read check, not an edit check). The third leg is
      // copy-specific so it stays inline.
      //
      // Either way a tab-scoped visitor (docs/specs/013-workspace/tab-scoped-share-links.md) copies their tab
      // only: the share-code leg carries the link's scope, the shared_with
      // leg the scope recorded on their last visit.
      let scope: { tabScope: string | null } | null = await gateGrant(
        ctx,
        id,
        source.ownerId,
        source.teamId,
      );
      if (!scope) {
        const sharedRow = (await listSharedWith(env, owner)).find((s) => s.id === id);
        // A past visit is no way round the document's share password
        // (docs/specs/013-workspace/share-password.md): it must be given here as on every share-link read.
        if (sharedRow && (await sharePasswordOk(env, id, sharePasswordOf(request))))
          scope = { tabScope: sharedRow.tabId };
      }
      if (!scope) return forbidden();
      // A body is optional here, and a JSON `null` is as good as none.
      const body = ((await request.json().catch(() => null)) ?? {}) as {
        name?: unknown;
      };
      const newId = crypto.randomUUID();
      // The copy's name meets the name cap (docs/specs/006-document/name-length.md),
      // including the default, which a long source name pushes past it.
      const requested =
        typeof body.name === 'string' ? capStoredName(body.name, null, 'document') : '';
      const newName = requested || capStoredName(`Copy of ${source.name}`, null, 'document');
      let copy: Awaited<ReturnType<typeof copyDocument>>;
      try {
        copy = await copyDocument(
          env,
          id,
          newId,
          owner,
          newName,
          scope.tabScope,
          // Anyone but the owner copies the comments as the tab read serves them to them.
          owner === source.ownerId ? null : owner,
        );
      } catch (error) {
        // A room out of reach (the source's export or the copy's import); the source is untouched.
        return roomUnavailable(request, error);
      }
      if (!copy) return notFound();
      // A copy is one document made on purpose: always a use (docs/specs/015-api/api.md "Marking a
      // document used").
      ctx.waitUntil?.(recordDocumentDuplicated(env, copy, source.name, owner, { markUsed: true }));
      // A copy taken by someone who came in through a share link is news the
      // owner wants: their shared document was worth forking.
      //
      // Same gate as the visitor-open event, for the same reason: the copy
      // route's read check admits joined team members, who present no share
      // code, and telling an owner that a teammate duplicating a team-library
      // document was "copied by a visitor" is simply untrue.
      // A visitor is someone the grant admitted through a link, never merely a request carrying a share header.
      if (owner !== source.ownerId && shareCodeOf(request) !== null) {
        ctx.waitUntil?.(
          gateGrant(ctx, source.id, source.ownerId, source.teamId).then(async (grant) => {
            if (!grant?.shareCode) return;
            const p = await getParticipant(env, owner);
            await recordVisitorCopied(env, source, owner, p?.name ?? null);
          }),
        );
      }
      return json({ document: copy }, { status: 201 });
    }
  }
  return notFound();
}
