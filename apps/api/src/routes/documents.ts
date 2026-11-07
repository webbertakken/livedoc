// /api/documents: document metadata, per-tab content, folder assignment, tab linking, comments, share links
// (docs/specs/006-document/document-storage.md). The worker answers the collection (list,
// create), the copy and the realtime room's ticket and upgrade; every other path under /api/documents/:id/ is handed
// to the document's room, which answers it with handleDocumentRequest against its own SQLite.

// /api/documents — document metadata, per-tab content, copy, folder
// assignment, tab linking, comments, share links, the realtime WS
// upgrade. The largest resource: every sub-path
// under a document id lives here.

import { capStoredName } from '../names';
import { MAX_DECK_LEN } from '../limits';
import {} from '../comments';
import {
  getDocument,
  getDocumentThumbMeta,
  readReorderEntries,
  reorderTabs,
  setDocumentPresentation,
  upsertDocumentMeta,
} from '../db';
import { badRequest, forbidden, json, notFound, svgImage } from '../responses';
import { isAppearance } from '@livedoc/document';
import { documentImageSvg } from '../document-image';
import { redactDocumentForReader, redactDocumentForScope } from '../redact-document';
import { answerOverview, parseViewQuery } from './document-views-route';
import { handleDocumentDelete } from './document-delete-route';
import { handleDocumentPlacement } from './document-placement-route';
import { handleDocumentSharedTabs } from './document-shared-tabs-route';
import { relayDocumentRename } from '../room-client';
import { handleDocumentRoomRoutes } from './document-room-routes';
import { handleDocumentSubresources } from './document-subresource-routes';
import {
  gateEdit,
  gateGrant,
  missingDocument,
  requireOwner,
  type DocumentRouteContext,
  type RouteContext,
  readBody,
} from './context';
import { handleDocumentCollection } from './document-collection-route';
import { handleDocumentCopy } from './document-copy-route';
import { askRoom, documentRoom } from '../document-room/document-client';
import { identityOf } from '../document-room/document-route';
import { purgeOwed } from '../room-purge-client';

// The longest document id the worker names a room by. Ids are UUIDs; this only stops a hostile path from naming
// rooms with huge ids.
const MAX_DOCUMENT_ID = 200;

export async function handleDocuments(ctx: RouteContext): Promise<Response> {
  const { request, segments } = ctx;
  if (segments[1] !== 'documents') return notFound();
  if (segments.length === 2) return handleDocumentCollection(ctx);
  // Realtime-room admission (docs/specs/015-api/api.md): the one-time WS ticket mint + the room's upgrade, which
  // stay in the worker so the room never calls itself (document-room-routes.ts).
  const roomResp = await handleDocumentRoomRoutes(ctx);
  if (roomResp) return roomResp;
  if (segments.length === 4 && segments[3] === 'copy') return handleDocumentCopy(ctx);
  const id = segments[2] ?? '';
  if (!id || id.length > MAX_DOCUMENT_ID) return notFound();
  // G3: a document whose room still owes its purge is gone; its room is not woken for it.
  if (await purgeOwed(ctx.env, id)) {
    console.info('[room-purge] refused a purged document', { documentId: id });
    return notFound();
  }
  return askRoom(request, () => documentRoom(ctx.env, id).route(request, identityOf(ctx)));
}

