// plan_board_statuses and the Inbox's Plan cards (docs/specs/013-workspace/inbox.md §2.4).
//
// The table is a per-tab projection of each Plan board's column statuses, in the document's room, written in the tab
// write's own batch (so every write path in §2.1 keeps it). The room works out from it which cards are open and the
// boards that place them, and pushes those to D1's `inbox_cards` (document-room/inbox-cards.ts); the read finds the
// reader's cards there through its assignee index.

import { planBoardRowsFromElements, type Element } from '@livedoc/document';
import type { ActivityCard } from '@livedoc/api-schema';
import { itemPersonId } from '@livedoc/items';
import type { DocumentEnv, Env } from '../types';

// ---------- Writes (the room) ------------------------------------------

// A full replace of the tab's board rows. A tab with no board costs one DELETE that touches nothing (a
// primary-key prefix lookup).
export function planBoardIndexStatements(
  env: DocumentEnv,
  tabId: string,
  elements: readonly Element[],
): D1PreparedStatement[] {
  const stmts: D1PreparedStatement[] = [
    env.DOCUMENT_DB.prepare('DELETE FROM plan_board_statuses WHERE tab_id = ?').bind(tabId),
  ];
  for (const r of planBoardRowsFromElements(elements)) {
    stmts.push(
      env.DOCUMENT_DB.prepare(
        `INSERT INTO plan_board_statuses
           (tab_id, element_id, board_title, status, done, board_order, position)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).bind(tabId, r.elementId, r.boardTitle, r.status, r.done ? 1 : 0, r.boardOrder, r.position),
    );
  }
  return stmts;
}

// ---------- Read (D1) ---------------------------------------------------

// The hashed person ids of the reader and every identity they used to be (§2.2): what an item's assignee id
// is (docs/specs/026-plan/items.md).
export async function readerPersonIds(env: Env, ownerId: string): Promise<string[]> {
  const res = await env.DB.prepare('SELECT alias_id FROM owner_aliases WHERE owner_id = ?')
    .bind(ownerId)
    .all<{ alias_id: string }>();
  const ids = [ownerId, ...(res.results ?? []).map((r) => r.alias_id)];
  return Promise.all(ids.map((id) => itemPersonId(id)));
}

// A pushed card's place for the reader (§4): its own board, or on a tab-scoped share the first board on the scoped
// tab, which `inScope` requires there to be.
export const CARD_BOARD_SQL = `CASE WHEN v.scope_tab_id IS NULL THEN ic.board
         ELSE (SELECT b.value FROM json_each(ic.boards) b
                WHERE b.value ->> '$.tabId' = v.scope_tab_id LIMIT 1) END`;

export const CARD_IN_SCOPE_SQL = `(v.scope_tab_id IS NULL
         OR EXISTS (SELECT 1 FROM json_each(ic.boards) b WHERE b.value ->> '$.tabId' = v.scope_tab_id))`;

// Appended to the Activity read's scope CTEs (?1 owner, ?2 now, ?3 limit), with ?4 the JSON array of the
// reader's person ids. `cards` is every open card assigned to the reader that its room pushed (`listed`).
export const CARDS_CTES = `,
  mine(pid) AS (SELECT value FROM json_each(?4)),
  cards AS (
    SELECT ic.document_id, ic.item_id AS id, ic.item_key, ic.type, ic.updated_at, ic.title, ic.status,
           v.name AS document_name, v.team_id AS document_team_id, v.via, v.share_code,
           ${CARD_BOARD_SQL} AS board
      FROM inbox_cards ic
      JOIN visible v ON v.id = ic.document_id
     WHERE ic.listed = 1
       AND ic.assignee_id IN (SELECT pid FROM mine)
       AND ${CARD_IN_SCOPE_SQL}
  )`;

export const CARDS_SELECT = `
  SELECT document_id, id, item_key, type, updated_at, title, status,
         document_name, document_team_id, via, share_code, board
    FROM cards
   ORDER BY updated_at DESC
   LIMIT ?3`;

export type CardRow = {
  document_id: string;
  id: string;
  item_key: number;
  type: string;
  updated_at: number;
  title: string | null;
  status: string | null;
  document_name: string;
  document_team_id: string | null;
  via: 'own' | 'team' | 'shared';
  share_code: string | null;
  board: string | null;
};

// A 'shared' row whose link has lapsed never arrives: `visible` (document-visibility.ts) drops it.
export function cardsFromRows(rows: readonly CardRow[]): ActivityCard[] {
  return rows.map((r) => ({
    documentId: r.document_id,
    documentName: r.document_name,
    teamId: r.document_team_id,
    via: r.via,
    shareCode: r.via === 'shared' ? r.share_code : null,
    board: r.board ? (JSON.parse(r.board) as ActivityCard['board']) : null,
    id: r.id,
    key: r.item_key,
    type: r.type,
    title: typeof r.title === 'string' ? r.title : '',
    status: typeof r.status === 'string' ? r.status : null,
    updatedAt: r.updated_at,
  }));
}
