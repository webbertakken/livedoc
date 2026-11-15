import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { purgeDocuments, trashDocument } from '../db';
import { ROUTE_MANIFEST } from '../openapi/manifest';
import { sqliteD1, type SqliteD1 } from '../test-sqlite-d1';
import type { Env } from '../types';
import { handleDocuments } from './documents';
import { makeTestRouteContext } from './test-route-context';

// G3 (docs/specs/006-document/document-storage.md "Invariants and edge cases"): a document whose room still owes
// its purge cannot be opened. The removal batch deletes the document's D1 row in the same batch that writes its
// tombstone (db/document-removal.ts), and every route under /api/documents/:id/ reads that row before it serves or
// writes anything, so no route needs a read of the tombstone itself. Every route the API documents is asked, as
// the document's owner, of a document whose room still holds everything.

const ROOM_TABLES = ['document', 'document_tabs', 'tabs', 'items', 'sheets'] as const;

let db: SqliteD1;

// The room keeps its content: it was not reached when the document was purged.
function unreachedRoom(env: Env): void {
  env.DOCUMENT_ROOM = {
    idFromName: (name: string) => ({ name, toString: () => name }),
    get: () => ({
      fetch: async () => {
        throw new Error('room unreachable');
      },
    }),
  } as unknown as Env['DOCUMENT_ROOM'];
}

function roomRows(): string {
  return ROOM_TABLES.map((t) => JSON.stringify(db.sql.prepare(`SELECT * FROM ${t}`).all())).join(
    '\n',
  );
}

const documentRoutes = ROUTE_MANIFEST.filter((r) => r.path.startsWith('/documents/{id}'));

beforeEach(async () => {
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  db = sqliteD1();
  db.sql.exec(`
    INSERT INTO documents (id, owner_id, name, shareable, saved_at, created_at) VALUES ('d1', 'owner', 'P', 1, 1, 1);
    INSERT INTO tabs (id, name, data, updated_at) VALUES ('t1', 'One', '{"elements":[]}', 1);
    INSERT INTO document_tabs (document_id, tab_id, order_index, added_at) VALUES ('d1', 't1', 0, 1);
    INSERT INTO share_links (code, document_id, role, tab_id, created_at) VALUES ('EDIT', 'd1', 'edit', NULL, 1);
  `);
  await db.flush();
  unreachedRoom(db.env);
  await trashDocument(db.env, 'd1', 1);
  await purgeDocuments(db.env, ['d1']);
  // The test rooms share one database, whose purge empties every room; this one's content is put back.
  db.sql.exec(`
    PRAGMA foreign_keys = OFF;
    INSERT INTO tabs (id, name, data, updated_at) VALUES ('t1', 'One', '{"elements":[]}', 1);
    INSERT INTO document_tabs (document_id, tab_id, order_index, added_at) VALUES ('d1', 't1', 0, 1);
    PRAGMA foreign_keys = ON;
  `);
});

afterEach(() => vi.restoreAllMocks());

describe('a document whose room still owes its purge (G3)', () => {
  it('is purged in D1 and keeps its tombstone and its room content', () => {
    expect(db.sql.prepare("SELECT 1 FROM documents WHERE id = 'd1'").all()).toEqual([]);
    expect(db.sql.prepare('SELECT document_id FROM room_purges').all()).toEqual([
      { document_id: 'd1' },
    ]);
    expect(db.sql.prepare("SELECT id FROM tabs WHERE id = 't1'").all()).toEqual([{ id: 't1' }]);
  });

  it.each(documentRoutes.map((r) => [r.method, r.path] as const))(
    'refuses %s %s and changes nothing',
    async (method, template) => {
      const path = `/api${template
        .replace('{id}', 'd1')
        .replace('{tabId}', 't1')
        .replace(/\{\w+\}/g, 'x1')}`;
      const before = roomRows();
      const pending: Promise<unknown>[] = [];
      const res = await handleDocuments(
        makeTestRouteContext(method, path, {
          env: db.env,
          owner: 'owner',
          ...(method === 'GET' || method === 'DELETE' ? {} : { body: {} }),
          waitUntil: (p) => void pending.push(p),
        }),
      );
      await Promise.allSettled(pending);
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
      expect(roomRows()).toBe(before);
      expect(db.sql.prepare("SELECT 1 FROM documents WHERE id = 'd1'").all()).toEqual([]);
    },
  );

  it('refuses a share-link visitor too', async () => {
    const res = await handleDocuments(
      makeTestRouteContext('GET', '/api/documents/d1/tabs/t1', {
        env: db.env,
        owner: 'visitor',
        headers: { 'X-Share-Code': 'EDIT' },
      }),
    );
    expect(res.status).toBe(404);
  });
});