// Everything about one document, inside its room (document-room/document-route.ts).
export async function handleDocumentRequest(ctx: DocumentRouteContext): Promise<Response> {
  const { request, env, segments } = ctx;
  // /api/documents/<id>
  if (segments.length === 3) {
    const id = segments[2]!;
    if (request.method === 'GET') {
      // Read access (docs/specs/013-workspace/team-shared-documents.md): the owner, a valid share-code visitor,
      // OR a joined member of the document's team — the same gate the
      // tab-content read below uses, so a team member can open a team
      // document by raw id (not just via a share link). A miss returns
      // 404 (not 403) so a guessed UUID can't probe existence.
      const view = parseViewQuery(new URL(request.url), 'document');
      if (view instanceof Response) return view;
      const d = await getDocument(env, id);
      if (!d) return missingDocument(ctx, id);
      const grant = await gateGrant(ctx, id, d.ownerId, d.teamId);
      // Redacted for every non-owner, exactly as the share-code resolver
      // does (docs/specs/014-identity/auth-and-guest-access.md): the gate above admits any valid share code, view
      // or edit, so this is the same audience — and a guest owner's id IS
      // their credential. This door was returning it intact while the
      // share door blanked it. See redact-document.ts.
      // A tab-scoped visitor (docs/specs/013-workspace/tab-scoped-share-links.md) sees the other tabs locked.
      if (!grant) return notFound();
      const reader = redactDocumentForReader(d, ctx.resolveOwner());
      const liveDoc = redactDocumentForScope(reader, grant.tabScope);
      // The overview view (docs/specs/024-agents/document-views.md), after the same gate and scope.
      if (view) return answerOverview(ctx, view, liveDoc, grant.tabScope);
      return json({ document: liveDoc });
    }
    if (request.method === 'PUT') {
      // Metadata-only PUT now that tabs live in their own table.
      // Body: { name?, tabIds?, tabs? } — name renames the document;
      // `tabs` (preferred, docs/specs/006-document/tab-folders.md) reorders AND sets each tab's
      // per-document folder; `tabIds` is the legacy folder-less shape,
      // still accepted for older clients. All optional, at least one
      // must be present.
      const read = await readBody(ctx);
      if (read instanceof Response) return read;
      const body = read as {
        name?: string;
        tabIds?: unknown;
        tabs?: unknown;
        // Slide deck (docs/specs/012-collaboration/presentation-mode.md): serialised StoredPresentation, or null to
        // clear. Absent leaves the stored deck alone, so an ordinary rename
        // can never wipe it.
        presentation?: string | null;
      };
      const owner = requireOwner(ctx);
      if (owner instanceof Response) return owner;
      const existing = await getDocument(env, id);
      // Unknown id: 404. This PUT used to create-on-first-write (the legacy
      // localStorage-sync model), which let any stray meta write mint a
      // permanent zero-tab ghost row, e.g. a client path that missed the
      // Offline Mode dispatch (docs/specs/006-document/offline-mode.md) writing an offline document's id to
      // the server. Documents are only ever created via POST /documents now.
      if (!existing) return missingDocument(ctx, id);
      const now = Date.now();
      const ownerId = existing.ownerId;
      // Anyone with the document id could previously rewrite it.
      // We now gate on canEditDocument so only the owner or an
      // edit-role share visitor can touch metadata.
      const allowed = await gateEdit(ctx, id, ownerId, existing.teamId);
      if (!allowed) return forbidden();
      // The tab order, read whole before anything is written: one malformed entry refuses the request, rename and
      // all. Prefer the folder-carrying `tabs` shape; fall back to the legacy `tabIds` (treated as loose) so older
      // clients keep working.
      const order = Array.isArray(body.tabs)
        ? readReorderEntries(body.tabs)
        : Array.isArray(body.tabIds)
          ? readReorderEntries(body.tabIds)
          : undefined;
      if (order === null) return badRequest('invalid tabs');
      // A rename meets the name cap (docs/specs/006-document/name-length.md); a
      // name echoed back unchanged (a reorder) is kept even if it predates it.
      const name =
        typeof body.name === 'string'
          ? capStoredName(body.name, existing.name, 'document')
          : existing.name;
      if (!name) return badRequest('missing name');
      await upsertDocumentMeta(env, {
        id,
        ownerId,
        name,
        shareable: existing.shareable,
        shareCode: existing.shareCode ?? null,
        folderId: existing.folderId ?? null,
        teamId: existing.teamId ?? null,
        // Preserve provenance (the upsert never rewrites it anyway, but
        // pass the existing value so the DTO is complete).
        source: existing.source ?? null,
        savedAt: now,
        createdAt: existing.createdAt,
      });
      // Only when the caller actually sent the field: `undefined` means "not
      // my business", which is what every existing client sends.
      if (body.presentation !== undefined) {
        if (typeof body.presentation === 'string' && body.presentation.length > MAX_DECK_LEN) {
          return badRequest('presentation too large');
        }
        await setDocumentPresentation(env, id, body.presentation);
      }
      if (order) await reorderTabs(env, id, order);
      const liveDoc = await getDocument(env, id);
      // An agent's rename reaches the open editors (docs/specs/024-agents/agent-changesets.md "Whole-tab saves and tab
      // renames"); an editor sends its own rename to the room itself.
      if (ctx.token && liveDoc && name !== existing.name)
        ctx.waitUntil?.(relayDocumentRename(env, id, liveDoc.name, liveDoc.tabs));
      // A rename is not a timeline moment (docs/specs/013-workspace/timeline.md §4.2): the feed reads
      // every document's CURRENT name instead, so older entries follow it.
      // Redacted like the GET: an edit-role share visitor passes gateEdit, and
      // a guest owner's id is a credential (see redact-document.ts).
      return json({ document: liveDoc ? redactDocumentForReader(liveDoc, owner) : liveDoc });
    }
    if (request.method === 'DELETE') {
      // Trash, permanent delete and Take Offline: document-delete-route.ts
      // (docs/specs/013-workspace/trash.md).
      return handleDocumentDelete(ctx, id);
    }
  }

  // /api/documents/<id>/folder — placement (docs/specs/013-workspace/folders.md + docs/specs/013-workspace/team-shared-documents.md); the
  // scope-change policy lives in document-placement-route.ts.
  {
    const placementResp = await handleDocumentPlacement(ctx);
    if (placementResp) return placementResp;
  }

  // /api/documents/<id>/shared-tabs — what a delete leaves behind in other
  // documents (docs/specs/006-document/tab-document-many-to-many.md).
  {
    const sharedTabsResp = await handleDocumentSharedTabs(ctx);
    if (sharedTabsResp) return sharedTabsResp;
  }

  // /api/documents/<id>/thumbnail — cached SVG snapshot (docs/specs/006-document/document-snapshots.md). Read-
  // gated exactly like GET /api/documents/<id>: the owner, a joined team
  // member, or a valid share-code visitor. A native <img> can't send
  // auth headers, so the live app fetches this with headers and wraps
  // the bytes in a blob URL; a miss (no document, no read access, no R2
  // binding, empty document) is a 404 the row turns into its icon.
  if (segments.length === 4 && segments[3] === 'thumbnail') {
    const id = segments[2]!;
    if (request.method === 'GET') {
      // The viewer's appearance (docs/specs/006-document/document-snapshots.md "In the viewer's half"): the
      // snapshot is drawn in their half. Absent, it is drawn as stored; anything else is refused.
      const asked = ctx.url.searchParams.get('appearance');
      if (asked !== null && !isAppearance(asked)) {
        console.warn('[thumbnail] appearance refused', {
          documentId: id,
          appearance: asked.slice(0, 32),
        });
        return badRequest('appearance must be light or dark');
      }
      const appearance = asked ?? undefined;
      // One query for the gate AND the cache-freshness check: this runs for
      // every preview in the Explorer grid, so its D1 round trips are the
      // floor on how fast a card can paint.
      const d = await getDocumentThumbMeta(env, id);
      if (!d) return notFound();
      const grant = await gateGrant(ctx, id, d.ownerId, d.teamId);
      if (!grant) return notFound();
      // A tab-scoped visitor (docs/specs/013-workspace/tab-scoped-share-links.md) gets their tab, never the
      // first-tab snapshot.
      const svg = await documentImageSvg(env, d, grant.tabScope, {
        defer: ctx.waitUntil,
        appearance,
      });
      // Nothing drawn (or no snapshot store). Past the gate, so this says
      // nothing about access, and the URL carries `?v=<savedAt>`: the answer
      // cannot change until the document does, so let the browser keep it
      // instead of re-asking on every Explorer visit.
      if (svg == null) {
        return json(
          { error: 'not_found' },
          { status: 404, headers: { 'Cache-Control': 'private, max-age=86400' } },
        );
      }
      // The client cache-busts via a `?v=<savedAt>` query param, so a
      // long private max-age is safe: a changed document changes the URL.
      return svgImage(svg, 'private, max-age=86400');
    }
  }

  const subResp = await handleDocumentSubresources(ctx);
  if (subResp) return subResp;

  return notFound();
}
