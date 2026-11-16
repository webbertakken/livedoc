import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sqliteD1, type SqliteD1 } from '../test-sqlite-d1';
import { handleDocuments } from './documents';
import { makeTestRouteContext } from './test-route-context';

// The worker's part of a document answer's Server-Timing (docs/specs/016-platform/web-performance.md "The api"):
// its call to the room, after what the room timed inside, on a successful answer only.

let db: SqliteD1;

beforeEach(async () => {
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  db = sqliteD1();
  db.sql.exec(`
    INSERT INTO documents (id, owner_id, name, shareable, saved_at, created_at) VALUES ('d1', 'owner', 'Plan', 0, 1, 1);
  `);
  await db.flush();
});

afterEach(() => vi.restoreAllMocks());

const get = (owner: string) =>
  handleDocuments(makeTestRouteContext('GET', '/api/documents/d1', { env: db.env, owner }));

describe('a document answer timing its room call', () => {
  it('times the call to the room', async () => {
    const res = await get('owner');
    expect(res.status).toBe(200);
    expect(res.headers.get('Server-Timing')).toMatch(/(^|, )room;dur=\d+$/);
  });

  it('times nothing on a refusal', async () => {
    const res = await get('stranger');
    expect(res.status).toBe(404);
    expect(res.headers.get('Server-Timing')).toBeNull();
  });
});
