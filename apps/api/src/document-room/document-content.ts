// The document-level reads and writes of a room (docs/specs/006-document/document-storage.md,
// "Reads from outside a document's routes"): the outline a document read carries, whether it holds a tab, and a
// copy's two halves. Runs inside the document's room, on `env.DOCUMENT_DB`; the worker reaches it through the room's
// RPCs (document-rpc.ts).

import { remapTabLinks, type Element } from '@livedoc/document';
import { itemIdsShownOnTab, type TabItemElement } from '@livedoc/items';
import { redactTabDataAuthors } from '../comments';
import { imageRefIdsFromData } from '../image-refs/extract';
import { imageRefAddStatements } from '../db/image-refs';
import { listItems } from '../db/items';
import { planBoardIndexStatements } from '../db/plan-board-index';
import { tabStatsOfData, tabStatsStatement } from '../db/tab-stats';
import type { ContentSummary } from '../db/content-summary';
import { rowToTabSummary, type TabRow } from '../tab-row';
import type { DocumentEnv, TabSummaryDTO } from '../types';
import { contentSummaryOf } from './content-summary';

// What a document read takes from the room: its tabs in order (no body), its slide deck and its item type
// catalogue, and its last save, ahead of D1's copy until the outbox pushes it.
export type DocumentOutline = {
  tabs: TabSummaryDTO[];
  presentation: string | null;
  itemTypes: string | null;
  itemTypesRev: number;
  savedAt: number;
};

export async function readDocumentOutline(
  env: DocumentEnv,
  documentId: string,
): Promise<DocumentOutline> {
  const [tabs, doc] = await env.DOCUMENT_DB.batch([
    env.DOCUMENT_DB.prepare(
      `SELECT t.id, dt.document_id, t.name, dt.order_index, '' AS data, t.updated_at, t.rev, dt.folder
         FROM document_tabs dt
         JOIN tabs t ON t.id = dt.tab_id
        WHERE dt.document_id = ?
        ORDER BY dt.order_index ASC`,
    ).bind(documentId),
    env.DOCUMENT_DB.prepare(
      'SELECT presentation, item_types, item_types_rev, saved_at FROM document WHERE id = ?',
    ).bind(documentId),
  ]);
  const row = doc?.results?.[0] as
    | {
        presentation: string | null;
        item_types: string | null;
        item_types_rev: number;
        saved_at: number;
      }
    | undefined;
  return {
    tabs: ((tabs?.results ?? []) as TabRow[]).map(rowToTabSummary),
    presentation: row?.presentation ?? null,
    itemTypes: row?.item_types ?? null,
    itemTypesRev: row?.item_types_rev ?? 0,
    savedAt: row?.saved_at ?? 0,
  };
}

export async function documentHasTab(
  env: DocumentEnv,
  documentId: string,
  tabId: string,
): Promise<boolean> {
  const row = await env.DOCUMENT_DB.prepare(
    'SELECT 1 AS present FROM document_tabs WHERE document_id = ? AND tab_id = ?',
  )
    .bind(documentId, tabId)
    .first<{ present: number }>();
  return row !== null;
}

// ---------- Copy ------------------------------------------------------------------------------------------

type CopiedTab = {
  id: string;
  name: string;
  data: string;
  elementCount: number | null;
  orderIndex: number;
};
type Row = Record<string, string | number | null>;

// What a copy carries from its source's room to the copy's (Copy). Plain rows, so it crosses
// the RPC boundary; the target re-mints the tab ids on import.
export type DocumentCopy = {
  itemTypes: string | null;
  itemsRev: number;
  itemsNextKey: number;
  tabs: CopiedTab[];
  // Which sheets each copied tab references, by its source id.
  sheetRefs: { tabId: string; sheetId: string }[];
  items: Row[];
  sheets: Row[];
  cells: Row[];
};

const ITEM_COLUMNS =
  'id, type, item_key, rank, fields, rev, created_at, updated_at, created_by, updated_by';

function elementsOf(data: string): Element[] {
  try {
    const parsed = JSON.parse(data) as { elements?: unknown };
    return Array.isArray(parsed.elements) ? (parsed.elements as Element[]) : [];
  } catch {
    return [];
  }
}

