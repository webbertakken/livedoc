// A document's content moving from D1 into its room (docs/specs/006-document/document-storage-move.md "A move",
// docs/specs/006-document/document-storage-move.md "A move"). The room reads every row D1 holds
// for the document, writes them verbatim in one transaction with the rows derived from the bodies (tab stats, image
// references, board statuses), reads its own rows back and compares the two as canonical content inside that same
// transaction, so a difference undoes the whole write (M2). D1's content tables are only read (M3); the one D1 write
// is the document's `content_moves` record.

import type { Element } from '@livedoc/document';
import { imageRefIdsFromData } from '../image-refs/extract';
import { imageRefAddStatements } from '../db/image-refs';
import { planBoardIndexStatements } from '../db/plan-board-index';
import { tabStatsOfData, tabStatsStatement } from '../db/tab-stats';
import type { DocumentEnv } from '../types';
import {
  canonicalContent,
  canonicalJson,
  contentHashOf,
  MOVABLE_TABLES,
  movableSelects,
  type CanonicalContent,
  type MovableRows,
} from './content-hash';
import type { DocumentDb } from './document-db';

/** The room's key-value record of its move; present once the room holds its content. */
export const CONTENT_MOVE_KEY = 'content-move';
/** Tab bodies one D1 read carries (four tab caps). */
export const MOVE_READ_BYTES = 8_000_000;

export type MoveStatus = 'moved' | 'failed' | 'mismatch';

export type MoveOutcome = {
  status: MoveStatus;
  d1Hash: string | null;
  roomHash: string | null;
  d1Tabs: number | null;
  roomTabs: number | null;
  born: boolean;
  movedAt: number | null;
  // The error's name on a failed try, never content.
  error: string | null;
};

/** What a move needs of its room. */
export type MoveRoom = {
  env: DocumentEnv;
  db: DocumentDb;
  kv: { get<T>(key: string): T | undefined; put<T>(key: string, value: T): void };
  transaction: <T>(fn: () => T) => T;
  // The room's schema, made before the move's transaction (R1: the move is the room's first write).
  ensureSchema: () => void;
};

class MoveMismatchError extends Error {
  readonly back: CanonicalContent;
  constructor(back: CanonicalContent) {
    super('move_mismatch');
    this.name = 'MoveMismatchError';
    this.back = back;
  }
}

type DocumentHead = {
  presentation: string | null;
  item_types: string | null;
  item_types_rev: number | null;
  items_rev: number | null;
  items_next_key: number | null;
  saved_at: number | null;
  created_at: number | null;
};

const h8 = (hash: string | null) => (hash ?? '').slice(0, 8);
const errorName = (error: unknown) => (error instanceof Error ? error.name : typeof error);

/** The room's stored move, or null when it has not moved. */
export function storedMove(kv: MoveRoom['kv']): MoveOutcome | null {
  return kv.get<MoveOutcome>(CONTENT_MOVE_KEY) ?? null;
}

/** A document created or copied in its room holds its content from the start: moved, with nothing to compare (M4). */
export function markBorn(kv: MoveRoom['kv'], now: number): MoveOutcome {
  const outcome: MoveOutcome = {
    status: 'moved',
    d1Hash: null,
    roomHash: null,
    d1Tabs: null,
    roomTabs: null,
    born: true,
    movedAt: now,
    error: null,
  };
  kv.put(CONTENT_MOVE_KEY, outcome);
  return outcome;
}

// ---------- Reading D1 ------------------------------------------------------------------------------------

const TAB_COLUMNS = MOVABLE_TABLES.find((t) => t.table === 'tabs')!.columns;

// The tab bodies in groups of at most MOVE_READ_BYTES, lengths first, so no one D1 answer carries the document.
async function readTabs(env: DocumentEnv, documentId: string): Promise<Record<string, unknown>[]> {
  const sizes = await env.DB.prepare(
    `SELECT id, length(data) AS bytes FROM tabs
      WHERE id IN (SELECT tab_id FROM document_tabs WHERE document_id = ?1) ORDER BY id`,
  )
    .bind(documentId)
    .all<{ id: string; bytes: number }>();
  const groups: string[][] = [];
  let group: string[] = [];
  let bytes = 0;
  for (const { id, bytes: size } of sizes.results ?? []) {
    if (group.length > 0 && bytes + size > MOVE_READ_BYTES) {
      groups.push(group);
      group = [];
      bytes = 0;
    }
    group.push(id);
    bytes += size;
  }
  if (group.length > 0) groups.push(group);
  const rows: Record<string, unknown>[] = [];
  for (const ids of groups) {
    const res = await env.DB.prepare(
      `SELECT ${TAB_COLUMNS.join(', ')} FROM tabs WHERE id IN (SELECT value FROM json_each(?1))`,
    )
      .bind(JSON.stringify(ids))
      .all<Record<string, unknown>>();
    rows.push(...(res.results ?? []));
  }
  return rows;
}

