import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyLayout } from '@livedoc/sheets';
import { countD1RoundTrips, type D1RoundTrips } from '../test-d1-round-trips';
import { sqliteD1, type SqliteD1 } from '../test-sqlite-d1';
import { handleDocuments } from './documents';
import { makeTestRouteContext } from './test-route-context';

// The D1 round trips of the document requests an open editor makes all the time
// (docs/specs/016-platform/web-performance.md "The api"): a check that needs only a document's owner and team reads
// that row, and nothing reads D1 for the purge guard (G3), which the document's own row keeps. Counted before the
// response, the work a request hands to waitUntil apart.

let db: SqliteD1;
let trips: D1RoundTrips;

let n = 7;
const rand = () => (n = (n * 16807 + 11) % 2147483647) / 2147483647;

beforeEach(async () => {
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  db = sqliteD1();
  db.sql.exec(`
    INSERT INTO documents (id, owner_id, name, shareable, saved_at, created_at) VALUES ('d1', 'owner', 'Plan', 1, 1, 1);
    INSERT INTO participants (id, name, color, created_at) VALUES ('owner', 'Webber', '#3b82f6', 1);
    INSERT INTO tabs (id, name, data, updated_at)
      VALUES ('t1', 'One', '{"elements":[{"id":"a","type":"rectangle","x":0,"y":0,"width":10,"height":10}]}', 1);
    INSERT INTO document_tabs (document_id, tab_id, order_index, added_at) VALUES ('d1', 't1', 0, 1);
    INSERT INTO share_links (code, document_id, role, tab_id, created_at) VALUES ('EDIT', 'd1', 'edit', NULL, 1);
  `);
  await db.flush();
  trips = countD1RoundTrips(db.env);
});

afterEach(() => vi.restoreAllMocks());

// The round trips a request made before it answered, and its status.
async function request(
  method: string,
  path: string,
  opts: { body?: unknown; owner?: string; code?: string } = {},
): Promise<{ status: number; trips: string[] }> {
  await db.flush();
  trips.reset();
  const background: Promise<unknown>[] = [];
  const res = await handleDocuments(
    makeTestRouteContext(method, `/api/documents/d1${path}`, {
      env: db.env,
      owner: opts.owner ?? 'owner',
      ...(opts.code ? { headers: { 'X-Share-Code': opts.code } } : {}),
      ...(opts.body === undefined ? {} : { body: opts.body }),
      waitUntil: (p) => void background.push(p),
    }),
  );
  const made = [...trips.trips];
  await Promise.allSettled(background);
  return { status: res.status, trips: made };
}

describe('the round trips of a document request', () => {
  it('opening the document reads its row and its owner', async () => {
    const res = await request('GET', '');
    expect(res.status).toBe(200);
    expect(res.trips).toHaveLength(2);
  });

  it.each([
    ['a tab', '/tabs/t1', 2],
    ['the cards', '/items', 2],
    ['the sheets', '/sheets', 2],
    ['the comments', '/comments', 2],
    ['the plan', '/plan', 2],
  ])('reading %s reads no tombstone', async (_what, path, expected) => {
    const res = await request('GET', path);
    expect(res.status).toBe(200);
    expect(res.trips).toHaveLength(expected);
    expect(res.trips.join('\n')).not.toMatch(/room_purges/);
  });

  it.each([
    ['a card', '/items', { type: 'task', fields: { title: 'x' } }, 3],
    [
      'a sheet',
      '/sheets',
      { id: 'sheetA00', tabId: 't1', title: 'B', layout: emptyLayout(rand, 3, 3) },
      3,
    ],
    ['a comment', '/tabs/t1/comments', { elementId: 'a', text: 'hi' }, 4],
  ])('adding %s reads no tombstone', async (_what, path, body, expected) => {
    const res = await request('POST', path, { body });
    expect(res.status).toBe(201);
    expect(res.trips).toHaveLength(expected);
    expect(res.trips.join('\n')).not.toMatch(/room_purges/);
  });

  it("a share-link visitor's tab read resolves the link once", async () => {
    const res = await request('GET', '/tabs/t1', { owner: 'visitor', code: 'EDIT' });
    expect(res.status).toBe(200);
    expect(res.trips).toHaveLength(6);
  });
});