// The source's half: every tab (or a tab-scoped visitor's one tab), its comments redacted for a copier other than the
// owner (an author id is a guest's credential), with the items it shows and the sheets of the copied tabs. Null
// when the source holds no such tab.
export async function exportDocumentCopy(
  env: DocumentEnv,
  documentId: string,
  onlyTabId: string | null,
  redactAuthorsFor: string | null,
): Promise<DocumentCopy | null> {
  const db = env.DOCUMENT_DB;
  const tabRows = (
    await db
      .prepare(
        `SELECT t.id, t.name, t.data, t.element_count, dt.order_index
           FROM document_tabs dt JOIN tabs t ON t.id = dt.tab_id
          WHERE dt.document_id = ?${onlyTabId === null ? '' : ' AND dt.tab_id = ?'}
          ORDER BY dt.order_index ASC`,
      )
      .bind(...(onlyTabId === null ? [documentId] : [documentId, onlyTabId]))
      .all<{
        id: string;
        name: string;
        data: string;
        element_count: number | null;
        order_index: number;
      }>()
  ).results;
  if (onlyTabId !== null && tabRows.length === 0) return null;
  const tabs = tabRows.map((row) => ({
    id: row.id,
    name: row.name,
    data: redactAuthorsFor === null ? row.data : redactTabDataAuthors(row.data, redactAuthorsFor),
    elementCount: row.element_count,
    orderIndex: row.order_index,
  }));
  const tabIds = JSON.stringify(tabs.map((t) => t.id));
  // A tab-scoped copy takes the items its one tab shows; a whole copy all of them.
  let itemFilter = '';
  const itemBinds: unknown[] = [documentId];
  if (onlyTabId !== null) {
    const shown = itemIdsShownOnTab(
      tabs.flatMap((t) => elementsOf(t.data) as TabItemElement[]),
      await listItems(env, documentId),
    );
    itemFilter = ' AND id IN (SELECT value FROM json_each(?))';
    itemBinds.push(JSON.stringify([...shown]));
  }
  const [head, items, refs, sheets, cells] = await db.batch([
    db
      .prepare('SELECT item_types, items_rev, items_next_key FROM document WHERE id = ?')
      .bind(documentId),
    db
      .prepare(`SELECT ${ITEM_COLUMNS} FROM items WHERE document_id = ?${itemFilter}`)
      .bind(...itemBinds),
    db
      .prepare(
        'SELECT tab_id AS tabId, sheet_id AS sheetId FROM sheet_refs WHERE tab_id IN (SELECT value FROM json_each(?))',
      )
      .bind(tabIds),
    db
      .prepare(
        `SELECT id, tab_id, title, layout, cell_count, cell_bytes, created_at, updated_by
           FROM sheets WHERE document_id = ? AND tab_id IN (SELECT value FROM json_each(?))`,
      )
      .bind(documentId, tabIds),
    db
      .prepare(
        `SELECT c.sheet_id, c.row_id, c.col_id, c.input, c.format
           FROM sheet_cells c JOIN sheets s ON s.document_id = c.document_id AND s.id = c.sheet_id
          WHERE c.document_id = ? AND s.tab_id IN (SELECT value FROM json_each(?))`,
      )
      .bind(documentId, tabIds),
  ]);
  const doc = head?.results?.[0] as
    { item_types: string | null; items_rev: number; items_next_key: number } | undefined;
  return {
    itemTypes: doc?.item_types ?? null,
    itemsRev: doc?.items_rev ?? 0,
    itemsNextKey: doc?.items_next_key ?? 1,
    tabs,
    sheetRefs: (refs?.results ?? []) as { tabId: string; sheetId: string }[],
    items: (items?.results ?? []) as Row[],
    sheets: (sheets?.results ?? []) as Row[],
    cells: (cells?.results ?? []) as Row[],
  };
}

