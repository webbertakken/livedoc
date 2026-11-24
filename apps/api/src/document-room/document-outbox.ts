// What a document's room pushes to D1 (docs/specs/006-document/document-storage.md "The outbox"). The room's
// triggers key `outbox` in the transaction of every write (document-schema.ts); the room's
// alarm drains it on idle. A drain reads the keys, builds one D1 batch per unit (the document unit: summary, images,
// cards, items; each tab its own), runs at most PUSH_CONCURRENCY at once and deletes exactly the keys whose unit
// landed, by the ids it read: a key written again meanwhile has a new id and stays for the next drain.
//
// Every D1 write is guarded by the document's D1 row (G2), so a drain racing a purge writes nothing. Every unit is a
// full replace of what it derives, so D1's rows are safe to drop and refill.

import { collabIndexRowsFromElements, type Element } from '@livedoc/document';
import { tabSearchText } from '@livedoc/document-views';
import { itemsSearchText } from '@livedoc/items';
import { sheetSearchInputs } from '@livedoc/sheets';
import { tabBlobHolds } from '../blob-store/tab-blobs';
import { previousStoredFiles, type PreviousStoredFile } from '../pdf-documents/pdf-previous';
import { contentSearchStatements, ITEMS_SEARCH_KEY } from '../db/content-search';
import { listItems } from '../db/items';
import { listSheets } from '../db/sheets';
import { refreshLiveTabDigest } from '../live-tabs/live-tab-digest';
import { liveTabKindOfTab } from '../live-tabs/live-tab-kinds';
import { documentImageIds } from '../db/image-refs';
import { imageGrantPlacementStatements } from '../db/image-grants';
import { formLinkShown } from '../forms/form-link-shown';
import type { DocumentEnv } from '../types';
import { contentSummaryOf } from './content-summary';
import { CARD_THREADS_TAB, readInboxCards } from './inbox-cards';

// Tab units one drain pushes; the rest go in the next drain, straight after.
export const DRAIN_TABS = 50;
// D1 batches in flight at once: Workers' six open connections.
export const PUSH_CONCURRENCY = 6;
// A bound JSON array stays under D1's 2 MB per value.
export const JSON_CHUNK_BYTES = 1_000_000;

type OutboxKind = 'summary' | 'tab' | 'cards' | 'items' | 'images';
type OutboxRow = { id: number; kind: OutboxKind; key: string };

export type DrainResult = {
  // Keys pushed and deleted.
  keys: number;
  // Units whose batch landed.
  units: number;
  // Units whose batch failed: their keys stay.
  failed: number;
  // Keys were left for the next drain (more than DRAIN_TABS tabs).
  more: boolean;
};

const EXISTS_DOCUMENT = 'EXISTS (SELECT 1 FROM documents WHERE id = ?1)';

// `rows` as JSON arrays of at most JSON_CHUNK_BYTES each.
export function jsonChunks(rows: readonly unknown[]): string[] {
  const chunks: string[] = [];
  let part: string[] = [];
  let size = 2;
  for (const row of rows) {
    const text = JSON.stringify(row);
    if (part.length > 0 && size + text.length + 1 > JSON_CHUNK_BYTES) {
      chunks.push(`[${part.join(',')}]`);
      part = [];
      size = 2;
    }
    part.push(text);
    size += text.length + 1;
  }
  if (part.length > 0) chunks.push(`[${part.join(',')}]`);
  return chunks;
}

// ---------- The document unit -----------------------------------------------------------------------------

async function summaryStatements(
  env: DocumentEnv,
  documentId: string,
): Promise<D1PreparedStatement[]> {
  const summary = await contentSummaryOf(env, documentId);
  const row = await env.DOCUMENT_DB.prepare('SELECT saved_at FROM document WHERE id = ?')
    .bind(documentId)
    .first<{ saved_at: number }>();
  return [
    env.DB.prepare(
      'UPDATE documents SET content_summary = ?2, saved_at = MAX(saved_at, ?3) WHERE id = ?1',
    ).bind(documentId, JSON.stringify(summary), row?.saved_at ?? 0),
  ];
}

