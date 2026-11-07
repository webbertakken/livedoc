import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { purgeDocuments, purgeExpiredTrash, trashDocument } from './db';
import { DAY, T0, liveDoc } from './db/test-trash-fixtures';
import { handleDocuments } from './routes/documents';
import { makeTestRouteContext } from './routes/test-route-context';
import {
  ROOM_PURGE_MAX_PER_RUN,
  ROOM_PURGE_RETRY_MS,
  purgeRooms,
  retryRoomPurges,
  roomCallBudget,
} from './room-purge-client';
import { sqliteD1, type SqliteD1 } from './test-sqlite-d1';
import type { Env } from './types';

// Purge tombstones (docs/specs/006-document/document-storage.md "Purging and copying"): the
// removal batch leaves one per document, a room that confirms clears it, one that cannot be reached keeps it for the
// daily retry, a tombstoned document cannot be opened (G3), and no run makes more room calls than its budget.

// The subrequests a Worker invocation may make to Cloudflare services (D1, Durable Objects) on the Free plan, the
// tighter of the two (https://developers.cloudflare.com/workers/platform/limits/#subrequests; 10,000 on Paid).
const WORKER_SERVICE_SUBREQUESTS = 1_000;

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const tombstones = (sql: DatabaseSync) =>
  sql
    .prepare('SELECT document_id, attempts, last_attempt_at FROM room_purges ORDER BY document_id')
    .all() as { document_id: string; attempts: number; last_attempt_at: number | null }[];

// The env's rooms answer /purge, except those in `down`; every room call is counted.
function rooms(db: SqliteD1, down: Set<string> = new Set()): { env: Env; purged: string[] } {
  const purged: string[] = [];
  const env = db.env;
  env.DOCUMENT_ROOM = {
    idFromName: (name: string) => ({ name, toString: () => name }),
    get: (id: { name: string }) => ({
      fetch: async () => {
        if (down.has(id.name)) throw new Error('room unreachable');
        purged.push(id.name);
        return new Response(null, { status: 204 });
      },
    }),
  } as unknown as Env['DOCUMENT_ROOM'];
  return { env, purged };
}

async function trashed(db: SqliteD1, ids: string[], at = T0) {
  for (const id of ids) {
    liveDoc(db.sql, id);
    await trashDocument(db.env, id, at);
  }
}

describe('purge tombstones', () => {
  it('are written with the removal and cleared by a room that confirms', async () => {
    const db = sqliteD1();
    const { env, purged } = rooms(db, new Set(['B']));
    await trashed(db, ['A', 'B']);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T0 + DAY);
    expect(await purgeDocuments(env, ['A', 'B'])).toBe(2);
    expect(purged).toEqual(['A']);
    expect(tombstones(db.sql)).toEqual([
      { document_id: 'B', attempts: 1, last_attempt_at: T0 + DAY },
    ]);
    expect(warn).toHaveBeenCalledWith('[room-purge] did not reach the room', {
      documentId: 'B',
      error: 'Error: room unreachable',
    });
  });

  it('make a document unopenable: 404 before its room is reached (G3)', async () => {
    const db = sqliteD1();
    const { env, purged } = rooms(db, new Set(['A']));
    await trashed(db, ['A']);
    await purgeDocuments(env, ['A']);
    const res = await handleDocuments(
      makeTestRouteContext('GET', '/api/documents/A', { env, owner: 'owner' }),
    );
    expect(res.status).toBe(404);
    expect(purged).toEqual([]);
  });

  it('are retried by the cron once the retry gap passed, oldest first, within the budget', async () => {
    const db = sqliteD1();
    const down = new Set(['A', 'B', 'C']);
    const { env, purged } = rooms(db, down);
    await trashed(db, ['A', 'B', 'C']);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T0);
    await purgeDocuments(env, ['A', 'B', 'C']);
    down.clear();
    // Tried a moment ago: not yet.
    expect((await retryRoomPurges(env, T0 + 1_000)).rooms).toBe(0);
    const budget = roomCallBudget(2);
    const out = await retryRoomPurges(env, T0 + ROOM_PURGE_RETRY_MS, budget);
    expect(out).toEqual({ rooms: 2, unreached: 0, deferred: 0 });
    expect(budget.left).toBe(0);
    expect(purged).toEqual(['A', 'B']);
    expect(tombstones(db.sql).map((t) => t.document_id)).toEqual(['C']);
  });

  it('leave ids past the budget to the cron, never calling their rooms', async () => {
    const db = sqliteD1();
    const { env, purged } = rooms(db);
    const out = await purgeRooms(env, ['A', 'B', 'C'], roomCallBudget(1));
    expect(out).toEqual({ rooms: 1, unreached: 0, deferred: 2 });
    expect(purged).toEqual(['A']);
  });

  it("keep a daily Trash run of 2,000 documents inside one invocation's subrequests", async () => {
    const db = sqliteD1();
    const { env, purged } = rooms(db);
    const ids = Array.from({ length: 2_000 }, (_, i) => `d${String(i).padStart(4, '0')}`);
    const insert = db.sql.prepare(
      `INSERT INTO documents (id, owner_id, name, saved_at, created_at, trashed_at) VALUES (?, 'o', ?, ?, ?, ?)`,
    );
    for (const id of ids) insert.run(id, id, T0, T0, T0);
    let d1Calls = 0;
    const counted = countingD1(env.DB, () => (d1Calls += 1));
    const runEnv = Object.create(env, { DB: { value: counted } }) as Env;
    const roomCalls = roomCallBudget();
    await retryRoomPurges(runEnv, T0 + 31 * DAY, roomCalls);
    expect(await purgeExpiredTrash(runEnv, T0 + 31 * DAY, { roomCalls })).toBe(2_000);
    expect(purged.length).toBe(ROOM_PURGE_MAX_PER_RUN);
    expect(d1Calls).toBeGreaterThan(0);
    expect(purged.length + d1Calls).toBeLessThan(WORKER_SERVICE_SUBREQUESTS);
    // The rest keep their tombstones for the next runs.
    expect(tombstones(db.sql)).toHaveLength(2_000 - ROOM_PURGE_MAX_PER_RUN);
  });
});

