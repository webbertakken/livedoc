import { DatabaseSync } from 'node:sqlite';
import { DocumentRoom } from './document-room/document-room';
import { nodeDocumentSql, nodeTransaction } from './test-document-sql';
import type { DocumentEnv, Env } from './types';

// The room harness for tests (docs/specs/006-document/document-storage.md), two ways:
//
// - withTestDocumentRooms: the env's DOCUMENT_ROOM answers the room's RPCs (document-rpc.ts) against the env itself,
//   so a route test drives the worker's handler, which hands the request to the "room", which runs the same
//   handlers with the same access checks. Content sits wherever the env's DOCUMENT_DB is (test-sqlite-d1.ts puts
//   every room's tables beside D1's). `fetch` (the room's relays) goes to the DOCUMENT_ROOM the test set, if any.
// - testDocumentRoom: a real DocumentRoom on a node:sqlite database of its own, for tests of the room itself and of
//   moving content into one beside D1's tables.
//
// Not a `.test.ts` file, so vitest doesn't collect it as a suite.

const WRAPPED = Symbol('test-document-rooms');

type FakeId = DurableObjectId & { documentName: string; realId: unknown };

// The background work of the latest test request, so a test watching its waitUntil sees the room's too.
type Background = { waitUntil?: (promise: Promise<unknown>) => void };

function namespaceOver(
  env: DocumentEnv,
  real: Env['DOCUMENT_ROOM'] | undefined,
  purge: (documentId: string) => void,
  background: Background,
): Env['DOCUMENT_ROOM'] {
  const ns = {
    [WRAPPED]: background,
    idFromName: (name: string): FakeId => {
      const id: FakeId = {
        documentName: name,
        realId: real ? real.idFromName(name) : name,
        name,
        toString: () => name,
        equals: (other: DurableObjectId) => (other as FakeId).documentName === name,
      };
      return id;
    },
    get: (id: FakeId) =>
      new Proxy(
        {},
        {
          get: (_target, prop) => {
            if (prop === 'then') return undefined;
            if (prop === 'fetch') {
              return async (input: RequestInfo | URL, init?: RequestInit) => {
                const url = input instanceof Request ? input.url : String(input);
                const purging = new URL(url, 'https://room.invalid').pathname === '/purge';
                if (purging) purge(id.documentName);
                if (!real) return new Response(null, { status: purging ? 200 : 404 });
                return real.get(id.realId as DurableObjectId).fetch(input, init);
              };
            }
            return async (...args: unknown[]) => {
              const { documentRpc } = await import('./document-room/document-rpc');
              const methods = documentRpc(env, background.waitUntil) as unknown as Record<
                string,
                (...a: unknown[]) => Promise<unknown>
              >;
              const method = methods[prop as string];
              if (!method) throw new Error(`no room RPC ${String(prop)}`);
              return method(...args);
            };
          },
        },
      ),
  };
  return ns as unknown as Env['DOCUMENT_ROOM'];
}

// Give `env` a DOCUMENT_ROOM that answers as its rooms would. A test that sets env.DOCUMENT_ROOM later (its relay
// recorder) gets it wrapped the same way. Idempotent.
export function withTestDocumentRooms(
  env: Partial<Env>,
  purge: (documentId: string) => void = () => {},
  waitUntil?: (promise: Promise<unknown>) => void,
): void {
  const current: (Env['DOCUMENT_ROOM'] & { [WRAPPED]?: Background }) | undefined =
    env.DOCUMENT_ROOM;
  if (current?.[WRAPPED]) {
    current[WRAPPED].waitUntil = waitUntil;
    return;
  }
  const docEnv = env as DocumentEnv;
  const background: Background = { waitUntil };
  let namespace = namespaceOver(docEnv, current, purge, background);
  Object.defineProperty(env, 'DOCUMENT_ROOM', {
    // Not enumerable, so a test comparing the env it passed still sees the bindings it set.
    enumerable: false,
    configurable: true,
    get: () => namespace,
    set: (next: Env['DOCUMENT_ROOM'] | undefined) => {
      namespace = namespaceOver(docEnv, next, purge, background);
    },
  });
}

// A real room on its own node:sqlite database: its state's storage has `sql`, `transactionSync` and the key-value
// calls a room makes, in memory. `name` is its id's: a test of several rooms names each, so a room answers its own
// id itself and reaches the others through the env's DOCUMENT_ROOM.
export function testDocumentRoom(
  env?: Env,
  name?: string,
): {
  room: DocumentRoom;
  sql: DatabaseSync;
  alarms: () => number | null;
  kv: Map<string, unknown>;
} {
  const sql = new DatabaseSync(':memory:');
  sql.exec('PRAGMA foreign_keys = ON');
  const kv = new Map<string, unknown>();
  let alarm: number | null = null;
  let gate: Promise<unknown> = Promise.resolve();
  const id = {
    name: name ?? 'room',
    toString: () => name ?? 'room',
    equals: (other: DurableObjectId) => name === undefined || String(other) === name,
  } as unknown as DurableObjectId;
  const storage = {
    sql: nodeDocumentSql(sql),
    transactionSync: nodeTransaction(sql),
    get: async (key: string) => kv.get(key),
    put: async (key: string, value: unknown) => {
      kv.set(key, value);
    },
    delete: async (key: string) => kv.delete(key),
    list: async () => new Map(kv),
    deleteAll: async () => {
      kv.clear();
      // As the room's deleteAll: everything goes at once, so no trigger or foreign key sees a half-dropped schema.
      sql.exec('PRAGMA foreign_keys = OFF');
      for (const { name } of sql
        .prepare("SELECT name FROM sqlite_master WHERE type = 'trigger'")
        .all() as { name: string }[])
        sql.exec(`DROP TRIGGER IF EXISTS "${name}"`);
      for (const { name } of sql
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
        .all() as { name: string }[])
        sql.exec(`DROP TABLE IF EXISTS "${name}"`);
      sql.exec('PRAGMA foreign_keys = ON');
    },
    // The synchronous key-value API of a SQLite-backed room, over the same keys.
    kv: {
      get: (key: string) => kv.get(key),
      put: (key: string, value: unknown) => {
        kv.set(key, value);
      },
      delete: (key: string) => kv.delete(key),
      list: () => kv.entries(),
    },
    getAlarm: async () => alarm,
    setAlarm: async (at: number) => {
      alarm = at;
    },
    deleteAlarm: async () => {
      alarm = null;
    },
  };
  const state = {
    id,
    storage,
    waitUntil: () => {},
    // As a Durable Object: one callback at a time, the next waiting for the one before.
    blockConcurrencyWhile: (fn: () => Promise<unknown>) => {
      const run = gate.then(fn);
      gate = run.catch(() => undefined);
      return run;
    },
    getWebSockets: () => [],
    acceptWebSocket: () => {},
  } as unknown as DurableObjectState;
  return { room: new DocumentRoom(state, env), sql, alarms: () => alarm, kv };
}

// The SQLite half of a room's storage, for a test that builds its own fake DurableObjectState.
export function roomSqlStorage(): Pick<DurableObjectStorage, 'sql' | 'transactionSync'> {
  const sql = new DatabaseSync(':memory:');
  sql.exec('PRAGMA foreign_keys = ON');
  return {
    sql: nodeDocumentSql(sql) as unknown as SqlStorage,
    transactionSync: nodeTransaction(sql),
  };
}
