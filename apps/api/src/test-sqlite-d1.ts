import { AsyncLocalStorage } from 'node:async_hooks';
import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { DocumentDb } from './document-room/document-db';
import { migrateDocumentSchema } from './document-room/document-schema';
import { assertD1Compound } from './test-d1-compound';
import { nodeDocumentSql, nodeTransaction } from './test-document-sql';
import { withTestDocumentRooms } from './test-document-room';
import type { DocumentEnv, Env } from './types';

// A REAL D1 for tests: an in-memory SQLite database with every migration in
// apps/api/migrations applied, behind the D1 prepare/bind/first/all/run/batch
// surface the db/ modules call.
//
// test-d1.ts records which SQL ran; this one answers whether it WORKED. Use it
// where the behaviour lives in the schema: foreign-key cascades, primary-key
// collisions, INSERT OR IGNORE outcomes. D1 enforces foreign keys, so this
// turns them on too.
//
// A document's content lives in its own room's SQLite (docs/specs/006-document/document-storage.md). Here every
// document's room tables sit in the same database as D1's, behind `env.DOCUMENT_DB`, so a test arranges and asserts
// on both through one handle and a handler runs as it does inside a room. D1's own content tables, which only the
// move into rooms reads, are dropped to make room for them (`keepD1Content` keeps them, with no room tables, for the
// move's tests; test-document-room.ts builds a room on a database of its own). `env.DOCUMENT_ROOM` answers the
// room's RPCs (document-rpc.ts) from these same tables and hands `fetch` to the DOCUMENT_ROOM the test passed, if any.
// A D1 `documents` row comes with its room's `document` row, as a create makes both, and what the rooms owe D1
// (document-outbox.ts) is drained before every D1 call, so a test reads D1 as it is once the drain has landed.
//
// Not a `.test.ts` file, so vitest doesn't collect it as a suite.

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations/', import.meta.url).href);

// D1's content tables (docs/specs/006-document/document-storage-move.md), children first.
const D1_CONTENT_TABLES = [
  'agent_changeset_parts',
  'agent_changesets',
  'image_refs',
  'image_refs_backfill',
  'tab_stats',
  'plan_board_statuses',
  'sheet_refs',
  'sheet_cells',
  'sheets',
  'items',
  'document_tabs',
  'tabs',
  'collab_index_state',
] as const;

// A statement through D1 that names a room's table: content read or written in D1 (D15, R1). D1 holds no
// content once documents live in rooms, so the harness refuses one outright rather than letting the shared tables
// answer it.
const ROOM_TABLE_SQL =
  /\b(?:FROM|JOIN|INTO|UPDATE)\s+(?:tabs|document_tabs|tab_stats|image_refs|agent_changesets|agent_changeset_parts|items|plan_board_statuses|sheets|sheet_cells|sheet_refs|document|outbox)\b/i;

export type SqliteD1 = {
  // The worker's bindings and the rooms' (DOCUMENT_DB): every content module and every D1 module runs against it.
  env: DocumentEnv;
  // The raw handle, for arranging rows and asserting on them directly.
  sql: DatabaseSync;
  // Land what the rooms owe D1 now (every D1 call does this first), for a test that reads D1 through `sql`.
  flush: () => Promise<void>;
};

// D1 binds a boolean as 1 / 0; node:sqlite refuses one outright.
function toSql(value: unknown): SQLInputValue {
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value === undefined) throw new TypeError('D1_TYPE_ERROR: undefined is not a bindable value');
  return value as SQLInputValue;
}

function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

// A migration runs on D1 too, so it meets D1's limits (testing.md "Every test database refuses what D1 refuses").
function runMigration(sql: DatabaseSync, file: string): void {
  const migration = readFileSync(MIGRATIONS_DIR + file, 'utf8');
  assertD1Compound(migration);
  sql.exec(migration);
}

// Run the one migration whose file name starts with `prefix` (e.g. '0049'),
// for a test that seeds rows under the previous schema first.
export function applyMigration(sql: DatabaseSync, prefix: string): void {
  const file = migrationFiles().find((f) => f.startsWith(`${prefix}_`));
  if (!file) throw new Error(`no migration ${prefix}`);
  runMigration(sql, file);
}

// Run every migration from `prefix` on, bringing a database seeded under an older schema up to
// the one the current code reads.
export function migrateFrom(sql: DatabaseSync, prefix: string): void {
  for (const file of migrationFiles().filter((f) => f >= prefix)) {
    runMigration(sql, file);
  }
}

// Give a database D1's full schema the rooms' tables, as sqliteD1 does: for a test that migrated an older
// schema up first.
export function addRoomTables(sql: DatabaseSync): void {
  for (const table of D1_CONTENT_TABLES) sql.exec(`DROP TABLE IF EXISTS ${table}`);
  const documentSql = nodeDocumentSql(sql);
  migrateDocumentSchema((q) => documentSql.exec(q));
  // A D1 document row comes with its room's document row, as a create makes both. A test may still arrange the
  // deck and the type catalogue on the D1 row (their columns stay until the drop release); they land in the room.
  sql.exec(`CREATE TEMP TRIGGER IF NOT EXISTS documents_room_document AFTER INSERT ON documents
    BEGIN
      INSERT OR IGNORE INTO document
        (id, presentation, item_types, item_types_rev, items_rev, items_next_key, saved_at, created_at)
      VALUES (NEW.id, NEW.presentation, NEW.item_types, COALESCE(NEW.item_types_rev, 0), COALESCE(NEW.items_rev, 0),
              COALESCE(NEW.items_next_key, 1), COALESCE(NEW.saved_at, 0), COALESCE(NEW.created_at, 0));
    END`);
}