describe('a create of an id whose room still owes a purge', () => {
  function create(env: Env) {
    return handleDocuments(
      makeTestRouteContext('POST', '/api/documents', {
        env,
        owner: 'owner',
        body: { id: 'A', name: 'Back from This Browser', tabs: [] },
      }),
    );
  }

  it('purges the room first, then creates', async () => {
    const db = sqliteD1();
    const down = new Set(['A']);
    const { env, purged } = rooms(db, down);
    await trashed(db, ['A']);
    await purgeDocuments(env, ['A']);
    down.clear();
    const res = await create(env);
    expect(res.status).toBeLessThan(300);
    expect(purged).toEqual(['A']);
    expect(tombstones(db.sql)).toEqual([]);
  });

  it('answers 503 while the room cannot be reached, creating nothing', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const db = sqliteD1();
    const { env } = rooms(db, new Set(['A']));
    await trashed(db, ['A']);
    await purgeDocuments(env, ['A']);
    const res = await create(env);
    expect(res.status).toBe(503);
    expect(db.sql.prepare("SELECT COUNT(*) AS n FROM documents WHERE id = 'A'").get()!.n).toBe(0);
  });
});

// D1 whose every call (a statement's first/all/run/raw, a batch) is counted: each is one subrequest.
function countingD1(db: D1Database, count: () => void): D1Database {
  const statement = (s: D1PreparedStatement): D1PreparedStatement =>
    new Proxy(s, {
      get(target, prop) {
        const value = Reflect.get(target, prop) as unknown;
        if (typeof value !== 'function') return value;
        if (prop === 'bind') {
          return (...args: unknown[]) =>
            statement((value as (...a: unknown[]) => D1PreparedStatement).apply(target, args));
        }
        if (prop === 'first' || prop === 'all' || prop === 'run' || prop === 'raw') {
          return (...args: unknown[]) => {
            count();
            return (value as (...a: unknown[]) => unknown).apply(target, args);
          };
        }
        return (value as (...a: unknown[]) => unknown).bind(target);
      },
    });
  return new Proxy(db, {
    get(target, prop) {
      const value = Reflect.get(target, prop) as unknown;
      if (prop === 'prepare') {
        return (query: string) =>
          statement((value as (q: string) => D1PreparedStatement).call(target, query));
      }
      if (prop === 'batch') {
        return (statements: D1PreparedStatement[]) => {
          count();
          return (value as (s: D1PreparedStatement[]) => unknown).call(target, statements);
        };
      }
      return typeof value === 'function' ? (value as () => unknown).bind(target) : value;
    },
  });
}
