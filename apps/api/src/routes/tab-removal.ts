// A tab removed from its document, with everything that goes with it: the links scoped to it (their holders leave as
// on a revoke), its comments' words in the document's feed, and its form link, a form it fed pausing. The tab DELETE's
// and a spreadsheet's sheet delete's (docs/specs/029-sheets/sheet-store.md "Changing the workbook").
import { broadcastShareOp } from '../room-client';
import { deleteFormLinksForTab, deleteShareLinksForTab, deleteTabRow } from '../db';
import { pauseFormsFeeding } from '../forms/form-tab';
import { retractTabComments } from '../timeline';
import type { DocumentRouteContext } from './context';

export async function removeDocumentTab(
  ctx: DocumentRouteContext,
  documentId: string,
  tabId: string,
): Promise<void> {
  const { env } = ctx;
  // The links scoped to it die with it (docs/specs/013-workspace/tab-scoped-share-links.md), before it, so no
  // request finds a live link to a tab that has gone; their holders leave the editor as on a revoke.
  const revoked = await deleteShareLinksForTab(env, documentId, tabId);
  const removed = await deleteTabRow(env, documentId, tabId);
  // Its comments' words leave this document's feed with it (docs/specs/013-workspace/timeline.md §4.3).
  if (removed) ctx.waitUntil?.(retractTabComments(env, documentId, removed));
  for (const code of revoked) {
    ctx.waitUntil?.(broadcastShareOp(env, documentId, { kind: 'share-revoked', code }));
  }
  // A Form tab's link goes with it, and a form whose board or sheet it was stops taking responses (its link kept)
  // (docs/specs/030-forms/forms.md "Publishing and the form link").
  await deleteFormLinksForTab(env, documentId, tabId);
  await pauseFormsFeeding(env, documentId, tabId);
}