// A tab D1 links into this document and another: once both have moved, each room holds its own copy and lists the
// other as a holder (tab-shares.ts).
type TabHolder = { tab_id: string; document_id: string };

async function readHolders(env: DocumentEnv, documentId: string): Promise<TabHolder[]> {
  const res = await env.DB.prepare(
    `SELECT tab_id, document_id FROM document_tabs
      WHERE tab_id IN (SELECT tab_id FROM document_tabs WHERE document_id = ?1) AND document_id <> ?1
      ORDER BY tab_id, document_id`,
  )
    .bind(documentId)
    .all<TabHolder>();
  return res.results ?? [];
}

// Every row D1 holds for the document, or null when D1 has no `documents` row for it (G1).
async function readD1(
  env: DocumentEnv,
  documentId: string,
): Promise<{ head: DocumentHead; rows: MovableRows; holders: TabHolder[] } | null> {
  const head = await env.DB.prepare(
    `SELECT presentation, item_types, item_types_rev, items_rev, items_next_key, saved_at, created_at
       FROM documents WHERE id = ?1`,
  )
    .bind(documentId)
    .first<DocumentHead>();
  if (!head) return null;
  const selects = movableSelects('documents').filter(
    (s) => s.table !== 'document' && s.table !== 'tabs',
  );
  const answers = await env.DB.batch(selects.map((s) => env.DB.prepare(s.sql).bind(documentId)));
  const rows: MovableRows = { document: [head], tabs: await readTabs(env, documentId) };
  selects.forEach((s, i) => {
    rows[s.table] = (answers[i]?.results ?? []) as Record<string, unknown>[];
  });
  return { head, rows, holders: await readHolders(env, documentId) };
}

// ---------- Writing the room ------------------------------------------------------------------------------

function insertRows(db: DocumentDb, rows: MovableRows): void {
  for (const { table, columns } of MOVABLE_TABLES) {
    if (table === 'document') continue;
    const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`;
    for (const row of rows[table] ?? []) {
      db.execute(db.prepare(sql).bind(...columns.map((c) => row[c] ?? null)));
    }
  }
}

// The rows a body implies, recomputed rather than copied: tab stats dated by the tab's own save, its image
// references and its boards' column statuses.
function deriveRows(
  db: DocumentDb,
  env: DocumentEnv,
  documentId: string,
  tabs: Record<string, unknown>[],
): void {
  for (const tab of tabs) {
    const id = tab.id as string;
    const data = tab.data as string;
    const statements = [
      tabStatsStatement(env, id, statsOf(documentId, id, data), Number(tab.updated_at ?? 0)),
      ...imageRefAddStatements(env, id, imageRefIdsFromData(data)),
      ...planBoardIndexStatements(env, id, elementsOf(data)),
    ];
    for (const statement of statements) db.execute(statement as never);
  }
}

// A body that is not JSON counts as an empty tab with its bytes, said once in the log.
function statsOf(documentId: string, tabId: string, data: string) {
  const { stats, corrupt } = tabStatsOfData(data);
  if (corrupt)
    console.warn(`[tab-stats] corrupt body id=${documentId} tab=${tabId} counted as empty`);
  return stats;
}

function elementsOf(data: string): Element[] {
  try {
    const body = JSON.parse(data) as { elements?: unknown };
    return Array.isArray(body.elements) ? (body.elements as Element[]) : [];
  } catch {
    return [];
  }
}

// The room's own rows for the document, as the hash reads them.
function readRoom(db: DocumentDb, documentId: string): CanonicalContent {
  const rows: MovableRows = {};
  for (const { table, sql } of movableSelects('document')) {
    rows[table] = db.execute(db.prepare(sql).bind(documentId)).results;
  }
  return canonicalContent(rows);
}

// ---------- The record ------------------------------------------------------------------------------------

function recordStatement(
  env: Pick<DocumentEnv, 'DB'>,
  documentId: string,
  outcome: MoveOutcome,
  now: number,
  counted: boolean,
): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT INTO content_moves
       (document_id, status, born, d1_tabs, room_tabs, d1_hash, room_hash, attempts, tried_at, moved_at, error)
     SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11
      WHERE EXISTS (SELECT 1 FROM documents WHERE id = ?1)
     ON CONFLICT (document_id) DO UPDATE SET
       status = excluded.status, born = excluded.born, d1_tabs = excluded.d1_tabs, room_tabs = excluded.room_tabs,
       d1_hash = excluded.d1_hash, room_hash = excluded.room_hash,
       attempts = content_moves.attempts + ?8, tried_at = excluded.tried_at, moved_at = excluded.moved_at,
       error = excluded.error`,
  ).bind(
    documentId,
    outcome.status,
    outcome.born ? 1 : 0,
    outcome.d1Tabs,
    outcome.roomTabs,
    outcome.d1Hash,
    outcome.roomHash,
    counted ? 1 : 0,
    now,
    outcome.movedAt,
    outcome.error,
  );
}

