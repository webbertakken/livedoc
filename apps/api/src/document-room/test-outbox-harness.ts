// A drain harness (docs/specs/006-document/document-storage.md "The outbox"): the room's SQLite and D1 as separate
// databases, as they are in production, and a hook on every D1 batch, for the outbox's tests.
import { DatabaseSync } from 'node:sqlite';
import { sqliteD1 } from '../test-sqlite-d1';
import { nodeDocumentSql, nodeTransaction } from '../test-document-sql';
import type { DocumentEnv } from '../types';
import { DocumentDb } from './document-db';
import { migrateDocumentSchema } from './document-schema';

export type Harness = {
  env: DocumentEnv;
  room: DatabaseSync;
  d1: DatabaseSync;
  // A batch's first statement's SQL and binds, for a test that fails or watches one unit.
  onBatch: (hook: (sql: string[], binds: unknown[][]) => Promise<void> | void) => void;
};

export function harness(documentId: string): Harness {
  const { env: d1Env, sql: d1 } = sqliteD1({}, { keepD1Content: true });
  d1.exec(
    `INSERT INTO documents (id, owner_id, name, saved_at, created_at) VALUES ('${documentId}', 'o', 'Doc', 1, 1)`,
  );
  const room = new DatabaseSync(':memory:');
  room.exec('PRAGMA foreign_keys = ON');
  const roomSql = nodeDocumentSql(room);
  migrateDocumentSchema((q) => roomSql.exec(q));
  const documentDb = new DocumentDb(roomSql, {
    transaction: nodeTransaction(room),
    ensureSchema: () => {},
    hasSchema: () => true,
    onWrite: () => {},
  });
  room.exec(`INSERT INTO document (id, saved_at, created_at) VALUES ('${documentId}', 5, 1)`);
  let hook: (sql: string[], binds: unknown[][]) => Promise<void> | void = () => {};
  const realPrepare = d1Env.DB.prepare.bind(d1Env.DB);
  const realBatch = d1Env.DB.batch.bind(d1Env.DB);
  const seen = new WeakMap<object, { sql: string; binds: unknown[] }>();
  const DB = {
    ...d1Env.DB,
    prepare: (query: string) => {
      const wrap = (statement: D1PreparedStatement, binds: unknown[]): D1PreparedStatement => {
        const proxy = new Proxy(statement, {
          get: (target, prop) => {
            if (prop === 'bind') return (...next: unknown[]) => wrap(target.bind(...next), next);
            const value: unknown = Reflect.get(target, prop);
            return typeof value === 'function'
              ? (value as (...a: unknown[]) => unknown).bind(target)
              : value;
          },
        });
        seen.set(proxy, { sql: query, binds });
        return proxy;
      };
      return wrap(realPrepare(query), []);
    },
    batch: async (statements: D1PreparedStatement[]) => {
      const meta = statements.map((s) => seen.get(s) ?? { sql: '', binds: [] });
      await hook(
        meta.map((m) => m.sql),
        meta.map((m) => m.binds),
      );
      return realBatch(statements);
    },
  } as unknown as D1Database;
  const env = { ...d1Env, DB, DOCUMENT_DB: documentDb.asD1() } as unknown as DocumentEnv;
  return { env, room, d1, onBatch: (h) => (hook = h) };
}
