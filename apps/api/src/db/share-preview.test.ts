import { beforeEach, describe, expect, it } from 'vitest';
import { countD1RoundTrips } from '../test-d1-round-trips';
import { sqliteD1, type SqliteD1 } from '../test-sqlite-d1';
import { getSharePreviewSubject } from './share-preview';

// A link preview's question (docs/specs/013-workspace/share-link-previews.md "The share page's head"): a working
// link, its document not trashed, no share password. One D1 query, so a preview pays one round trip, not three.

let db: SqliteD1;

const NOW = Date.now();

beforeEach(() => {
  db = sqliteD1();
  db.sql.exec(`
    INSERT INTO documents (id, owner_id, team_id, name, shareable, saved_at, created_at, thumb_rendered_at)
      VALUES ('d1', 'owner', 'team', 'Payments flow', 1, 5, 1, 4);
    INSERT INTO share_links (code, document_id, role, tab_id, created_at) VALUES ('OPEN', 'd1', 'view', NULL, 1);
    INSERT INTO share_links (code, document_id, role, tab_id, created_at) VALUES ('TAB', 'd1', 'view', 't2', 1);
    INSERT INTO share_links (code, document_id, role, tab_id, created_at, expires_at)
      VALUES ('LATER', 'd1', 'view', NULL, 1, ${NOW + 60_000});
    INSERT INTO share_links (code, document_id, role, tab_id, created_at, expires_at)
      VALUES ('EXPIRED', 'd1', 'view', NULL, 1, ${NOW - 1});
  `);
});

const subject = (code: string) => getSharePreviewSubject(db.env, code);

describe('getSharePreviewSubject', () => {
  it("answers a working link's document and tab", async () => {
    expect(await subject('OPEN')).toEqual({
      doc: {
        id: 'd1',
        ownerId: 'owner',
        teamId: 'team',
        name: 'Payments flow',
        savedAt: 5,
        thumbRenderedAt: 4,
      },
      tabId: null,
    });
    expect((await subject('TAB'))?.tabId).toBe('t2');
    expect((await subject('LATER'))?.doc.id).toBe('d1');
  });

  it('is null for an unknown or expired code', async () => {
    expect(await subject('NOPE')).toBeNull();
    expect(await subject('EXPIRED')).toBeNull();
  });

  it('is null for a trashed document', async () => {
    db.sql.exec(`UPDATE documents SET trashed_at = 9 WHERE id = 'd1'`);
    expect(await subject('OPEN')).toBeNull();
  });

  it('is null behind a share password, and a blank one is no password', async () => {
    db.sql.exec(`UPDATE documents SET share_password = 'hash' WHERE id = 'd1'`);
    expect(await subject('OPEN')).toBeNull();
    db.sql.exec(`UPDATE documents SET share_password = ' ' || char(9, 10, 13) WHERE id = 'd1'`);
    expect((await subject('OPEN'))?.doc.id).toBe('d1');
  });

  it('asks D1 once', async () => {
    await db.flush();
    const trips = countD1RoundTrips(db.env);
    await subject('OPEN');
    await subject('NOPE');
    expect(trips.trips).toHaveLength(2);
  });
});