export type SqliteD1Options = {
  // Stop short of that migration (e.g. '0049'), leaving it for the test to apply with applyMigration. No room
  // tables: a test that migrates up and needs them calls addRoomTables.
  before?: string;
  // Keep D1's content tables and add no room tables: the move's tests (document-storage-move.md).
  keepD1Content?: boolean;
};

export function sqliteD1(base: Partial<Env> = {}, opts: SqliteD1Options = {}): SqliteD1 {
  const sql = new DatabaseSync(':memory:');
  sql.exec('PRAGMA foreign_keys = ON');
  for (const file of migrationFiles()) {
    if (opts.before && file >= opts.before) break;
    runMigration(sql, file);
  }
  const rooms = !opts.before && !opts.keepD1Content;
  if (rooms) addRoomTables(sql);
  const hasOutbox = () =>
    sql.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'outbox'").all()
      .length > 0;

  // Drain what the rooms owe D1 before D1 answers anything. A call made while a drain runs waits for it; the
  // drain's own D1 batches (inside it, by their async context) go straight through.
  const inDrain = new AsyncLocalStorage<true>();
  let draining: Promise<void> | null = null;
  const flush = async (): Promise<void> => {
    if (inDrain.getStore() || !rooms) return;
    while (draining) await draining;
    if (!hasOutbox() || sql.prepare('SELECT 1 FROM outbox LIMIT 1').all().length === 0) return;
    draining = inDrain.run(true, async () => {
      const { drainOutbox } = await import('./document-room/document-outbox');
      const documents = sql.prepare('SELECT DISTINCT document_id FROM outbox').all() as {
        document_id: string;
      }[];
      for (const { document_id } of documents) {
        let more = true;
        while (more) more = (await drainOutbox(env, document_id)).more;
      }
    });
    try {
      await draining;
    } finally {
      draining = null;
    }
  };

  // D1 refuses a compound SELECT of more than five terms, where node:sqlite allows 500.
  const statement = (query: string, args: SQLInputValue[]) => {
    assertD1Compound(query);
    const rows = () =>
      sql
        .prepare(query)
        .all(...args)
        .map((row) => ({ ...row }));
    return {
      bind: (...next: unknown[]) => statement(query, next.map(toSql)),
      first: async (column?: string) => {
        await flush();
        const row = rows()[0] ?? null;
        return column && row ? (row[column] ?? null) : row;
      },
      // A write through all() (better-auth's D1 dialect sends every statement this way) answers its change
      // count, as D1 does; a read answers its rows.
      all: async () => {
        await flush();
        const prepared = sql.prepare(query);
        if (prepared.columns().length > 0) return { results: rows(), success: true, meta: {} };
        const res = prepared.run(...args);
        return {
          results: [],
          success: true,
          meta: { changes: Number(res.changes), last_row_id: Number(res.lastInsertRowid) },
        };
      },
      run: async () => {
        await flush();
        const res = sql.prepare(query).run(...args);
        return {
          success: true,
          meta: { changes: Number(res.changes), last_row_id: Number(res.lastInsertRowid) },
        };
      },
      // What D1's batch hands back per statement: a read's rows, a write's
      // change count. Synchronous, so nothing interleaves inside a batch.
      batchResult: () => {
        const prepared = sql.prepare(query);
        if (prepared.columns().length > 0) {
          return { results: rows(), success: true, meta: { changes: 0 } };
        }
        const res = prepared.run(...args);
        return { results: [], success: true, meta: { changes: Number(res.changes) } };
      },
    };
  };

  // D1 runs a batch as one transaction: all of it lands or none of it does. The statements run synchronously
  // after the drain, so no other batch or room write can land inside one.
  const runBatch = (statements: { batchResult: () => unknown }[]) => {
    sql.exec('BEGIN');
    try {
      const results = statements.map((s) => s.batchResult());
      sql.exec('COMMIT');
      return results;
    } catch (err) {
      sql.exec('ROLLBACK');
      throw err;
    }
  };
  const db = {
    prepare: (query: string) => {
      if (rooms && ROOM_TABLE_SQL.test(query))
        throw new Error(
          `D1 statement names a room table: ${query.replace(/\s+/g, ' ').slice(0, 160)}`,
        );
      return statement(query, []);
    },
    // Present so better-auth recognises the binding as D1 (it tests for prepare, batch and exec).
    exec: async (query: string) => {
      assertD1Compound(query);
      sql.exec(query);
      return { count: 0, duration: 0 };
    },
    batch: async (statements: { batchResult: () => unknown }[]) => {
      await flush();
      return runBatch(statements);
    },
  };

  const documentDb = new DocumentDb(nodeDocumentSql(sql), {
    transaction: nodeTransaction(sql),
    ensureSchema: () => {},
    hasSchema: () => rooms,
    onWrite: () => {},
  });
  const env = { ...base, DB: db, DOCUMENT_DB: documentDb.asD1() } as unknown as DocumentEnv;
  withTestDocumentRooms(env, (documentId) => purgeRoomRows(sql, documentId));
  return { env, sql, flush };
}

// What a room's deleteAll drops, for one document of the shared tables.
function purgeRoomRows(sql: DatabaseSync, documentId: string): void {
  if (sql.prepare("SELECT 1 FROM sqlite_master WHERE name = 'document'").all().length === 0) return;
  sql
    .prepare(
      'DELETE FROM tabs WHERE id IN (SELECT tab_id FROM document_tabs WHERE document_id = ?)',
    )
    .run(documentId);
  sql.prepare('DELETE FROM document WHERE id = ?').run(documentId);
  sql.prepare('DELETE FROM outbox WHERE document_id = ?').run(documentId);
}
