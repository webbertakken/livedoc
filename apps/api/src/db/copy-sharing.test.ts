// docs/specs/034-text-documents/files-and-print.md "Make a copy": Share it with the same people.
import { describe, expect, it, vi } from 'vitest';
import { sqliteD1 } from '../test-sqlite-d1';
import { shareCopyLikeSource } from './copy-sharing';
import { listSharedWith } from './shared';

const DAY = 86_400_000;

function world() {
  const db = sqliteD1();
  db.sql
    .exec(`INSERT INTO documents (id, owner_id, name, shareable, saved_at, created_at, share_password)
    VALUES ('src', 'owner', 'Doc', 1, 1, 1, 'hash'), ('cp', 'owner', 'Copy of Doc', 0, 1, 1, NULL)`);
  const user = (id: string) =>
    db.sql
      .prepare(
        `INSERT INTO identity_users (id, name, email, emailVerified, createdAt, updatedAt)
       VALUES (?, ?, ?, 1, '2026-01-01', '2026-01-01')`,
      )
      .run(id, id, `${id}@example.com`);
  const link = (
    code: string,
    role: string,
    level: string | null,
    opts: Partial<Record<string, unknown>> = {},
  ) =>
    db.sql
      .prepare(
        `INSERT INTO share_links (code, document_id, role, level, created_at, expiry, expires_at, tab_id)
       VALUES (?, 'src', ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        code,
        role,
        level,
        (opts.created as number) ?? 1,
        (opts.expiry as string) ?? null,
        (opts.expiresAt as number) ?? null,
        (opts.tab as string) ?? null,
      );
  const visit = (
    owner: string,
    role: string,
    level: string | null,
    code: string,
    tab: string | null = null,
  ) =>
    db.sql
      .prepare(
        `INSERT INTO shared_with (owner_id, document_id, role, level, last_seen, tab_id, share_code)
       VALUES (?, 'src', ?, ?, 1, ?, ?)`,
      )
      .run(owner, role, level, tab, code);
  const share = () =>
    shareCopyLikeSource(db.env, {
      sourceId: 'src',
      copyId: 'cp',
      copier: 'owner',
      sourceTabIds: ['t1', 't2'],
      copyTabIds: ['c1', 'c2'],
    });
  const copyLinks = () =>
    db.sql
      .prepare(
        'SELECT code, role, level, expiry, expires_at, tab_id FROM share_links WHERE document_id = ? ORDER BY created_at, role',
      )
      .all('cp') as {
      code: string;
      role: string;
      level: string | null;
      expiry: string | null;
      expires_at: number | null;
      tab_id: string | null;
    }[];
  const copyRows = () =>
    db.sql
      .prepare(
        'SELECT owner_id, role, level, tab_id, share_code FROM shared_with WHERE document_id = ? ORDER BY owner_id',
      )
      .all('cp') as {
      owner_id: string;
      role: string;
      level: string | null;
      tab_id: string | null;
      share_code: string;
    }[];
  const copyDoc = () =>
    db.sql.prepare('SELECT shareable, share_password FROM documents WHERE id = ?').get('cp') as {
      shareable: number;
      share_password: string | null;
    };
  return { db, user, link, visit, share, copyLinks, copyRows, copyDoc };
}

describe('shareCopyLikeSource', () => {
  it('gives the copy a new link for every active link, at the same level, never the source’s code', async () => {
    const w = world();
    w.link('EDIT', 'edit', null);
    w.link('PART', 'view', 'participate');
    w.link('VIEW', 'view', null);
    const counts = await w.share();
    const links = w.copyLinks();
    expect(links.map((l) => [l.role, l.level])).toEqual([
      ['edit', null],
      ['view', 'participate'],
      ['view', null],
    ]);
    expect(links.map((l) => l.code)).not.toContain('EDIT');
    expect(new Set(links.map((l) => l.code)).size).toBe(3);
    expect(counts).toEqual({ links: 3, linksSkipped: 0, people: 0, peopleSkipped: 0 });
    expect(w.copyDoc()).toEqual({ shareable: 1, share_password: 'hash' });
  });

  it('re-arms an expiring link’s choice from now and scopes a tab link to the copy’s tab in its place', async () => {
    vi.useFakeTimers({ now: 10 * DAY });
    try {
      const w = world();
      w.link('WEEK', 'view', null, { expiry: 'week', expiresAt: 11 * DAY, tab: 't2' });
      await w.share();
      const [link] = w.copyLinks();
      expect(link).toMatchObject({ expiry: 'week', expires_at: 17 * DAY, tab_id: 'c2' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('leaves out an expired link and a link to a tab the copy lacks', async () => {
    const w = world();
    w.link('OLD', 'edit', null, { expiry: 'week', expiresAt: 5 });
    w.link('GONE', 'view', null, { tab: 't9' });
    const counts = await w.share();
    expect(w.copyLinks()).toEqual([]);
    expect(counts).toMatchObject({ links: 0, linksSkipped: 1 });
    // Nothing carried: the copy stays private, its password untouched.
    expect(w.copyDoc()).toEqual({ shareable: 0, share_password: null });
  });

  it('gives each signed-in person a Shared with you row at their level through the copy’s new link', async () => {
    const w = world();
    w.link('EDIT', 'edit', null);
    w.link('PART', 'view', 'participate');
    w.link('VIEW', 'view', null, { tab: 't1' });
    w.user('ed');
    w.user('pa');
    w.user('vi');
    w.visit('ed', 'edit', null, 'EDIT');
    w.visit('pa', 'view', 'participate', 'PART');
    w.visit('vi', 'view', null, 'VIEW', 't1');
    const counts = await w.share();
    const codeOf = new Map(w.copyLinks().map((l) => [`${l.role}:${l.level}:${l.tab_id}`, l.code]));
    expect(w.copyRows()).toEqual([
      {
        owner_id: 'ed',
        role: 'edit',
        level: null,
        tab_id: null,
        share_code: codeOf.get('edit:null:null'),
      },
      {
        owner_id: 'pa',
        role: 'view',
        level: 'participate',
        tab_id: null,
        share_code: codeOf.get('view:participate:null'),
      },
      {
        owner_id: 'vi',
        role: 'view',
        level: null,
        tab_id: 'c1',
        share_code: codeOf.get('view:null:c1'),
      },
    ]);
    expect(counts).toEqual({ links: 3, linksSkipped: 0, people: 3, peopleSkipped: 0 });
    // They find it under Shared with you, as a visit would.
    const shared = await listSharedWith(w.db.env, 'pa');
    expect(shared.find((s) => s.id === 'cp')?.role).toBe('participate');
  });

  it('carries no guest, no one through a revoked or expired link, and not the copier', async () => {
    const w = world();
    w.link('EDIT', 'edit', null);
    w.link('OLD', 'view', null, { expiry: 'week', expiresAt: 5 });
    w.user('owner');
    w.user('late');
    w.user('revoked');
    // A guest, known only by this browser's id.
    w.visit('guest-browser-id', 'edit', null, 'EDIT');
    w.visit('late', 'view', null, 'OLD');
    // Their link was revoked: its code is in no share_links row.
    w.visit('revoked', 'edit', null, 'REVOKED');
    w.visit('owner', 'edit', null, 'EDIT');
    const counts = await w.share();
    expect(w.copyRows()).toEqual([]);
    expect(counts).toMatchObject({ links: 1, people: 0, peopleSkipped: 3 });
  });

  it('carries no link and no one while the source is no longer shared', async () => {
    const w = world();
    w.link('EDIT', 'edit', null);
    w.user('ed');
    w.visit('ed', 'edit', null, 'EDIT');
    w.db.sql.exec("UPDATE documents SET shareable = 0 WHERE id = 'src'");
    const counts = await w.share();
    expect(w.copyRows()).toEqual([]);
    expect(counts).toMatchObject({ links: 0, people: 0 });
    expect(w.copyDoc().shareable).toBe(0);
  });
});
