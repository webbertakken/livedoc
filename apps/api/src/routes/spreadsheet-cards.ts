// The cards a spreadsheet's card functions read when the api works its values out (docs/specs/029-sheets/plan-links.md
// "The `CARD` functions": outside the editor, the cards' document is read with the asker's own access). The Plan
// document the settings name is read as `GET /items` and `GET /plan` read it, by the asker's identity alone: never the
// spreadsheet's share link or its tab, which grant nothing on another document. None named, or one the asker may not
// open, reads as why not, so the functions read #REF!; the cards are read only when a formula reads them.
import { cardSourceOf, planOutline } from '@livedoc/items';
import {
  CARDS_DENIED,
  CARDS_UNSET,
  unavailableCards,
  type CardSource,
  type Workbook,
  type WorkbookRecord,
} from '@livedoc/sheets';
import { listItems } from '../db';
import type { DocumentRouteContext } from './context';
import { forCaller, itemCaller } from './item-route-kit';
import { planTabs } from './plan-route';

const SHARE_HEADERS = ['X-Share-Code', 'X-Share-Password'];

/** The request as the asker alone: no share link, no tab named, so another document is gated by who they are. */
export function ownAccess(ctx: DocumentRouteContext): DocumentRouteContext {
  const headers = new Headers(ctx.request.headers);
  for (const name of SHARE_HEADERS) headers.delete(name);
  const url = new URL(ctx.url.pathname, ctx.url.origin);
  return { ...ctx, url, request: new Request(url, { method: 'GET', headers }) };
}

/** The cards the spreadsheet's settings name, read with the asker's own access, or why there are none to read. */
export async function spreadsheetCards(
  ctx: DocumentRouteContext,
  record: WorkbookRecord,
): Promise<CardSource> {
  const documentId = record.settings.cardsDocument;
  if (!documentId) return unavailableCards(CARDS_UNSET);
  const caller = await itemCaller(ownAccess(ctx), documentId, 'read');
  if (caller instanceof Response) {
    console.info(`[workbook] cards refused document=${documentId} status=${caller.status}`);
    return unavailableCards(CARDS_DENIED);
  }
  const [items, tabs] = await Promise.all([
    caller.items ?? listItems(ctx.env, documentId),
    planTabs(ctx, documentId, null),
  ]);
  const plan = planOutline(tabs, caller.doc?.itemTypes);
  console.info(`[workbook] cards read document=${documentId} items=${items.length}`);
  return cardSourceOf(forCaller(caller, items), plan.types, {
    statusNames: new Map(plan.statuses.map((s) => [s.status, s.name])),
  });
}

/** Gives `wb` its cards when any formula reads them; a workbook reading none costs nothing more. */
export async function fillSpreadsheetCards(
  wb: Workbook,
  ctx: DocumentRouteContext,
  record: WorkbookRecord,
): Promise<void> {
  if (wb.usesCards()) wb.setCards(await spreadsheetCards(ctx, record));
}
