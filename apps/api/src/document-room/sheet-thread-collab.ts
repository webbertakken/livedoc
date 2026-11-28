// A spreadsheet tab's rows in the collaboration index (docs/specs/029-sheets/review.md "Mentions, assignees and the
// Inbox"; docs/specs/013-workspace/inbox.md §2.7): its sheets' comment threads, each labelled by its sheet and range,
// with an action row for each thread a comment assigns; their authors' keys turned into the identities they were made
// from, as a text document's are. Null for a tab holding no threads, which keeps the element rows.
import { officeCollabRows } from '@livedoc/document';
import { threadPlaceLabel } from '@livedoc/sheets';
import { listSheetHeads } from '../db/sheets';
import { readSheetsThreads } from '../db/sheet-threads';
import type { DocumentEnv } from '../types';
import { keyOwners, resolveCollabKeys, rowKeys } from './collab-key-owners';
import type { CollabIndexRows } from '@livedoc/document';

export async function sheetThreadCollab(
  env: DocumentEnv,
  documentId: string,
  tabId: string,
  teamOf: () => Promise<string | null>,
): Promise<CollabIndexRows | null> {
  const heads = await listSheetHeads(env, documentId, tabId);
  if (heads.length === 0) return null;
  const threads = await readSheetsThreads(
    env,
    documentId,
    heads.map((h) => h.id),
  );
  if (threads.length === 0) return null;
  const byId = new Map(heads.map((h) => [h.id, h]));
  const labelled = threads.map((t) => {
    const head = byId.get(t.sheetId)!;
    return { ...t, label: threadPlaceLabel(head.title, head.layout, t.anchor) };
  });
  const keyed = officeCollabRows(labelled, null);
  const keys = rowKeys(keyed);
  const owners = await keyOwners(env, documentId, keys);
  const teamId = keyed.actions.length > 0 ? await teamOf() : null;
  console.info(
    `[outbox] sheet-threads document=${documentId} tab=${tabId} threads=${threads.length} keys=${keys.size} resolved=${owners.size}`,
  );
  const rows = officeCollabRows(labelled, teamId);
  return resolveCollabKeys(rows, owners, teamId);
}
