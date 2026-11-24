import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { canEditDocument, canReadDocument } from '../auth/document-access';
import { sqliteD1, type SqliteD1 } from '../test-sqlite-d1';
import { handleDocuments } from './documents';
import { makeTestRouteContext } from './test-route-context';

// docs/specs/013-workspace/tab-scoped-share-links.md "Drawing tabs": a link to one tab reaches the drawing tabs that
// belong to it, at every door a canvas tab passes; another tab's drawing stays out of reach.

let db: SqliteD1;

beforeEach(async () => {
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  db = sqliteD1();
  db.sql.exec(`
    INSERT INTO documents (id, owner_id, name, shareable, saved_at, created_at) VALUES ('d1', 'owner', 'Plan', 1, 1, 1);
    INSERT INTO tabs (id, name, data, updated_at, kind) VALUES ('t1', 'One', '{"elements":[]}', 1, 'text-document');
    INSERT INTO tabs (id, name, data, updated_at, kind) VALUES ('t2', 'Two', '{"elements":[]}', 1, 'text-document');
    INSERT INTO tabs (id, name, data, updated_at, drawing_of) VALUES ('mine', 'Drawing 1', '{"elements":[]}', 1, 't2');
    INSERT INTO tabs (id, name, data, updated_at, drawing_of) VALUES ('theirs', 'Drawing 2', '{"elements":[]}', 1, 't1');
    INSERT INTO document_tabs (document_id, tab_id, order_index, added_at) VALUES ('d1', 't1', 0, 1);
    INSERT INTO document_tabs (document_id, tab_id, order_index, added_at) VALUES ('d1', 't2', 1, 1);
    INSERT INTO document_tabs (document_id, tab_id, order_index, added_at) VALUES ('d1', 'mine', 2, 1);
    INSERT INTO document_tabs (document_id, tab_id, order_index, added_at) VALUES ('d1', 'theirs', 3, 1);
    INSERT INTO share_links (code, document_id, role, tab_id, created_at) VALUES ('TAB2', 'd1', 'edit', 't2', 1);
  `);
  await db.flush();
});

afterEach(() => vi.restoreAllMocks());

function get(path: string) {
  return handleDocuments(
    makeTestRouteContext('GET', path, {
      env: db.env,
      owner: 'visitor',
      headers: { 'X-Share-Code': 'TAB2' },
    }),
  );
}

describe('a link to one tab and its drawing tabs', () => {
  it('lets the gates through to its drawing tabs, never to another tab’s', async () => {
    const gate = (check: typeof canEditDocument, tab: string) =>
      check(db.env, 'd1', 'visitor', 'TAB2', 'owner', null, null, null, tab);
    expect(await gate(canEditDocument, 'mine')).toBe(true);
    expect(await gate(canReadDocument, 'mine')).toBe(true);
    expect(await gate(canEditDocument, 'theirs')).toBe(false);
    expect(await gate(canReadDocument, 't1')).toBe(false);
  });

  it('reads its drawing tab, and answers another tab’s drawing as missing', async () => {
    const mine = await get('/api/documents/d1/tabs/mine');
    expect(mine.status).toBe(200);
    expect((await mine.json<{ tab: { id: string } }>()).tab.id).toBe('mine');
    expect((await get('/api/documents/d1/tabs/theirs')).status).toBe(404);
  });

  it('lists its drawing tab whole in the document, and another tab’s drawing out of scope', async () => {
    const res = await get('/api/documents/d1');
    expect(res.status).toBe(200);
    const { tabs } = (
      await res.json<{
        document: { tabs: { id: string; name: string; outOfScope?: true; drawingOf?: string }[] };
      }>()
    ).document;
    const byId = new Map(tabs.map((t) => [t.id, t]));
    expect(byId.get('mine')).toMatchObject({ name: 'Drawing 1', drawingOf: 't2' });
    expect(byId.get('mine')?.outOfScope).toBeUndefined();
    expect(byId.get('theirs')).toMatchObject({ name: '', outOfScope: true, drawingOf: 't1' });
  });

  it('lists its drawing tab’s changesets, and none of another tab’s drawing', async () => {
    for (const [id, tab] of [
      ['c1', 'mine'],
      ['c2', 'theirs'],
    ] as const)
      db.sql
        .prepare(
          `INSERT INTO agent_changesets (id, document_id, tab_id, rev, author_id, author_name, author_color,
             fingerprints, added, changed, removed, created_at)
           VALUES (?, 'd1', ?, 1, 'owner', 'Webber', '#123456', '{}', 1, 0, 0, 1)`,
        )
        .run(id, tab);
    await db.flush();
    const list = async (tab: string) =>
      (
        await (
          await get(`/api/documents/d1/changesets?tab=${tab}`)
        ).json<{
          changesets: { id: string }[];
        }>()
      ).changesets.map((c) => c.id);
    expect(await list('mine')).toEqual(['c1']);
    expect(await list('theirs')).toEqual([]);
  });
});