/** Write the document's `content_moves` record; a failure is logged, and the next sweep heals it. */
export async function recordMove(
  env: Pick<DocumentEnv, 'DB'>,
  documentId: string,
  outcome: MoveOutcome,
  now: number,
  counted: boolean,
): Promise<void> {
  try {
    await recordStatement(env, documentId, outcome, now, counted).run();
  } catch (error) {
    console.error(`[content-move] failed id=${documentId} stage=record error=${errorName(error)}`);
  }
}

// ---------- The move --------------------------------------------------------------------------------------

/**
 * Move the document's content into the room, or answer the move it already made. Null when D1 holds no
 * `documents` row for the id (G1): the room stays empty and nothing is recorded.
 */
export async function moveIntoRoom(
  room: MoveRoom,
  documentId: string,
  now: number,
): Promise<MoveOutcome | null> {
  const stored = storedMove(room.kv);
  if (stored) {
    await recordMove(room.env, documentId, stored, now, false);
    return stored;
  }
  let read: Awaited<ReturnType<typeof readD1>>;
  let d1: CanonicalContent;
  let d1Hash: string;
  try {
    read = await readD1(room.env, documentId);
    if (!read) return null;
    d1 = canonicalContent(read.rows);
    d1Hash = await contentHashOf(d1);
  } catch (error) {
    return fail(room, documentId, now, 'read', error);
  }
  const d1Tabs = d1.tabs.length;
  const expected = canonicalJson(d1);
  const { head, rows, holders } = read;
  let outcome: MoveOutcome;
  try {
    room.ensureSchema();
    outcome = room.transaction(() => {
      room.db.execute(
        room.db
          .prepare(
            `INSERT INTO document (id, presentation, item_types, item_types_rev, items_rev, items_next_key, saved_at,
                                   created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            documentId,
            head.presentation,
            head.item_types,
            head.item_types_rev ?? 0,
            head.items_rev ?? 0,
            head.items_next_key ?? 1,
            head.saved_at ?? 0,
            head.created_at ?? 0,
          ),
      );
      insertRows(room.db, rows);
      deriveRows(room.db, room.env, documentId, rows.tabs ?? []);
      for (const h of holders) {
        room.db.execute(
          room.db
            .prepare('INSERT INTO tab_shares (tab_id, document_id) VALUES (?, ?)')
            .bind(h.tab_id, h.document_id),
        );
      }
      const back = readRoom(room.db, documentId);
      const roomTabs = back.tabs.length;
      // Equal canonical texts hash equally, so the room's hash is the D1 hash; a difference throws, undoing it all.
      if (canonicalJson(back) !== expected || roomTabs !== d1Tabs) {
        throw new MoveMismatchError(back);
      }
      const moved: MoveOutcome = {
        status: 'moved',
        d1Hash,
        roomHash: d1Hash,
        d1Tabs,
        roomTabs,
        born: false,
        movedAt: now,
        error: null,
      };
      room.kv.put(CONTENT_MOVE_KEY, moved);
      return moved;
    });
  } catch (error) {
    if (error instanceof MoveMismatchError) {
      const roomHash = await contentHashOf(error.back);
      return mismatch(room, documentId, now, d1Hash, d1Tabs, roomHash, error.back.tabs.length);
    }
    return fail(room, documentId, now, 'write', error);
  }
  const keys = Number(
    room.db.execute(room.db.prepare('SELECT COUNT(*) AS n FROM outbox')).results[0]?.n ?? 0,
  );
  console.log(
    `[content-move] moved id=${documentId} tabs=${d1Tabs} keys=${keys} hash=${h8(d1Hash)}`,
  );
  await recordMove(room.env, documentId, outcome, now, true);
  return outcome;
}

/** A failed try's outcome: only the error's name. */
export function failedMove(error: string): MoveOutcome {
  return {
    status: 'failed',
    d1Hash: null,
    roomHash: null,
    d1Tabs: null,
    roomTabs: null,
    born: false,
    movedAt: null,
    error,
  };
}

async function fail(
  room: MoveRoom,
  documentId: string,
  now: number,
  stage: 'read' | 'write',
  error: unknown,
): Promise<MoveOutcome> {
  const name = errorName(error);
  console.error(`[content-move] failed id=${documentId} stage=${stage} error=${name}`, error);
  const outcome = failedMove(name);
  await recordMove(room.env, documentId, outcome, now, true);
  return outcome;
}

async function mismatch(
  room: MoveRoom,
  documentId: string,
  now: number,
  d1Hash: string,
  d1Tabs: number,
  roomHash: string | null,
  roomTabs: number,
): Promise<MoveOutcome> {
  console.error(
    `[content-move] mismatch id=${documentId} d1=${h8(d1Hash)} room=${h8(roomHash)} d1Tabs=${d1Tabs} roomTabs=${roomTabs}`,
  );
  const outcome: MoveOutcome = {
    status: 'mismatch',
    d1Hash,
    roomHash,
    d1Tabs,
    roomTabs,
    born: false,
    movedAt: null,
    error: 'MoveMismatchError',
  };
  await recordMove(room.env, documentId, outcome, now, true);
  return outcome;
}