// The document's whole set of placed images (docs/specs/009-elements/images.md "Reference index"), then the grants
// its images' owners are entitled to now ("Placement grants").
async function imagesStatements(
  env: DocumentEnv,
  documentId: string,
  now: number,
): Promise<D1PreparedStatement[]> {
  const ids = await documentImageIds(env, documentId);
  const set = JSON.stringify(ids);
  return [
    env.DB.prepare(
      `DELETE FROM document_images
        WHERE document_id = ?1 AND image_id NOT IN (SELECT value FROM json_each(?2))`,
    ).bind(documentId, set),
    ...jsonChunks(ids).map((chunk) =>
      env.DB.prepare(
        `INSERT OR IGNORE INTO document_images (document_id, image_id)
         SELECT ?1, value FROM json_each(?2) WHERE ${EXISTS_DOCUMENT}`,
      ).bind(documentId, chunk),
    ),
    ...imageGrantPlacementStatements(env, documentId, ids, now),
  ];
}

// The Inbox's Plan cards and their threads (docs/specs/013-workspace/inbox.md §2.4, §2.5), replaced whole.
async function cardsStatements(
  env: DocumentEnv,
  documentId: string,
): Promise<D1PreparedStatement[]> {
  const { cards, threads } = await readInboxCards(env, documentId);
  const stmts = [
    env.DB.prepare('DELETE FROM inbox_cards WHERE document_id = ?1').bind(documentId),
    env.DB.prepare('DELETE FROM collab_threads WHERE document_id = ?1 AND tab_id = ?2').bind(
      documentId,
      CARD_THREADS_TAB,
    ),
  ];
  for (const chunk of jsonChunks(cards)) {
    stmts.push(
      env.DB.prepare(
        `INSERT INTO inbox_cards
           (document_id, item_id, item_key, type, title, status, assignee_id, listed, updated_at, board, boards)
         SELECT ?1, value ->> '$.item_id', value ->> '$.item_key', value ->> '$.type', value ->> '$.title',
                value ->> '$.status', value ->> '$.assignee_id', value ->> '$.listed', value ->> '$.updated_at',
                value ->> '$.board', value ->> '$.boards'
           FROM json_each(?2)
          WHERE ${EXISTS_DOCUMENT}`,
      ).bind(documentId, chunk),
    );
  }
  for (const chunk of jsonChunks(threads)) {
    stmts.push(
      env.DB.prepare(
        `INSERT INTO collab_threads
           (document_id, tab_id, tab_name, element_id, element_label, resolved, comment_count, participant_ids,
            mentioned_ids, latest_text, latest_author_name, latest_author_color, first_at, latest_at)
         SELECT ?1, ?3, '', value ->> '$.item_id', value ->> '$.title', 0, value ->> '$.comment_count',
                value ->> '$.participant_ids', value ->> '$.mentioned_ids', COALESCE(value ->> '$.latest_text', ''),
                COALESCE(value ->> '$.latest_author_name', ''), COALESCE(value ->> '$.latest_author_color', ''),
                COALESCE(value ->> '$.first_at', 0), COALESCE(value ->> '$.latest_at', 0)
           FROM json_each(?2)
          WHERE ${EXISTS_DOCUMENT}`,
      ).bind(documentId, chunk, CARD_THREADS_TAB),
    );
  }
  return stmts;
}

// ---------- A tab unit ------------------------------------------------------------------------------------

type StoredTab = { id: string; name: string; data: string; drawing_of: string | null };

