// A bug report filed in the Bug Tracker's room (docs/specs/016-platform/bug-reports.md "Filing" step 5, "The Bug
// Tracker board"): the first live board on the configured tab that takes Bug Report cards, a card in its first
// column (a security issue in its Security column, docs/specs/016-platform/worker-issues.md "The issue card")
// through the item store (the write a form response makes), relayed to everyone with the board open.
import {
  bugReportCard,
  bugReportColumn,
  findBugReportType,
  type BugReportFiling,
} from '@livedoc/api-schema';
import { boardTakesType, readItemCreate, typesOf, type ItemPerson } from '@livedoc/items';
import { getDocument } from '../db';
import type { BugReportStoreReason } from '../db/bug-reports';
import { documentRouteContext, type RouteIdentity } from '../document-room/document-route';
import { boardsOnTab } from '../forms/form-tab';
import { createMany } from '../routes/item-routes';
import { relay } from '../routes/item-route-kit';
import type { DocumentEnv } from '../types';

export type BugReportFileOutcome =
  { filed: true; number: number } | { filed: false; reason: BugReportStoreReason };

// The maker every report's card names: the form itself, never the reporter.
const BUG_REPORTS_PERSON: ItemPerson = { id: 'bug-reports', name: 'Bug reports', color: '#dc2626' };

const NO_ONE: RouteIdentity = {
  sessionAccountId: null,
  verifiedAccountId: null,
  accountEmail: null,
  sessionAuthTime: null,
  owner: null,
  token: null,
  workbench: null,
};

export async function fileBugReportInRoom(
  env: DocumentEnv,
  documentId: string,
  tabId: string,
  filing: BugReportFiling,
  waitUntil: ((promise: Promise<unknown>) => void) | undefined,
): Promise<BugReportFileOutcome> {
  const doc = await getDocument(env, documentId);
  if (!doc) return { filed: false, reason: 'document_missing' };
  const types = typesOf(doc.itemTypes);
  const type = findBugReportType(types);
  if (!type) return { filed: false, reason: 'type_missing' };
  const live = (await boardsOnTab(env, documentId, tabId)).filter((b) => !b.archive);
  if (live.length === 0) return { filed: false, reason: 'board_missing' };
  const board = live.find((b) => b.columns.length > 0 && boardTakesType(b, types, type.id));
  const status = board && bugReportColumn(filing, board.columns)?.status;
  if (!status) return { filed: false, reason: 'type_not_on_board' };

  const card = bugReportCard(filing, type);
  const create = readItemCreate({ type: card.type, fields: card.fields, place: { status } });
  if (typeof create === 'string') {
    console.error('[bug-reports] card.unmade', { rejection: create });
    return { filed: false, reason: 'board_busy' };
  }
  const ctx = documentRouteContext(
    env,
    new Request('https://bug-reports.internal/api/bug-reports', { method: 'POST' }),
    NO_ONE,
    waitUntil,
  );
  const made = await createMany(ctx, { documentId, owner: BUG_REPORTS_PERSON.id }, [create], {
    by: BUG_REPORTS_PERSON,
  });
  if (made instanceof Response)
    return { filed: false, reason: made.status === 413 ? 'board_full' : 'board_busy' };
  relay(ctx, documentId, made.items, [], made.rev);
  return { filed: true, number: made.items[0]!.key };
}
