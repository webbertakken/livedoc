import { describe, expect, it } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { sqliteD1 } from '../test-sqlite-d1';
import { createShareLink } from './share';
import { recordSharedAccess } from './shared';
import {
  accountsOfIdentities,
  claimNoticeEmail,
  deleteOldNoticeSends,
  noticeReachOf,
} from './text-document-notice-people';

// docs/specs/034-text-documents/review.md "Notifications" (Who is emailed; Batches): read at the send.

const T = 1_700_000_000_000;
const HOUR = 60 * 60 * 1000;

function insert(sql: DatabaseSync, table: string, row: Record<string, string | number | null>) {
  const cols = Object.keys(row);
  sql
    .prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`)
    .run(...Object.values(row));
}

function withDocument() {
  const db = sqliteD1();
  insert(db.sql, 'documents', {
    id: 'D',
    owner_id: 'owner',
    name: 'Plan',
    saved_at: T,
    created_at: T,
    shareable: 1,
  });
  return db;
}

describe('how someone reaches the document now', () => {
  it('is an Editor’s for its owner', async () => {
    const { env } = withDocument();
    expect(await noticeReachOf(env, 'D', 'owner', Date.now())).toEqual({
      level: 'edit',
      scopeTabId: null,
      shareCode: null,
    });
  });

  it('follows the link a visitor came through, and its tab', async () => {
    const { env } = withDocument();
    await createShareLink(env, 'D', 'PART', 'participate');
    await createShareLink(env, 'D', 'VIEW', 'view');
    await createShareLink(env, 'D', 'TAB1', 'edit', 'never', 't1');
    await recordSharedAccess(env, 'pat', 'D', 'participate', null, 'PART');
    await recordSharedAccess(env, 'vic', 'D', 'view', null, 'VIEW');
    await recordSharedAccess(env, 'tab', 'D', 'edit', 't1', 'TAB1');
    const now = Date.now();
    expect(await noticeReachOf(env, 'D', 'pat', now)).toEqual({
      level: 'participate',
      scopeTabId: null,
      shareCode: 'PART',
    });
    expect(await noticeReachOf(env, 'D', 'vic', now)).toEqual({
      level: 'view',
      scopeTabId: null,
      shareCode: 'VIEW',
    });
    expect(await noticeReachOf(env, 'D', 'tab', now)).toEqual({
      level: 'edit',
      scopeTabId: 't1',
      shareCode: 'TAB1',
    });
  });

  it('is nothing once their link is lowered to view, gone, or the document is in the Trash', async () => {
    const { env, sql } = withDocument();
    await createShareLink(env, 'D', 'PART', 'participate');
    await recordSharedAccess(env, 'pat', 'D', 'participate', null, 'PART');
    sql.prepare("UPDATE share_links SET level = 'view', role = 'view' WHERE code = 'PART'").run();
    expect(await noticeReachOf(env, 'D', 'pat', Date.now())).toBeNull();
    expect(await noticeReachOf(env, 'D', 'stranger', Date.now())).toBeNull();
    sql.prepare('UPDATE documents SET trashed_at = ? WHERE id = ?').run(T, 'D');
    expect(await noticeReachOf(env, 'D', 'owner', Date.now())).toBeNull();
  });
});

describe('identities as accounts', () => {
  it('turns a guest id an account took over into the account, and keeps the rest', async () => {
    const { env, sql } = withDocument();
    insert(sql, 'owner_aliases', { owner_id: 'ada', alias_id: 'guest-1', created_at: T });
    const accounts = await accountsOfIdentities(env, ['guest-1', 'bo']);
    expect(Object.fromEntries(accounts)).toEqual({ 'guest-1': 'ada', bo: 'bo' });
    expect((await accountsOfIdentities(env, [])).size).toBe(0);
  });
});

describe('the hourly cap', () => {
  it('lets at most so many through an hour, per person', async () => {
    const { env } = withDocument();
    expect(await claimNoticeEmail(env, 'ada', T, 2)).toBe(true);
    expect(await claimNoticeEmail(env, 'ada', T + 1, 2)).toBe(true);
    expect(await claimNoticeEmail(env, 'ada', T + 2, 2)).toBe(false);
    expect(await claimNoticeEmail(env, 'bo', T + 2, 2)).toBe(true);
    expect(await claimNoticeEmail(env, 'ada', T + HOUR + 1, 2)).toBe(true);
  });

  it('forgets sends past their hour', async () => {
    const { env } = withDocument();
    await claimNoticeEmail(env, 'ada', T, 2);
    await claimNoticeEmail(env, 'ada', T + HOUR, 2);
    expect(await deleteOldNoticeSends(env, T + 1)).toBe(1);
  });
});