function parseBody(data: string): Record<string, unknown> {
  try {
    const body: unknown = JSON.parse(data);
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

// The tab's comment threads and actions (docs/specs/013-workspace/inbox.md §2.1), replaced whole. `tab` null: the
// tab has gone, and its rows with it.
function collabStatements(
  env: DocumentEnv,
  documentId: string,
  tabId: string,
  tab: StoredTab | null,
  body: Record<string, unknown>,
): D1PreparedStatement[] {
  const stmts = [
    env.DB.prepare('DELETE FROM collab_actions WHERE document_id = ?1 AND tab_id = ?2').bind(
      documentId,
      tabId,
    ),
    env.DB.prepare('DELETE FROM collab_threads WHERE document_id = ?1 AND tab_id = ?2').bind(
      documentId,
      tabId,
    ),
  ];
  if (!tab) return stmts;
  const elements = Array.isArray(body.elements) ? (body.elements as Element[]) : [];
  const rows = collabIndexRowsFromElements(elements);
  for (const chunk of jsonChunks(rows.actions)) {
    stmts.push(
      env.DB.prepare(
        `INSERT INTO collab_actions
           (document_id, tab_id, tab_name, element_id, action_id, element_label, name, description, status,
            assignee_user_id, assignee_member_id, assignee_name, assigner_id, assigner_name, team_id,
            created_at, updated_at)
         SELECT ?1, ?2, ?3, value ->> '$.elementId', value ->> '$.actionId', value ->> '$.elementLabel',
                value ->> '$.name', value ->> '$.description', value ->> '$.status',
                value ->> '$.assigneeUserId', value ->> '$.assigneeMemberId', value ->> '$.assigneeName',
                value ->> '$.assignerId', value ->> '$.assignerName', value ->> '$.teamId',
                value ->> '$.createdAt', value ->> '$.updatedAt'
           FROM json_each(?4)
          WHERE ${EXISTS_DOCUMENT}`,
      ).bind(documentId, tabId, tab.name, chunk),
    );
  }
  for (const chunk of jsonChunks(rows.threads)) {
    stmts.push(
      env.DB.prepare(
        `INSERT INTO collab_threads
           (document_id, tab_id, tab_name, element_id, element_label, resolved, comment_count,
            participant_ids, mentioned_ids, latest_text, latest_author_name, latest_author_color,
            first_at, latest_at)
         SELECT ?1, ?2, ?3, value ->> '$.elementId', value ->> '$.elementLabel',
                CASE WHEN value ->> '$.resolved' THEN 1 ELSE 0 END, value ->> '$.commentCount',
                value -> '$.participantIds', value -> '$.mentionedIds', value ->> '$.latestText',
                value ->> '$.latestAuthorName', value ->> '$.latestAuthorColor',
                value ->> '$.firstAt', value ->> '$.latestAt'
           FROM json_each(?4)
          WHERE ${EXISTS_DOCUMENT}`,
      ).bind(documentId, tabId, tab.name, chunk),
    );
  }
  return stmts;
}

// What the Inbox shows of the tab's form (docs/specs/030-forms/forms.md "Hearing about responses"): its name, its
// heading and the board its responses land on, on the tab's form links.
function formLinkStatements(
  env: DocumentEnv,
  documentId: string,
  tabId: string,
  tab: StoredTab | null,
  body: Record<string, unknown>,
): D1PreparedStatement[] {
  if (!tab) return [];
  const shown = formLinkShown(tab.name, body);
  return [
    env.DB.prepare(
      `UPDATE form_links SET tab_name = ?3, heading = ?4, board_tab_id = ?5
        WHERE document_id = ?1 AND tab_id = ?2
          AND (tab_name IS NOT ?3 OR heading IS NOT ?4 OR board_tab_id IS NOT ?5)`,
    ).bind(documentId, tabId, shown.tabName, shown.heading, shown.boardTabId),
  ];
}

// A tab that has gone takes its tab-scoped share links with it (docs/specs/013-workspace/tab-scoped-share-links.md),
// as the tab's own delete route does; this keeps any other way a tab goes from leaving one behind.
function goneTabStatements(
  env: DocumentEnv,
  documentId: string,
  tabId: string,
  tab: StoredTab | null,
): D1PreparedStatement[] {
  if (tab) return [];
  return [
    env.DB.prepare('DELETE FROM shared_with WHERE document_id = ?1 AND tab_id = ?2').bind(
      documentId,
      tabId,
    ),
    env.DB.prepare('DELETE FROM share_links WHERE document_id = ?1 AND tab_id = ?2').bind(
      documentId,
      tabId,
    ),
  ];
}

// The keys the tab holds in the blob store (docs/specs/006-document/blob-store.md "Holds and retention"), replaced
// whole: what the retention sweep reads. A tab of a kind that never holds a blob writes nothing; a tab that has gone
// lets go of what it held.
function blobHoldStatements(
  env: DocumentEnv,
  documentId: string,
  tabId: string,
  tab: StoredTab | null,
  body: Record<string, unknown>,
  _storedTexts: readonly string[],
  previous: readonly PreviousStoredFile[],
): D1PreparedStatement[] {
  const holds = tab ? tabBlobHolds(body, previous) : [];
  if (holds === null) return [];
  const stmts = [
    env.DB.prepare('DELETE FROM document_blobs WHERE document_id = ?1 AND tab_id = ?2').bind(
      documentId,
      tabId,
    ),
  ];
  if (holds.length > 0)
    stmts.push(
      env.DB.prepare(
        `INSERT INTO document_blobs (document_id, tab_id, key, until)
         SELECT ?1, ?2, value ->> '$.key', value ->> '$.until' FROM json_each(?3)
          WHERE ${EXISTS_DOCUMENT}`,
      ).bind(documentId, tabId, JSON.stringify(holds)),
    );
  return stmts;
}

// The tab's content search row (docs/specs/013-workspace/content-search.md): its text with the texts it holds outside
// its body (the inputs of the sheets it references, a text document's writing and drawings), or a delete when it has
// gone or holds no text. A drawing tab has none: its words are its text document's ("What is searched").
function searchStatements(
  env: DocumentEnv,
  documentId: string,
  tabId: string,
  tab: StoredTab | null,
  body: Record<string, unknown>,
  storedTexts: readonly string[],
): D1PreparedStatement[] {
  if (!tab || tab.drawing_of) return contentSearchStatements(env, documentId, tabId, '', null);
  const text = tabSearchText({ ...body, name: tab.name }, storedTexts);
  return contentSearchStatements(env, documentId, tabId, tab.name, text);
}

// Every part of a tab unit, in batch order.
const TAB_UNIT_PARTS = [
  collabStatements,
  formLinkStatements,
  goneTabStatements,
  blobHoldStatements,
  searchStatements,
] as const;

// The sheets a tab references (sheet_refs), as the search text reads them.
async function referencedSheetInputs(
  env: DocumentEnv,
  documentId: string,
  tabId: string,
): Promise<string[]> {
  const refs = await env.DOCUMENT_DB.prepare('SELECT sheet_id FROM sheet_refs WHERE tab_id = ?')
    .bind(tabId)
    .all<{ sheet_id: string }>();
  const ids = (refs.results ?? []).map((r) => r.sheet_id);
  if (ids.length === 0) return [];
  return sheetSearchInputs(await listSheets(env, documentId, { ids }));
}

async function readStoredTab(
  env: DocumentEnv,
  documentId: string,
  tabId: string,
): Promise<StoredTab | null> {
  return env.DOCUMENT_DB.prepare(
    `SELECT t.id, t.name, t.data, t.drawing_of FROM tabs t JOIN document_tabs dt ON dt.tab_id = t.id
      WHERE dt.document_id = ? AND t.id = ?`,
  )
    .bind(documentId, tabId)
    .first<StoredTab>();
}

// A drawing tab's text document's row, built afresh as its own unit builds it: a drawing's words are its.
async function textDocumentSearchStatements(
  env: DocumentEnv,
  documentId: string,
  textTabId: string,
): Promise<D1PreparedStatement[]> {
  const tab = await readStoredTab(env, documentId, textTabId);
  if (!tab || tab.drawing_of) return [];
  const body = parseBody(tab.data);
  const storedTexts = await storedTextsOf(env, documentId, textTabId, body);
  return searchStatements(env, documentId, textTabId, tab, body, storedTexts);
}

// Each drawing tab's words of a text document tab, in the document's order, its name left out.
async function drawingSearchTexts(
  env: DocumentEnv,
  documentId: string,
  textTabId: string,
): Promise<string[]> {
  const rows = await env.DOCUMENT_DB.prepare(
    `SELECT t.data FROM tabs t JOIN document_tabs dt ON dt.tab_id = t.id AND dt.document_id = ?
      WHERE t.drawing_of = ? ORDER BY dt.order_index`,
  )
    .bind(documentId, textTabId)
    .all<{ data: string }>();
  return (rows.results ?? []).flatMap((r) => {
    const text = tabSearchText({ ...parseBody(r.data), name: '' }, []).trim();
    return text ? [text] : [];
  });
}

async function tabStatements(
  env: DocumentEnv,
  documentId: string,
  tabId: string,
): Promise<D1PreparedStatement[]> {
  const tab = await readStoredTab(env, documentId, tabId);
  // One body at a time: a drain after a 200-tab import holds one tab in memory, never the document.
  const body = tab ? parseBody(tab.data) : {};
  const storedTexts = tab ? await storedTextsOf(env, documentId, tabId, body) : [];
  // A PDF tab's previous versions, whose bytes it holds until their day.
  const previous = tab && body.kind === 'pdf' ? await previousStoredFiles(env, tabId) : [];
  const unit = TAB_UNIT_PARTS.flatMap((part) =>
    part(env, documentId, tabId, tab, body, storedTexts, previous),
  );
  if (!tab?.drawing_of) return unit;
  return [...unit, ...(await textDocumentSearchStatements(env, documentId, tab.drawing_of))];
}

// What a tab holds outside its body, as text: a live tab's (a text document's writing), read through its digest
// (docs/specs/006-document/kinds-outside-the-canvas.md "Live state"), or the inputs of the sheets it references.
async function storedTextsOf(
  env: DocumentEnv,
  documentId: string,
  tabId: string,
  body: Record<string, unknown>,
): Promise<string[]> {
  const live = liveTabKindOfTab(body);
  if (live)
    return [
      (await refreshLiveTabDigest(env, live, documentId, tabId)).searchText,
      ...(await drawingSearchTexts(env, documentId, tabId)),
    ];
  return referencedSheetInputs(env, documentId, tabId);
}

// The cards' content search row, under ITEMS_SEARCH_KEY; no cards deletes it.
async function itemsSearchStatements(
  env: DocumentEnv,
  documentId: string,
): Promise<D1PreparedStatement[]> {
  const text = itemsSearchText(await listItems(env, documentId));
  return contentSearchStatements(env, documentId, ITEMS_SEARCH_KEY, '', text);
}

// ---------- The drain -------------------------------------------------------------------------------------

type Unit = { name: string; rows: OutboxRow[]; build: () => Promise<D1PreparedStatement[]> };

function unitsOf(env: DocumentEnv, documentId: string, rows: OutboxRow[], now: number): Unit[] {
  const documentRows = rows.filter((r) => r.kind !== 'tab');
  const units: Unit[] = [];
  if (documentRows.length > 0) {
    const kinds = new Set(documentRows.map((r) => r.kind));
    units.push({
      name: 'summary',
      rows: documentRows,
      build: async () => [
        ...(kinds.has('summary') ? await summaryStatements(env, documentId) : []),
        ...(kinds.has('images') ? await imagesStatements(env, documentId, now) : []),
        ...(kinds.has('cards') ? await cardsStatements(env, documentId) : []),
        ...(kinds.has('items') ? await itemsSearchStatements(env, documentId) : []),
      ],
    });
  }
  for (const row of rows.filter((r) => r.kind === 'tab')) {
    units.push({
      name: `tab:${row.key}`,
      rows: [row],
      build: () => tabStatements(env, documentId, row.key),
    });
  }
  return units;
}

// Run `tasks` at most `limit` at a time.
export async function pooled<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results: T[] = new Array<T>(tasks.length);
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const index = next++;
      results[index] = await tasks[index]!();
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

// One drain: at most DRAIN_TABS tab units and the document unit, PUSH_CONCURRENCY batches at once. Never throws for a
// unit: a failed unit keeps its keys (logged) and is counted in `failed`, so the room retries later.
export async function drainOutbox(env: DocumentEnv, documentId: string): Promise<DrainResult> {
  const all = (
    await env.DOCUMENT_DB.prepare(
      'SELECT id, kind, key FROM outbox WHERE document_id = ? ORDER BY id',
    )
      .bind(documentId)
      .all<OutboxRow>()
  ).results;
  if (all.length === 0) return { keys: 0, units: 0, failed: 0, more: false };
  const tabs = all.filter((r) => r.kind === 'tab');
  const taken = new Set(tabs.slice(0, DRAIN_TABS).map((r) => r.id));
  const rows = all.filter((r) => r.kind !== 'tab' || taken.has(r.id));
  const more = rows.length < all.length;
  const now = Date.now();
  const outcomes = await pooled(
    unitsOf(env, documentId, rows, now).map((unit) => async () => {
      try {
        const statements = await unit.build();
        if (statements.length > 0) await env.DB.batch(statements);
        return { unit, ok: true };
      } catch (error) {
        console.warn(`[outbox] unit failed id=${documentId} unit=${unit.name}`, error);
        return { unit, ok: false };
      }
    }),
    PUSH_CONCURRENCY,
  );
  const pushed = outcomes.filter((o) => o.ok).flatMap((o) => o.unit.rows.map((r) => r.id));
  if (pushed.length > 0) {
    await env.DOCUMENT_DB.prepare('DELETE FROM outbox WHERE id IN (SELECT value FROM json_each(?))')
      .bind(JSON.stringify(pushed))
      .run();
  }
  const result = {
    keys: pushed.length,
    units: outcomes.filter((o) => o.ok).length,
    failed: outcomes.filter((o) => !o.ok).length,
    more,
  };
  console.info(
    `[outbox] drained id=${documentId} units=${result.units} keys=${result.keys} more=${result.more}`,
  );
  return result;
}
