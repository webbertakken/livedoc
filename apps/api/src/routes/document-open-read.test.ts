import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DOCUMENT_OPEN_HEADER } from '@livedoc/api-schema';
import { countD1RoundTrips, type D1RoundTrips } from '../test-d1-round-trips';
import { sqliteD1, type SqliteD1 } from '../test-sqlite-d1';
import { handleDocuments } from './documents';
import { makeTestRouteContext } from './test-route-context';

// The open as one read (docs/specs/016-platform/web-performance.md "The open is one read", docs/specs/015-api/api.md):
// the editor's document read, marked as an open, answers the tab it opens first and the reader's own participant row
// with the document, in the one D1 round trip the document read already makes.

let db: SqliteD1;
let trips: D1RoundTrips;

const comment = (authorId: string) => ({
  id: `c-${authorId}`,
  authorName: 'Ann',
  authorColor: '#f00',
  authorId,
  text: 'hi',
  createdAt: 1,
});

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
        commentThread: { comments: [comment('owner')], resolved: false },
      },
    ],
  });
  db.sql.exec(`
    INSERT INTO documents (id, owner_id, name, shareable, saved_at, created_at) VALUES ('d1', 'owner', 'Plan', 1, 1, 1);
    INSERT INTO participants (id, name, color, created_at, picture_url)
      VALUES ('owner', 'Webber', '#3b82f6', 1, 'https://lh3.googleusercontent.com/a/w');
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
  document: { id: string };
  openedTab?: {
    id: string;
    rev: number;
    elements: { commentThread?: { comments: { authorId?: string }[] } }[];
  } | null;
  reader?: { id: string; name: string; color: string; pictureUrl: string | null } | null;
};

async function read(opts: {
  owner?: string;
  code?: string;
  open?: boolean;
  verifiedAccountId?: string | null;
}): Promise<{ status: number; body: Body; trips: string[]; all: string[] }> {
  await db.flush();
  trips.reset();
  const background: Promise<unknown>[] = [];
  const headers: Record<string, string> = {};
  if (opts.code) headers['X-Share-Code'] = opts.code;
  if (opts.open !== false) headers[DOCUMENT_OPEN_HEADER] = '1';
  const res = await handleDocuments(
    makeTestRouteContext('GET', '/api/documents/d1', {
      env: db.env,
      owner: opts.owner ?? 'owner',
      verifiedAccountId: opts.verifiedAccountId ?? null,
      headers,
      waitUntil: (p) => void background.push(p),
    }),
  );
  const made = [...trips.trips];
  await Promise.allSettled(background);
  return {
    status: res.status,
    body: await res.json<Body>(),
    trips: made,
    all: [...trips.trips],
  };
}

describe('the document read, marked as an open', () => {
  it('answers the first tab and the reader with the document, in one D1 round trip', async () => {
    const res = await read({});
    expect(res.status).toBe(200);
    // The open record runs in the background (waitUntil); the read itself is one round trip.
    expect(res.trips.filter((t) => !/document_opens|timeline/.test(t))).toHaveLength(1);
    expect(res.body.openedTab).toMatchObject({ id: 't1', rev: 4 });
    expect(res.body.reader).toMatchObject({ id: 'owner', name: 'Webber', color: '#3b82f6' });
  });

  it('records the open, as the tab read it stands for would', async () => {
    const res = await read({});
    expect(res.all.join('\n')).toMatch(/document_opens/);
  });

  it('answers neither, nor records an open, when the read is not an open', async () => {
    const res = await read({ open: false });
    expect(res.body).not.toHaveProperty('openedTab');
    expect(res.body).not.toHaveProperty('reader');
    expect(res.all.join('\n')).not.toMatch(/document_opens/);
  });

  it('answers a reader with no row yet as null', async () => {
    db.sql.exec("DELETE FROM participants WHERE id = 'owner'");
    const res = await read({});
    expect(res.status).toBe(200);
    expect(res.body.reader).toBeNull();
  });

  it('shows the reader their published picture only when signed in', async () => {
    expect((await read({})).body.reader?.pictureUrl).toBeNull();
    expect((await read({ verifiedAccountId: 'owner' })).body.reader?.pictureUrl).toBe(
      'https://lh3.googleusercontent.com/a/w',
    );
  });

  it("hands a share-link visitor the tab with other people's comment authors blanked", async () => {
    const res = await read({ owner: 'visitor', code: 'EDIT' });
    expect(res.status).toBe(200);
    expect(res.body.reader).toMatchObject({ id: 'visitor', name: 'Swift Otter' });
    const authors = res.body.openedTab!.elements[0]!.commentThread!.comments.map((c) => c.authorId);
    expect(authors).not.toContain('owner');
  });

  it('opens a tab-scoped link on its own tab', async () => {
    const res = await read({ owner: 'visitor', code: 'TAB2' });
    expect(res.body.openedTab).toMatchObject({ id: 't2' });
  });

  it('answers no tab for a document without one', async () => {
    db.sql.exec("DELETE FROM document_tabs WHERE document_id = 'd1'");
    const res = await read({});
    expect(res.status).toBe(200);
    expect(res.body.openedTab).toBeNull();
  });
});