// Re-point the tab and element links inside one tab's stored `data` at the copy's tab ids. Parsed only when it
// mentions a tab id, so the common link-free tab is copied byte for byte.
export function remapTabDataLinks(data: string, tabIdMap: Map<string, string>): string {
  if (!data.includes('"tabId"') && !data.includes('"windowTabId"')) return data;
  try {
    const parsed = JSON.parse(data) as { elements?: Element[] };
    if (!Array.isArray(parsed.elements)) return data;
    return JSON.stringify({ ...parsed, elements: remapTabLinks(parsed.elements, tabIdMap) });
  } catch {
    return data;
  }
}

// The copy's half, in one transaction: the document row, every tab under a fresh id with its links re-pointed, its
// stats, image references, board statuses and sheet references, the items with their ids and keys, and the sheets
// under their tabs' new ids (docs/specs/029-sheets/sheet-store.md "Copies"). Answers the first content summary.
export async function importDocumentCopy(
  env: DocumentEnv,
  documentId: string,
  copy: DocumentCopy,
): Promise<ContentSummary> {
  const db = env.DOCUMENT_DB;
  const now = Date.now();
  const tabIdMap = new Map(copy.tabs.map((t) => [t.id, crypto.randomUUID()]));
  const stmts: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO document (id, item_types, items_rev, items_next_key, saved_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET item_types = excluded.item_types, items_rev = excluded.items_rev,
           items_next_key = excluded.items_next_key, saved_at = excluded.saved_at`,
      )
      .bind(documentId, copy.itemTypes, copy.itemsRev, copy.itemsNextKey, now, now),
  ];
  for (const tab of copy.tabs) {
    const id = tabIdMap.get(tab.id)!;
    const data = remapTabDataLinks(tab.data, tabIdMap);
    const { stats, corrupt } = tabStatsOfData(data);
    if (corrupt)
      console.warn(`[tab-stats] corrupt body id=${documentId} tab=${id} counted as empty`);
    stmts.push(
      // Link remapping rewrites ids inside elements, never their number, so the count carries over.
      db
        .prepare(
          'INSERT INTO tabs (id, name, data, updated_at, element_count, rev) VALUES (?, ?, ?, ?, ?, 1)',
        )
        .bind(id, tab.name, data, now, tab.elementCount),
      db
        .prepare(
          'INSERT INTO document_tabs (document_id, tab_id, order_index, added_at) VALUES (?, ?, ?, ?)',
        )
        .bind(documentId, id, tab.orderIndex, now),
      tabStatsStatement(env, id, stats, now),
      ...imageRefAddStatements(env, id, imageRefIdsFromData(data)),
      ...planBoardIndexStatements(env, id, elementsOf(data)),
    );
  }
  for (const item of copy.items) {
    stmts.push(
      db
        .prepare(
          `INSERT INTO items (document_id, ${ITEM_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          documentId,
          item.id,
          item.type,
          item.item_key,
          item.rank,
          item.fields,
          item.rev,
          item.created_at,
          item.updated_at,
          item.created_by,
          item.updated_by,
        ),
    );
  }
  for (const sheet of copy.sheets) {
    stmts.push(
      db
        .prepare(
          `INSERT INTO sheets (document_id, id, tab_id, title, layout, rev, cell_count, cell_bytes, created_at,
                               updated_at, updated_by)
           VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`,
        )
        .bind(
          documentId,
          sheet.id,
          tabIdMap.get(String(sheet.tab_id)) ?? sheet.tab_id,
          sheet.title,
          sheet.layout,
          sheet.cell_count,
          sheet.cell_bytes,
          sheet.created_at,
          now,
          sheet.updated_by,
        ),
    );
  }
  for (const cell of copy.cells) {
    stmts.push(
      db
        .prepare(
          'INSERT INTO sheet_cells (document_id, sheet_id, row_id, col_id, input, format) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .bind(documentId, cell.sheet_id, cell.row_id, cell.col_id, cell.input, cell.format),
    );
  }
  // After the sheets, so the reference triggers find them referenced.
  for (const ref of copy.sheetRefs) {
    const tabId = tabIdMap.get(ref.tabId);
    if (!tabId) continue;
    stmts.push(
      db
        .prepare('INSERT OR IGNORE INTO sheet_refs (tab_id, sheet_id) VALUES (?, ?)')
        .bind(tabId, ref.sheetId),
    );
  }
  await db.batch(stmts);
  return contentSummaryOf(env, documentId);
}
