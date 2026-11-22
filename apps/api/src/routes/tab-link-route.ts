// /api/documents/<id>/tabs/<tabId>/link — POST { from }: share a tab of another of the caller's documents (`from`)
// into this one (docs/specs/006-document/tab-document-many-to-many.md "Joining"). Both documents then hold the tab,
// each its own copy under the same tab id in its own room, and a write to it in either reaches the other
// (document-room/tab-shares.ts). Answers the tab as this document now holds it, so the editor shows it without
// reading the whole document.
//
// Runs in this document's room. Auth: the caller must own this document AND `from`, which must hold the tab; the
// second half stops anyone grafting in a tab they cannot read. `from` may sit in its Trash: a trashed document still
// holds its tabs.

import { getDocumentMeta, getTab, getTrashedDocumentMeta } from '../db';
import { isSpreadsheet } from '../db/workbook';
import { documentRoom } from '../document-room/document-client';
import { queueShareBody, sharesTabWith, takeSharedTab } from '../document-room/tab-shares';
import { badRequest, conflict, forbidden, json, notFound } from '../responses';
import {
  missingDocument,
  ownsDocument,
  readBody,
  requireOwner,
  type DocumentRouteContext,
} from './context';

export async function handleTabLink(ctx: DocumentRouteContext): Promise<Response | null> {
  const { request, env, segments } = ctx;
  if (
    segments.length !== 6 ||
    segments[3] !== 'tabs' ||
    segments[5] !== 'link' ||
    request.method !== 'POST'
  ) {
    return null;
  }
  const id = segments[2]!;
  const tabId = segments[4]!;
  const owner = requireOwner(ctx);
  if (owner instanceof Response) return owner;
  const target = await getDocumentMeta(env, id);
  if (!target) return missingDocument(ctx, id);
  // `ownsDocument`, not a bare id compare: a team document's owner id is one every teammate can read, so it is
  // proven with a verified account id, never the X-Owner-Id header (routes/context.ts).
  if (!(await ownsDocument(ctx, target))) return forbidden();
  const body = await readBody(ctx);
  if (body instanceof Response) return body;
  const from = body.from;
  if (typeof from !== 'string' || from.length === 0) return badRequest('from: a document id');
  if (from === id) return badRequest('from: another document');
  const source = (await getDocumentMeta(env, from)) ?? (await getTrashedDocumentMeta(env, from));
  if (!source) return notFound();
  if (!(await ownsDocument(ctx, source))) return forbidden();

  const held = await getTab(env, id, tabId);
  if (held && (await sharesTabWith(env, tabId, from))) {
    // A repeat: the join is recorded again (it changes nothing when it landed), which heals one that did not.
    await recordJoin(ctx, id, tabId, from, held.updatedAt ?? 0);
    return json({ tab: held });
  }
  const copy = await documentRoom(env, from).sharedTabCopy(tabId);
  if (!copy) return notFound();
  // A spreadsheet's sheets live in its own room, so its tabs are never shared, either way
  // (docs/specs/029-sheets/spreadsheet.md "The workbook shape").
  // Nor is a PDF tab: its live changes are one room's, so two holders would each show their own
  // (docs/specs/035-pdf-documents/live-editing-and-storage.md "Copies, the Trash and versions").
  if (copy.spreadsheet || copy.pdf || (await isSpreadsheet(env, id))) {
    console.info('[tab-link] refused', { documentId: id, tabId, from, reason: 'tab_not_linkable' });
    return conflict('tab_not_linkable');
  }
  // Tab ids are unique per document only: a tab of this id that `from` does not share with this one is another tab.
  if (held || !(await takeSharedTab(env, id, tabId, copy))) return refused(id, tabId, from);
  await recordJoin(ctx, id, tabId, from, copy.updatedAt);
  console.info('[tab-link] joined', { documentId: id, tabId, from, holders: copy.members.length });
  const tab = await getTab(env, id, tabId);
  return tab ? json({ tab }) : notFound();
}

function refused(documentId: string, tabId: string, from: string): Response {
  console.warn('[tab-link] refused', { documentId, tabId, from, reason: 'tab_id_taken' });
  return conflict('tab_id_taken');
}

// The document joined through records the join, tells the other holders, and sends this one the tab again if it
// changed meanwhile. When that call fails the tab is still here: this document sends its copy back instead, which
// teaches `from` of it, retried by the drain until it lands.
async function recordJoin(
  ctx: DocumentRouteContext,
  id: string,
  tabId: string,
  from: string,
  seenUpdatedAt: number,
): Promise<void> {
  try {
    if (await documentRoom(ctx.env, from).shareJoined(tabId, id, seenUpdatedAt)) return;
    console.warn('[tab-link] join not recorded', {
      documentId: id,
      tabId,
      from,
      error: 'tab_gone',
    });
  } catch (error) {
    console.warn('[tab-link] join not recorded', {
      documentId: id,
      tabId,
      from,
      error: String(error),
    });
  }
  await queueShareBody(ctx.env, tabId, from);
}
