// /api/documents, the collection (docs/specs/006-document/document-storage.md): the
// caller's document list and the create, answered in the worker. A create has the new document's room store its
// content first, then writes the D1 row (D11).

// /api/documents — document metadata, per-tab content, copy, folder
// assignment, tab linking, comments, share links, the realtime WS
// upgrade. The largest resource: every sub-path
// under a document id lives here.

import { documentRoom } from '../document-room/document-client';
import type { CreateOutcome } from '../document-room/document-create';
import { identityOf, roomUnavailable } from '../document-room/document-route';
import { purgeOwed, purgeRooms } from '../room-purge-client';
import { readSeedItems } from './item-routes';
import { readSeedSheets } from './sheet-routes';
import {
  catalogueWithBoardTypes,
  legacyCatalogue,
  validateItemTypeCatalogue,
  type ItemTypeCatalogue,
} from '@livedoc/items';
import type { Tab } from '@livedoc/document';
import { isValidTab, migrateIncomingTab } from '@livedoc/document';
import { capStoredName } from '../names';
import { MAX_DECK_LEN, MAX_TAB_BYTES, logTabRefused, tabDataBytes } from '../limits';
import {
  DOCUMENT_CONVERSION_HEADER,
  INTENT_INVALID,
  MARK_USED_INVALID,
  readCreationIntent,
  readDocumentConversion,
  readMarkUsed,
  TEAM_RECENT_INCLUDE,
  TEAM_RECENT_LIMIT,
  type CreationIntent,
} from '@livedoc/api-schema';
import {} from '../comments';
import {
  getDocument,
  getTrashedDocumentMeta,
  countDocumentsByOwner,
  listDocumentsByOwner,
  listRecentTeamDocuments,
  upsertDocumentMeta,
} from '../db';
import {
  badRequest,
  documentTrashed,
  forbidden,
  json,
  notFound,
  payloadTooLarge,
} from '../responses';
import { documentDates, isDocumentSource, isKeyId } from '@livedoc/api-schema';
import { emailEnabled } from '../email/client';
import { notifyMilestone } from '../email/notifications';
import { recordDocumentCreated, recordDocumentSynced } from '../timeline';
import { compileSeededTabs } from './document-seed';
import { hasTemplateSheets } from '@livedoc/templates';
import { materialiseTemplateSheets } from '@livedoc/templates/template-sheets';
import { parsePlacement, resolvePlacement } from '../placement/resolve-placement';
import { placementLookups } from '../placement/placement-lookups';
import {
  logDefaultSkipped,
  logPlacementRejected,
  logPlacementResolved,
  logPlacementSkipped,
  placementScope,
} from '../placement/placement-log';
import { intentRejected, placementRejected } from '../placement/placement-response';
import type { DocumentDTO } from '../types';
import { ownsDocument, requireOwner, type RouteContext, readBody } from './context';

