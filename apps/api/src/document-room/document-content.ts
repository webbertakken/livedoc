// The document-level reads and writes of a room (docs/specs/006-document/document-storage.md,
// "Reads from outside a document's routes"): the outline a document read carries, whether it holds a tab, and a
// copy's two halves. Runs inside the document's room, on `env.DOCUMENT_DB`; the worker reaches it through the room's
// RPCs (document-rpc.ts).

import { withTabLinksRemapped, type Element } from '@livedoc/document';
import type { WorkbookRecord } from '@livedoc/sheets';
import { keptBytes, type KeptContent, type StoredAt } from '@livedoc/sheets/files';
import { workbookFromRow, WORKBOOK_COLUMNS, type WorkbookRow } from '../db/workbook';
import { keptAddStatements, readKept } from '../db/workbook-kept';
import { cellFormatSql, styleCellsStatements } from '../db/sheet-styles';
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
import { liveTabKindOfTab } from '../live-tabs/live-tab-kinds';
import { chunkStatements, readLiveTabState } from '../live-tabs/live-tab-store';
import { TEXT_DOCUMENT_LIVE_TAB } from '../text-documents/text-document-live-tab';
import { viewerStateOf } from '../text-documents/room-viewer-copies';
import { contentSummaryOf } from './content-summary';

// What a document read takes from the room: its tabs in order (no body), its slide deck and its item type
// catalogue, and its last save, ahead of D1's copy until the outbox pushes it.
export type DocumentOutline = {
  tabs: TabSummaryDTO[];
  presentation: string | null;
  itemTypes: string | null;
  itemTypesRev: number;
  savedAt: number;
  // The workbook record when the document is a spreadsheet (docs/specs/029-sheets/sheet-store.md "In a spreadsheet").
  workbook: WorkbookRecord | null;
};

