import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DOCUMENT_OPEN_HEADER } from '@livedoc/api-schema';
import { countD1RoundTrips, type D1RoundTrips } from '../test-d1-round-trips';
import { sqliteD1, type SqliteD1 } from '../test-sqlite-d1';
import { handleShare } from './share';
import { makeTestRouteContext } from './test-route-context';

// A share link opened in one read (docs/specs/016-platform/web-performance.md "The open is one read",
// docs/specs/015-api/api.md): the share read, marked as an open, carries the tab the visitor opens first, as the
// document's room answers that visitor's own tab read, and the visitor's own participant row.

let db: SqliteD1;
let trips: D1RoundTrips;

beforeEach(async () => {
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  db = sqliteD1();
  const t1 = JSON.stringify({
    elements: [
      {
        id: 'a',
        type: 'shape',
        shape: 'square',
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        commentThread: {
          comments: [
            {
              id: 'c1',
              authorName: 'W',
              authorColor: '#f00',
              authorId: 'owner',
              text: 'hi',
              createdAt: 1,
            },
          ],
          resolved: false,
        },
      },
    ],
  });
  db.sql.exec(`
    INSERT INTO documents (id, owner_id, name, shareable, saved_at, created_at) VALUES ('d1', 'owner', 'Plan', 1, 1, 1);
    INSERT INTO participants (id, name, color, created_at) VALUES ('owner', 'Webber', '#3b82f6', 1);
    INSERT INTO participants (id, name, color, created_at) VALUES ('visitor', 'Swift Otter', '#22c55e', 2);
    INSERT INTO tabs (id, name, data, updated_at, rev) VALUES ('t1', 'One', '${t1}', 1, 4);
    INSERT INTO tabs (id, name, data, updated_at) VALUES ('t2', 'Two', '{"elements":[]}', 1);
    INSERT INTO document_tabs (document_id, tab_id, order_index, added_at) VALUES ('d1', 't1', 0, 1);
    INSERT INTO document_tabs (document_id, tab_id, order_index, added_at) VALUES ('d1', 't2', 1, 1);
    INSERT INTO share_links (code, document_id, role, tab_id, created_at) VALUES ('EDIT', 'd1', 'edit', NULL, 1);
    INSERT INTO share_links (code, document_id, role, tab_id, created_at) VALUES ('TAB2', 'd1', 'view', 't2', 1);
  `);
  await db.flush();
  trips = countD1RoundTrips(db.env);
});

afterEach(() => vi.restoreAllMocks());

type Body = {
  document?: { id: string };
  openedTab?: {
    id: string;
    rev: number;
    elements: { commentThread?: { comments: { authorId?: string }[] } }[];
  } | null;
  reader?: { id: string; name: string } | null;
};

async function read(
  code: string,
  opts: { owner?: string | null; open?: boolean; password?: string } = {},
): Promise<{ status: number; body: Body; all: string[] }> {
  await db.flush();
  trips.reset();
  const background: Promise<unknown>[] = [];
  const headers: Record<string, string> = {};
  if (opts.open !== false) headers[DOCUMENT_OPEN_HEADER] = '1';
  if (opts.password) headers['X-Share-Password'] = opts.password;
  const res = await handleShare(
    makeTestRouteContext('GET', `/api/share/${code}`, {
      env: db.env,
      owner: opts.owner === undefined ? 'visitor' : opts.owner,
      headers,
      waitUntil: (p) => void background.push(p),
    }),
  );
  await Promise.allSettled(background);
  return { status: res.status, body: await res.json<Body>(), all: [...trips.trips] };
}

describe('the share read, marked as an open', () => {
  it("carries the first tab, as the room hands it to this visitor, and the visitor's own row", async () => {
    const res = await read('EDIT');
    expect(res.status).toBe(200);
    expect(res.body.openedTab).toMatchObject({ id: 't1', rev: 4 });
    expect(res.body.reader).toMatchObject({ id: 'visitor', name: 'Swift Otter' });
    const authors = res.body.openedTab!.elements[0]!.commentThread!.comments.map((c) => c.authorId);
    expect(authors).not.toContain('owner');
  });

  it('records the open, as the tab read it stands for would', async () => {
    const res = await read('EDIT');
    expect(res.all.join('\n')).toMatch(/document_opens/);
  });

  it("opens a tab-scoped link on the link's own tab", async () => {
    expect((await read('TAB2')).body.openedTab).toMatchObject({ id: 't2' });
  });

  it('carries neither when the read is not an open', async () => {
    const res = await read('EDIT', { open: false });
    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty('openedTab');
    expect(res.body).not.toHaveProperty('reader');
    expect(res.all.join('\n')).not.toMatch(/document_opens/);
  });

  it('carries neither for a visitor who says nothing of who they are', async () => {
    const res = await read('EDIT', { owner: null });
    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty('openedTab');
  });

  it('carries a reader with no row yet as null', async () => {
    db.sql.exec("DELETE FROM participants WHERE id = 'visitor'");
    expect((await read('EDIT')).body.reader).toBeNull();
  });

  it('hands out no tab behind the password gate, and the tab once the password is right', async () => {
    db.sql.exec("UPDATE documents SET share_password = 'hunter2' WHERE id = 'd1'");
    const gated = await read('EDIT');
    expect(gated.status).toBe(401);
    expect(gated.body).not.toHaveProperty('openedTab');
    const opened = await read('EDIT', { password: 'hunter2' });
    expect(opened.status).toBe(200);
    expect(opened.body.openedTab).toMatchObject({ id: 't1' });
  });
});