export async function handleDocumentCollection(ctx: RouteContext): Promise<Response> {
  const { request, env, segments } = ctx;
  if (segments.length === 2) {
    if (request.method === 'GET') {
      const owner = requireOwner(ctx);
      if (owner instanceof Response) return owner;
      // `?include=team-recent` (docs/specs/019-marketing/returning-visitor.md): the newest documents of
      // the teams the caller has joined, for their recent diagrams. Membership is read from the
      // verified account only, never the guest header, which anyone can set to any id.
      if (ctx.url.searchParams.get('include') === TEAM_RECENT_INCLUDE) {
        const [liveDocs, teamRecent] = await Promise.all([
          listDocumentsByOwner(env, owner),
          ctx.verifiedAccountId
            ? listRecentTeamDocuments(env, ctx.verifiedAccountId, TEAM_RECENT_LIMIT)
            : [],
        ]);
        return json({ documents: liveDocs, teamRecent });
      }
      const liveDocs = await listDocumentsByOwner(env, owner);
      return json({ documents: liveDocs });
    }
    if (request.method === 'POST') {
      const read = await readBody(ctx);
      if (read instanceof Response) return read;
      const body = read as Omit<Partial<DocumentDTO>, 'tabs'> & {
        tabs?: Tab[];
        intent?: unknown;
        markUsed?: unknown;
        items?: unknown;
        sheets?: unknown;
      };
      const owner = requireOwner(ctx);
      if (owner instanceof Response) return owner;
      if (!body.id || typeof body.name !== 'string') {
        return badRequest('missing id/name');
      }
      // The id keys the document in paths, its room and every scope (docs/specs/015-api/api.md "Ids").
      if (!isKeyId(body.id)) return badRequest('invalid id');
      // The document's own dates (docs/specs/015-api/api.md "Document dates"), refused whole when
      // invalid, before anything is written.
      const dates = documentDates(body, Date.now());
      if (!dates.ok) return badRequest('invalid document dates');
      // Placement (docs/specs/013-workspace/folders.md "Placement on create"): read up front so a
      // malformed one is refused before anything else is looked at.
      const requested = parsePlacement(body);
      if (!requested) {
        logPlacementRejected('placement_invalid', placementScope(body.teamId));
        return placementRejected('placement_invalid');
      }
      // Seeded tabs given as a graph, Mermaid or a template are compiled first (docs/specs/015-api/api.md);
      // with no intent given, the first compiled tab supplies it, as the MCP derives it.
      let derivedIntent: CreationIntent | null = null;
      let templateElements: Tab['elements'] = [];
      if (Array.isArray(body.tabs)) {
        const seed = compileSeededTabs(body.tabs, body.id);
        if ('refusal' in seed) return json(seed.refusal.body, { status: seed.refusal.status });
        body.tabs = seed.tabs as Tab[];
        derivedIntent = seed.intent;
        templateElements = seed.templateElements;
      }
      // The creation intent (docs/specs/013-workspace/default-folders.md): which default folder a
      // create at the root of My Documents lands in. Malformed, it refuses the create.
      const intent =
        body.intent === undefined && derivedIntent
          ? { ok: true as const, intent: derivedIntent }
          : readCreationIntent(body.intent);
      if (!intent.ok) {
        logPlacementRejected(INTENT_INVALID, placementScope(body.teamId));
        return intentRejected();
      }
      // Whether making it is a use (docs/specs/015-api/api.md "Marking a document used"): absent
      // counts; anything but a boolean refuses the create before anything is written.
      const making = readMarkUsed(body.markUsed);
      if (!making.ok) {
        console.warn('documents: rejected reason=mark_used_invalid');
        return badRequest(MARK_USED_INVALID);
      }
      // Validate any seeded tabs up front (structure + per-tab byte cap) so a
      // create can't smuggle a malformed / oversized tab past the tab gate.
      if (Array.isArray(body.tabs)) {
        // Former stored shapes (a Google Drive copy, an offline sync, an API-token script) are
        // migrated before validation, as every tab read migrates them (docs/specs/015-api/api.md).
        body.tabs = body.tabs.map((tab) => migrateIncomingTab(tab) as Tab);
        for (const tab of body.tabs) {
          if (!isValidTab(tab)) return badRequest('invalid tab');
          // The cap D1's row sets (docs/specs/015-api/api.md "Tab size"), measured as stored,
          // before anything is written, so a create never leaves a document without its tabs.
          const bytes = tabDataBytes(tab);
          if (bytes > MAX_TAB_BYTES) {
            logTabRefused('create', tab.id, bytes);
            return payloadTooLarge();
          }
        }
      }
      // A template's Sheets (docs/specs/029-sheets/sheet-store.md "Template starts"), however the tabs came (the
      // wizard, an agent, a template compiled above), on the validated tabs: made into seed sheets now, so the sheet exists the moment the
      // document does, the mark dropped from each Sheet. Validated with the rest of the seed sheets below.
      let templateSheets: unknown[] = [];
      if (Array.isArray(body.tabs) && hasTemplateSheets(body.tabs)) {
        const made = materialiseTemplateSheets(body.tabs, Date.now());
        body.tabs = made.tabs;
        templateSheets = made.sheets;
        console.info('[documents] template sheets made', {
          documentId: body.id,
          count: made.sheets.length,
        });
      }
      // Seed items (docs/specs/026-plan/items.md): an offline document's, on sync. Validated whole
      // before anything is written.
      const seedItemCreates = readSeedItems(body.items, owner);
      if (seedItemCreates instanceof Response) return seedItemCreates;
      // Seed sheets (docs/specs/029-sheets/sheet-store.md "Offline documents", "Copies"), validated the same way.
      // The request's own sheets, then the template's; anything that is not a list is refused below.
      const withTemplate = (asked: unknown): unknown => {
        if (templateSheets.length === 0) return asked;
        if (asked === undefined) return templateSheets;
        if (!Array.isArray(asked)) return asked;
        const own: readonly unknown[] = asked;
        return [...own, ...templateSheets];
      };
      const seedSheetCreates = readSeedSheets(withTemplate(body.sheets));
      if (seedSheetCreates instanceof Response) return seedSheetCreates;
      // Ownership guard (security): upsertDocumentMeta is INSERT ... ON
      // CONFLICT(id) DO UPDATE owner_id = excluded.owner_id, so a POST with an
      // id that already exists under a DIFFERENT owner would silently transfer
      // ownership to the caller. Document ids are unguessable UUIDs but they
      // leak to every share-link visitor / team member, so refuse the create
      // when the id is already owned by someone else (legitimate updates go
      // through PUT, which gates on edit access). Owning a team document's row is not enough: its maker re-commits
      // it only while still in the team (ownsDocument, docs/specs/013-workspace/team-shared-documents.md).
      const clash = await getDocument(env, body.id);
      if (clash && !(await ownsDocument(ctx, clash))) return forbidden();
      // The name cap (docs/specs/006-document/name-length.md): shortened here,
      // whoever the caller. A re-commit of the caller's own id compares against
      // what it already stores, so an unchanged pre-cap name is kept.
      const name = capStoredName(body.name, clash?.name ?? null, 'document');
      if (!name) return badRequest('missing id/name');
      const incomingTabs: Tab[] | null = Array.isArray(body.tabs)
        ? body.tabs.map((tab) => ({
            ...tab,
            name: capStoredName(
              tab.name,
              clash?.tabs.find((t) => t.id === tab.id)?.name ?? null,
              'tab',
            ),
          }))
        : null;
      // An id in the Trash is taken just the same (docs/specs/013-workspace/trash.md):
      // its owner hears the deleted state, anyone else the same refusal.
      const binned = clash ? null : await getTrashedDocumentMeta(env, body.id);
      if (binned) return (await ownsDocument(ctx, binned)) ? documentTrashed() : forbidden();
      if (typeof body.presentation === 'string' && body.presentation.length > MAX_DECK_LEN) {
        return badRequest('presentation too large');
      }
      // A type catalogue a copy, a sync or a Drive import carries (docs/specs/026-plan/item-types.md
      // "Storage and sync"), validated as the item-types route does; a bad one refuses the create.
      let itemTypes: ItemTypeCatalogue | null = null;
      if (body.itemTypes !== undefined && body.itemTypes !== null) {
        const checked = validateItemTypeCatalogue(body.itemTypes);
        if (!checked.ok)
          return json({ error: 'item_types_invalid', reason: checked.reason }, { status: 400 });
        itemTypes = checked.catalogue;
      }
      // A seeded Plan template's boards bring their card types (docs/specs/026-plan/item-types.md "The type
      // catalogue"): they join the catalogue given (none: they are its card types). Cards carried with no catalogue
      // come from a document made before card types started empty: they keep the default types (legacyCatalogue).
      itemTypes = legacyCatalogue(itemTypes, (seedItemCreates?.length ?? 0) > 0);
      const brought = catalogueWithBoardTypes(itemTypes, templateElements);
      // Checked as a catalogue the item-types route takes; one that would break a rule (its size) keeps the given one.
      if (brought && !validateItemTypeCatalogue(brought).ok) {
        console.warn('[item-types] brought invalid', { documentId: body.id });
      } else if (brought) {
        console.info('[item-types] brought', {
          documentId: body.id,
          chosen: itemTypes === null,
          types: brought.types.length,
        });
        itemTypes = brought;
      }
      // Where the document is filed, decided before the write and written by it
      // (docs/specs/013-workspace/folders.md "Placement on create"). An invalid placement refuses
      // the create by name; it never files the document somewhere else. A re-commit of the
      // caller's own id keeps the placement it already has.
      let placement = { teamId: clash?.teamId ?? null, folderId: clash?.folderId ?? null };
      if (clash) {
        logPlacementSkipped();
      } else {
        const outcome = await resolvePlacement(
          requested,
          { ownerId: owner, verifiedAccountId: ctx.verifiedAccountId },
          placementLookups(env),
          intent.intent,
        );
        if (!outcome.ok) {
          logPlacementRejected(outcome.rejection, placementScope(requested.teamId));
          return placementRejected(outcome.rejection);
        }
        for (const skip of outcome.skipped) logDefaultSkipped(skip);
        logPlacementResolved(outcome.placement, outcome);
        placement = outcome.placement;
      }
      // Only a genuine create takes the body's dates: a re-commit keeps the stored created date
      // (the upsert never rewrites it) and is modified now.
      const savedAt = clash ? Date.now() : dates.savedAt;
      // The content first, in the new document's room (D11): its row, the seeded tabs (each keeping its id: a
      // room's tabs are its own, docs/specs/006-document/offline-mode.md), and on a genuine create the seed items
      // and sheets. The deck is usually none; an Offline Mode sync carries the one it built offline.
      const documentId = body.id;
      const room = documentRoom(env, documentId);
      const discard = async (why: string) => {
        if (clash) return;
        console.warn('[documents] create discarded', { documentId, why });
        await purgeRooms(env, [documentId]);
      };
      // A room still owing the purge of an earlier document of this id (taken offline, now synced back) is purged
      // first, so that debt never wipes the new content; unreached, the create waits for a retry.
      if (!clash && (await purgeOwed(env, documentId))) {
        const settled = await purgeRooms(env, [documentId]);
        if (settled.rooms === 0 || settled.unreached > 0) {
          return roomUnavailable(request, new Error('room_purge_owed'));
        }
      }
      let made: CreateOutcome;
      try {
        made = await room.create({
          identity: identityOf(ctx),
          owner,
          recommit: clash !== null,
          savedAt,
          createdAt: dates.createdAt,
          presentation: typeof body.presentation === 'string' ? body.presentation : null,
          itemTypes: itemTypes ? JSON.stringify(itemTypes) : null,
          tabs: incomingTabs,
          items: seedItemCreates,
          sheets: seedSheetCreates,
        });
      } catch (error) {
        await discard('room_unavailable');
        return roomUnavailable(request, error);
      }
      if (!made.ok) {
        await discard(`refused ${made.status}`);
        return json(made.body, { status: made.status });
      }
      // Then the listing row, with the room's first summary, so a new row never reads empty for want of a push.
      try {
        await upsertDocumentMeta(env, {
          id: body.id,
          ownerId: owner,
          name,
          shareable: body.shareable ?? false,
          shareCode: body.shareCode ?? null,
          folderId: placement.folderId,
          teamId: placement.teamId,
          // Provenance (docs/specs/013-workspace/folders.md): only the closed set of generated sources
          // is accepted; anything else (or absent) is a user-made document.
          source: isDocumentSource(body.source) ? body.source : null,
          savedAt,
          createdAt: dates.createdAt,
          contentSummary: made.summary,
          // The creation intent, recorded once (docs/specs/013-workspace/default-folders.md
          // "Recorded intent"); null without one. A re-commit's upsert never rewrites it.
          opensIn: intent.intent?.mode ?? null,
          tabKind: intent.intent?.tabKind ?? null,
          templateFamily: intent.intent?.templateFamily ?? null,
        });
      } catch (error) {
        await discard('d1_failed');
        throw error;
      }
      const liveDoc = await getDocument(env, body.id);
      // docs/specs/013-workspace/timeline.md §4.2: only a GENUINE create earns a timeline event. A
      // POST that resolved to an existing row is the editor re-committing
      // an id it already owns, and "Diagram Created" twice for one
      // document is a lie the feed can't walk back.
      if (liveDoc && !clash) {
        // A sync (docs/specs/006-document/offline-mode.md) is a POST like any other, so the editor declares it:
        // undeclared, moving a document from this browser INTO the account was
        // reported as a document being created for the first time.
        const conversion = readDocumentConversion(request.headers.get(DOCUMENT_CONVERSION_HEADER));
        if (conversion === 'sync') {
          ctx.waitUntil?.(recordDocumentSynced(env, liveDoc, owner));
        } else {
          // Making it is a use of it for its maker, unless the create said not (a bulk import):
          // docs/specs/013-workspace/explorer-home.md "Making a document".
          console.info(`home: making doc=${liveDoc.id} marked=${making.markUsed}`);
          ctx.waitUntil?.(
            recordDocumentCreated(env, liveDoc, owner, { markUsed: making.markUsed }),
          );
        }
      }
      // docs/specs/014-identity/transactional-email.md (#6): on a genuine create (no prior row), check for a document
      // milestone. Count + send run in the background, off the response path.
      if (emailEnabled(env) && !clash) {
        ctx.waitUntil?.(
          countDocumentsByOwner(env, owner).then((count) => notifyMilestone(env, owner, count)),
        );
      }
      return json({ document: liveDoc }, { status: 201 });
    }
  }
  return notFound();
}