export async function readDocumentOutline(
  env: DocumentEnv,
  documentId: string,
): Promise<DocumentOutline> {
  const [tabs, doc, workbook] = await env.DOCUMENT_DB.batch([
    env.DOCUMENT_DB.prepare(
      `SELECT t.id, dt.document_id, t.name, dt.order_index, '' AS data, t.updated_at, t.rev, dt.folder, t.kind, t.drawing_of
         FROM document_tabs dt
         JOIN tabs t ON t.id = dt.tab_id
        WHERE dt.document_id = ?
        ORDER BY dt.order_index ASC`,
    ).bind(documentId),
    env.DOCUMENT_DB.prepare(
      'SELECT presentation, item_types, item_types_rev, saved_at FROM document WHERE id = ?',
    ).bind(documentId),
    env.DOCUMENT_DB.prepare(`SELECT ${WORKBOOK_COLUMNS} FROM workbook WHERE document_id = ?`).bind(
      documentId,
    ),
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
    workbook: workbookFromRow(documentId, workbook?.results?.[0] as WorkbookRow | undefined),
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
  // The row's kind (docs/specs/006-document/kinds-outside-the-canvas.md "The surface"), carried as the count is.
  kind: string | null;
  // A drawing tab's text document tab (docs/specs/034-text-documents/objects.md "Copying"), re-pointed on import.
  drawingOf: string | null;
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
  // The sheets' row and column order, in their chunks (db/sheet-axes.ts).
  axes: Row[];
  // A spreadsheet's workbook row (docs/specs/029-sheets/sheet-store.md "Copies and exports"), or null.
  workbook: Row | null;
  // A spreadsheet's kept content of the copied sheets and the workbook's own (sheet-store.md "Copies and exports").
  kept?: KeptContent<StoredAt> | null;
  // Each copied live tab's whole state, by its source id (docs/specs/006-document/kinds-outside-the-canvas.md
  // "Live state").
  liveStates: { tabId: string; state: Uint8Array }[];
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
  viewer = false,
): Promise<DocumentCopy | null> {
  const db = env.DOCUMENT_DB;
  const tabRows = (
    await db
      .prepare(
        `SELECT t.id, t.name, t.data, t.element_count, t.kind, t.drawing_of, dt.order_index
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
        kind: string | null;
        drawing_of: string | null;
        order_index: number;
      }>()
  ).results;
  if (onlyTabId !== null && tabRows.length === 0) return null;
  const tabs = tabRows.map((row) => ({
    id: row.id,
    name: row.name,
    data: redactAuthorsFor === null ? row.data : redactTabDataAuthors(row.data, redactAuthorsFor),
    elementCount: row.element_count,
    kind: row.kind,
    drawingOf: row.drawing_of,
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
  const [head, items, refs, sheets, cells, axes, workbook] = await db.batch([
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
        `SELECT c.sheet_id, c.row_id, c.col_id, c.input, ${cellFormatSql('c')} AS format
           FROM sheet_cells c JOIN sheets s ON s.document_id = c.document_id AND s.id = c.sheet_id
          WHERE c.document_id = ? AND s.tab_id IN (SELECT value FROM json_each(?))`,
      )
      .bind(documentId, tabIds),
    db
      .prepare(
        `SELECT a.sheet_id, a.axis, a.chunk, a.ids
           FROM sheet_axes a JOIN sheets s ON s.document_id = a.document_id AND s.id = a.sheet_id
          WHERE a.document_id = ? AND s.tab_id IN (SELECT value FROM json_each(?))`,
      )
      .bind(documentId, tabIds),
    db
      .prepare(
        'SELECT format, settings, meaning, functions, created_at FROM workbook WHERE document_id = ?',
      )
      .bind(documentId),
  ]);
  const doc = head?.results?.[0] as
    { item_types: string | null; items_rev: number; items_next_key: number } | undefined;
  const liveStates = await Promise.all(
    tabs.flatMap((t) => {
      const live = liveTabKindOfTab(t);
      return live
        ? [readLiveTabState(env, live, t.id).then((state) => ({ tabId: t.id, state }))]
        : [];
    }),
  );
  const copiedSheets = new Set(((sheets?.results ?? []) as Row[]).map((s) => String(s.id)));
  return {
    liveStates: viewer ? liveStates.map((s) => asViewersState(s, tabs, documentId)) : liveStates,
    kept: keptOfSheets(await readKept(env, documentId), copiedSheets),
    itemTypes: doc?.item_types ?? null,
    itemsRev: doc?.items_rev ?? 0,
    itemsNextKey: doc?.items_next_key ?? 1,
    tabs,
    sheetRefs: (refs?.results ?? []) as { tabId: string; sheetId: string }[],
    items: (items?.results ?? []) as Row[],
    sheets: (sheets?.results ?? []) as Row[],
    cells: (cells?.results ?? []) as Row[],
    axes: (axes?.results ?? []) as Row[],
    workbook: ((workbook?.results ?? [])[0] as Row | undefined) ?? null,
  };
}

// Kept content as a copy takes it: the workbook's own, and its copied sheets'; null for none.
function keptOfSheets(
  kept: KeptContent<StoredAt> | undefined,
  sheets: ReadonlySet<string>,
): KeptContent<StoredAt> | null {
  if (!kept) return null;
  const copied = (entry: { at: StoredAt }) =>
    entry.at.sheet === undefined || sheets.has(entry.at.sheet);
  return {
    ...kept,
    items: kept.items.filter(copied),
    relationships: kept.relationships.filter(copied),
  };
}

// Re-point the tab and element links inside one tab's stored `data` at the copy's tab ids, and a drawing tab's text
// document tab. Parsed only when it mentions a tab id, so the common link-free tab is copied byte for byte.
export function remapTabDataLinks(data: string, tabIdMap: Map<string, string>): string {
  if (!['"tabId"', '"windowTabId"', '"drawingOf"'].some((key) => data.includes(key))) return data;
  try {
    const parsed = JSON.parse(data) as { elements?: Element[]; drawingOf?: string };
    if (!Array.isArray(parsed.elements)) return data;
    return JSON.stringify(withTabLinksRemapped({ ...parsed, elements: parsed.elements }, tabIdMap));
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
          'INSERT INTO tabs (id, name, data, updated_at, element_count, rev, kind, drawing_of) VALUES (?, ?, ?, ?, ?, 1, ?, ?)',
        )
        .bind(
          id,
          tab.name,
          data,
          now,
          tab.elementCount,
          tab.kind ?? null,
          tab.drawingOf ? (tabIdMap.get(tab.drawingOf) ?? tab.drawingOf) : null,
        ),
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
  // A copy of a spreadsheet is a spreadsheet: its workbook row comes first, so its sheet tabs reference their sheets.
  // It keeps the spreadsheet's meaning (formulas.md, the file's meaning) and named functions (formulas.md "Named
  // functions").
  if (copy.workbook)
    stmts.push(
      db
        .prepare(
          `INSERT INTO workbook (document_id, format, settings, meaning, functions, rev, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 0, ?, ?)
           ON CONFLICT (document_id) DO NOTHING`,
        )
        .bind(
          documentId,
          copy.workbook.format,
          copy.workbook.settings,
          copy.workbook.meaning ?? null,
          copy.workbook.functions ?? null,
          copy.workbook.created_at,
          now,
        ),
    );
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
  for (const axis of copy.axes) {
    stmts.push(
      db
        .prepare(
          'INSERT INTO sheet_axes (document_id, sheet_id, axis, chunk, ids) VALUES (?, ?, ?, ?, ?)',
        )
        .bind(documentId, axis.sheet_id, axis.axis, axis.chunk, axis.ids),
    );
  }
  // A spreadsheet's kept content, after its workbook row and its sheets, which it names.
  if (copy.workbook && copy.kept) {
    const from = { items: 0, relationships: 0, parts: 0 };
    stmts.push(...keptAddStatements(env, documentId, copy.kept, from, keptBytes(copy.kept)));
  }
  // A copy's cells carry their formats; in a spreadsheet copy they become its own styles.
  if (copy.cells.length > 0) stmts.push(...styleCellsStatements(env, documentId, null));
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
  // Each live tab's state under its tab's new id, as chunks; the tab's outbox entry rebuilds its digest.
  const kindOf = new Map(copy.tabs.map((t) => [t.id, liveTabKindOfTab(t)]));
  for (const { tabId, state } of copy.liveStates ?? []) {
    const id = tabIdMap.get(tabId);
    const live = kindOf.get(tabId);
    if (!id || !live) continue;
    stmts.push(...chunkStatements(env, live, id, state, now));
  }
  await db.batch(stmts);
  return contentSummaryOf(env, documentId);
}

// A live tab's state as a Viewer may take it (docs/specs/034-text-documents/review.md "What a Viewer receives"): a
// text document's without comments or suggestions' authors. One that cannot be copied so fails the whole copy, never
// hands the Viewer the document itself.
function asViewersState(
  live: { tabId: string; state: Uint8Array },
  tabs: readonly { id: string; kind: string | null }[],
  documentId: string,
): { tabId: string; state: Uint8Array } {
  if (tabs.find((t) => t.id === live.tabId)?.kind !== TEXT_DOCUMENT_LIVE_TAB.tabKind) return live;
  const state = viewerStateOf(live.state, { documentId, tabId: live.tabId });
  if (!state) throw new Error('viewer_copy_unavailable');
  return { tabId: live.tabId, state };
}
